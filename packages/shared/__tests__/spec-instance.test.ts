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

  test('줄인 인스턴스를 잡는다 (24×24 아이콘을 16×16 으로)', () => {
    const v = instanceResizedFromSpecRule([node({ width: 16, height: 16 })]);
    expect(v.length).toBe(1);
    expect(v[0].rule).toBe('instance_resized_from_spec');
    expect(v[0].nodes).toEqual(['n1']);
    expect(v[0].message).toContain('폭 24→16');
    expect(v[0].message).toContain('높이 24→16');
  });

  test('늘린 인스턴스를 잡는다 (16×16 체크박스를 48×42 표 칸으로)', () => {
    const v = instanceResizedFromSpecRule([
      node({ name: 'table_check', specAlias: 'table_check_unchecked', componentWidth: 16, componentHeight: 16, width: 48, height: 42 }),
    ]);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('폭 16→48');
  });

  test('한 축만 달라도 그 축만 적어 잡는다', () => {
    const v = instanceResizedFromSpecRule([node({ width: 24, height: 40 })]);
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('높이 24→40');
    expect(v[0].message).not.toContain('폭');
  });

  test('부동소수 반올림(±1e-6)은 무시한다', () => {
    expect(instanceResizedFromSpecRule([node({ width: 24.0000002, height: 23.9999998 })])).toEqual([]);
  });

  test('tolerance 로 허용 오차를 넓힐 수 있다', () => {
    const n = [node({ width: 25, height: 24 })];
    expect(instanceResizedFromSpecRule(n).length).toBe(1);
    expect(instanceResizedFromSpecRule(n, { tolerance: 2 })).toEqual([]);
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
