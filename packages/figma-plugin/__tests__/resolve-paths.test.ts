/**
 * resolvePaths — 여러 경로를 한 왕복에 nodeId 로 해석.
 *
 * 목적은 호출자가 nodeId 를 스크립트에 손으로 옮겨 적는 구조를 없애는 것이다.
 * 배경: docs/history/009-node-ids-were-copied-by-hand.md
 */
import { describe, test, expect } from 'bun:test';
import { resolvePaths } from '../src/node-ops/tree';

interface FakeNode {
  id: string; name: string; type: string;
  parent: FakeNode | null; children?: FakeNode[];
}

function n(id: string, name: string, type: string, children: FakeNode[] = []): FakeNode {
  const node: FakeNode = { id, name, type, parent: null, children };
  for (const c of children) c.parent = node;
  return node;
}

function withFigma<T>(children: FakeNode[], fn: () => T): T {
  const page = { id: 'p1', name: 'Page', type: 'PAGE', children };
  const g = globalThis as unknown as { figma?: unknown };
  const prev = g.figma;
  g.figma = { currentPage: page, root: { children: [page] }, getNodeById: () => null };
  try { return fn(); } finally { g.figma = prev; }
}

const tree = () => [
  n('s1', 'Design System', 'SECTION', [
    n('f1', 'Buttons', 'FRAME', [n('b1', 'Primary', 'INSTANCE'), n('b2', 'Secondary', 'INSTANCE')]),
  ]),
  n('s2', 'Screens', 'SECTION', [n('f2', 'Home', 'FRAME')]),
];

describe('resolvePaths', () => {
  test('positive control — 여러 경로가 한 번에 해석된다', () => {
    const r = withFigma(tree(), () => resolvePaths([
      'Design System/Buttons/Primary',
      'Screens/Home',
    ]));
    expect(r.results.map((x) => x.nodeId)).toEqual(['b1', 'f2']);
    expect(r.results[0].type).toBe('INSTANCE');
  });

  test('부분 실패를 허용한다 — 하나가 없어도 나머지는 해석된다', () => {
    const r = withFigma(tree(), () => resolvePaths(['Screens/Home', 'Screens/없음']));
    expect(r.results[0].nodeId).toBe('f2');
    expect(r.results[1].nodeId).toBeUndefined();
    expect(r.results[1].error).toBeDefined();
    // 어느 경로가 실패했는지 응답만으로 알 수 있어야 한다
    expect(r.results[1].path).toBe('Screens/없음');
  });

  test('type 필터가 적용된다', () => {
    const r = withFigma(tree(), () => resolvePaths(['Screens/Home'], 'SECTION'));
    expect(r.results[0].error).toBeDefined();
  });

  test('배열 경로는 리터럴 이름으로 매칭한다 (이름에 / 가 든 노드)', () => {
    const nodes = [n('s1', 'Icons', 'SECTION', [n('i1', 'icon/arrow/left', 'COMPONENT')])];
    const r = withFigma(nodes, () => resolvePaths([['Icons', 'icon/arrow/left']]));
    expect(r.results[0].nodeId).toBe('i1');
  });

  test('다중 매칭은 개수를 함께 돌려 조용히 첫 번째를 고르지 않는다', () => {
    const nodes = [n('s1', 'S', 'SECTION', [n('a1', 'dup', 'FRAME'), n('a2', 'dup', 'FRAME')])];
    const r = withFigma(nodes, () => resolvePaths(['S/dup']));
    expect(r.results[0].nodeId).toBe('a1');
    expect(r.results[0].matches).toBe(2);
  });
});
