/**
 * Sigma Extractor - Barrel Export
 *
 * DOM 요소 추출 함수를 제공합니다.
 * 주의: 이 모듈은 DOM API에 의존하므로 브라우저 환경에서만 사용 가능합니다.
 */

// Main extraction
export { extractElement, extractAll, extractVisible, getDesignTokens } from './core';

// Utilities
export { generateId, parseSize, parseAutoSize, parseBorderSpacing, getClassName, getDirectTextContent, getAttributes } from './utils';

// Style extraction
export { extractStyles } from './styles';

// Visibility
export { isElementVisible } from './visibility';

// Text merge
export { isAllInlineTextContent, getFullInlineTextContent } from './text';

// Icon font detection
export { isIconFontElement, captureIconAsImage } from './icons';

// Pseudo-elements
export { extractPseudoElement, extractPseudoElements } from './pseudo';

// SVG handling
export { serializeSvgWithComputedStyles, applySvgComputedStyles, parseComputedLength } from './svg';
