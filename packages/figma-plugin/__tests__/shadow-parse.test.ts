/**
 * CSS box-shadow 문자열 → Figma DropShadowEffect.
 *
 * 이 파서의 핵심 난점은 **쉼표 분리**다 — `rgba(0,0,0,.1)` 안의 쉼표로 그림자를 쪼개면
 * 색이 통째로 깨진다. splitShadows 가 괄호 깊이를 세는 이유가 그것이다.
 */
import { describe, test, expect } from 'bun:test';
import { splitShadows, parseSingleShadow, parseBoxShadows } from '../src/converter/styles';

describe('splitShadows', () => {
  test('rgba() 안의 쉼표로 쪼개지 않는다', () => {
    expect(splitShadows('0 1px 2px rgba(0,0,0,.1), 0 2px 4px red')).toEqual([
      '0 1px 2px rgba(0,0,0,.1)',
      '0 2px 4px red',
    ]);
  });

  test('그림자가 하나면 그대로 돌려준다', () => {
    expect(splitShadows('0 1px 2px red')).toEqual(['0 1px 2px red']);
  });
});

describe('parseSingleShadow', () => {
  test('offset/blur/spread/color 를 Figma 이펙트로 옮긴다', () => {
    expect(parseSingleShadow('0 2px 4px 1px rgba(0,0,0,0.5)')).toEqual({
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.5 },
      offset: { x: 0, y: 2 },
      radius: 4,
      spread: 1,
      visible: true,
      blendMode: 'NORMAL',
    });
  });

  test('spread 생략 시 0', () => {
    const e = parseSingleShadow('0 1px 2px rgba(0,0,0,0.1)');
    expect(e?.spread).toBe(0);
    expect(e?.radius).toBe(2);
    expect(e?.offset).toEqual({ x: 0, y: 1 });
  });

  test('파싱 불가한 문자열은 null', () => {
    expect(parseSingleShadow('garbage')).toBeNull();
  });
});

describe('parseBoxShadows', () => {
  test('단일 그림자를 배열로 돌려준다', () => {
    expect(parseBoxShadows('0 1px 2px rgba(0,0,0,0.1)')).toEqual([
      {
        type: 'DROP_SHADOW',
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        offset: { x: 0, y: 1 },
        radius: 2,
        spread: 0,
        visible: true,
        blendMode: 'NORMAL',
      },
    ]);
  });

  test('여러 그림자를 순서대로 돌려준다', () => {
    const effects = parseBoxShadows('0 1px 2px rgba(0,0,0,.1), 0 4px 8px rgba(0,0,0,.2)');
    expect(effects).toHaveLength(2);
    expect(effects[0].offset).toEqual({ x: 0, y: 1 });
    expect(effects[1].offset).toEqual({ x: 0, y: 4 });
  });

  test('none 은 빈 배열', () => {
    expect(parseBoxShadows('none')).toEqual([]);
  });

  test('inset 은 지원하지 않아 버린다 (Figma DROP_SHADOW 로 표현 불가)', () => {
    expect(parseBoxShadows('inset 0 1px 2px red')).toEqual([]);
  });
});
