import { describe, test, expect } from 'bun:test';
import { parseColor, rgbaToString } from '../src/colors';

describe('parseColor', () => {
  test('null/empty/키워드 반환', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('none')).toBeNull();
    expect(parseColor('initial')).toBeNull();
    expect(parseColor('inherit')).toBeNull();
  });

  test('named color: transparent', () => {
    const result = parseColor('transparent');
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test('named color: red', () => {
    const result = parseColor('red');
    expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  test('named color: 대소문자 무시', () => {
    expect(parseColor('Red')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor('RED')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  test('hex: #fff (3자리)', () => {
    const result = parseColor('#fff')!;
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBeCloseTo(1, 2);
    expect(result.b).toBeCloseTo(1, 2);
    expect(result.a).toBe(1);
  });

  test('hex: #000000 (6자리)', () => {
    const result = parseColor('#000000')!;
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test('hex: #ff0000 (6자리)', () => {
    const result = parseColor('#ff0000')!;
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  test('hex: #ff000080 (8자리, alpha)', () => {
    const result = parseColor('#ff000080')!;
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.a).toBeCloseTo(0.502, 2);
  });

  test('hex: #f00f (4자리, alpha)', () => {
    const result = parseColor('#f00f')!;
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBeCloseTo(1, 2);
  });

  test('hex: 잘못된 길이', () => {
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
  });

  test('rgb(255, 0, 0)', () => {
    const result = parseColor('rgb(255, 0, 0)')!;
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  test('rgba(255, 128, 0, 0.5)', () => {
    const result = parseColor('rgba(255, 128, 0, 0.5)')!;
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBeCloseTo(0.502, 2);
    expect(result.b).toBe(0);
    expect(result.a).toBe(0.5);
  });

  test('hsl(0, 100%, 50%) → red', () => {
    const result = parseColor('hsl(0, 100%, 50%)')!;
    expect(result.r).toBeCloseTo(1, 1);
    expect(result.g).toBeCloseTo(0, 1);
    expect(result.b).toBeCloseTo(0, 1);
    expect(result.a).toBe(1);
  });

  test('hsla(120, 50%, 50%, 0.8)', () => {
    const result = parseColor('hsla(120, 50%, 50%, 0.8)')!;
    expect(result.g).toBeGreaterThan(result.r);
    expect(result.a).toBe(0.8);
  });

  test('알 수 없는 형식 → null', () => {
    expect(parseColor('fancy-color')).toBeNull();
    expect(parseColor('gradient(45deg, red, blue)')).toBeNull();
  });
});

describe('rgbaToString', () => {
  test('불투명 → rgb()', () => {
    expect(rgbaToString({ r: 1, g: 0, b: 0, a: 1 })).toBe('rgb(255, 0, 0)');
  });

  test('반투명 → rgba()', () => {
    expect(rgbaToString({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('rgba(0, 0, 0, 0.5)');
  });

  test('투명 → rgba()', () => {
    expect(rgbaToString({ r: 0, g: 0, b: 0, a: 0 })).toBe('rgba(0, 0, 0, 0)');
  });

  test('중간값 반올림', () => {
    expect(rgbaToString({ r: 0.5, g: 0.5, b: 0.5, a: 1 })).toBe('rgb(128, 128, 128)');
  });
});
