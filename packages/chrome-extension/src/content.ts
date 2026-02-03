import type { ExtractedNode, ComputedStyles, RGBA } from '@sigma/shared';
import { parseColor } from '@sigma/shared';

let isSelectMode = false;
let hoveredElement: HTMLElement | null = null;
let overlay: HTMLDivElement | null = null;

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
      sendResponse({ success: true, data: extracted });
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
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
  document.body.style.cursor = 'crosshair';
}

/**
 * 선택 모드 종료
 */
function stopSelectMode() {
  isSelectMode = false;
  removeOverlay();
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown);
  document.body.style.cursor = '';
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

  // 추출 완료 메시지 전송
  chrome.runtime.sendMessage({
    type: 'ELEMENT_EXTRACTED',
    data: extracted,
  });

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
 * DOM 요소를 ExtractedNode로 변환
 */
function extractElement(element: HTMLElement): ExtractedNode {
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  return {
    id: generateId(),
    tagName: element.tagName.toLowerCase(),
    className: element.className || '',
    textContent: getDirectTextContent(element),
    attributes: getAttributes(element),
    styles: extractStyles(computedStyle),
    boundingRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    children: Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => extractElement(child)),
  };
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
