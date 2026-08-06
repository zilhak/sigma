/**
 * annotation_marker_pair — 기획 레이어 안 마커 ↔ 범례 짝·왕복 링크 검사.
 * 짝은 **레이어 단위**로 맞춘다(한 페이지에 섹션이 여럿이면 ① 번 마커도 여럿이다).
 */
import { describe, test, expect } from 'bun:test';
import { annotationMarkerPairRule, type MarkerPairRelations } from '../src/lint/annotation-marker';
import type { LintNode } from '../src/lint/types';

/** 레이어 1개 + (마커/범례 인스턴스 + 그 안 번호 TEXT) 조합을 만든다. */
function build(spec: Array<{ kind: 'marker' | 'legend'; sym: string; id: string; linkTo?: string[] }>, layerId = 'L1') {
  const nodes: LintNode[] = [{
    id: layerId, name: '📝 기획 주석', type: 'FRAME', x: 0, y: 0, width: 100, height: 100,
    childCount: spec.length, isAnnotationLayer: true,
  }];
  const children: Record<string, string[]> = { [layerId]: spec.map((s) => s.id) };
  const ancestors: Record<string, string[]> = {};

  for (const s of spec) {
    nodes.push({
      id: s.id, name: `${s.kind}${s.sym}`, type: 'INSTANCE', x: 0, y: 0, width: 24, height: 24,
      childCount: 1, specAlias: s.kind,
    });
    const textId = `${s.id}-t`;
    nodes.push({
      id: textId, name: 'n', type: 'TEXT', x: 0, y: 0, width: 10, height: 10, childCount: 0,
      characters: s.sym,
      ...(s.linkTo ? { hyperlinks: s.linkTo.map((v) => ({ start: 0, end: 1, type: 'NODE', value: v })) } : {}),
    });
    children[s.id] = [textId];
    children[textId] = [];
    ancestors[s.id] = [layerId];
    ancestors[textId] = [s.id, layerId];
  }
  ancestors[layerId] = [];
  return { nodes, relations: { children, ancestors } as MarkerPairRelations };
}

