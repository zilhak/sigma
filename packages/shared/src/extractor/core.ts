/**
 * Sigma Extractor Core
 *
 * DOM 요소를 ExtractedNode로 변환하는 공유 추출 로직.
 * Chrome Extension과 Standalone Extractor 모두 이 모듈을 사용합니다.
 */
import type { ExtractedNode } from '../types';
import { serializeSvgWithComputedStyles } from './svg';
import { generateId, getClassName, getAttributes, getDirectTextContent } from './utils';
import { extractStyles } from './styles';
import { isElementVisible } from './visibility';
import { isAllInlineTextContent, getFullInlineTextContent } from './text';
import { isIconFontElement, captureIconAsImage } from './icons';
import { extractPseudoElements } from './pseudo';

// ============================================================
// Main Extraction Function
// ============================================================

/**
 * DOM 요소를 ExtractedNode로 변환
 */
export function extractElement(element: HTMLElement | SVGElement): ExtractedNode | null {
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);
  const tagName = element.tagName.toLowerCase();

  // 루트 요소(body)가 아닌 경우 visibility 체크
  if (tagName !== 'body' && !isElementVisible(element)) {
    return null;
  }

  // Canvas 요소인 경우: 이미지 데이터 URL로 변환
  if (tagName === 'canvas') {
    const canvas = element as unknown as HTMLCanvasElement;
    let imageDataUrl: string | undefined;
    try {
      imageDataUrl = canvas.toDataURL('image/png');
    } catch {
      // CORS 또는 보안 제한으로 데이터 추출 불가
    }

    return {
      id: generateId(),
      tagName: 'canvas',
      className: getClassName(element),
      textContent: '',
      attributes: getAttributes(element as HTMLElement),
      styles: extractStyles(computedStyle),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: [],
      imageDataUrl,
    };
  }

  // 이미지 요소인 경우: src 또는 data URL 캡처
  if (tagName === 'img') {
    const img = element as unknown as HTMLImageElement;
    let imageDataUrl: string | undefined;

    if (img.src && img.src.startsWith('data:')) {
      // data URL인 경우 그대로 사용
      imageDataUrl = img.src;
    } else if (img.complete && img.naturalWidth > 0) {
      // 로드된 이미지를 canvas로 변환
      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          imageDataUrl = tempCanvas.toDataURL('image/png');
        }
      } catch {
        // CORS 제한으로 변환 불가
      }
    }

    return {
      id: generateId(),
      tagName: 'img',
      className: getClassName(element),
      textContent: '',
      attributes: getAttributes(element as HTMLElement),
      styles: extractStyles(computedStyle),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: [],
      imageDataUrl,
    };
  }

  // SVG 요소인 경우
  if (tagName === 'svg' || element instanceof SVGSVGElement) {
    const svgWithStyles = serializeSvgWithComputedStyles(element as SVGSVGElement);

    return {
      id: generateId(),
      tagName: 'svg',
      className: getClassName(element),
      textContent: '',
      attributes: getAttributes(element as HTMLElement),
      styles: extractStyles(computedStyle),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: [],
      svgString: svgWithStyles,
    };
  }

  // 아이콘 폰트 요소인 경우: 이미지로 캡처
  if (isIconFontElement(element)) {
    const imageDataUrl = captureIconAsImage(element);
    return {
      id: generateId(),
      tagName: 'img',
      className: getClassName(element),
      textContent: '',
      attributes: { ...getAttributes(element as HTMLElement), 'data-icon-font': 'true' },
      styles: extractStyles(computedStyle),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: [],
      imageDataUrl: imageDataUrl || undefined,
    };
  }

  // 혼합 인라인 콘텐츠 감지:
  // 모든 자식이 순수 텍스트 포매팅용 인라인 태그이고
  // 시각적 스타일(배경, 테두리)이 없으면 하나의 텍스트로 병합
  if (element.children.length > 0 && isAllInlineTextContent(element)) {
    const mergedText = getFullInlineTextContent(element);
    // Pseudo-elements도 포함
    const pseudoElements = extractPseudoElements(element as HTMLElement);
    const beforeElements = pseudoElements.filter(p => p.tagName === '::before');
    const afterElements = pseudoElements.filter(p => p.tagName === '::after');
    const allChildren = [...beforeElements, ...afterElements];

    return {
      id: generateId(),
      tagName: tagName,
      className: getClassName(element),
      textContent: mergedText,
      attributes: getAttributes(element as HTMLElement),
      styles: extractStyles(computedStyle),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: allChildren,
    };
  }

  // DOM 자식 요소 추출
  const domChildren = Array.from(element.children)
    .filter((child): child is HTMLElement | SVGSVGElement =>
      child instanceof HTMLElement || child instanceof SVGSVGElement)
    .map((child) => extractElement(child))
    .filter((child): child is ExtractedNode => child !== null);

  // Pseudo-elements 추출
  const pseudoElements = extractPseudoElements(element as HTMLElement);
  const beforeElements = pseudoElements.filter(p => p.tagName === '::before');
  const afterElements = pseudoElements.filter(p => p.tagName === '::after');

  const allChildren = [...beforeElements, ...domChildren, ...afterElements];

  // 자식의 실제 렌더링 위치를 기반으로 부모 boundingRect 확장
  // absolute/fixed 자식은 부모의 getBoundingClientRect()에 포함되지 않으므로
  // 브라우저가 이미 계산한 자식의 bounding box를 사용하여 부모 크기를 보정

  // overflow: hidden/scroll/auto 컨테이너의 실제 콘텐츠 크기 반영
  // scrollWidth/scrollHeight는 클리핑된 콘텐츠 포함 전체 크기를 반환
  const htmlEl = element as HTMLElement;
  const contentWidth = Math.max(rect.width, htmlEl.scrollWidth || 0);
  const contentHeight = Math.max(rect.height, htmlEl.scrollHeight || 0);

  // 무한 스크롤 보호: 최대 크기 제한
  const MAX_DIMENSION = 10000;
  const cappedWidth = Math.min(contentWidth, MAX_DIMENSION);
  const cappedHeight = Math.min(contentHeight, MAX_DIMENSION);

  let finalX = rect.x;
  let finalY = rect.y;
  let finalMaxX = rect.x + cappedWidth;
  let finalMaxY = rect.y + cappedHeight;

  const overflow = computedStyle.overflow;
  const isOverflowVisible = !overflow || overflow === 'visible';

  if (isOverflowVisible && allChildren.length > 0) {
    for (const child of allChildren) {
      const cr = child.boundingRect;
      if (cr.width > 0 && cr.height > 0) {
        finalX = Math.min(finalX, cr.x);
        finalY = Math.min(finalY, cr.y);
        finalMaxX = Math.max(finalMaxX, cr.x + cr.width);
        finalMaxY = Math.max(finalMaxY, cr.y + cr.height);
      }
    }
  }

  const extractedStyles = extractStyles(computedStyle);

  // 자식 오버플로로 확장된 경우, styles의 width/height도 보정
  // (변환기가 styles.width/height를 boundingRect보다 우선 사용하므로)
  const expandedWidth = finalMaxX - finalX;
  const expandedHeight = finalMaxY - finalY;
  if (expandedWidth > rect.width && typeof extractedStyles.width === 'number') {
    extractedStyles.width = expandedWidth;
  }
  if (expandedHeight > rect.height && typeof extractedStyles.height === 'number') {
    extractedStyles.height = expandedHeight;
  }

  return {
    id: generateId(),
    tagName: tagName,
    className: getClassName(element),
    textContent: getDirectTextContent(element as HTMLElement),
    attributes: getAttributes(element as HTMLElement),
    styles: extractedStyles,
    boundingRect: {
      x: finalX,
      y: finalY,
      width: expandedWidth,
      height: expandedHeight,
    },
    children: allChildren,
  };
}

// ============================================================
// Bulk & Viewport Extraction
// ============================================================

/**
 * 셀렉터에 매칭되는 모든 요소를 일괄 추출
 */
export function extractAll(selector: string): ExtractedNode[] {
  const elements = document.querySelectorAll(selector);
  const results: ExtractedNode[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const node = extractElement(el);
    if (node) results.push(node);
  }
  return results;
}

/**
 * 뷰포트 내 보이는 컴포넌트를 자동 추출
 * 시맨틱 요소, role 속성, 일정 크기 이상인 요소를 컴포넌트로 간주
 */
export function extractVisible(options?: { minWidth?: number; minHeight?: number }): ExtractedNode[] {
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
}

// ============================================================
// Design Tokens Extraction
// ============================================================

/**
 * CSS 커스텀 프로퍼티(변수)를 추출
 * 선택자 미지정 시 :root의 변수를 추출
 */
export function getDesignTokens(selectorOrElement?: string | Element): Record<string, string> {
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
}
