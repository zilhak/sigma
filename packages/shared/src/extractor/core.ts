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

interface TextLine {
  text: string;
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * 하나의 텍스트 노드를 렌더된 줄 단위로 분할한다.
 * 여러 줄에 걸친 텍스트를 getBoundingClientRect()로 잡으면 모든 줄을 덮는
 * 합집합 박스가 되어 위치가 어긋나므로, 줄마다 개별 조각(텍스트+위치)으로 나눈다.
 *
 * - 단일 줄: selectNodeContents 한 번으로 빠르게 처리 (기존 동작 유지)
 * - 여러 줄: 문자별 rect의 top으로 줄을 그룹핑
 */
function splitTextNodeByLines(textNode: Text): TextLine[] {
  const full = textNode.textContent || '';
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const lineCount = range.getClientRects().length;

  // 단일 줄 빠른 경로
  if (lineCount <= 1) {
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return [];
    const text = full.replace(/\s+/g, ' ').trim();
    if (!text) return [];
    return [{ text, rect: { x: r.x, y: r.y, width: r.width, height: r.height } }];
  }

  // 여러 줄: 문자별 rect로 줄 그룹핑
  const groups: Array<{ text: string; top: number; left: number; right: number; bottom: number }> = [];
  let cur: { text: string; top: number; left: number; right: number; bottom: number } | null = null;
  for (let i = 0; i < full.length; i++) {
    const cr = document.createRange();
    cr.setStart(textNode, i);
    cr.setEnd(textNode, i + 1);
    const rect = cr.getBoundingClientRect();
    // 줄바꿈 경계의 공백 등 렌더 크기 0 문자는 현재 줄에 흡수
    if (rect.width === 0 && rect.height === 0) {
      if (cur) cur.text += full[i];
      continue;
    }
    if (!cur || Math.abs(rect.top - cur.top) > 1) {
      cur = { text: full[i], top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
      groups.push(cur);
    } else {
      cur.text += full[i];
      if (rect.right > cur.right) cur.right = rect.right;
      if (rect.left < cur.left) cur.left = rect.left;
      if (rect.bottom > cur.bottom) cur.bottom = rect.bottom;
    }
  }

  return groups
    .map((g) => ({
      text: g.text.replace(/\s+/g, ' ').trim(),
      rect: { x: g.left, y: g.top, width: g.right - g.left, height: g.bottom - g.top },
    }))
    .filter((g) => g.text.length > 0);
}

const PURE_TEXT_INLINE_TAGS = new Set([
  'span', 'b', 'strong', 'em', 'i', 'a', 'small', 'mark', 'code',
  'sub', 'sup', 'u', 'abbr', 'cite', 'q', 'time', 'kbd', 'var', 'samp',
]);

/**
 * 순수 텍스트 스타일 인라인 요소인지 판정한다.
 * (배경/테두리/의미있는 패딩이 없는 인라인 텍스트 런 — <b>, <em>, <span> 등)
 *
 * true면 흐르는 텍스트 런으로 보고 줄 단위로 분해한다. 배경/테두리가 있는
 * 인라인(뱃지/칩 등)은 false → 자체 박스 노드로 위치시킨다.
 */
function isPureTextInlineElement(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (!PURE_TEXT_INLINE_TAGS.has(el.tagName.toLowerCase())) return false;
  const disp = style.display;
  if (disp !== 'inline' && disp !== 'inline-block') return false;
  if (isIconFontElement(el)) return false;

  const bg = style.backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return false;
  if (parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderBottomWidth) > 0 ||
      parseFloat(style.borderLeftWidth) > 0 || parseFloat(style.borderRightWidth) > 0) return false;
  if (parseFloat(style.paddingTop) > 2 || parseFloat(style.paddingBottom) > 2 ||
      parseFloat(style.paddingLeft) > 2 || parseFloat(style.paddingRight) > 2) return false;
  return true;
}

/**
 * 혼합 콘텐츠(자식 요소 + 직접 텍스트)에서 흐르는 인라인 텍스트를
 * 실제 렌더 위치(Range 기반)를 가진 개별 텍스트 노드로 추출한다.
 *
 * - 직접 텍스트 노드: 줄 단위로 분해
 * - 순수 텍스트 인라인 요소(<b>/<span> 등): 자신의 스타일로 재귀하여 줄 단위 분해
 *   (인라인 요소가 흐르며 여러 줄에 걸쳐도 각 줄이 올바른 위치를 갖도록)
 * - 배경/테두리 있는 인라인(뱃지)·블록·이미지 등은 여기서 제외 → domChildren 이 박스로 처리
 *
 * 부모 textContent로 병합하면 위치 정보가 손실되어 겹침/어긋남이 발생하므로 분리한다.
 */
function extractInlineTextNodes(
  element: HTMLElement,
  ownStyle: CSSStyleDeclaration,
  decomposeInlineElements: boolean
): ExtractedNode[] {
  const result: ExtractedNode[] = [];
  const styles = extractStyles(ownStyle);
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (!child.textContent || !child.textContent.trim()) continue;
      for (const line of splitTextNodeByLines(child as Text)) {
        result.push({
          id: generateId(),
          tagName: 'span',
          className: '',
          textContent: line.text,
          attributes: {},
          styles,
          boundingRect: {
            x: line.rect.x,
            y: line.rect.y,
            // Figma Inter 폰트가 원본보다 미세하게 넓어 발생하는 줄바꿈 방지용 여유(4px)
            width: Math.ceil(line.rect.width) + 4,
            height: line.rect.height,
          },
          children: [],
        });
      }
    } else if (decomposeInlineElements && child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const cs = window.getComputedStyle(el);
      // 순수 텍스트 인라인 요소만 텍스트 런으로 분해(자신의 스타일 적용). 나머지는 domChildren 처리.
      // 인라인 텍스트 런 내부는 항상 분해(decomposeInlineElements=true)한다.
      if (isPureTextInlineElement(el, cs)) {
        result.push(...extractInlineTextNodes(el, cs, true));
      }
    }
  }
  return result;
}