describe('annotationMarkerPairRule', () => {
  test('짝이 맞고 왕복 링크가 있으면 통과', () => {
    const { nodes, relations } = build([
      { kind: 'marker', sym: '①', id: 'm1', linkTo: ['g1'] },
      { kind: 'legend', sym: '①', id: 'g1', linkTo: ['m1'] },
    ]);
    expect(annotationMarkerPairRule(nodes, relations)).toEqual([]);
  });

  test('설명 없는 마커를 잡는다', () => {
    const { nodes, relations } = build([{ kind: 'marker', sym: '②', id: 'm2' }]);
    const v = annotationMarkerPairRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('대응하는 범례가 없다');
  });

  test('가리키는 곳 없는 범례를 잡는다 (마커만 지운 흔적)', () => {
    const { nodes, relations } = build([{ kind: 'legend', sym: '③', id: 'g3' }]);
    const v = annotationMarkerPairRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('대응하는 마커가 없다');
  });

  test('같은 번호가 한 레이어에 둘이면 잡는다 (재번호 중 어긋남)', () => {
    const { nodes, relations } = build([
      { kind: 'marker', sym: '①', id: 'm1', linkTo: ['g1'] },
      { kind: 'marker', sym: '①', id: 'm1b', linkTo: ['g1'] },
      { kind: 'legend', sym: '①', id: 'g1', linkTo: ['m1'] },
    ]);
    const v = annotationMarkerPairRule(nodes, relations);
    expect(v.some((x) => x.message.includes('2개 있다'))).toBe(true);
  });

  test('한쪽만 링크가 걸렸으면 방향까지 알려 준다', () => {
    const { nodes, relations } = build([
      { kind: 'marker', sym: '①', id: 'm1', linkTo: ['g1'] },
      { kind: 'legend', sym: '①', id: 'g1' },
    ]);
    const v = annotationMarkerPairRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('범례→마커');
  });

  test('링크가 범례 안쪽 노드를 가리켜도 인정한다', () => {
    const { nodes, relations } = build([
      { kind: 'marker', sym: '①', id: 'm1', linkTo: ['g1-t'] },
      { kind: 'legend', sym: '①', id: 'g1', linkTo: ['m1-t'] },
    ]);
    expect(annotationMarkerPairRule(nodes, relations)).toEqual([]);
  });

  test('requireHyperlink:false 면 링크는 보지 않는다', () => {
    const { nodes, relations } = build([
      { kind: 'marker', sym: '①', id: 'm1' },
      { kind: 'legend', sym: '①', id: 'g1' },
    ]);
    expect(annotationMarkerPairRule(nodes, relations, { requireHyperlink: false })).toEqual([]);
  });

  test('㉑(U+3251) 처럼 ①(U+2460) 과 연속이 아닌 원문자도 번호로 읽는다', () => {
    const { nodes, relations } = build([
      { kind: 'marker', sym: '㉑', id: 'm21', linkTo: ['g21'] },
      { kind: 'legend', sym: '㉑', id: 'g21', linkTo: ['m21'] },
    ]);
    expect(annotationMarkerPairRule(nodes, relations)).toEqual([]);
  });

  test('기획 레이어 밖의 마커·범례는 대상이 아니다', () => {
    const { nodes, relations } = build([
      { kind: 'marker', sym: '①', id: 'm1' },
      { kind: 'legend', sym: '①', id: 'g1' },
    ]);
    // 레이어 태깅을 떼면(=기획 레이어가 아니면) 아무것도 판정하지 않는다
    const plain = nodes.map((n) => (n.isAnnotationLayer ? { ...n, isAnnotationLayer: false } : n));
    expect(annotationMarkerPairRule(plain, relations)).toEqual([]);
  });

  test('레이어가 다르면 같은 번호라도 서로 짝으로 세지 않는다', () => {
    const a = build([
      { kind: 'marker', sym: '①', id: 'a-m', linkTo: ['a-g'] },
      { kind: 'legend', sym: '①', id: 'a-g', linkTo: ['a-m'] },
    ], 'LA');
    const b = build([
      { kind: 'marker', sym: '①', id: 'b-m', linkTo: ['b-g'] },
      { kind: 'legend', sym: '①', id: 'b-g', linkTo: ['b-m'] },
    ], 'LB');
    const nodes = [...a.nodes, ...b.nodes];
    const relations: MarkerPairRelations = {
      children: { ...a.relations.children, ...b.relations.children },
      ancestors: { ...a.relations.ancestors, ...b.relations.ancestors },
    };
    // 페이지 전체로 묶었다면 ① 중복 2건이 떴을 것이다.
    expect(annotationMarkerPairRule(nodes, relations)).toEqual([]);
  });

  test('번호를 읽을 수 없는 인스턴스를 알려 준다', () => {
    const { nodes, relations } = build([{ kind: 'marker', sym: 'X', id: 'mx' }]);
    const v = annotationMarkerPairRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('번호를 읽을 수 없다');
  });
});

// ─── annotation_marker_gap ───────────────────────────────────────────────────
import { annotationMarkerGapRule } from '../src/lint/annotation-marker';

/** 레이어 안 마커 1개 + 레이어 밖 대상들. 절대좌표로만 판정한다. */
function gapScene(markerBox: { x: number; y: number }, targets: Array<{ id: string; x: number; y: number; w?: number; h?: number; type?: string; childCount?: number }>) {
  const nodes: LintNode[] = [
    { id: 'L', name: '📝 기획 주석', type: 'FRAME', x: 0, y: 0, width: 1000, height: 1000, childCount: 1, isAnnotationLayer: true, absoluteX: 0, absoluteY: 0 },
    { id: 'M', name: 'marker①', type: 'INSTANCE', x: 0, y: 0, width: 24, height: 24, childCount: 1, specAlias: 'marker', absoluteX: markerBox.x, absoluteY: markerBox.y },
  ];
  const children: Record<string, string[]> = { L: ['M'], M: [] };
  const ancestors: Record<string, string[]> = { L: [], M: ['L'] };
  for (const t of targets) {
    nodes.push({
      id: t.id, name: t.id, type: t.type || 'INSTANCE',
      x: 0, y: 0, width: t.w ?? 100, height: t.h ?? 30,
      childCount: t.childCount ?? 0, absoluteX: t.x, absoluteY: t.y,
    });
    children[t.id] = [];
    ancestors[t.id] = [];
  }
  return { nodes, relations: { children, ancestors } as MarkerPairRelations };
}

