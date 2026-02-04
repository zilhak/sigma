import type { ExtractedNode, ComputedStyles, RGBA } from '@sigma/shared';
import { parseColor } from '@sigma/shared';

let isSelectMode = false;
let hoveredElement: HTMLElement | null = null;
let overlay: HTMLDivElement | null = null;

// ============================================================
// Playwright 자동화 지원: 페이지 컨텍스트 스크립트 주입
// ============================================================

/**
 * 페이지 컨텍스트에 Sigma API를 주입
 * CSP 우회를 위해 외부 스크립트 파일 방식 사용
 */
function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () {
    script.remove(); // 로드 완료 후 태그 제거
  };
  (document.head || document.documentElement).appendChild(script);
}

/**
 * 페이지에서 오는 명령 이벤트 리스닝
 */
function setupCommandListeners() {
  // 선택 모드 시작
  window.addEventListener('sigma:cmd:start-select', () => {
    startSelectMode();
  });

  // 선택 모드 종료
  window.addEventListener('sigma:cmd:stop-select', () => {
    stopSelectMode();
  });

  // 요소 추출
  window.addEventListener('sigma:cmd:extract', ((e: CustomEvent) => {
    const { selector, x, y } = e.detail || {};
    let element: HTMLElement | null = null;

    if (selector) {
      element = document.querySelector(selector) as HTMLElement;
    } else if (typeof x === 'number' && typeof y === 'number') {
      element = document.elementFromPoint(x, y) as HTMLElement;
    }

    if (element) {
      const extracted = extractElement(element);
      if (extracted) {
        window.dispatchEvent(new CustomEvent('sigma:extracted', { detail: extracted }));
      }
    }
  }) as EventListener);

  // 상태 확인
  window.addEventListener('sigma:cmd:status', () => {
    window.dispatchEvent(new CustomEvent('sigma:status', { detail: { isSelectMode } }));
  });
}

// 초기화
injectPageScript();
setupCommandListeners();

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_SELECT_MODE') {
    startSelectMode();
    sendResponse({ success: true });
  } else if (message.type === 'STOP_SELECT_MODE') {
    stopSelectMode();
    sendResponse({ success: true });
  } else if (message.type === 'EXTRACT_ELEMENT') {
    const element = document.querySelector(message.selector) as HTMLElement;
    if (element) {
      const extracted = extractElement(element);
      if (extracted) {
        sendResponse({ success: true, data: extracted });
      } else {
        sendResponse({ success: false, error: 'Element is not visible' });
      }
    } else {
      sendResponse({ success: false, error: 'Element not found' });
    }
  } else if (message.type === 'COPY_TEXT') {
    // Background에서 요청한 클립보드 복사
    navigator.clipboard.writeText(message.text).then(() => {
      sendResponse({ success: true });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  }
  return true;
});

/**
 * 선택 모드 시작
 */
function startSelectMode() {
  isSelectMode = true;
  createOverlay();
  document.addEventListener('mousemove', onMouseMove as EventListener);
  document.addEventListener('click', onClick as EventListener, true);
  document.addEventListener('keydown', onKeyDown as EventListener);
  if (document.body) {
    document.body.style.cursor = 'crosshair';
  }
}

/**
 * 선택 모드 종료
 */
function stopSelectMode() {
  isSelectMode = false;
  removeOverlay();
  document.removeEventListener('mousemove', onMouseMove as EventListener);
  document.removeEventListener('click', onClick as EventListener, true);
  document.removeEventListener('keydown', onKeyDown as EventListener);
  if (document.body) {
    document.body.style.cursor = '';
  }
  hoveredElement = null;
}

/**
 * 오버레이 생성
 */
