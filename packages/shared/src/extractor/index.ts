/**
 * Sigma Extractor - Barrel Export
 *
 * DOM 요소 추출 함수를 제공합니다.
 * 주의: 이 모듈은 DOM API에 의존하므로 브라우저 환경에서만 사용 가능합니다.
 */
export {
  // Main extraction
  extractElement,

  // Bulk & viewport extraction
  extractAll,
  extractVisible,

  // Design tokens
  getDesignTokens,

  // Style extraction
  extractStyles,

  // Visibility
  isElementVisible,

  // DOM utilities
  getClassName,
  getDirectTextContent,
  getAttributes,

  // Size parsing
  parseSize,
  parseAutoSize,
  generateId,

  // Pseudo-elements
  extractPseudoElements,
  extractPseudoElement,
} from './core';

export {
  // SVG handling
  serializeSvgWithComputedStyles,
  applySvgComputedStyles,
  parseComputedLength,
} from './svg';
