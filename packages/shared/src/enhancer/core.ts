/**
 * CDP 보강 레이어 코어
 *
 * 기본 DOM 추출 결과(ExtractedNode)를 CDP 세션을 활용하여 보강합니다.
 * Playwright CDPSession 또는 Chrome Extension debugger에서 사용.
 *
 * 사용 예시 (Playwright):
 *   const cdp = await page.context().newCDPSession(page);
 *   const enhanced = await enhance(cdp, extractedData, { platformFonts: true });
 */
import type { ExtractedNode } from '../types';
import type { CDPClient, EnhanceOptions } from './types';
import type { FontEnhancement } from './types';
import { enhanceFonts } from './font';

export interface EnhanceResult {
  /** 보강된 ExtractedNode */
  data: ExtractedNode;
  /** 폰트 보강 결과 (platformFonts 옵션 사용 시) */
  fontEnhancements?: FontEnhancement[];
}

/**
 * ExtractedNode를 CDP로 보강
 *
 * @param cdp - CDP 클라이언트 (Playwright CDPSession 등)
 * @param data - 기본 추출 결과
 * @param options - 보강 옵션
 */
export async function enhance(
  cdp: CDPClient,
  data: ExtractedNode,
  options: EnhanceOptions = {}
): Promise<EnhanceResult> {
  const enhanced = structuredClone(data);
  const result: EnhanceResult = { data: enhanced };

  if (options.platformFonts) {
    result.fontEnhancements = await enhanceFonts(cdp, enhanced);
  }

  return result;
}
