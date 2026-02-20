/**
 * 단일 선택 모드 - 요소 하나를 클릭하여 추출
 */

import { extractElement } from '@sigma/shared/extractor';
import {
  createHoverOverlay,
  getHoverOverlay,
  removeHoverOverlay,
  updateHoverOverlay,
} from './overlay';

// 모듈 상태
let isSelectMode = false;
let isBatchMode = false;
let hoveredElement: HTMLElement | null = null;

// 배치 모드에서도 접근해야 하는 상태 getter/setter
export function getIsSelectMode() {
  return isSelectMode;
}
export function setIsSelectMode(v: boolean) {
  isSelectMode = v;
}
export function getIsBatchMode() {
  return isBatchMode;
}
export function setIsBatchMode(v: boolean) {
  isBatchMode = v;
}

/**
 * 단일 선택 모드 시작
 */
export function startSelectMode() {
  isBatchMode = false;
  isSelectMode = true;
  createHoverOverlay();
  document.addEventListener('mousemove', onMouseMove as EventListener);
  document.addEventListener('click', onClick as EventListener, true);
  document.addEventListener('keydown', onKeyDown as EventListener);
  if (document.body) {
    document.body.style.cursor = 'crosshair';
  }
}

/**
 * 선택 모드 종료 (단일/배치 공통)
 * cleanupBatchFn: 배치 모드 정리 콜백 (순환 의존 방지)
 */
export function stopSelectMode(cleanupBatchFn?: () => void) {
  isSelectMode = false;
  removeHoverOverlay();
  if (cleanupBatchFn) cleanupBatchFn();
  document.removeEventListener('mousemove', onMouseMove as EventListener);
  document.removeEventListener('click', onClick as EventListener, true);
  document.removeEventListener('keydown', onKeyDown as EventListener);
  if (document.body) {
    document.body.style.cursor = '';
  }
  hoveredElement = null;
  isBatchMode = false;
}

/**
 * 마우스 이동 핸들러
 */
export function onMouseMove(e: MouseEvent) {
  if (!isSelectMode) return;

  const target = e.target as HTMLElement;
  if (target === getHoverOverlay() || target === hoveredElement) return;
  if (target.id === 'sigma-batch-badge' || target.closest('#sigma-batch-badge')) return;

  hoveredElement = target;
  updateHoverOverlay(target);
}

/**
 * 단일 클릭 핸들러
 */
function onClick(e: MouseEvent) {
  if (!isSelectMode || isBatchMode) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  if (target === getHoverOverlay()) return;

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
