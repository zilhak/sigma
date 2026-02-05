import type { ExtractedNode } from '@sigma/shared';
import { extractElement } from '@sigma/shared/extractor';

let isSelectMode = false;
let isBatchMode = false;
let hoveredElement: HTMLElement | null = null;
let overlay: HTMLDivElement | null = null;

// 배치 모드 상태
let batchSelectedElements: HTMLElement[] = [];
let batchOverlays: HTMLDivElement[] = [];
let batchCountBadge: HTMLDivElement | null = null;

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

  // 배치 선택 모드 시작
  window.addEventListener('sigma:cmd:start-batch-select', () => {
    startBatchSelectMode();
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
    window.dispatchEvent(
      new CustomEvent('sigma:status', {
        detail: { isSelectMode, isBatchMode, batchCount: batchSelectedElements.length },
      })
    );
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
  } else if (message.type === 'START_BATCH_SELECT_MODE') {
    startBatchSelectMode();
    sendResponse({ success: true });
  } else if (message.type === 'STOP_SELECT_MODE') {
    stopSelectMode();
    sendResponse({ success: true });
  } else if (message.type === 'FINISH_BATCH_SELECT') {
    finishBatchSelect();
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
    navigator.clipboard
      .writeText(message.text)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // async response
  }
  return true;
});

// ============================================================
// 단일 선택 모드
// ============================================================

/**
 * 선택 모드 시작
 */
function startSelectMode() {
  isBatchMode = false;
  isSelectMode = true;
  createOverlay();
  document.addEventListener('mousemove', onMouseMove as EventListener);
  document.addEventListener('click', onClick as EventListener, true);
  document.addEventListener('keydown', onKeyDown as EventListener);
  if (document.body) {
    document.body.style.cursor = 'crosshair';
  }
}

// ============================================================
// 배치 선택 모드
// ============================================================

/**
 * 배치 선택 모드 시작
 */
function startBatchSelectMode() {
  isBatchMode = true;
  isSelectMode = true;
  batchSelectedElements = [];
  clearBatchOverlays();
  createOverlay();
  createBatchCountBadge();
  document.addEventListener('mousemove', onMouseMove as EventListener);
  document.addEventListener('click', onBatchClick as EventListener, true);
  document.addEventListener('keydown', onBatchKeyDown as EventListener);
  if (document.body) {
    document.body.style.cursor = 'crosshair';
  }
}

/**
 * 배치 카운트 배지 생성
 */
function createBatchCountBadge() {
  batchCountBadge = document.createElement('div');
  batchCountBadge.id = 'sigma-batch-badge';
  batchCountBadge.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 1000000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #0066ff;
    color: white;
    border-radius: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 102, 255, 0.4);
    user-select: none;
    pointer-events: auto;
  `;
  updateBatchBadgeText();

  // 완료 버튼
  const doneBtn = document.createElement('button');
  doneBtn.textContent = 'Done';
  doneBtn.style.cssText = `
    background: white;
    color: #0066ff;
    border: none;
    border-radius: 12px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  `;
  doneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    finishBatchSelect();
  });

  batchCountBadge.appendChild(doneBtn);
  document.body.appendChild(batchCountBadge);
}

/**
 * 배치 배지 텍스트 업데이트
 */
function updateBatchBadgeText() {
  if (!batchCountBadge) return;
  const textNode = batchCountBadge.firstChild;
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    textNode.textContent = `${batchSelectedElements.length}`;
  } else {
    batchCountBadge.insertBefore(
      document.createTextNode(`${batchSelectedElements.length}`),
      batchCountBadge.firstChild
    );
  }
}

/**
 * 선택된 요소에 배치 오버레이 추가 (녹색)
 */
function addBatchOverlay(element: HTMLElement, index: number) {
  const rect = element.getBoundingClientRect();
  const batchOverlay = document.createElement('div');
  batchOverlay.className = 'sigma-batch-overlay';
  batchOverlay.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 2px solid #22c55e;
    background: rgba(34, 197, 94, 0.1);
    z-index: 999998;
    pointer-events: none;
  `;

  // 번호 표시
  const badge = document.createElement('div');
  badge.style.cssText = `
    position: absolute;
    top: -10px;
    left: -10px;
    width: 20px;
    height: 20px;
    background: #22c55e;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, sans-serif;
  `;
  badge.textContent = `${index + 1}`;
  batchOverlay.appendChild(badge);

  document.body.appendChild(batchOverlay);
  batchOverlays.push(batchOverlay);
}

