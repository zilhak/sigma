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
import { SERVER_URL } from './constants';

declare global {
  interface Window {
    __sigma__?: SigmaAPI;
  }
}

interface SaveResult {
  success: boolean;
  id?: string;
  error?: string;
}

interface SigmaAPI {
  // === 추출 ===
  extract: (selectorOrElement: string | Element) => ExtractedNode | null;
  extractAt: (x: number, y: number) => ExtractedNode | null;
  extractAll: (selector: string) => ExtractedNode[];
  extractVisible: (options?: { minWidth?: number; minHeight?: number }) => ExtractedNode[];
  extractAndSave: (name: string, selectorOrElement: string | Element, serverUrl?: string) => Promise<SaveResult>;

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

    /**
     * 요소를 추출하여 Sigma 서버에 저장
     * @param name - 컴포넌트 이름
     * @param selectorOrElement - CSS 선택자 또는 DOM 요소
     * @param serverUrl - Sigma 서버 URL (기본: http://localhost:19832)
     */
    async extractAndSave(
      name: string,
      selectorOrElement: string | Element,
      serverUrl?: string
    ): Promise<SaveResult> {
      const extracted = this.extract(selectorOrElement);
      if (!extracted) {
        return { success: false, error: 'extract returned null' };
      }

      const server = serverUrl || SERVER_URL;
      try {
        const res = await fetch(`${server}/api/extracted`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            data: extracted,
            format: 'json',
            timestamp: Date.now(),
          }),
        });
        const result = await res.json();
        return { success: true, id: result.component?.id };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },

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

    // `window.__sigma__` API 계약의 판번호 — 패키지 버전과 별개 축이다.
    // 이 API 의 함수 시그니처/반환 모양이 바뀔 때만 올린다(리빌드만으로는 올리지 않는다).
    version: '2.0.0',
  };

  console.log(
    '[Sigma] Standalone extractor v2.0.0 loaded. APIs: extract, extractAll, extractVisible, findByText, getPageStructure, getDesignTokens, ...'
  );
}