/**
 * 텍스트를 폭 제약(고정폭 + HEIGHT auto-resize)으로 변환해야 하는지 판정한다.
 *
 * converter는 텍스트 노드를 기본 WIDTH_AND_HEIGHT(자동폭·단일줄)로 만들어, 폭 제약이
 * 있는 박스의 텍스트가 Figma에선 한 줄로 펼쳐져 박스 밖으로 삐져나간다. 또한 Figma는
 * Inter 폰트를 쓰는데 원본(Pretendard 등)보다 넓어, 브라우저에선 1줄이지만 Figma에선
 * 넘치는 경우가 있다.
 *
 * 따라서 "현재 줄 수"만 보지 않고, 다음 중 하나면 폭 제약이 필요하다고 본다:
 *   1) 이미 여러 줄로 렌더됨
 *   2) 단일 줄이지만 컨테이너 content 폭에 여유(slack)가 있음 = hug가 아니라 fill 컨테이너
 *      → 폭을 박스 폭으로 고정하면 Figma가 필요 시 리플로우 (넘침 방지)
 * hug(내용에 딱 맞는) 요소는 제약하면 Inter 폭 증가로 오히려 깨질 수 있어 제외한다.
 */
function doesTextWrap(element: HTMLElement, computedStyle: CSSStyleDeclaration): boolean {
  const ws = computedStyle.whiteSpace;
  // nowrap/pre 는 줄바꿈하지 않음 (pre-wrap/pre-line/normal 만 래핑 가능)
  if (ws === 'nowrap' || ws === 'pre') return false;
  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = range.getClientRects();
    let lines = 0;
    let lastTop: number | null = null;
    let maxLineWidth = 0;
    for (const r of Array.from(rects)) {
      if (r.width === 0 && r.height === 0) continue;
      // 같은 줄의 조각(인라인 자식 등)은 top 이 동일 — 1px 초과 차이만 새 줄로 카운트
      if (lastTop === null || Math.abs(r.top - lastTop) > 1) {
        lines++;
        lastTop = r.top;
      }
      if (r.width > maxLineWidth) maxLineWidth = r.width;
    }
    if (lines > 1) return true;
    if (lines === 0) return false;
    // 단일 줄: content 폭에 여유가 있으면(fill 컨테이너) 제약 → Figma 리플로우 허용.
    // hug 요소(폭 ≈ 텍스트 폭)는 제외해 Inter 폭 증가로 인한 오작동 방지.
    const padX =
      (parseFloat(computedStyle.paddingLeft) || 0) +
      (parseFloat(computedStyle.paddingRight) || 0);
    const contentWidth = element.clientWidth - padX;
    return contentWidth - maxLineWidth > 20;
  } catch {
    return false;
  }
}

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
  // 이 시점에서 SVG 요소는 위에서 이미 early return됨
  const htmlElement = element as HTMLElement;
  const parentDisplay = computedStyle.display;
  const isFlexOrGrid = parentDisplay === 'flex' || parentDisplay === 'inline-flex'
    || parentDisplay === 'grid' || parentDisplay === 'inline-grid';

  if (htmlElement.children.length > 0 && !isFlexOrGrid && isAllInlineTextContent(htmlElement)) {
    const mergedText = getFullInlineTextContent(htmlElement);
    // Pseudo-elements도 포함
    const pseudoElements = extractPseudoElements(element as HTMLElement);
    const beforeElements = pseudoElements.filter(p => p.tagName === '::before');
    const afterElements = pseudoElements.filter(p => p.tagName === '::after');
    const allChildren = [...beforeElements, ...afterElements];

    const mergedStyles = extractStyles(computedStyle);
    mergedStyles.textWraps = doesTextWrap(htmlElement, computedStyle);

    return {
      id: generateId(),
      tagName: tagName,
      className: getClassName(element),
      textContent: mergedText,
      attributes: getAttributes(element as HTMLElement),
      styles: mergedStyles,
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: allChildren,
    };
  }

  // 흐르는(normal-flow) 컨테이너에서만 인라인 텍스트 요소를 텍스트 런으로 분해한다.
  // flex/grid 컨테이너의 인라인 자식은 레이아웃 아이템이므로 노드로 보존.
  const decomposeInline = !isFlexOrGrid;

  // DOM 자식 요소 추출.
  // 흐르는 컨테이너의 순수 텍스트 인라인 요소(<b>/<span> 등, 배경/테두리 없음)는
  // extractInlineTextNodes 가 줄 단위 텍스트 런으로 처리하므로 여기서 제외한다.
  // (박스 뱃지·블록·flex/grid 자식은 유지)
  const domChildren = Array.from(element.children)
    .filter((child): child is HTMLElement | SVGSVGElement =>
      child instanceof HTMLElement || child instanceof SVGSVGElement)
    .filter((child) => !(decomposeInline && child instanceof HTMLElement &&
      isPureTextInlineElement(child, window.getComputedStyle(child))))
    .map((child) => extractElement(child))
    .filter((child): child is ExtractedNode => child !== null);

  // 혼합 콘텐츠(자식 요소 + 직접/인라인 텍스트) 감지:
  // 자식 요소가 있으면서 흐르는 텍스트도 가진 경우, 텍스트를 위치 있는
  // 개별 노드로 분리한다. (부모 textContent로 병합 시 위치 손실 → 겹침/어긋남)
  const hasChildElements = element.children.length > 0;
  const directTextNodes = hasChildElements
    ? extractInlineTextNodes(element as HTMLElement, computedStyle, decomposeInline)
    : [];

  // Pseudo-elements 추출
  const pseudoElements = extractPseudoElements(element as HTMLElement);
  const beforeElements = pseudoElements.filter(p => p.tagName === '::before');
  const afterElements = pseudoElements.filter(p => p.tagName === '::after');

  const allChildren = [...beforeElements, ...domChildren, ...directTextNodes, ...afterElements];

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

  // 자식 요소 없이 텍스트만 가진 요소(div 등 포함)가 여러 줄로 래핑되면 표시.
  // converter가 고정폭 + HEIGHT auto-resize 로 만들어 원본처럼 줄바꿈되게 한다.
  if (!hasChildElements) {
    extractedStyles.textWraps = doesTextWrap(element as HTMLElement, computedStyle);
  }

  return {
    id: generateId(),
    tagName: tagName,
    className: getClassName(element),
    // 자식 요소가 있으면 직접 텍스트는 directTextNodes로 분리했으므로 부모는 비운다.
    // (자식 요소가 없는 순수 텍스트 요소만 textContent 유지)
    textContent: hasChildElements ? '' : getDirectTextContent(element as HTMLElement),
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
