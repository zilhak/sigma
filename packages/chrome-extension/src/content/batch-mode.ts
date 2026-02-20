/**
 * 배치 선택 모드 - 여러 요소를 선택하여 일괄 추출
 */

import type { ExtractedNode } from '@sigma/shared';
import { extractElement } from '@sigma/shared/extractor';
import { createHoverOverlay, createSelectedOverlay, getHoverOverlay } from './overlay';
import {
  getIsBatchMode,
  getIsSelectMode,
  onMouseMove,
  setIsBatchMode,
  setIsSelectMode,
  stopSelectMode,
} from './select-mode';

// 배치 모드 상태
let batchSelectedElements: HTMLElement[] = [];
let batchOverlays: HTMLDivElement[] = [];
let batchCountBadge: HTMLDivElement | null = null;

/**
 * 배치 선택된 요소 수 반환 (상태 조회용)
 */
export function getBatchCount(): number {
  return batchSelectedElements.length;
}

/**
 * 배치 선택 모드 시작
 */
export function startBatchSelectMode() {
  setIsBatchMode(true);
  setIsSelectMode(true);
  batchSelectedElements = [];
  clearBatchOverlays();
  createHoverOverlay();
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
 * 배치 오버레이 모두 제거 (배지 포함)
 */
export function clearBatchOverlays() {
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
 * 오버레이만 제거 (배지 유지)
 */
function clearBatchOverlaysOnly() {
  for (const ov of batchOverlays) {
    ov.remove();
  }
  batchOverlays = [];
}

/**
 * 배치 클릭 핸들러 (선택 후 계속 유지)
 */
function onBatchClick(e: MouseEvent) {
  if (!getIsSelectMode() || !getIsBatchMode()) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  if (
    target === getHoverOverlay() ||
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
    batchSelectedElements.forEach((el, idx) => {
      batchOverlays.push(createSelectedOverlay(el, idx));
    });
    updateBatchBadgeText();
    return;
  }

  // 추출 가능한지 확인
  const extracted = extractElement(target);
  if (extracted) {
    batchSelectedElements.push(target);
    batchOverlays.push(createSelectedOverlay(target, batchSelectedElements.length - 1));
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
 * 배치 키보드 핸들러
 */
function onBatchKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    stopBatchSelectMode();
    chrome.runtime.sendMessage({ type: 'BATCH_CANCELLED' });
  } else if (e.key === 'Enter') {
    finishBatchSelect();
  }
}

/**
 * 배치 선택 완료
 */
export function finishBatchSelect() {
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

  stopBatchSelectMode();
}

/**
 * 배치 모드 정리 후 선택 모드 종료
 */
function stopBatchSelectMode() {
  // 배치 이벤트 리스너 제거
  document.removeEventListener('click', onBatchClick as EventListener, true);
  document.removeEventListener('keydown', onBatchKeyDown as EventListener);
  batchSelectedElements = [];

  // 공통 종료 (오버레이 제거 포함)
  stopSelectMode(clearBatchOverlays);
}
