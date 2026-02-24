/**
 * Pseudo-element (::before, ::after) 추출
 *
 * CSS pseudo-element의 존재를 감지하고 ExtractedNode로 변환합니다.
 * 프로브 span을 사용하여 pseudo-element의 실제 크기를 측정합니다.
 */
import type { ExtractedNode, BoundingRect } from '../types';
import { generateId, parseSize } from './utils';
import { extractStyles } from './styles';

/**
 * pseudo-element의 바운딩 크기를 측정
 *
 * CSS width/height가 명시되어 있으면 사용하고,
 * 없으면 프로브 span을 삽입하여 실제 렌더링 크기를 측정합니다.
 */
function measurePseudoBounds(
  element: HTMLElement,
  content: string,
  pseudoStyle: CSSStyleDeclaration
): BoundingRect {
  const parentRect = element.getBoundingClientRect();

  // 먼저 CSS 명시 크기 체크
  const cssWidth = parseFloat(pseudoStyle.width);
  const cssHeight = parseFloat(pseudoStyle.height);
  if (cssWidth > 0 && cssHeight > 0) {
    return { x: parentRect.x, y: parentRect.y, width: cssWidth, height: cssHeight };
  }

  // 프로브 span으로 실제 크기 측정
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';

  // pseudo-element의 핵심 스타일 복사
  const propsToClone = [
    'font', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
    'lineHeight', 'letterSpacing', 'padding', 'border', 'display',
    'width', 'height',
  ];
  for (const prop of propsToClone) {
    (probe.style as any)[prop] = (pseudoStyle as any)[prop];
  }

  const textContent = content.replace(/^['"]|['"]$/g, '');
  probe.textContent = textContent;
  element.appendChild(probe);
  const probeRect = probe.getBoundingClientRect();
  element.removeChild(probe);

  return {
    x: parentRect.x,
    y: parentRect.y,
    width: probeRect.width > 0 ? probeRect.width : (parseSize(pseudoStyle.width) || 16),
    height: probeRect.height > 0 ? probeRect.height : (parseSize(pseudoStyle.height) || 16),
  };
}

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

  // 프로브 기반 바운딩 측정
  const bounds = measurePseudoBounds(element, content, pseudoStyle);

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
    boundingRect: bounds,
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