function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'sigma-overlay';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #0066ff;
    background: rgba(0, 102, 255, 0.1);
    z-index: 999999;
    transition: all 0.1s ease;
  `;
  document.body.appendChild(overlay);
}

/**
 * 오버레이 제거
 */
function removeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

/**
 * 마우스 이동 핸들러
 */
function onMouseMove(e: MouseEvent) {
  if (!isSelectMode) return;

  const target = e.target as HTMLElement;
  if (target === overlay || target === hoveredElement) return;

  hoveredElement = target;
  updateOverlay(target);
}

/**
 * 오버레이 위치 업데이트
 */
function updateOverlay(element: HTMLElement) {
  if (!overlay) return;

  const rect = element.getBoundingClientRect();
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
}

/**
 * 클릭 핸들러
 */
function onClick(e: MouseEvent) {
  if (!isSelectMode) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  if (target === overlay) return;

  const extracted = extractElement(target);

  if (extracted) {
    // 추출 완료 메시지 전송 (Extension 내부용)
    chrome.runtime.sendMessage({
      type: 'ELEMENT_EXTRACTED',
      data: extracted,
    });

    // 커스텀 이벤트 발송 (Playwright 자동화용)
    window.dispatchEvent(new CustomEvent('sigma:extracted', { detail: extracted }));
  } else {
    // 보이지 않는 요소 클릭 시
    chrome.runtime.sendMessage({
      type: 'EXTRACTION_FAILED',
      error: 'Element is not visible',
    });
  }

  stopSelectMode();
}

/**
 * 키보드 핸들러 (ESC로 취소)
 */
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    stopSelectMode();
    chrome.runtime.sendMessage({ type: 'SELECT_CANCELLED' });
  }
}

/**
 * 요소가 시각적으로 보이는지 확인
 */
function isElementVisible(element: HTMLElement | SVGElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  // display: none
  if (style.display === 'none') return false;

  // visibility: hidden
  if (style.visibility === 'hidden') return false;

  // opacity: 0
  if (parseFloat(style.opacity) === 0) return false;

  // 크기가 0인 요소 (단, body나 html은 예외)
  const tagName = element.tagName.toLowerCase();
  if (tagName !== 'body' && tagName !== 'html') {
    if (rect.width === 0 || rect.height === 0) return false;
  }

  return true;
}

/**
 * DOM 요소를 ExtractedNode로 변환
 */
function extractElement(element: HTMLElement | SVGElement): ExtractedNode | null {
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);
  const tagName = element.tagName.toLowerCase();

  // 루트 요소(body)가 아닌 경우 visibility 체크
  if (tagName !== 'body' && !isElementVisible(element)) {
    return null;
  }

  // SVG 요소인 경우: computed styles를 적용한 outerHTML을 캡처
  // CSS pseudo-class로 변경된 시각적 상태를 정확히 캡처하기 위함
  if (tagName === 'svg' || element instanceof SVGSVGElement) {
    // computed styles가 적용된 SVG 문자열 생성
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

  // DOM 자식 요소 추출 (보이는 요소만)
  const domChildren = Array.from(element.children)
    .filter((child): child is HTMLElement | SVGSVGElement =>
      child instanceof HTMLElement || child instanceof SVGSVGElement)
    .map((child) => extractElement(child))
    .filter((child): child is ExtractedNode => child !== null);

  // Pseudo-elements 추출
  const pseudoElements = extractPseudoElements(element as HTMLElement);

  // ::before는 맨 앞에, ::after는 맨 뒤에 배치
  const beforeElements = pseudoElements.filter(p => p.tagName === '::before');
  const afterElements = pseudoElements.filter(p => p.tagName === '::after');

  // children 조합: [::before, ...domChildren, ::after]
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

/**
 * className 추출 (SVG와 HTML 모두 지원)
 */
function getClassName(element: Element): string {
  const cn = element.className;
  if (typeof cn === 'object' && cn instanceof SVGAnimatedString) {
    return cn.baseVal || '';
  }
  return (cn as string) || '';
}

/**
 * 직접 텍스트 콘텐츠만 추출 (자식 요소의 텍스트 제외)
 */
function getDirectTextContent(element: HTMLElement): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent?.trim() || '';
    }
  }
  return text;
}

/**
 * HTML 속성 추출
 */
function getAttributes(element: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of element.attributes) {
    if (attr.name !== 'class' && attr.name !== 'style') {
      attrs[attr.name] = attr.value;
    }
  }
  return attrs;
}

/**
 * ComputedStyle에서 필요한 스타일 추출
 */
function extractStyles(style: CSSStyleDeclaration): ComputedStyles {
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

/**
 * CSS 크기값을 숫자로 변환
 */
function parseSize(value: string): number {
  if (!value || value === 'auto' || value === 'none' || value === 'normal') {
    return 0;
  }
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * 'auto'를 유지하는 크기 파싱
 */
function parseAutoSize(value: string): number | 'auto' {
  if (value === 'auto') return 'auto';
  return parseSize(value);
}

/**
 * 고유 ID 생성
 */
function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================
// SVG Computed Styles 적용 (시각적 상태 캡처)
// ============================================================

/**
 * SVG 요소의 computed styles를 인라인 속성으로 적용하여 직렬화
 * CSS pseudo-class (:checked, :hover 등)로 변경된 시각적 상태를 캡처
 */
function serializeSvgWithComputedStyles(svg: SVGSVGElement): string {
  // SVG를 깊은 복제
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // 원본과 클론의 모든 요소를 순회
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

/**
 * 개별 SVG 요소에 computed styles 적용
 */
function applySvgComputedStyles(original: SVGElement, clone: SVGElement): void {
  const computed = window.getComputedStyle(original);

  // 색상 관련 속성
  const fill = computed.fill;
  if (fill && fill !== 'none' && fill !== '') {
    // CSS 변수가 resolve된 실제 값으로 설정
    clone.setAttribute('fill', resolveColorValue(fill));
  }

  const stroke = computed.stroke;
  if (stroke && stroke !== 'none' && stroke !== '') {
    clone.setAttribute('stroke', resolveColorValue(stroke));
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

  // 기하학적 속성 (circle, ellipse 등)
  if (original instanceof SVGCircleElement || original.tagName.toLowerCase() === 'circle') {
    const cx = computed.cx;
    const cy = computed.cy;
    const r = computed.r;
    if (cx) clone.setAttribute('cx', parseComputedLength(cx));
    if (cy) clone.setAttribute('cy', parseComputedLength(cy));
    if (r) clone.setAttribute('r', parseComputedLength(r));
  }

  if (original instanceof SVGEllipseElement || original.tagName.toLowerCase() === 'ellipse') {
    const cx = computed.cx;
    const cy = computed.cy;
    const rx = computed.rx;
    const ry = computed.ry;
    if (cx) clone.setAttribute('cx', parseComputedLength(cx));
    if (cy) clone.setAttribute('cy', parseComputedLength(cy));
    if (rx) clone.setAttribute('rx', parseComputedLength(rx));
    if (ry) clone.setAttribute('ry', parseComputedLength(ry));
  }

  if (original instanceof SVGRectElement || original.tagName.toLowerCase() === 'rect') {
    const x = computed.x;
    const y = computed.y;
    const width = computed.width;
    const height = computed.height;
    const rx = computed.rx;
    const ry = computed.ry;
    if (x) clone.setAttribute('x', parseComputedLength(x));
    if (y) clone.setAttribute('y', parseComputedLength(y));
    if (width && width !== 'auto') clone.setAttribute('width', parseComputedLength(width));
    if (height && height !== 'auto') clone.setAttribute('height', parseComputedLength(height));
    if (rx) clone.setAttribute('rx', parseComputedLength(rx));
    if (ry) clone.setAttribute('ry', parseComputedLength(ry));
  }

  // transform 속성
  const transform = computed.transform;
  if (transform && transform !== 'none') {
    // matrix(...) 형태로 반환되므로 그대로 적용
    clone.setAttribute('transform', transform);
  }

  // visibility
  const visibility = computed.visibility;
  if (visibility === 'hidden') {
    clone.setAttribute('visibility', 'hidden');
  }

  // display (none인 경우 제거 대신 visibility로 처리)
  const display = computed.display;
  if (display === 'none') {
    clone.setAttribute('visibility', 'hidden');
  }
}

/**
 * 색상 값에서 CSS 변수를 resolve하고 정규화
 */
function resolveColorValue(color: string): string {
  // computed style은 이미 CSS 변수가 resolve된 상태
  // rgb(), rgba(), #hex 등의 형태로 반환됨
  return color;
}

/**
 * computed length 값을 SVG 속성 값으로 변환
 * "10px" -> "10"
 */
function parseComputedLength(value: string): string {
  if (!value || value === 'auto' || value === 'none') {
    return '0';
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return '0';
  }
  return String(num);
}

// ============================================================
// Pseudo-elements (::before, ::after) 추출
// ============================================================

/**
 * 요소의 ::before, ::after pseudo-elements를 추출하여 ExtractedNode 배열로 반환
 */
function extractPseudoElements(element: HTMLElement): ExtractedNode[] {
  const pseudoNodes: ExtractedNode[] = [];

  // ::before 추출
  const beforeNode = extractPseudoElement(element, '::before');
  if (beforeNode) {
    pseudoNodes.push(beforeNode);
  }

  // ::after 추출
  const afterNode = extractPseudoElement(element, '::after');
  if (afterNode) {
    pseudoNodes.push(afterNode);
  }

  return pseudoNodes;
}

/**
 * 특정 pseudo-element 추출
 */
function extractPseudoElement(
  element: HTMLElement,
  pseudo: '::before' | '::after'
): ExtractedNode | null {
  const pseudoStyle = window.getComputedStyle(element, pseudo);

  // content가 없거나 'none'이면 pseudo-element가 없음
  const content = pseudoStyle.content;
  if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") {
    return null;
  }

  // display: none이면 보이지 않음
  if (pseudoStyle.display === 'none') {
    return null;
  }

  // visibility: hidden이면 공간은 차지하지만 보이지 않음 (캡처는 함)

  // 부모 요소의 위치를 기준으로 pseudo-element 위치 추정
  const parentRect = element.getBoundingClientRect();

  // pseudo-element의 크기 계산
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
    tagName: pseudo, // '::before' 또는 '::after'를 태그명으로 사용
    className: '',
    textContent: textContent,
    attributes: {},
    styles: extractPseudoStyles(pseudoStyle),
    boundingRect: {
      x: parentRect.x, // 정확한 위치는 알 수 없으므로 부모 기준
      y: parentRect.y,
      width: width || 0,
      height: height || 0,
    },
    children: [],
    isPseudo: true, // pseudo-element 표시
  };
}

/**
 * Pseudo-element의 스타일 추출
 */
function extractPseudoStyles(style: CSSStyleDeclaration): ComputedStyles {
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
