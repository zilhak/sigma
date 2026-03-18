/**
 * compare 스펙:
 *   - 두 ExtractedNode의 구조적 차이를 비교
 *   - 반환: { equal: boolean, differences: Difference[], summary: { added, removed, changed, structure } }
 *   - 비교 대상: tagName, textContent, className, styles, boundingRect, attributes, children
 *   - 크기/위치 변경은 1px 이하 차이 무시
 *   - RGBA 색상 비교는 0.01 이하 오차 허용
 *   - 자식 노드는 재귀적으로 비교
 */
import { describe, test, expect } from 'bun:test';
import { compare } from '../src/diff/core';
import type { ExtractedNode, ComputedStyles } from '../src/types';

function makeStyles(overrides?: Partial<ComputedStyles>): ComputedStyles {
  return {
    display: 'block', position: 'static', flexDirection: 'row',
    justifyContent: 'flex-start', alignItems: 'stretch', alignSelf: 'auto',
    flexWrap: 'nowrap', gap: 0, rowGap: 0, columnGap: 0,
    borderSpacingX: 0, borderSpacingY: 0,
    flexGrow: 0, flexShrink: 1, flexBasis: 'auto',
    width: 100, height: 50, minWidth: 0, minHeight: 0, maxWidth: 0, maxHeight: 0,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
    backgroundColor: null, backgroundImage: null,
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
    borderTopColor: null, borderRightColor: null, borderBottomColor: null, borderLeftColor: null,
    borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderBottomLeftRadius: 0,
    color: null, fontSize: 14, fontFamily: 'Arial', fontWeight: '400', fontStyle: 'normal',
    textAlign: 'left', textDecoration: 'none', lineHeight: 20, letterSpacing: 0,
    whiteSpace: 'normal', textOverflow: 'clip', verticalAlign: 'baseline',
    gridTemplateColumns: 'none', gridTemplateRows: 'none', gridAutoFlow: 'row',
    gridColumnStart: 'auto', gridColumnEnd: 'auto', gridRowStart: 'auto', gridRowEnd: 'auto',
    opacity: 1, overflow: 'visible', boxShadow: 'none', transform: 'none',
    ...overrides,
  };
}

function makeNode(overrides?: Partial<ExtractedNode>): ExtractedNode {
  return {
    id: 'node-1', tagName: 'div', className: '', textContent: '',
    attributes: {}, styles: makeStyles(),
    boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    children: [],
    ...overrides,
  };
}

