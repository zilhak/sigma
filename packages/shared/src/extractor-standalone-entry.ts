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
import { extractElement, extractAll, extractVisible, getDesignTokens } from './extractor/core';
import type { ExtractedNode } from './types';
import {
  findByAlt,
  findByText,
  findForm,
  findContainer,
  queryElementInfo,
  getPageStructure,
} from './discovery/core';
import type { ElementInfo, ContainerOptions, PageStructure } from './discovery/core';

declare global {
  interface Window {
    __sigma__?: SigmaAPI;
  }
}

interface SigmaAPI {
  // === 추출 ===
  extract: (selectorOrElement: string | Element) => ExtractedNode | null;
  extractAt: (x: number, y: number) => ExtractedNode | null;
  extractAll: (selector: string) => ExtractedNode[];
  extractVisible: (options?: { minWidth?: number; minHeight?: number }) => ExtractedNode[];

  // === 탐색 ===
  findByAlt: (altText: string) => ElementInfo | null;
  findByText: (text: string, tagName?: string) => ElementInfo | null;
  findForm: (action?: string) => ElementInfo | null;
  findContainer: (options: ContainerOptions) => ElementInfo | null;
  getElementInfo: (selector: string) => ElementInfo | null;
  getPageStructure: () => PageStructure;

  // === 디자인 토큰 ===
  getDesignTokens: (selectorOrElement?: string | Element) => Record<string, string>;

  // === 메타 ===
  version: string;
}

// 이미 로드되었으면 스킵
if (!window.__sigma__) {
  window.__sigma__ = {
    // ================================================================
    // 추출 API
    // ================================================================

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

    // Bulk & viewport extraction (core로부터 직접 가져옴)
    extractAll,
    extractVisible,

    // ================================================================
    // 탐색 API (Discovery)
    // ================================================================

    findByAlt,
    findByText,
    findForm,
    findContainer,
    getElementInfo: queryElementInfo,
    getPageStructure,

    // ================================================================
    // 디자인 토큰 API
    // ================================================================

    getDesignTokens,

    // ================================================================
    // 메타
    // ================================================================

    version: '2.0.0',
  };

  console.log(
    '[Sigma] Standalone extractor v2.0.0 loaded. APIs: extract, extractAll, extractVisible, findByText, getPageStructure, getDesignTokens, ...'
  );
}
