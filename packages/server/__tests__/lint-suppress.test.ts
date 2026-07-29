/**
 * 노드 단위 lint 억제(inline suppress) 스펙:
 *   - parseLintIgnore: true / 배열 / 객체(rules+reason) / "all" / 무효 처리
 *   - isSuppressed / filterSuppressed / collectSubjectNodeIds
 */
import { describe, test, expect } from 'bun:test';
import { parseLintIgnore, isSuppressed, filterSuppressed, collectSubjectNodeIds } from '../src/lint/suppress';
import type { Violation } from '@sigma/shared';

const v = (rule: string, nodeId: string): Violation => ({ rule, source: 'builtin', message: `${rule} @ ${nodeId}`, nodes: [nodeId] });

describe('parseLintIgnore', () => {
  test('null/빈문자열 → null', () => {
    expect(parseLintIgnore(null)).toBeNull();
    expect(parseLintIgnore('')).toBeNull();
  });
  test('true → 모든 룰 억제', () => {
    const ig = parseLintIgnore('true')!;
    expect(ig.all).toBe(true);
  });
  test('배열 → 지정 룰', () => {
    const ig = parseLintIgnore('["raw_node","stray_pixel"]')!;
    expect(ig.all).toBe(false);
    expect(ig.rules.has('raw_node')).toBe(true);
    expect(ig.rules.has('stray_pixel')).toBe(true);
  });
  test('객체 {rules,reason}', () => {
    const ig = parseLintIgnore('{"rules":["raw_node"],"reason":"primitive"}')!;
    expect(ig.rules.has('raw_node')).toBe(true);
    expect(ig.reason).toBe('primitive');
  });
  test('객체 {rules:"all"} → 전면 억제', () => {
    const ig = parseLintIgnore('{"rules":"all","reason":"stub"}')!;
    expect(ig.all).toBe(true);
    expect(ig.reason).toBe('stub');
  });
  test('rules 없이 reason만 → 전면 억제(관대 해석)', () => {
    const ig = parseLintIgnore('{"reason":"wip"}')!;
    expect(ig.all).toBe(true);
    expect(ig.reason).toBe('wip');
  });
  test('깨진 JSON / 빈 배열 → null', () => {
    expect(parseLintIgnore('{not json')).toBeNull();
    expect(parseLintIgnore('[]')).toBeNull();
    expect(parseLintIgnore('false')).toBeNull();
  });
});

describe('isSuppressed', () => {
  test('all=true 면 어떤 룰도 억제', () => {
    expect(isSuppressed({ all: true, rules: new Set() }, 'raw_node')).toBe(true);
  });
  test('지정 룰만', () => {
    const ig = { all: false, rules: new Set(['raw_node']) };
    expect(isSuppressed(ig, 'raw_node')).toBe(true);
    expect(isSuppressed(ig, 'stray_pixel')).toBe(false);
  });
});

describe('filterSuppressed', () => {
  test('주체 노드의 lint-ignore로 해당 룰 위반만 제거', () => {
    const violations = [v('raw_node', '1:1'), v('stray_pixel', '1:1'), v('raw_node', '1:2')];
    const ignoreMap = {
      '1:1': '["raw_node"]',          // 1:1의 raw_node만 억제
      '1:2': 'true',                   // 1:2 전면 억제
    };
    const { kept, suppressedCount } = filterSuppressed(violations, ignoreMap);
    expect(suppressedCount).toBe(2);                       // 1:1 raw_node + 1:2 raw_node
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ rule: 'stray_pixel', nodes: ['1:1'] });  // 1:1 stray_pixel 는 살아남음
  });
  test('ignoreMap 비어있으면 전부 유지', () => {
    const violations = [v('raw_node', '1:1')];
    expect(filterSuppressed(violations, {}).kept).toHaveLength(1);
  });
});

describe('collectSubjectNodeIds', () => {
  test('주체 노드 id 중복 제거', () => {
    const ids = collectSubjectNodeIds([v('raw_node', '1:1'), v('stray_pixel', '1:1'), v('raw_node', '1:2')]);
    expect(ids.sort()).toEqual(['1:1', '1:2']);
  });
});
