import type { ExtractedNode, ComputedStyles, RGBA } from '@sigma/shared';
import { parseColor } from '@sigma/shared';
import { createDefaultStyles } from '../utils';

/**
 * CSS spacing 값 파싱 (padding, margin, border-radius)
 */
function parseSpacing(value: string): [number, number, number, number] {
  const parts = value.split(/\s+/).map((v) => parseFloat(v) || 0);

  switch (parts.length) {
    case 1:
      return [parts[0], parts[0], parts[0], parts[0]];
    case 2:
      return [parts[0], parts[1], parts[0], parts[1]];
    case 3:
      return [parts[0], parts[1], parts[2], parts[1]];
    case 4:
      return [parts[0], parts[1], parts[2], parts[3]];
    default:
      return [0, 0, 0, 0];
  }
}

/**
 * style 속성에서 width/height 추출
 */
function extractBoundingFromStyle(attrsString: string): { x: number; y: number; width: number; height: number } {
  const result = { x: 0, y: 0, width: 0, height: 0 };
  const styleMatch = attrsString.match(/style\s*=\s*["']([^"']*)["']/i);

  if (styleMatch) {
    const widthMatch = styleMatch[1].match(/(?:^|;\s*)width\s*:\s*([\d.]+)/);
    const heightMatch = styleMatch[1].match(/(?:^|;\s*)height\s*:\s*([\d.]+)/);
    const leftMatch = styleMatch[1].match(/(?:^|;\s*)left\s*:\s*([\d.]+)/);
    const topMatch = styleMatch[1].match(/(?:^|;\s*)top\s*:\s*([\d.]+)/);
    if (widthMatch) result.width = parseFloat(widthMatch[1]);
    if (heightMatch) result.height = parseFloat(heightMatch[1]);
    if (leftMatch) result.x = parseFloat(leftMatch[1]);
    if (topMatch) result.y = parseFloat(topMatch[1]);
  }

  return result;
}

/**
 * HTML 문자열을 ExtractedNode로 파싱
 * Figma Plugin 환경에서는 DOMParser가 없으므로 간단한 파서 구현
 */
