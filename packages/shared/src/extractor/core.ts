/**
 * Sigma Extractor Core
 *
 * DOM 요소를 ExtractedNode로 변환하는 공유 추출 로직.
 * Chrome Extension과 Standalone Extractor 모두 이 모듈을 사용합니다.
 */
import type { ExtractedNode, ComputedStyles } from '../types';
import { parseColor } from '../colors';
import { serializeSvgWithComputedStyles } from './svg';

// ============================================================
// Utility Functions
// ============================================================

export function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseSize(value: string): number {
  if (!value || value === 'auto' || value === 'none' || value === 'normal') {
    return 0;
  }
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

export function parseAutoSize(value: string): number | 'auto' {
  if (value === 'auto') return 'auto';
  return parseSize(value);
}

export function parseBorderSpacing(value: string): { x: number; y: number } {
  if (!value || value === 'normal') return { x: 0, y: 0 };
  const parts = value.split(/\s+/);
  const x = parseFloat(parts[0]) || 0;
  const y = parts.length > 1 ? (parseFloat(parts[1]) || 0) : x;
  return { x, y };
}

export function getClassName(element: Element): string {
  const cn = element.className as unknown;
  if (typeof cn === 'object' && cn !== null && 'baseVal' in cn) {
    return (cn as { baseVal: string }).baseVal || '';
  }
  return (cn as string) || '';
}

export function getDirectTextContent(element: HTMLElement): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent?.trim() || '';
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).tagName === 'BR'
    ) {
      text += '\n';
    }
  }
  return text;
}

/**
 * 순수 텍스트 포매팅용 인라인 태그 목록
 * 시각적 스타일 없이 텍스트만 꾸미는 태그들
 */
const INLINE_TEXT_TAGS = new Set([
  'span', 'strong', 'em', 'b', 'i', 'a', 'br', 'code', 'small',
  'sub', 'sup', 'mark', 'abbr', 'cite', 'q', 'time', 'kbd', 'var', 'samp',
]);

/**
 * 요소의 모든 자식이 순수 인라인 텍스트 콘텐츠인지 확인
 * true이면 자식을 개별 노드로 분리하지 않고 텍스트로 병합 가능
 */
export function isAllInlineTextContent(element: HTMLElement): boolean {
  for (const child of element.children) {
    const tag = child.tagName.toLowerCase();
    if (!INLINE_TEXT_TAGS.has(tag)) return false;

    // 인라인 태그라도 시각적 스타일(배경, 테두리, 패딩)이 있으면 병합하지 않음
    if (tag !== 'br') {
      const style = window.getComputedStyle(child);

      // flex/grid 컨테이너는 내부 레이아웃(justifyContent 등)이 시각적 정렬에 영향 → 병합 금지
      const displayVal = style.display;
      if (displayVal === 'flex' || displayVal === 'inline-flex' ||
          displayVal === 'grid' || displayVal === 'inline-grid') {
        return false;
      }

      const bgColor = style.backgroundColor;
      // transparent나 rgba(0,0,0,0)이 아닌 배경색이 있으면 시각적 요소
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        return false;
      }
      if (parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderBottomWidth) > 0) {
        return false;
      }
      if (parseFloat(style.paddingTop) > 2 || parseFloat(style.paddingBottom) > 2) {
        return false;
      }
    }

    // 재귀: 자식의 자식도 인라인이어야 함
    if (child.children.length > 0 && !isAllInlineTextContent(child as HTMLElement)) {
      return false;
    }
  }
  return true;
}

/**
 * 요소의 전체 인라인 콘텐츠를 순서대로 하나의 텍스트로 병합
 * text node, <br>, inline element 텍스트를 DOM 순서 그대로 수집
 */
export function getFullInlineTextContent(element: HTMLElement): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) text += t;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'BR') {
        text += '\n';
      } else {
        // 인라인 자식 재귀
        text += getFullInlineTextContent(el);
      }
    }
  }
  return text;
}

export function getAttributes(element: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of element.attributes) {
    if (attr.name !== 'class' && attr.name !== 'style') {
      attrs[attr.name] = attr.value;
    }
  }
  return attrs;
}

export function isElementVisible(element: HTMLElement | SVGElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName !== 'body' && tagName !== 'html') {
    if (rect.width === 0 || rect.height === 0) return false;
  }

  return true;
}

// ============================================================
// Style Extraction
// ============================================================

