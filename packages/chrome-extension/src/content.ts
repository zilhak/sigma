import type { ExtractedNode } from '@sigma/shared';
import { extractElement } from '@sigma/shared/extractor';

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