export function parseHTML(html: string): ExtractedNode | null {
  let cleaned = html.trim();
  if (!cleaned) return null;

  // DOCTYPE 제거
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');

  // HTML 주석 제거
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // CDATA 섹션 제거
  cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  cleaned = cleaned.trim();
  if (!cleaned) return null;

  return parseElement(cleaned, 0).node;
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&copy;': '\u00A9',      // ©
    '&reg;': '\u00AE',       // ®
    '&trade;': '\u2122',     // ™
    '&mdash;': '\u2014',     // —
    '&ndash;': '\u2013',     // –
    '&hellip;': '\u2026',    // …
    '&lsquo;': '\u2018',     // '
    '&rsquo;': '\u2019',     // '
    '&ldquo;': '\u201C',     // "
    '&rdquo;': '\u201D',     // "
    '&bull;': '\u2022',      // •
    '&middot;': '\u00B7',    // ·
  };

  let result = text;

  // Named entities
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Numeric entities (&#123; or &#x7B;)
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

interface ParseResult {
  node: ExtractedNode | null;
  endIndex: number;
}

/**
 * 고유 ID 생성
 */
let nodeIdCounter = 0;
function generateNodeId(): string {
  return `html-node-${Date.now()}-${++nodeIdCounter}`;
}

/**
 * HTML 요소 파싱 (재귀)
 */
function parseElement(html: string, startIndex: number): ParseResult {
  const rest = html.slice(startIndex);

  // 텍스트 노드 (태그 아님)
  if (!rest.startsWith('<') || rest.startsWith('</')) {
    const textEnd = rest.indexOf('<');
    const text = textEnd === -1 ? rest : rest.slice(0, textEnd);
    const trimmedText = decodeHTMLEntities(text.trim());

    if (trimmedText) {
      return {
        node: {
          id: generateNodeId(),
          tagName: 'span',
          className: '',
          textContent: trimmedText,
          attributes: {},
          styles: createDefaultStyles(),
          boundingRect: { x: 0, y: 0, width: 0, height: 0 },
          children: [],
        },
        endIndex: startIndex + (textEnd === -1 ? text.length : textEnd),
      };
    }
    return { node: null, endIndex: startIndex + (textEnd === -1 ? text.length : textEnd) };
  }

  // 시작 태그 파싱
  const tagMatch = rest.match(/^<(\w+)([^>]*)>/);
  if (!tagMatch) {
    return { node: null, endIndex: startIndex + 1 };
  }

  const tagName = tagMatch[1].toLowerCase();
  const attrsString = tagMatch[2];
  const afterOpenTag = startIndex + tagMatch[0].length;

  // SVG 요소: 전체를 svgString으로 캡처
  if (tagName === 'svg') {
    const svgClosingTag = '</svg>';
    const svgCloseIndex = html.toLowerCase().indexOf(svgClosingTag, afterOpenTag);
    const svgEndIndex = svgCloseIndex === -1 ? html.length : svgCloseIndex + svgClosingTag.length;
    const svgString = html.slice(startIndex, svgEndIndex);
    const styles = parseInlineStyles(attrsString);
    return {
      node: {
        id: generateNodeId(),
        tagName: 'svg',
        className: '',
        textContent: '',
        attributes: {},
        styles,
        boundingRect: extractBoundingFromStyle(attrsString),
        children: [],
        svgString,
      },
      endIndex: svgEndIndex,
    };
  }

  // 자기 종료 태그 체크 (br, img, input 등)
  const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link'];
  if (selfClosingTags.includes(tagName) || attrsString.endsWith('/')) {
    return {
      node: {
        id: generateNodeId(),
        tagName,
        className: extractClass(attrsString),
        textContent: '',
        attributes: extractAttributes(attrsString),
        styles: parseInlineStyles(attrsString),
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        children: [],
      },
      endIndex: afterOpenTag,
    };
  }

  // 자식 노드 파싱
  const children: ExtractedNode[] = [];
  let textContent = '';
  let currentIndex = afterOpenTag;
  const closingTag = `</${tagName}>`;

  while (currentIndex < html.length) {
    const remaining = html.slice(currentIndex);

    // 종료 태그 발견
    if (remaining.toLowerCase().startsWith(closingTag)) {
      break;
    }

    // 다음 태그 또는 텍스트
    if (remaining.startsWith('<') && !remaining.startsWith('</')) {
      const childResult = parseElement(html, currentIndex);
      if (childResult.node) {
        children.push(childResult.node);
      }
      currentIndex = childResult.endIndex;
    } else if (remaining.startsWith('</')) {
      // 다른 종료 태그 (잘못된 HTML)
      break;
    } else {
      // 텍스트 노드
      const nextTagIndex = remaining.indexOf('<');
      const text = nextTagIndex === -1 ? remaining : remaining.slice(0, nextTagIndex);
      const trimmedText = decodeHTMLEntities(text.trim());
      if (trimmedText) {
        textContent += (textContent ? ' ' : '') + trimmedText;
      }
      currentIndex += text.length;
    }
  }

  // 종료 태그 이후 인덱스
  const closingTagIndex = html.toLowerCase().indexOf(closingTag, currentIndex);
  const endIndex = closingTagIndex === -1 ? html.length : closingTagIndex + closingTag.length;

  return {
    node: {
      id: generateNodeId(),
      tagName,
      className: extractClass(attrsString),
      textContent: children.length === 0 ? textContent : '',
      attributes: extractAttributes(attrsString),
      styles: parseInlineStyles(attrsString),
      boundingRect: extractBoundingFromStyle(attrsString),
      children,
    },
    endIndex,
  };
}

/**
 * class 속성 추출
 */
function extractClass(attrsString: string): string {
  const match = attrsString.match(/class\s*=\s*["']([^"']*)["']/i);
  return match ? match[1] : '';
}

/**
 * 모든 속성 추출
 */
function extractAttributes(attrsString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  // 속성 매칭: name="value" 또는 name='value' 또는 name=value
  const attrRegex = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;

  while ((match = attrRegex.exec(attrsString)) !== null) {
    const name = match[1].toLowerCase();
    // ES2017 호환: ?? 대신 || 사용 (빈 문자열도 falsy이므로 마지막에 '' 처리)
    const value = match[2] !== undefined ? match[2]
                : match[3] !== undefined ? match[3]
                : match[4] !== undefined ? match[4]
                : '';
    // style과 class는 별도 처리하므로 제외
    if (name !== 'style' && name !== 'class') {
      attributes[name] = decodeHTMLEntities(value);
    }
  }

  return attributes;
}

/**
 * inline style 파싱
 */
function parseInlineStyles(attrsString: string): ComputedStyles {
  const styles = createDefaultStyles();
  const styleMatch = attrsString.match(/style\s*=\s*["']([^"']*)["']/i);

  if (!styleMatch) return styles;

  const styleStr = styleMatch[1];
  const rules = styleStr.split(';').filter(Boolean);

  for (const rule of rules) {
    const [prop, value] = rule.split(':').map((s) => s.trim());
    if (!prop || !value) continue;

    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    applyStyleProperty(styles, camelProp, value);
  }

  return styles;
}

/**
 * 스타일 속성 적용
 */
function applyStyleProperty(styles: ComputedStyles, prop: string, value: string) {
  const numValue = parseFloat(value);

  switch (prop) {
    case 'width':
      styles.width = numValue || 0;
      break;
    case 'height':
      styles.height = numValue || 0;
      break;
    case 'backgroundColor':
    case 'background':
      if (value.includes('rgb') || value.includes('#')) {
        styles.backgroundColor = parseCSSColor(value);
      }
      break;
    case 'color':
      styles.color = parseCSSColor(value);
      break;
    case 'fontSize':
      styles.fontSize = numValue || 14;
      break;
    case 'fontWeight':
      styles.fontWeight = value;
      break;
    case 'lineHeight':
      styles.lineHeight = numValue || 0;
      break;
    case 'letterSpacing':
      styles.letterSpacing = numValue || 0;
      break;
    case 'textAlign':
      styles.textAlign = value;
      break;
    case 'display':
      styles.display = value;
      break;
    case 'flexDirection':
      styles.flexDirection = value;
      break;
    case 'justifyContent':
      styles.justifyContent = value;
      break;
    case 'alignItems':
      styles.alignItems = value;
      break;
    case 'gap':
      styles.gap = numValue || 0;
      break;
    case 'flexWrap':
      styles.flexWrap = value;
      break;
    case 'flexGrow':
      styles.flexGrow = numValue || 0;
      break;
    case 'flexShrink':
      styles.flexShrink = numValue || 0;
      break;
    case 'alignSelf':
      styles.alignSelf = value;
      break;
    case 'overflow':
      styles.overflow = value;
      break;
    case 'position':
      styles.position = value;
      break;
    case 'left':
      // boundingRect.x로 매핑 (extractBoundingFromStyle에서 처리)
      break;
    case 'top':
      // boundingRect.y로 매핑 (extractBoundingFromStyle에서 처리)
      break;
    case 'padding':
      const paddings = parseSpacing(value);
      styles.paddingTop = paddings[0];
      styles.paddingRight = paddings[1];
      styles.paddingBottom = paddings[2];
      styles.paddingLeft = paddings[3];
      break;
    case 'paddingTop':
      styles.paddingTop = numValue || 0;
      break;
    case 'paddingRight':
      styles.paddingRight = numValue || 0;
      break;
    case 'paddingBottom':
      styles.paddingBottom = numValue || 0;
      break;
    case 'paddingLeft':
      styles.paddingLeft = numValue || 0;
      break;
    case 'borderRadius':
      const radii = parseSpacing(value);
      styles.borderTopLeftRadius = radii[0];
      styles.borderTopRightRadius = radii[1];
      styles.borderBottomRightRadius = radii[2];
      styles.borderBottomLeftRadius = radii[3];
      break;
    case 'borderWidth': {
      const bws = parseSpacing(value);
      styles.borderTopWidth = bws[0];
      styles.borderRightWidth = bws[1];
      styles.borderBottomWidth = bws[2];
      styles.borderLeftWidth = bws[3];
      break;
    }
    case 'borderTopWidth':
      styles.borderTopWidth = numValue || 0;
      break;
    case 'borderRightWidth':
      styles.borderRightWidth = numValue || 0;
      break;
    case 'borderBottomWidth':
      styles.borderBottomWidth = numValue || 0;
      break;
    case 'borderLeftWidth':
      styles.borderLeftWidth = numValue || 0;
      break;
    case 'borderColor': {
      const bc = parseCSSColor(value);
      styles.borderTopColor = bc;
      styles.borderRightColor = bc;
      styles.borderBottomColor = bc;
      styles.borderLeftColor = bc;
      break;
    }
    case 'borderTopColor':
      styles.borderTopColor = parseCSSColor(value);
      break;
    case 'borderRightColor':
      styles.borderRightColor = parseCSSColor(value);
      break;
    case 'borderBottomColor':
      styles.borderBottomColor = parseCSSColor(value);
      break;
    case 'borderLeftColor':
      styles.borderLeftColor = parseCSSColor(value);
      break;
    case 'opacity':
      styles.opacity = numValue || 1;
      break;
    case 'boxShadow':
      styles.boxShadow = value;
      break;
  }
}

/**
 * CSS 색상 파싱 (hex, rgb, rgba, named colors)
 * parseColor에 위임하되, null 대신 기본값(투명)을 반환
 */
export function parseCSSColor(colorStr: string): RGBA {
  return parseColor(colorStr) || { r: 0, g: 0, b: 0, a: 0 };
}
