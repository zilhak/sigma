import { describe, test, expect } from 'bun:test';
import { parseSize, parseAutoSize, parseBorderSpacing, generateId } from '../src/extractor/utils';

describe('parseSize', () => {
  test('픽셀 값', () => {
    expect(parseSize('16px')).toBe(16);
    expect(parseSize('0px')).toBe(0);
    expect(parseSize('12.5px')).toBe(12.5);
  });

  test('단위 없는 숫자', () => {
    expect(parseSize('14')).toBe(14);
  });

  test('auto → 0', () => {
    expect(parseSize('auto')).toBe(0);
  });

  test('none → 0', () => {
    expect(parseSize('none')).toBe(0);
  });

  test('normal → 0', () => {
    expect(parseSize('normal')).toBe(0);
  });

  test('빈 문자열 → 0', () => {
    expect(parseSize('')).toBe(0);
  });

  test('파싱 불가 → 0', () => {
    expect(parseSize('abc')).toBe(0);
  });

  test('em/rem 값 (숫자 부분만)', () => {
    expect(parseSize('1.5em')).toBe(1.5);
    expect(parseSize('2rem')).toBe(2);
  });
});

describe('parseAutoSize', () => {
  test('auto 문자열 → "auto"', () => {
    expect(parseAutoSize('auto')).toBe('auto');
  });

  test('숫자 값 → 숫자', () => {
    expect(parseAutoSize('100px')).toBe(100);
    expect(parseAutoSize('0')).toBe(0);
  });

  test('빈 값 → 0', () => {
    expect(parseAutoSize('')).toBe(0);
  });
});

describe('parseBorderSpacing', () => {
  test('단일 값', () => {
    expect(parseBorderSpacing('8px')).toEqual({ x: 8, y: 8 });
  });

  test('두 값 (가로 세로)', () => {
    expect(parseBorderSpacing('4px 8px')).toEqual({ x: 4, y: 8 });
  });

  test('빈 값 → 0', () => {
    expect(parseBorderSpacing('')).toEqual({ x: 0, y: 0 });
  });

  test('normal → 0', () => {
    expect(parseBorderSpacing('normal')).toEqual({ x: 0, y: 0 });
  });
});

describe('generateId', () => {
  test('node- 접두사', () => {
    expect(generateId()).toMatch(/^node-/);
  });

  test('매번 고유한 값', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
