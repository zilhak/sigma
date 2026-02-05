/**
 * Sigma Standalone Extractor - IIFE Entry Point
 *
 * esbuild로 빌드되어 self-contained IIFE JS 파일로 출력됩니다.
 * Playwright에서 page.addScriptTag({ path }) 로 inject하여 사용합니다.
 *
 * 사용법:
 *   await page.addScriptTag({ path: '/path/to/extractor.standalone.js' });
 *   const data = await page.evaluate(() => window.__sigma__.extract('button.primary'));
 */
import { extractElement } from './extractor/core';

declare global {
  interface Window {
    __sigma__?: {
      extract: (selectorOrElement: string | Element) => ReturnType<typeof extractElement>;
      extractAt: (x: number, y: number) => ReturnType<typeof extractElement>;
      version: string;
    };
  }
}

// 이미 로드되었으면 스킵
if (!window.__sigma__) {
  window.__sigma__ = {
    /**
     * 요소를 ExtractedNode로 추출
     * @param selectorOrElement - CSS 선택자 또는 DOM 요소
     */
    extract(selectorOrElement: string | Element) {
      let element: HTMLElement | SVGElement | null;

      if (typeof selectorOrElement === 'string') {
        element = document.querySelector(selectorOrElement) as HTMLElement | null;
      } else {
        element = selectorOrElement as HTMLElement | SVGElement;
      }

      if (!element) {
        console.error('[Sigma] Element not found:', selectorOrElement);
        return null;
      }

      return extractElement(element);
    },

    /**
     * 좌표에서 요소 추출
     */
    extractAt(x: number, y: number) {
      const element = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!element) {
        console.error('[Sigma] No element at:', x, y);
        return null;
      }
      return extractElement(element);
    },

    version: '1.1.0',
  };

  console.log('[Sigma] Standalone extractor loaded. Use window.__sigma__.extract(selector)');
}
