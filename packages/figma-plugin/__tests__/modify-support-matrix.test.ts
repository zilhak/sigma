/**
 * METHOD_SUPPORT_MATRIX 스펙 — 노드 타입별로 허용되는 modify 메서드.
 *
 * 이 표가 틀리면 "성공했다는 응답이 오는데 아무 일도 안 일어나는" 실패가 난다.
 * 서버는 그런 조용한 no-op 을 막으려고 인자 검증까지 넣어 뒀는데(mcp/tool-handler.ts
 * rejectUnknownArgs), 타입↔메서드 조합은 여기서만 걸러진다.
 */
import { describe, test, expect } from 'bun:test';
import { isMethodSupportedForType, getSupportedMethodsForType } from '../src/node-ops/modify';

/** 표에 실제로 항목이 있는 타입들 */
const KNOWN_TYPES = ['FRAME', 'TEXT', 'RECTANGLE', 'ELLIPSE', 'COMPONENT', 'INSTANCE', 'SECTION'];

describe('isMethodSupportedForType', () => {
  test('공통 메서드는 모든 타입이 받는다', () => {
    for (const t of KNOWN_TYPES) {
      expect(isMethodSupportedForType(t, 'rename')).toBe(true);
      expect(isMethodSupportedForType(t, 'setOpacity')).toBe(true);
    }
  });

  test('텍스트 메서드는 도형 노드가 받지 않는다', () => {
    expect(isMethodSupportedForType('TEXT', 'setCharacters')).toBe(true);
    expect(isMethodSupportedForType('RECTANGLE', 'setCharacters')).toBe(false);
    expect(isMethodSupportedForType('ELLIPSE', 'setCharacters')).toBe(false);
  });

  test('FRAME/COMPONENT 는 의도적으로 텍스트 메서드도 허용한다', () => {
    // modify.ts:63 "FRAME: 모든 메서드 지원" — 컨테이너는 넓게 열어 둔다.
    // TEXT 전용으로 좁히면 프레임 대상 호출이 표 단계에서 먼저 막혀 버린다.
    expect(isMethodSupportedForType('FRAME', 'setCharacters')).toBe(true);
    expect(isMethodSupportedForType('COMPONENT', 'setCharacters')).toBe(true);
    // 다만 TEXT 전용 세부 메서드까지 열려 있지는 않다
    expect(isMethodSupportedForType('FRAME', 'setLineHeight')).toBe(false);
    expect(isMethodSupportedForType('TEXT', 'setLineHeight')).toBe(true);
  });

  test('Auto Layout 메서드는 컨테이너만 받는다', () => {
    expect(isMethodSupportedForType('FRAME', 'setLayoutMode')).toBe(true);
    expect(isMethodSupportedForType('TEXT', 'setLayoutMode')).toBe(false);
  });

  test('모르는 타입은 공통 메서드만 허용한다 (거부가 아니라 축소)', () => {
    // 새 Figma 노드 타입이 생겨도 rename/setOpacity 같은 안전한 조작은 막지 않는다.
    expect(isMethodSupportedForType('NOSUCHTYPE', 'rename')).toBe(true);
    expect(isMethodSupportedForType('NOSUCHTYPE', 'setCharacters')).toBe(false);
  });
});

describe('getSupportedMethodsForType', () => {
  test('빈 목록을 돌려주는 타입이 없다', () => {
    for (const t of KNOWN_TYPES) {
      expect(getSupportedMethodsForType(t).length).toBeGreaterThan(0);
    }
  });

  test('TEXT 는 텍스트 메서드를 포함하고 RECTANGLE 은 포함하지 않는다', () => {
    expect(getSupportedMethodsForType('TEXT')).toContain('setCharacters');
    expect(getSupportedMethodsForType('RECTANGLE')).not.toContain('setCharacters');
  });

  test('isMethodSupportedForType 와 목록이 서로 어긋나지 않는다', () => {
    // 두 함수가 같은 표를 보는지 — 한쪽만 고치는 회귀를 막는다.
    for (const t of KNOWN_TYPES) {
      for (const m of getSupportedMethodsForType(t)) {
        expect(isMethodSupportedForType(t, m)).toBe(true);
      }
    }
  });

  test('모르는 타입은 공통 메서드 집합을 돌려준다', () => {
    const unknown = getSupportedMethodsForType('NOSUCHTYPE');
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown).toContain('rename');
    // 모든 알려진 타입이 이 공통 집합을 전부 포함해야 한다
    for (const t of KNOWN_TYPES) {
      const supported = new Set(getSupportedMethodsForType(t));
      for (const m of unknown) expect(supported.has(m)).toBe(true);
    }
  });
});
