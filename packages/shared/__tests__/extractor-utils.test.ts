/**
 * parseSize 스펙: CSS 크기 문자열 → 숫자 (px 기준). auto/none/normal/빈값 → 0
 * parseAutoSize 스펙: "auto" → 문자열 'auto', 나머지는 parseSize와 동일
 * parseBorderSpacing 스펙: CSS border-spacing → { x, y }. 단일값이면 x=y
 * generateId 스펙: 고유 ID 생성, "node-" 접두사
 */
import { describe, test, expect } from 'bun:test';
import { parseSize, parseAutoSize, parseBorderSpacing, generateId } from '../src/extractor/utils';

describe('parseSize', () => {
  // === 정상 입력 ===
  test('px 값 → 숫자', () => {
    expect(parseSize('16px')).toBe(16);
    expect(parseSize('0px')).toBe(0);
  });

  test('소수점 → 소수', () => {
    expect(parseSize('12.5px')).toBe(12.5);
  });

  test('단위 없는 숫자 → 숫자', () => {
    expect(parseSize('14')).toBe(14);
  });

  test('em/rem → 숫자 부분 추출', () => {
    expect(parseSize('1.5em')).toBe(1.5);
    expect(parseSize('2rem')).toBe(2);
  });

  // === 특수 키워드 → 0 ===
  test('auto → 0', () => expect(parseSize('auto')).toBe(0));
  test('none → 0', () => expect(parseSize('none')).toBe(0));
  test('normal → 0', () => expect(parseSize('normal')).toBe(0));
  test('빈 문자열 → 0', () => expect(parseSize('')).toBe(0));

  // === 엣지 케이스 ===
  test('파싱 불가 문자열 → 0', () => {
    expect(parseSize('abc')).toBe(0);
    expect(parseSize('px')).toBe(0);
  });

  test('음수 값', () => {
    expect(parseSize('-5px')).toBe(-5);
  });

  test('매우 큰 값', () => {
    expect(parseSize('99999px')).toBe(99999);
  });
});

describe('parseAutoSize', () => {
  test('"auto" → 문자열 "auto" 반환 (숫자 아님)', () => {
    const result = parseAutoSize('auto');
    expect(result).toBe('auto');
    expect(typeof result).toBe('string');
  });

  test('숫자 값 → 숫자 반환', () => {
    expect(parseAutoSize('100px')).toBe(100);
    expect(typeof parseAutoSize('100px')).toBe('number');
  });

  test('빈 값 → 0', () => {
    expect(parseAutoSize('')).toBe(0);
  });

  test('"AUTO" (대문자) — auto로 인식해야 하는가?', () => {
    // 스펙상 CSS는 case-insensitive이므로 "AUTO"도 auto여야 하지만
    // 실제 브라우저 getComputedStyle은 항상 소문자를 반환
    const result = parseAutoSize('AUTO');
    // 어떤 결과든 크래시는 안 돼야 함
    expect(result).toBeDefined();
  });
});

describe('parseBorderSpacing', () => {
  test('단일 값 → x와 y 동일', () => {
    expect(parseBorderSpacing('8px')).toEqual({ x: 8, y: 8 });
  });

  test('두 값 → x, y 분리', () => {
    expect(parseBorderSpacing('4px 12px')).toEqual({ x: 4, y: 12 });
  });

  test('빈 값 → { x: 0, y: 0 }', () => {
    expect(parseBorderSpacing('')).toEqual({ x: 0, y: 0 });
  });

  test('normal → { x: 0, y: 0 }', () => {
    expect(parseBorderSpacing('normal')).toEqual({ x: 0, y: 0 });
  });

  test('소수점 값', () => {
    expect(parseBorderSpacing('2.5px 4.5px')).toEqual({ x: 2.5, y: 4.5 });
  });
});

describe('generateId', () => {
  test('"node-" 접두사로 시작해야 함', () => {
    expect(generateId()).toMatch(/^node-/);
  });

  test('매번 고유한 값을 반환해야 함', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  test('문자열이어야 함', () => {
    expect(typeof generateId()).toBe('string');
  });
});
