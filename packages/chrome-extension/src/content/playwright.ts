/**
 * Playwright 자동화 지원 - 페이지 컨텍스트 스크립트 주입 및 커맨드 리스닝
 */

import { extractElement } from '@sigma/shared/extractor';
import { startSelectMode, stopSelectMode, getIsSelectMode, getIsBatchMode } from './select-mode';
import { startBatchSelectMode, getBatchCount } from './batch-mode';

/**
 * 페이지 컨텍스트에 Sigma API를 주입
 * CSP 우회를 위해 외부 스크립트 파일 방식 사용
 */
export function injectPageScript() {
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
export function setupCommandListeners() {
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
        detail: {
          isSelectMode: getIsSelectMode(),
          isBatchMode: getIsBatchMode(),
          batchCount: getBatchCount(),
        },
      })
    );
  });
}