describe('annotationMarkerGapRule', () => {
  test('대상 경계 10px 밖이면 통과', () => {
    const { nodes, relations } = gapScene({ x: 0, y: 66 }, [{ id: 'btn', x: 0, y: 100 }]);
    expect(annotationMarkerGapRule(nodes, relations)).toEqual([]);
  });

  test('대상을 덮으면 잡는다 (가리키려는 것을 가리면 안 된다)', () => {
    const { nodes, relations } = gapScene({ x: 10, y: 105 }, [{ id: 'btn', x: 0, y: 100 }]);
    const v = annotationMarkerGapRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].rule).toBe('annotation_marker_gap');
    expect(v[0].message).toContain('덮고 있다');
  });

  test('12px 넘게 떨어지면 잡는다', () => {
    const { nodes, relations } = gapScene({ x: 0, y: 40 }, [{ id: 'btn', x: 0, y: 100 }]);
    const v = annotationMarkerGapRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('36px');
  });

  test('maxGap 을 넓히면 통과', () => {
    const { nodes, relations } = gapScene({ x: 0, y: 40 }, [{ id: 'btn', x: 0, y: 100 }]);
    expect(annotationMarkerGapRule(nodes, relations, { maxGap: 40 })).toEqual([]);
  });

  test('주변에 아무것도 없으면 "가리킬 대상 없음"으로 잡는다', () => {
    const { nodes, relations } = gapScene({ x: 0, y: 0 }, [{ id: 'far', x: 5000, y: 5000 }]);
    const v = annotationMarkerGapRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('가리킬 만한 요소가 없다');
  });

  test('큰 컨테이너는 후보가 아니다 (마커는 늘 상태 프레임 위에 있다)', () => {
    // 자식을 가진 FRAME = 컨테이너. 이걸 후보로 세면 모든 마커가 "덮음"이 된다.
    const { nodes, relations } = gapScene({ x: 300, y: 300 }, [
      { id: 'stateFrame', x: 0, y: 0, w: 1000, h: 800, type: 'FRAME', childCount: 12 },
      { id: 'btn', x: 300, y: 334 },
    ]);
    expect(annotationMarkerGapRule(nodes, relations)).toEqual([]);
  });

  test('주석끼리는 서로 대상이 아니다', () => {
    const { nodes, relations } = gapScene({ x: 0, y: 0 }, []);
    // 같은 레이어 안 범례를 넣어도 "가리킬 대상"으로 세지 않는다
    nodes.push({ id: 'g', name: 'legend①', type: 'INSTANCE', x: 0, y: 0, width: 360, height: 100, childCount: 2, specAlias: 'legend', absoluteX: 0, absoluteY: 30 });
    relations.children.L.push('g');
    relations.children.g = [];
    relations.ancestors.g = ['L'];
    const v = annotationMarkerGapRule(nodes, relations);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('가리킬 만한 요소가 없다');
  });

  test('절대좌표가 없으면 판정하지 않는다 (로컬좌표로는 애초에 비교가 안 된다)', () => {
    const { nodes, relations } = gapScene({ x: 10, y: 105 }, [{ id: 'btn', x: 0, y: 100 }]);
    const stripped = nodes.map((n) => ({ ...n, absoluteX: undefined, absoluteY: undefined }));
    expect(annotationMarkerGapRule(stripped, relations)).toEqual([]);
  });
});
