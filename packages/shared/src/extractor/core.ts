/**
 * Sigma Extractor Core
 *
 * DOM 요소를 ExtractedNode로 변환하는 공유 추출 로직.
 * Chrome Extension과 Standalone Extractor 모두 이 모듈을 사용합니다.
 */
import type { ExtractedNode, ComputedStyles } from '../types';
import { parseColor } from '../colors';

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
    flexWrap: style.flexWrap,
    gap: parseSize(style.gap),

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

    // 테두리 색상
    borderTopColor: parseColor(style.borderTopColor),
    borderRightColor: parseColor(style.borderRightColor),
    borderBottomColor: parseColor(style.borderBottomColor),
    borderLeftColor: parseColor(style.borderLeftColor),

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

    // 기타
    opacity: parseFloat(style.opacity),
    overflow: style.overflow,
    boxShadow: style.boxShadow,
    transform: style.transform,
  };
}

// ============================================================
// SVG Handling
// ============================================================

/**
 * computed length 값을 SVG 속성 값으로 변환
 * "10px" -> "10"
 */
export function parseComputedLength(value: string): string {
  if (!value || value === 'auto' || value === 'none') {
    return '0';
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return '0';
  }
  return String(num);
}

/**
 * 개별 SVG 요소에 computed styles 적용
 */
export function applySvgComputedStyles(original: SVGElement, clone: SVGElement): void {
  const computed = window.getComputedStyle(original);

  // 색상 관련 속성
  const fill = computed.fill;
  if (fill && fill !== 'none' && fill !== '') {
    clone.setAttribute('fill', fill);
  }

  const stroke = computed.stroke;
  if (stroke && stroke !== 'none' && stroke !== '') {
    clone.setAttribute('stroke', stroke);
  }

  const strokeWidth = computed.strokeWidth;
  if (strokeWidth && strokeWidth !== '0' && strokeWidth !== '0px') {
    clone.setAttribute('stroke-width', strokeWidth);
  }

  // 불투명도
  const opacity = computed.opacity;
  if (opacity && opacity !== '1') {
    clone.setAttribute('opacity', opacity);
  }

  const fillOpacity = computed.fillOpacity;
  if (fillOpacity && fillOpacity !== '1') {
    clone.setAttribute('fill-opacity', fillOpacity);
  }

  const strokeOpacity = computed.strokeOpacity;
  if (strokeOpacity && strokeOpacity !== '1') {
    clone.setAttribute('stroke-opacity', strokeOpacity);
  }

  // 기하학적 속성
  const tagName = original.tagName.toLowerCase();

  if (tagName === 'circle') {
    if (computed.cx) clone.setAttribute('cx', parseComputedLength(computed.cx));
    if (computed.cy) clone.setAttribute('cy', parseComputedLength(computed.cy));
    if (computed.r) clone.setAttribute('r', parseComputedLength(computed.r));
  }

  if (tagName === 'ellipse') {
    if (computed.cx) clone.setAttribute('cx', parseComputedLength(computed.cx));
    if (computed.cy) clone.setAttribute('cy', parseComputedLength(computed.cy));
    if (computed.rx) clone.setAttribute('rx', parseComputedLength(computed.rx));
    if (computed.ry) clone.setAttribute('ry', parseComputedLength(computed.ry));
  }

  if (tagName === 'rect') {
    if (computed.x) clone.setAttribute('x', parseComputedLength(computed.x));
    if (computed.y) clone.setAttribute('y', parseComputedLength(computed.y));
    if (computed.width && computed.width !== 'auto') clone.setAttribute('width', parseComputedLength(computed.width));
    if (computed.height && computed.height !== 'auto') clone.setAttribute('height', parseComputedLength(computed.height));
    if (computed.rx) clone.setAttribute('rx', parseComputedLength(computed.rx));
    if (computed.ry) clone.setAttribute('ry', parseComputedLength(computed.ry));
  }

  // transform 속성
  const transform = computed.transform;
  if (transform && transform !== 'none') {
    clone.setAttribute('transform', transform);
  }

  // visibility
  if (computed.visibility === 'hidden') {
    clone.setAttribute('visibility', 'hidden');
  }

  // display (none인 경우 visibility로 처리)
  if (computed.display === 'none') {
    clone.setAttribute('visibility', 'hidden');
  }
}

/**
 * SVG 요소의 computed styles를 인라인 속성으로 적용하여 직렬화
 */
export function serializeSvgWithComputedStyles(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originalElements = svg.querySelectorAll('*');
  const cloneElements = clone.querySelectorAll('*');

  // 루트 SVG 요소에도 스타일 적용
  applySvgComputedStyles(svg, clone);

  // 모든 자식 요소에 스타일 적용
  cloneElements.forEach((cloneEl, index) => {
    const originalEl = originalElements[index];
    if (originalEl && cloneEl) {
      applySvgComputedStyles(originalEl as SVGElement, cloneEl as SVGElement);
    }
  });

  return clone.outerHTML;
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