/**
 * 배치 오버레이 모두 제거
 */
function clearBatchOverlays() {
  for (const ov of batchOverlays) {
    ov.remove();
  }
  batchOverlays = [];
  if (batchCountBadge) {
    batchCountBadge.remove();
    batchCountBadge = null;
  }
}

/**
 * 배치 클릭 핸들러 (선택 후 계속 유지)
 */
function onBatchClick(e: MouseEvent) {
  if (!isSelectMode || !isBatchMode) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  if (
    target === overlay ||
    target.id === 'sigma-batch-badge' ||
    target.closest('#sigma-batch-badge')
  )
    return;

  // 이미 선택된 요소는 제거 (토글)
  const existingIndex = batchSelectedElements.indexOf(target);
  if (existingIndex >= 0) {
    batchSelectedElements.splice(existingIndex, 1);
    // 오버레이 재생성
    clearBatchOverlaysOnly();
    batchSelectedElements.forEach((el, idx) => addBatchOverlay(el, idx));
    updateBatchBadgeText();
    return;
  }

  // 추출 가능한지 확인
  const extracted = extractElement(target);
  if (extracted) {
    batchSelectedElements.push(target);
    addBatchOverlay(target, batchSelectedElements.length - 1);
    updateBatchBadgeText();

    // 개별 추출 알림
    chrome.runtime.sendMessage({
      type: 'BATCH_ELEMENT_ADDED',
      data: extracted,
      count: batchSelectedElements.length,
    });
  }
}

/**
 * 오버레이만 제거 (배지 유지)
 */
function clearBatchOverlaysOnly() {
  for (const ov of batchOverlays) {
    ov.remove();
  }
  batchOverlays = [];
}

/**
 * 배치 키보드 핸들러
 */
function onBatchKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    stopSelectMode();
    chrome.runtime.sendMessage({ type: 'BATCH_CANCELLED' });
  } else if (e.key === 'Enter') {
    finishBatchSelect();
  }
}

/**
 * 배치 선택 완료
 */
function finishBatchSelect() {
  const extractedList: ExtractedNode[] = [];
  for (const el of batchSelectedElements) {
    const extracted = extractElement(el);
    if (extracted) extractedList.push(extracted);
  }

  if (extractedList.length > 0) {
    chrome.runtime.sendMessage({
      type: 'BATCH_EXTRACTION_COMPLETE',
      data: extractedList,
    });

    // Playwright 자동화용 커스텀 이벤트
    window.dispatchEvent(
      new CustomEvent('sigma:batch-extracted', { detail: extractedList })
    );
  }

  stopSelectMode();
}

// ============================================================
// 공통 선택 모드 기능
// ============================================================

/**
 * 선택 모드 종료
 */
function stopSelectMode() {
  isSelectMode = false;
  removeOverlay();
  clearBatchOverlays();
  document.removeEventListener('mousemove', onMouseMove as EventListener);
  document.removeEventListener('click', onClick as EventListener, true);
  document.removeEventListener('click', onBatchClick as EventListener, true);
  document.removeEventListener('keydown', onKeyDown as EventListener);
  document.removeEventListener('keydown', onBatchKeyDown as EventListener);
  if (document.body) {
    document.body.style.cursor = '';
  }
  hoveredElement = null;
  batchSelectedElements = [];
  isBatchMode = false;
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
  if (target.id === 'sigma-batch-badge' || target.closest('#sigma-batch-badge')) return;

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
 * 단일 클릭 핸들러
 */
function onClick(e: MouseEvent) {
  if (!isSelectMode || isBatchMode) return;

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
