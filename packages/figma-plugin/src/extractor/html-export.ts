import type { ExtractedNode, ComputedStyles, RGBA } from '@sigma/shared';

/**
 * ExtractedNode를 HTML 문자열로 변환
 * parentIsAbsolute: 부모가 절대 좌표 배치(non-flex)인지 여부
 */
export function convertExtractedNodeToHTML(node: ExtractedNode, parentIsAbsolute?: boolean): string {
  const { tagName, className, textContent, styles, children } = node;

  // SVG 노드: svgString이 있으면 그대로 출력
  if (node.svgString) {
    return node.svgString;
  }

  // 스타일 문자열 생성
  let styleStr = buildStyleString(styles);

  // 부모가 절대 좌표 배치면 position/left/top 추가
  if (parentIsAbsolute && node.boundingRect) {
    const positionParts: string[] = [];
    positionParts.push('position: absolute');
    if (node.boundingRect.x !== 0) positionParts.push(`left: ${node.boundingRect.x}px`);
    if (node.boundingRect.y !== 0) positionParts.push(`top: ${node.boundingRect.y}px`);
    const posStr = positionParts.join('; ');
    styleStr = posStr + (styleStr ? '; ' + styleStr : '');
  }

  // 이 노드의 자식이 절대 좌표인지 판단: display가 flex가 아니고 자식이 있으면 절대 좌표
  const isAbsoluteContainer = children && children.length > 0 &&
    styles.display !== 'flex';

  // 클래스 속성
  const classAttr = className ? ` class="${escapeHTMLAttrForExport(className)}"` : '';

  // 스타일 속성
  const styleAttr = styleStr ? ` style="${escapeHTMLAttrForExport(styleStr)}"` : '';

  // 자식이 없고 텍스트만 있는 경우
  if ((!children || children.length === 0) && textContent) {
    return `<${tagName}${classAttr}${styleAttr}>${escapeHTMLContentForExport(textContent)}</${tagName}>`;
  }

  // 자식 노드 재귀 처리 (절대 좌표 여부 전달)
  let childrenHTML = '';
  if (children && children.length > 0) {
    childrenHTML = children.map(child => convertExtractedNodeToHTML(child, isAbsoluteContainer)).join('\n');
  }

  // 텍스트 + 자식 모두 있는 경우
  const content = textContent ? escapeHTMLContentForExport(textContent) + '\n' + childrenHTML : childrenHTML;

  return `<${tagName}${classAttr}${styleAttr}>${content ? '\n' + content + '\n' : ''}</${tagName}>`;
}

/**
 * ComputedStyles를 CSS 인라인 스타일 문자열로 변환
 */
export function buildStyleString(styles: ComputedStyles): string {
  const parts: string[] = [];

  // 크기
  if (typeof styles.width === 'number' && styles.width > 0) {
    parts.push(`width: ${styles.width}px`);
  }
  if (typeof styles.height === 'number' && styles.height > 0) {
    parts.push(`height: ${styles.height}px`);
  }

  // 레이아웃
  if (styles.display && styles.display !== 'block') {
    parts.push(`display: ${styles.display}`);
  }
  if (styles.display === 'flex') {
    if (styles.flexDirection && styles.flexDirection !== 'row') {
      parts.push(`flex-direction: ${styles.flexDirection}`);
    }
    if (styles.justifyContent && styles.justifyContent !== 'flex-start') {
      parts.push(`justify-content: ${styles.justifyContent}`);
    }
    if (styles.alignItems && styles.alignItems !== 'stretch') {
      parts.push(`align-items: ${styles.alignItems}`);
    }
  }
  // flex-wrap
  if (styles.flexWrap && styles.flexWrap !== 'nowrap') {
    parts.push(`flex-wrap: ${styles.flexWrap}`);
  }
  if (styles.gap > 0) {
    parts.push(`gap: ${styles.gap}px`);
  }

  // Flex 아이템 속성
  if (styles.flexGrow > 0) {
    parts.push(`flex-grow: ${styles.flexGrow}`);
  }
  if (styles.alignSelf && styles.alignSelf !== 'auto') {
    parts.push(`align-self: ${styles.alignSelf}`);
  }

  // 패딩
  if (styles.paddingTop > 0 || styles.paddingRight > 0 || styles.paddingBottom > 0 || styles.paddingLeft > 0) {
    if (styles.paddingTop === styles.paddingRight &&
        styles.paddingRight === styles.paddingBottom &&
        styles.paddingBottom === styles.paddingLeft) {
      parts.push(`padding: ${styles.paddingTop}px`);
    } else {
      parts.push(`padding: ${styles.paddingTop}px ${styles.paddingRight}px ${styles.paddingBottom}px ${styles.paddingLeft}px`);
    }
  }

  // 배경색
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    parts.push(`background-color: ${rgbaToCSS(styles.backgroundColor)}`);
  }

  // 테두리
  const borderWidth = styles.borderTopWidth || 0;
  if (borderWidth > 0) {
    parts.push(`border-width: ${borderWidth}px`);
    parts.push(`border-style: solid`);
    if (styles.borderTopColor) {
      parts.push(`border-color: ${rgbaToCSS(styles.borderTopColor)}`);
    }
  }

  // 모서리 라운드
  if (styles.borderTopLeftRadius > 0 || styles.borderTopRightRadius > 0 ||
      styles.borderBottomRightRadius > 0 || styles.borderBottomLeftRadius > 0) {
    if (styles.borderTopLeftRadius === styles.borderTopRightRadius &&
        styles.borderTopRightRadius === styles.borderBottomRightRadius &&
        styles.borderBottomRightRadius === styles.borderBottomLeftRadius) {
      parts.push(`border-radius: ${styles.borderTopLeftRadius}px`);
    } else {
      parts.push(`border-radius: ${styles.borderTopLeftRadius}px ${styles.borderTopRightRadius}px ${styles.borderBottomRightRadius}px ${styles.borderBottomLeftRadius}px`);
    }
  }

  // 텍스트 스타일
  if (styles.color && styles.color.a > 0) {
    parts.push(`color: ${rgbaToCSS(styles.color)}`);
  }
  if (styles.fontSize && styles.fontSize !== 14) {
    parts.push(`font-size: ${styles.fontSize}px`);
  }
  if (styles.fontWeight && styles.fontWeight !== '400') {
    parts.push(`font-weight: ${styles.fontWeight}`);
  }
  if (styles.lineHeight && styles.lineHeight > 0) {
    parts.push(`line-height: ${styles.lineHeight}px`);
  }
  if (styles.letterSpacing && styles.letterSpacing !== 0) {
    parts.push(`letter-spacing: ${styles.letterSpacing}px`);
  }
  if (styles.textAlign && styles.textAlign !== 'left') {
    parts.push(`text-align: ${styles.textAlign}`);
  }

  // overflow
  if (styles.overflow && styles.overflow !== 'visible') {
    parts.push(`overflow: ${styles.overflow}`);
  }

  // 불투명도
  if (styles.opacity < 1) {
    parts.push(`opacity: ${styles.opacity}`);
  }

  // 그림자
  if (styles.boxShadow && styles.boxShadow !== 'none') {
    parts.push(`box-shadow: ${styles.boxShadow}`);
  }

  return parts.join('; ');
}

/**
 * RGBA를 CSS 문자열로 변환
 */
export function rgbaToCSS(color: RGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}

/**
 * HTML 속성값 이스케이프 (export용)
 */
export function escapeHTMLAttrForExport(str: string): string {
  return str.replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

/**
 * HTML 콘텐츠 이스케이프 (export용)
 */
export function escapeHTMLContentForExport(str: string): string {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}
