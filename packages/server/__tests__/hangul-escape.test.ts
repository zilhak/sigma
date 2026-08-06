/**
 * 한글 유니코드 이스케이프 감지.
 *
 * 이 검사가 있는 이유는 결과물 lint 로는 못 잡는 오타 경로를 짚는 것이고(정상 음절 오타),
 * 그래서 **감지 자체가 새면 장치가 무의미해진다.** 실제로 첫 구현이 음절 범위 첫 자리를
 * `[aAdD]` 로 잡아 b·c 로 시작하는 음절(`직`·`접`)을 통째로 놓쳤다 — 그 회귀를 여기서 막는다.
 */
import { describe, test, expect } from 'bun:test';
import { findHangulEscapes } from '../src/mcp/hangul-escape';

describe('findHangulEscapes', () => {
  test('음절 범위 네 자리(a·b·c·d)를 모두 잡는다', () => {
    // 테(D14C) · 방(BC29) · 직(C9C1) · 가(AC00)
    for (const esc of ['\\ud14c', '\\ubc29', '\\uc9c1', '\\uac00']) {
      expect(findHangulEscapes(`{"note":"직접","text":"${esc}"}`).length).toBe(1);
    }
  });

  test('실제 요청 원문 형태에서 여러 음절을 모아 준다', () => {
    const raw = '{"method":"tools/call","params":{"name":"섞임","arguments":{"characters":"\\uc9c1\\uc811 \\uc785\\ub825"}}}';
    const found = findHangulEscapes(raw);
    expect(found.length).toBe(4);
    expect(found[0]).toContain('직');
  });

  test('한글이 그대로 들어오면 걸리지 않는다 (이게 권장 경로다)', () => {
    expect(findHangulEscapes('{"characters":"직접 입력"}')).toEqual([]);
  });

  test('한글 아닌 이스케이프는 걸리지 않는다', () => {
    // 가 부근이 아닌 값들: 개행·라틴·CJK 한자·이모지 서로게이트
    expect(findHangulEscapes('{"a":"\\u000a\\u00e9\\u4e2d\\ud83d\\ude00"}')).toEqual([]);
  });

  test('같은 음절이 여러 번 나와도 한 번만, 최대 5개까지', () => {
    expect(findHangulEscapes('"섞임\\ud14c\\ud14c\\ud14c"')).toHaveLength(1);
    const many = '"섞임' + ['\\uac00', '\\uac01', '\\uac02', '\\uac03', '\\uac04', '\\uac05', '\\uac06'].join('') + '"';
    expect(findHangulEscapes(many)).toHaveLength(5);
  });

  // 클라이언트가 non-ASCII 를 전부 이스케이프하면(Python json.dumps 기본값) 한글을 직접 입력해도
  // 원문은 \uXXXX 가 된다. 그 경우 판정 근거가 없으므로 경고하지 않는다 — 상시 오탐이면 무시하게 된다.
  test('원문이 전부 ASCII 면 판정하지 않는다 (클라이언트 ensure_ascii)', () => {
    expect(findHangulEscapes('{"characters":"\\uc9c1\\uc811 \\uc785\\ub825"}')).toEqual([]);
  });

  test('전역 정규식의 lastIndex 가 호출 간에 새지 않는다', () => {
    const raw = '"섞임\\ud14c\\uc9c1"';
    expect(findHangulEscapes(raw)).toHaveLength(2);
    expect(findHangulEscapes(raw)).toHaveLength(2);
  });
});
