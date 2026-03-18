/**
 * parseColor 스펙:
 *   - CSS 색상 문자열을 RGBA (0-1 범위)로 변환
 *   - 지원 형식: named colors, hex (#fff/#ffffff/#ffffffff), rgb(), rgba(), hsl(), hsla()
 *   - 파싱 불가 시 null 반환
 *
 * rgbaToString 스펙:
 *   - RGBA (0-1 범위) → CSS 문자열
 *   - alpha=1이면 rgb(), 아니면 rgba()
 */
import { describe, test, expect } from 'bun:test';
import { parseColor, rgbaToString } from '../src/colors';

// 헬퍼: 0-1 범위 검증
function expectInRange01(val: number) {
  expect(val).toBeGreaterThanOrEqual(0);
  expect(val).toBeLessThanOrEqual(1);
}

describe('parseColor', () => {
  // === 무효한 입력 ===
  describe('무효한 입력 → null', () => {
    test.each([
      ['', '빈 문자열'],
      ['none', 'none'],
      ['initial', 'initial'],
      ['inherit', 'inherit'],
    ])('%s → null', (input) => {
      expect(parseColor(input)).toBeNull();
    });
  });

  // === Named colors ===
  describe('named colors', () => {
    test('black = 순수 검정 (r=0, g=0, b=0, a=1)', () => {
      expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    test('white = 순수 흰색 (r=1, g=1, b=1, a=1)', () => {
      expect(parseColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });

    test('transparent = 완전 투명 (a=0)', () => {
      expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    test('대소문자 무시해야 함', () => {
      expect(parseColor('RED')).toEqual(parseColor('red'));
      expect(parseColor('Blue')).toEqual(parseColor('blue'));
    });

    test('앞뒤 공백 무시해야 함', () => {
      expect(parseColor('  red  ')).toEqual(parseColor('red'));
    });

    test('존재하지 않는 named color → null', () => {
      expect(parseColor('fancycolor')).toBeNull();
      expect(parseColor('ultraviolet')).toBeNull();
    });
  });

  // === Hex ===
  describe('hex 형식', () => {
    test('#000 → 검정', () => {
      const result = parseColor('#000')!;
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    test('#fff → 흰색', () => {
      const result = parseColor('#fff')!;
      expect(result.r).toBeCloseTo(1, 2);
      expect(result.g).toBeCloseTo(1, 2);
      expect(result.b).toBeCloseTo(1, 2);
      expect(result.a).toBe(1);
    });

    test('#ff0000 → 빨강', () => {
      const result = parseColor('#ff0000')!;
      expect(result.r).toBeCloseTo(1, 2);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    test('8자리 hex → alpha 포함', () => {
      const result = parseColor('#ff000080')!;
      expect(result.r).toBeCloseTo(1, 2);
      expect(result.a).toBeCloseTo(128 / 255, 2);
    });

    test('4자리 hex → alpha 포함', () => {
      const result = parseColor('#f008')!;
      expect(result.r).toBeCloseTo(1, 2);
      expect(result.a).toBeCloseTo(0x88 / 255, 2);
    });

    test('결과는 항상 0-1 범위여야 함', () => {
      const result = parseColor('#8080ff')!;
      expectInRange01(result.r);
      expectInRange01(result.g);
      expectInRange01(result.b);
      expectInRange01(result.a);
    });

    test('잘못된 길이 → null', () => {
      expect(parseColor('#1')).toBeNull();
      expect(parseColor('#12')).toBeNull();
      expect(parseColor('#12345')).toBeNull();
      expect(parseColor('#123456789')).toBeNull();
    });
  });

  // === RGB/RGBA ===
  describe('rgb/rgba 형식', () => {
    test('rgb(0, 0, 0) → 검정, alpha=1', () => {
      const result = parseColor('rgb(0, 0, 0)')!;
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    test('rgb(255, 255, 255) → 흰색', () => {
      const result = parseColor('rgb(255, 255, 255)')!;
      expect(result.r).toBeCloseTo(1, 2);
      expect(result.g).toBeCloseTo(1, 2);
      expect(result.b).toBeCloseTo(1, 2);
    });

    test('rgba alpha 값 전달', () => {
      const result = parseColor('rgba(255, 0, 0, 0.5)')!;
      expect(result.a).toBe(0.5);
    });

    test('rgb에 alpha 없으면 a=1이어야 함', () => {
      const result = parseColor('rgb(100, 100, 100)')!;
      expect(result.a).toBe(1);
    });

    test('범위 초과 값 (255 초과) — 클램핑하거나 그대로 반환하더라도 크래시 없어야 함', () => {
      const result = parseColor('rgb(300, -10, 256)');
      expect(result).not.toBeNull();
    });

    test('소수점 값 처리', () => {
      const result = parseColor('rgb(127.5, 0, 0)')!;
      expect(result).not.toBeNull();
      expect(result.r).toBeCloseTo(0.5, 1);
    });
  });

  // === HSL/HSLA ===
  describe('hsl/hsla 형식', () => {
    test('hsl(0, 100%, 50%) → 빨강', () => {
      const result = parseColor('hsl(0, 100%, 50%)')!;
      expect(result.r).toBeCloseTo(1, 1);
      expect(result.g).toBeCloseTo(0, 1);
      expect(result.b).toBeCloseTo(0, 1);
    });

    test('hsl(120, 100%, 50%) → 녹색', () => {
      const result = parseColor('hsl(120, 100%, 50%)')!;
      expect(result.g).toBeCloseTo(1, 1);
      expect(result.r).toBeCloseTo(0, 1);
    });

    test('hsl(240, 100%, 50%) → 파랑', () => {
      const result = parseColor('hsl(240, 100%, 50%)')!;
      expect(result.b).toBeCloseTo(1, 1);
      expect(result.r).toBeCloseTo(0, 1);
    });

    test('hsl(0, 0%, 50%) → 회색', () => {
      const result = parseColor('hsl(0, 0%, 50%)')!;
      expect(result.r).toBeCloseTo(0.5, 1);
      expect(result.g).toBeCloseTo(result.r, 2);
      expect(result.b).toBeCloseTo(result.r, 2);
    });

    test('hsla alpha 전달', () => {
      const result = parseColor('hsla(0, 100%, 50%, 0.3)')!;
      expect(result.a).toBe(0.3);
    });

    test('hsl에 alpha 없으면 a=1이어야 함', () => {
      const result = parseColor('hsl(0, 100%, 50%)')!;
      expect(result.a).toBe(1);
    });

    test('결과는 항상 0-1 범위여야 함', () => {
      const result = parseColor('hsl(180, 75%, 60%)')!;
      expectInRange01(result.r);
      expectInRange01(result.g);
      expectInRange01(result.b);
      expectInRange01(result.a);
    });
  });

  // === 라운드트립 ===
  describe('라운드트립: parseColor → rgbaToString → parseColor', () => {
    test.each([
      'rgb(128, 64, 32)',
      'rgba(255, 0, 0, 0.5)',
      '#336699',
    ])('%s → toString → parse 결과 동일', (input) => {
      const parsed1 = parseColor(input)!;
      const str = rgbaToString(parsed1);
      const parsed2 = parseColor(str)!;
      expect(parsed2.r).toBeCloseTo(parsed1.r, 2);
      expect(parsed2.g).toBeCloseTo(parsed1.g, 2);
      expect(parsed2.b).toBeCloseTo(parsed1.b, 2);
      expect(parsed2.a).toBeCloseTo(parsed1.a, 2);
    });
  });
});

describe('rgbaToString', () => {
  test('alpha=1 → rgb() 형식', () => {
    const result = rgbaToString({ r: 1, g: 0, b: 0, a: 1 });
    expect(result).toMatch(/^rgb\(/);
    expect(result).not.toMatch(/rgba/);
  });

  test('alpha<1 → rgba() 형식', () => {
    const result = rgbaToString({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(result).toMatch(/^rgba\(/);
  });

  test('alpha=0 → rgba() 형식', () => {
    const result = rgbaToString({ r: 0, g: 0, b: 0, a: 0 });
    expect(result).toMatch(/^rgba\(/);
  });

  test('rgb 값은 0-255 정수로 출력되어야 함', () => {
    const result = rgbaToString({ r: 0.5, g: 0.5, b: 0.5, a: 1 });
    // 0.5 * 255 = 127.5 → 128 반올림
    expect(result).toBe('rgb(128, 128, 128)');
  });

  test('r=1 → 255', () => {
    const result = rgbaToString({ r: 1, g: 0, b: 0, a: 1 });
    expect(result).toBe('rgb(255, 0, 0)');
  });
});
