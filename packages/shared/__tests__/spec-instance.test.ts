/**
 * instance_resized_from_spec — 스펙 인스턴스를 마스터와 다른 크기로 놔둔 것 검출.
 * 스펙 마스터는 HTML 을 고정 크기 자식 트리로 구운 것이라 인스턴스를 늘려도 자식이 안 따라온다.
 */
import { describe, test, expect } from 'bun:test';
import { instanceResizedFromSpecRule } from '../src/lint/spec-instance';
import type { LintNode } from '../src/lint/types';

function node(over: Partial<LintNode>): LintNode {
  return {
    id: 'n1', name: 'inst', type: 'INSTANCE',
    x: 0, y: 0, width: 24, height: 24, childCount: 1,
    specAlias: 'icon_ccp_trashcan', componentWidth: 24, componentHeight: 24,
    ...over,
  };
}

describe('instanceResizedFromSpecRule', () => {
  test('마스터와 크기가 같으면 통과', () => {
    expect(instanceResizedFromSpecRule([node({})])).toEqual([]);
  });

  test('작은 컨트롤을 배 이상 늘린 것을 잡는다 (16×16 체크박스 → 48×42 표 칸)', () => {
    const v = instanceResizedFromSpecRule([
      node({ name: 'table_check', specAlias: 'table_check_unchecked', componentWidth: 16, componentHeight: 16, width: 48, height: 42 }),
    ]);
    expect(v.length).toBe(1);
    expect(v[0].rule).toBe('instance_resized_from_spec');
    expect(v[0].message).toContain('폭 16→48');
    expect(v[0].message).toContain('3.0배');
  });

  test('⭐ 표 셀처럼 열 너비 때문에 늘리고 줄이는 정상 사용은 잡지 않는다', () => {
    // 실측: 이걸 잡으면 한 페이지에서만 2220건이 나온다 — 규칙이 아니라 소음이 된다.
    const cell = { specAlias: 'table_cell', componentWidth: 180, componentHeight: 42 };
    expect(instanceResizedFromSpecRule([node({ ...cell, width: 300, height: 42 })])).toEqual([]);
    expect(instanceResizedFromSpecRule([node({ ...cell, width: 110, height: 42 })])).toEqual([]);
  });

  test('줄임은 기본적으로 잡지 않는다 (실제 피해는 child_overflow 가 이미 잡는다)', () => {
    const shrunk = [node({ width: 16, height: 16 })];   // 24×24 아이콘 → 16×16
    expect(instanceResizedFromSpecRule(shrunk)).toEqual([]);
    const v = instanceResizedFromSpecRule(shrunk, { flagShrink: true });
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('폭 24→16');
  });

  test('원래 큰 요소를 늘린 것은 의도로 본다', () => {
    const v = instanceResizedFromSpecRule([
      node({ specAlias: 'panel', componentWidth: 400, componentHeight: 200, width: 1200, height: 600 }),
    ]);
    expect(v).toEqual([]);
  });

  test('한 축만 크게 늘렸으면 그 축만 적는다', () => {
    const v = instanceResizedFromSpecRule([node({ width: 24, height: 60 })]);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('높이 24→60');
    expect(v[0].message).not.toContain('폭 24');
  });

  test('부동소수 반올림(±1e-6)은 무시한다', () => {
    expect(instanceResizedFromSpecRule([node({ width: 24.0000002, height: 23.9999998 })])).toEqual([]);
  });

  test('growthRatio 로 민감도를 조절할 수 있다', () => {
    const n = [node({ width: 40, height: 24 })];        // 24 → 40 = 1.7배
    expect(instanceResizedFromSpecRule(n)).toEqual([]);
    expect(instanceResizedFromSpecRule(n, { growthRatio: 1.5 }).length).toBe(1);
  });

  test('⭐ hug 축은 아예 보지 않는다 (내용에 따라 늘어나는 게 정상)', () => {
    // 실측: 이걸 빼지 않으면 줄바꿈 텍스트 스펙(범례·메모)이 전부 위반으로 잡힌다.
    const legend = node({ specAlias: 'legend', componentWidth: 320, componentHeight: 38, width: 320, height: 86 });
    expect(instanceResizedFromSpecRule([legend]).length).toBe(1);   // sizing 을 모르면 판정한다
    expect(instanceResizedFromSpecRule([legend], {
      sizingByAlias: { legend: { horizontal: 'fixed', vertical: 'hug' } },
    })).toEqual([]);
  });

  test('fixed 축은 sizing 을 알아도 그대로 판정한다', () => {
    const chk = node({ specAlias: 'table_check', componentWidth: 16, componentHeight: 16, width: 48, height: 42 });
    const v = instanceResizedFromSpecRule([chk], {
      sizingByAlias: { table_check: { horizontal: 'fixed', vertical: 'fixed' } },
    });
    expect(v.length).toBe(1);
  });

  test('스펙 스탬프가 없는 일반 컴포넌트 인스턴스는 대상이 아니다', () => {
    // 손으로 만든 컴포넌트는 제약/오토레이아웃으로 정상 리플로우된다.
    const v = instanceResizedFromSpecRule([node({ specAlias: undefined, width: 100 })]);
    expect(v).toEqual([]);
  });

  test('마스터 크기를 모르면(상세 조회 실패 등) 판정하지 않는다', () => {
    const v = instanceResizedFromSpecRule([node({ componentWidth: undefined, width: 100 })]);
    expect(v).toEqual([]);
  });

  test('INSTANCE 가 아닌 노드는 건너뛴다', () => {
    const v = instanceResizedFromSpecRule([node({ type: 'FRAME', width: 100 })]);
    expect(v).toEqual([]);
  });
});