export function extractStyles(style: CSSStyleDeclaration): ComputedStyles {
  return {
    // 레이아웃
    display: style.display,
    position: style.position,
    flexDirection: style.flexDirection,
    justifyContent: style.justifyContent,
    alignItems: style.alignItems,
    alignSelf: style.alignSelf,
    flexWrap: style.flexWrap,
    gap: parseSize(style.gap),
    rowGap: parseSize(style.rowGap),
    columnGap: parseSize(style.columnGap),
    borderSpacingX: parseBorderSpacing(style.borderSpacing).x,
    borderSpacingY: parseBorderSpacing(style.borderSpacing).y,

    // Flex 아이템 속성
    flexGrow: parseFloat(style.flexGrow) || 0,
    flexShrink: parseFloat(style.flexShrink) || 1,
    flexBasis: parseAutoSize(style.flexBasis),

    // 크기
    width: parseAutoSize(style.width),
    height: parseAutoSize(style.height),
    minWidth: parseSize(style.minWidth),
    minHeight: parseSize(style.minHeight),
    maxWidth: parseSize(style.maxWidth),
    maxHeight: parseSize(style.maxHeight),

    // 패딩
    paddingTop: parseSize(style.paddingTop),
    paddingRight: parseSize(style.paddingRight),
    paddingBottom: parseSize(style.paddingBottom),
    paddingLeft: parseSize(style.paddingLeft),

    // 마진
    marginTop: parseSize(style.marginTop),
    marginRight: parseSize(style.marginRight),
    marginBottom: parseSize(style.marginBottom),
    marginLeft: parseSize(style.marginLeft),

    // 배경
    backgroundColor: parseColor(style.backgroundColor),
    backgroundImage: style.backgroundImage !== 'none' ? style.backgroundImage : null,

    // 테두리 두께
    borderTopWidth: parseSize(style.borderTopWidth),
    borderRightWidth: parseSize(style.borderRightWidth),
    borderBottomWidth: parseSize(style.borderBottomWidth),
    borderLeftWidth: parseSize(style.borderLeftWidth),

    // 테두리 색상 (width=0이면 색상 정보 불필요 — Figma 라운드트립 일관성)
    borderTopColor: parseSize(style.borderTopWidth) > 0 ? parseColor(style.borderTopColor) : { r: 0, g: 0, b: 0, a: 0 },
    borderRightColor: parseSize(style.borderRightWidth) > 0 ? parseColor(style.borderRightColor) : { r: 0, g: 0, b: 0, a: 0 },
    borderBottomColor: parseSize(style.borderBottomWidth) > 0 ? parseColor(style.borderBottomColor) : { r: 0, g: 0, b: 0, a: 0 },
    borderLeftColor: parseSize(style.borderLeftWidth) > 0 ? parseColor(style.borderLeftColor) : { r: 0, g: 0, b: 0, a: 0 },

    // 테두리 라운드
    borderTopLeftRadius: parseSize(style.borderTopLeftRadius),
    borderTopRightRadius: parseSize(style.borderTopRightRadius),
    borderBottomRightRadius: parseSize(style.borderBottomRightRadius),
    borderBottomLeftRadius: parseSize(style.borderBottomLeftRadius),

    // 텍스트
    color: parseColor(style.color),
    fontSize: parseSize(style.fontSize),
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAlign: style.textAlign,
    textDecoration: style.textDecoration,
    lineHeight: parseSize(style.lineHeight),
    letterSpacing: parseSize(style.letterSpacing),
    whiteSpace: style.whiteSpace,
    textOverflow: style.textOverflow,
    verticalAlign: style.verticalAlign,

    // Grid
    gridTemplateColumns: style.gridTemplateColumns,
    gridTemplateRows: style.gridTemplateRows,
    gridAutoFlow: style.gridAutoFlow,
    gridColumnStart: style.gridColumnStart,
    gridColumnEnd: style.gridColumnEnd,
    gridRowStart: style.gridRowStart,
    gridRowEnd: style.gridRowEnd,

    // 기타
    opacity: parseFloat(style.opacity),
    overflow: style.overflow,
    boxShadow: style.boxShadow,
    transform: style.transform,
  };
}

// ============================================================
// Pseudo-element Extraction
// ============================================================

/**
 * 특정 pseudo-element 추출
 */
export function extractPseudoElement(
  element: HTMLElement,
  pseudo: '::before' | '::after'
): ExtractedNode | null {
  const pseudoStyle = window.getComputedStyle(element, pseudo);

  const content = pseudoStyle.content;
  if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") {
    return null;
  }

  if (pseudoStyle.display === 'none') {
    return null;
  }

  const parentRect = element.getBoundingClientRect();
  const width = parseSize(pseudoStyle.width);
  const height = parseSize(pseudoStyle.height);

  // content에서 텍스트 추출 (따옴표 제거)
  let textContent = '';
  if (content.startsWith('"') && content.endsWith('"')) {
    textContent = content.slice(1, -1);
  } else if (content.startsWith("'") && content.endsWith("'")) {
    textContent = content.slice(1, -1);
  }

  return {
    id: generateId(),
    tagName: pseudo,
    className: '',
    textContent: textContent,
    attributes: {},
    styles: extractStyles(pseudoStyle),
    boundingRect: {
      x: parentRect.x,
      y: parentRect.y,
      width: width || 0,
      height: height || 0,
    },
    children: [],
    isPseudo: true,
  };
}

/**
 * 요소의 ::before, ::after pseudo-elements를 추출
 */
export function extractPseudoElements(element: HTMLElement): ExtractedNode[] {
  const pseudoNodes: ExtractedNode[] = [];

  const beforeNode = extractPseudoElement(element, '::before');
  if (beforeNode) {
    pseudoNodes.push(beforeNode);
  }

  const afterNode = extractPseudoElement(element, '::after');
  if (afterNode) {
    pseudoNodes.push(afterNode);
  }

  return pseudoNodes;
}

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

  return {
    id: generateId(),
    tagName: tagName,
    className: getClassName(element),
    textContent: getDirectTextContent(element as HTMLElement),
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
