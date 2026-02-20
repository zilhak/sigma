/**
 * 오버레이 UI - 단일/배치 선택 모드 공용
 */

// 호버 오버레이 인스턴스
let overlay: HTMLDivElement | null = null;

/**
 * 호버 오버레이 생성
 */
export function createHoverOverlay() {
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
 * 호버 오버레이 위치 업데이트
 */
export function updateHoverOverlay(element: HTMLElement) {
  if (!overlay) return;

  const rect = element.getBoundingClientRect();
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
}

/**
 * 호버 오버레이 숨기기 (DOM에 유지)
 */
export function hideHoverOverlay() {
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * 호버 오버레이 완전 제거
 */
export function removeHoverOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

/**
 * 현재 호버 오버레이 엘리먼트 반환 (이벤트 필터링용)
 */
export function getHoverOverlay(): HTMLDivElement | null {
  return overlay;
}

/**
 * 배치 모드 - 선택된 요소에 녹색 오버레이 추가
 */
export function createSelectedOverlay(
  element: HTMLElement,
  index: number
): HTMLDivElement {
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
  return batchOverlay;
}