describe('compare', () => {
  // === 기본 동작 ===
  test('동일한 노드 → equal: true, differences 비어 있어야 함', () => {
    const node = makeNode();
    const result = compare(node, node);
    expect(result.equal).toBe(true);
    expect(result.differences).toHaveLength(0);
    expect(result.summary).toEqual({ added: 0, removed: 0, changed: 0, structure: 0 });
  });

  // === 구조 변경 (structure) ===
  test('tagName 변경 → structure 타입 차이', () => {
    const result = compare(makeNode({ tagName: 'div' }), makeNode({ tagName: 'section' }));
    expect(result.equal).toBe(false);
    expect(result.summary.structure).toBeGreaterThanOrEqual(1);
  });

  test('자식 수 변경 → structure 타입 차이', () => {
    const a = makeNode({ children: [makeNode()] });
    const b = makeNode({ children: [] });
    const result = compare(a, b);
    expect(result.summary.structure).toBeGreaterThanOrEqual(1);
  });

  // === 내용 변경 (changed) ===
  test('textContent 변경 → changed', () => {
    const result = compare(makeNode({ textContent: 'A' }), makeNode({ textContent: 'B' }));
    expect(result.summary.changed).toBeGreaterThanOrEqual(1);
  });

  test('className 변경 → changed', () => {
    const result = compare(makeNode({ className: 'x' }), makeNode({ className: 'y' }));
    expect(result.summary.changed).toBeGreaterThanOrEqual(1);
  });

  test('스타일 변경 (fontSize 14→18) → changed', () => {
    const result = compare(
      makeNode({ styles: makeStyles({ fontSize: 14 }) }),
      makeNode({ styles: makeStyles({ fontSize: 18 }) }),
    );
    expect(result.differences.some(d => d.path.includes('fontSize'))).toBe(true);
  });

  // === 속성 변경 ===
  test('속성 추가 → added', () => {
    const result = compare(
      makeNode({ attributes: {} }),
      makeNode({ attributes: { 'data-id': '1' } }),
    );
    expect(result.summary.added).toBeGreaterThanOrEqual(1);
  });

  test('속성 제거 → removed', () => {
    const result = compare(
      makeNode({ attributes: { 'data-id': '1' } }),
      makeNode({ attributes: {} }),
    );
    expect(result.summary.removed).toBeGreaterThanOrEqual(1);
  });

  test('속성 값 변경 → changed', () => {
    const result = compare(
      makeNode({ attributes: { href: '/a' } }),
      makeNode({ attributes: { href: '/b' } }),
    );
    expect(result.summary.changed).toBeGreaterThanOrEqual(1);
  });

  test('style/class 속성은 별도 비교되므로 attributes에서 제외해야 함', () => {
    // style과 class가 attributes에 있어도 중복 비교되지 않아야
    const a = makeNode({ attributes: { style: 'color:red', class: 'x' } });
    const b = makeNode({ attributes: { style: 'color:blue', class: 'y' } });
    const result = compare(a, b);
    // style/class 속성 변경이 attributes diff에 나타나면 안 됨
    const attrDiffs = result.differences.filter(d => d.path.includes('[style]') || d.path.includes('[class]'));
    expect(attrDiffs).toHaveLength(0);
  });

  // === 크기/위치 오차 허용 ===
  test('크기 차이 1px 이하 → 무시해야 함', () => {
    const a = makeNode({ boundingRect: { x: 0, y: 0, width: 100, height: 50 } });
    const b = makeNode({ boundingRect: { x: 0, y: 0, width: 100.8, height: 50 } });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('size'))).toBe(false);
  });

  test('크기 차이 2px → 감지해야 함', () => {
    const a = makeNode({ boundingRect: { x: 0, y: 0, width: 100, height: 50 } });
    const b = makeNode({ boundingRect: { x: 0, y: 0, width: 102, height: 50 } });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('size'))).toBe(true);
  });

  test('위치 차이 1px 이하 → 무시해야 함', () => {
    const a = makeNode({ boundingRect: { x: 10, y: 20, width: 100, height: 50 } });
    const b = makeNode({ boundingRect: { x: 10.5, y: 20, width: 100, height: 50 } });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('position'))).toBe(false);
  });

  test('위치 차이 2px → 감지해야 함', () => {
    const a = makeNode({ boundingRect: { x: 10, y: 20, width: 100, height: 50 } });
    const b = makeNode({ boundingRect: { x: 12, y: 20, width: 100, height: 50 } });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('position'))).toBe(true);
  });

  // === RGBA 색상 오차 허용 ===
  test('RGBA 차이 0.01 이하 → 같다고 판정해야 함', () => {
    const a = makeNode({ styles: makeStyles({ backgroundColor: { r: 1, g: 0, b: 0, a: 1 } }) });
    const b = makeNode({ styles: makeStyles({ backgroundColor: { r: 1, g: 0.005, b: 0, a: 1 } }) });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('backgroundColor'))).toBe(false);
  });

  test('RGBA 차이 0.02 → 감지해야 함', () => {
    const a = makeNode({ styles: makeStyles({ backgroundColor: { r: 1, g: 0, b: 0, a: 1 } }) });
    const b = makeNode({ styles: makeStyles({ backgroundColor: { r: 1, g: 0.02, b: 0, a: 1 } }) });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('backgroundColor'))).toBe(true);
  });

  // === 재귀 비교 ===
  test('자식 노드 내부 변경도 재귀적으로 감지해야 함', () => {
    const a = makeNode({ children: [makeNode({ textContent: 'Old' })] });
    const b = makeNode({ children: [makeNode({ textContent: 'New' })] });
    const result = compare(a, b);
    expect(result.summary.changed).toBeGreaterThanOrEqual(1);
  });

  test('자식 추가 시 added + structure', () => {
    const a = makeNode({ children: [] });
    const b = makeNode({ children: [makeNode({ tagName: 'span' })] });
    const result = compare(a, b);
    expect(result.summary.added).toBeGreaterThanOrEqual(1);
    expect(result.summary.structure).toBeGreaterThanOrEqual(1);
  });

  test('자식 제거 시 removed + structure', () => {
    const a = makeNode({ children: [makeNode({ tagName: 'span' })] });
    const b = makeNode({ children: [] });
    const result = compare(a, b);
    expect(result.summary.removed).toBeGreaterThanOrEqual(1);
    expect(result.summary.structure).toBeGreaterThanOrEqual(1);
  });

  // === summary 정합성 ===
  test('summary 합계 = differences 길이', () => {
    const a = makeNode({ textContent: 'A', attributes: { x: '1' } });
    const b = makeNode({ textContent: 'B', attributes: { y: '2' } });
    const result = compare(a, b);
    const total = result.summary.added + result.summary.removed + result.summary.changed + result.summary.structure;
    expect(total).toBe(result.differences.length);
  });
});
