/**
 * Pseudo-element (::before, ::after) 처리
 */
import type { ComputedStyles, ExtractedNode } from '@sigma/shared';
import { createSolidPaint } from '../styles/color';
import { applyBorder, applyCornerRadius } from '../styles';
import { createTextNode } from './text';

/**
 * 시각적 스타일이 있는지 확인 (배경, 테두리 등)
 */
export function hasVisualStyles(styles: ComputedStyles): boolean {
  // 배경색이 있는 경우
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    return true;
  }

  // 테두리가 있는 경우
  if (styles.borderTopWidth > 0 || styles.borderRightWidth > 0 ||
      styles.borderBottomWidth > 0 || styles.borderLeftWidth > 0) {
    return true;
  }

  // 고정 크기가 있는 경우 (장식 박스일 수 있음)
  if (typeof styles.width === 'number' && styles.width > 0 &&
      typeof styles.height === 'number' && styles.height > 0) {
    return true;
  }

  return false;
}

/**
 * Pseudo-element (::before, ::after) 노드 생성
 * CSS pseudo-elements는 주로 장식 요소나 아이콘으로 사용됨
 */
export function createPseudoElementNode(node: ExtractedNode): FrameNode | TextNode | null {
  const { styles, textContent, boundingRect } = node;

  // 텍스트 콘텐츠만 있는 경우 (예: content: "•" 같은 장식 문자)
  if (textContent && !hasVisualStyles(styles)) {
    return createTextNode(textContent, styles);
  }

  // 시각적 스타일이 있는 경우 프레임으로 생성
  const frame = figma.createFrame();
  frame.name = node.tagName; // '::before' 또는 '::after'

  // 크기 설정 (pseudo-element는 주로 고정 크기)
  const width = typeof styles.width === 'number' && styles.width > 0
    ? styles.width
    : boundingRect.width > 0 ? boundingRect.width : 16;
  const height = typeof styles.height === 'number' && styles.height > 0
    ? styles.height
    : boundingRect.height > 0 ? boundingRect.height : 16;

  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // 배경색 적용
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    frame.fills = [createSolidPaint(styles.backgroundColor)];
  } else {
    frame.fills = [];
  }

  // 테두리 적용
  applyBorder(frame, styles);

  // 모서리 라운드 적용
  applyCornerRadius(frame, styles);

  // 불투명도
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  // 텍스트 콘텐츠가 있으면 내부에 추가
  if (textContent) {
    const textNode = createTextNode(textContent, styles);
    if (textNode) {
      frame.layoutMode = 'HORIZONTAL';
      frame.primaryAxisAlignItems = 'CENTER';
      frame.counterAxisAlignItems = 'CENTER';
      frame.appendChild(textNode);
    }
  }

  return frame;
}
