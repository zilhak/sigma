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

    /**
     * 셀렉터에 매칭되는 모든 요소를 일괄 추출
     */
    extractAll(selector: string): ExtractedNode[] {
      const elements = document.querySelectorAll(selector);
      const results: ExtractedNode[] = [];
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;
        const node = extractElement(el);
        if (node) results.push(node);
      }
      return results;
    },

    /**
     * 뷰포트 내 보이는 컴포넌트를 자동 추출
     * 시맨틱 요소, role 속성, 일정 크기 이상인 요소를 컴포넌트로 간주
     */
    extractVisible(options?: { minWidth?: number; minHeight?: number }): ExtractedNode[] {
      const minW = options?.minWidth ?? 20;
      const minH = options?.minHeight ?? 20;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const componentSelectors = [
        'button',
        'input',
        'select',
        'textarea',
        'a[href]',
        'nav',
        'header',
        'footer',
        'aside',
        'section > *',
        'article',
        '[role="button"]',
        '[role="navigation"]',
        '[role="dialog"]',
        '[role="tablist"]',
        '[role="alert"]',
        '[class*="card"]',
        '[class*="badge"]',
        '[class*="chip"]',
        '[class*="avatar"]',
        '[class*="modal"]',
        '[class*="dropdown"]',
        '[class*="tooltip"]',
        '[class*="tab"]',
      ];

      const seen = new Set<Element>();
      const results: ExtractedNode[] = [];

      for (const sel of componentSelectors) {
        try {
          const elements = document.querySelectorAll(sel);
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            if (seen.has(el)) continue;
            seen.add(el);

            const rect = el.getBoundingClientRect();
            if (
              rect.width >= minW &&
              rect.height >= minH &&
              rect.right > 0 &&
              rect.bottom > 0 &&
              rect.left < vw &&
              rect.top < vh
            ) {
              const node = extractElement(el);
              if (node) results.push(node);
            }
          }
        } catch {
          // 유효하지 않은 셀렉터 무시
        }
      }

      return results;
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

    /**
     * CSS 커스텀 프로퍼티(변수)를 추출
     * 선택자 미지정 시 :root의 변수를 추출
     */
    getDesignTokens(selectorOrElement?: string | Element): Record<string, string> {
      let element: Element;

      if (!selectorOrElement) {
        element = document.documentElement;
      } else if (typeof selectorOrElement === 'string') {
        element = document.querySelector(selectorOrElement) || document.documentElement;
      } else {
        element = selectorOrElement;
      }

      const tokens: Record<string, string> = {};

      // 1. 인라인 style에서 CSS 변수 수집
      if (element instanceof HTMLElement && element.style.cssText) {
        const matches = element.style.cssText.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g);
        for (const m of matches) {
          tokens[m[1]] = m[2].trim();
        }
      }

      // 2. 스타일시트에서 해당 요소에 적용된 CSS 변수 수집
      for (let i = 0; i < document.styleSheets.length; i++) {
        try {
          const sheet = document.styleSheets[i];
          const rules = sheet.cssRules;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (rule instanceof CSSStyleRule) {
              // :root나 해당 요소에 매칭되는 규칙
              let matches = false;
              try {
                matches = element.matches(rule.selectorText);
              } catch {
                // invalid selector
              }

              if (matches || rule.selectorText === ':root' || rule.selectorText === 'html') {
                const style = rule.style;
                for (let k = 0; k < style.length; k++) {
                  const prop = style[k];
                  if (prop.startsWith('--')) {
                    tokens[prop] = style.getPropertyValue(prop).trim();
                  }
                }
              }
            }
          }
        } catch {
          // CORS 제한으로 외부 스타일시트 접근 불가
        }
      }

      // 3. computed style에서 해결된 값으로 덮어쓰기
      const computed = window.getComputedStyle(element);
      for (const name of Object.keys(tokens)) {
        const resolved = computed.getPropertyValue(name).trim();
        if (resolved) {
          tokens[name] = resolved;
        }
      }

      return tokens;
    },

    // ================================================================
    // 메타
    // ================================================================

    version: '2.0.0',
  };

  console.log(
    '[Sigma] Standalone extractor v2.0.0 loaded. APIs: extract, extractAll, extractVisible, findByText, getPageStructure, getDesignTokens, ...'
  );
}
