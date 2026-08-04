/**
 * getStyleCandidates 스펙:
 *   - CSS font-weight(100~900) → Figma 폰트 스타일 이름 후보 배열
 *   - 폰트마다 스타일 이름 표기가 다르므로(Pretendard "SemiBold" vs Inter "Semi Bold")
 *     하나가 아니라 후보 목록을 돌려주고, 호출부가 순서대로 로드를 시도한다
 *   - 각 100 단위에 자기 분기가 있어야 한다 — 400이 300 분기로 흘러 Light가 되는
 *     회귀가 실제로 있었다(스펙 텍스트가 weight 미지정=400인데 Light로 렌더됨)
 */
import { describe, test, expect } from 'bun:test';
import { getStyleCandidates } from '../src/converter/font-loader';

describe('getStyleCandidates — weight별 첫 후보', () => {
  test('표준 9단계가 각자 자기 스타일로 매핑된다', () => {
    const first = (w: number) => getStyleCandidates(w)[0];
    expect(first(100)).toBe('Thin');
    expect(first(200)).toBe('ExtraLight');
    expect(first(300)).toBe('Light');
    expect(first(400)).toBe('Regular');
    expect(first(500)).toBe('Medium');
    expect(first(600)).toBe('SemiBold');
    expect(first(700)).toBe('Bold');
    expect(first(800)).toBe('ExtraBold');
    expect(first(900)).toBe('Black');
  });

  test('400은 Light가 아니다 (300 분기로 새지 않는다)', () => {
    expect(getStyleCandidates(400)).not.toContain('Light');
  });

  test('표기 흔들리는 weight는 대체 이름을 함께 제안한다', () => {
    // Pretendard "SemiBold" / Inter "Semi Bold" 둘 다 잡혀야 한다
    expect(getStyleCandidates(600)).toContain('SemiBold');
    expect(getStyleCandidates(600)).toContain('Semi Bold');
    expect(getStyleCandidates(400)).toContain('Normal');
  });

  test('중간 값은 아래쪽 단계로 내려간다', () => {
    expect(getStyleCandidates(450)[0]).toBe('Regular');
    expect(getStyleCandidates(650)[0]).toBe('SemiBold');
  });

  test('모든 weight가 비지 않은 후보를 준다', () => {
    for (let w = 100; w <= 900; w += 100) {
      expect(getStyleCandidates(w).length).toBeGreaterThan(0);
    }
  });
});
