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
    id: 'node-1',
    tagName: 'div',
    className: '',
    textContent: '',
    attributes: {},
    styles: makeStyles(),
    boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    children: [],
    ...overrides,
  };
}

describe('compare', () => {
  test('동일한 노드 → equal: true', () => {
    const a = makeNode();
    const b = makeNode();
    const result = compare(a, b);
    expect(result.equal).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  test('태그 변경 감지', () => {
    const a = makeNode({ tagName: 'div' });
    const b = makeNode({ tagName: 'span' });
    const result = compare(a, b);
    expect(result.equal).toBe(false);
    expect(result.summary.structure).toBeGreaterThan(0);
    expect(result.differences.some(d => d.type === 'structure')).toBe(true);
  });

  test('텍스트 변경 감지', () => {
    const a = makeNode({ textContent: 'Hello' });
    const b = makeNode({ textContent: 'World' });
    const result = compare(a, b);
    expect(result.summary.changed).toBeGreaterThan(0);
  });

  test('클래스 변경 감지', () => {
    const a = makeNode({ className: 'btn' });
    const b = makeNode({ className: 'btn-primary' });
    const result = compare(a, b);
    expect(result.summary.changed).toBeGreaterThan(0);
  });

  test('스타일 변경 감지 (fontSize)', () => {
    const a = makeNode({ styles: makeStyles({ fontSize: 14 }) });
    const b = makeNode({ styles: makeStyles({ fontSize: 18 }) });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('fontSize'))).toBe(true);
  });

  test('크기 변경 감지 (2px 이상)', () => {
    const a = makeNode({ boundingRect: { x: 0, y: 0, width: 100, height: 50 } });
    const b = makeNode({ boundingRect: { x: 0, y: 0, width: 110, height: 50 } });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('size'))).toBe(true);
  });

  test('크기 차이 1px 이하 → 무시', () => {
    const a = makeNode({ boundingRect: { x: 0, y: 0, width: 100, height: 50 } });
    const b = makeNode({ boundingRect: { x: 0, y: 0, width: 100.5, height: 50 } });
    const result = compare(a, b);
    expect(result.differences.some(d => d.path.includes('size'))).toBe(false);
  });

  test('속성 추가 감지', () => {
    const a = makeNode({ attributes: {} });
    const b = makeNode({ attributes: { 'data-id': '123' } });
    const result = compare(a, b);
    expect(result.summary.added).toBeGreaterThan(0);
  });

  test('속성 제거 감지', () => {
    const a = makeNode({ attributes: { 'data-id': '123' } });
    const b = makeNode({ attributes: {} });
    const result = compare(a, b);
    expect(result.summary.removed).toBeGreaterThan(0);
  });

  test('자식 노드 수 변경 감지', () => {
    const a = makeNode({ children: [makeNode({ tagName: 'span' })] });
    const b = makeNode({ children: [] });
    const result = compare(a, b);
    expect(result.differences.some(d => d.type === 'structure' && d.path.includes('children'))).toBe(true);
  });

  test('자식 노드 추가 감지', () => {
    const a = makeNode({ children: [] });
    const b = makeNode({ children: [makeNode({ tagName: 'span' })] });
    const result = compare(a, b);
    expect(result.summary.added).toBeGreaterThan(0);
    expect(result.summary.structure).toBeGreaterThan(0);
  });

  test('RGBA 색상 비교 (오차 허용)', () => {
    const a = makeNode({ styles: makeStyles({ backgroundColor: { r: 1, g: 0, b: 0, a: 1 } }) });
    const b = makeNode({ styles: makeStyles({ backgroundColor: { r: 1, g: 0.005, b: 0, a: 1 } }) });
    const result = compare(a, b);
    // 0.01 이하 차이는 같다고 판정
    expect(result.differences.some(d => d.path.includes('backgroundColor'))).toBe(false);
  });

  test('summary 카운트 정확성', () => {
    const a = makeNode({
      textContent: 'Old',
      className: 'old-class',
      attributes: { 'data-x': '1' },
    });
    const b = makeNode({
      textContent: 'New',
      className: 'new-class',
      attributes: { 'data-y': '2' },
    });
    const result = compare(a, b);
    // textContent changed, className changed, data-x removed, data-y added
    expect(result.summary.changed).toBeGreaterThanOrEqual(2);
    expect(result.summary.added).toBeGreaterThanOrEqual(1);
    expect(result.summary.removed).toBeGreaterThanOrEqual(1);
  });
});
