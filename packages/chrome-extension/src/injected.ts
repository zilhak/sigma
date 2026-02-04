/**
 * 페이지 컨텍스트에 주입되는 Sigma API
 * CSP 우회를 위해 별도 파일로 분리
 */

// 모듈로 인식되도록 export 추가
export {};

declare global {
  interface Window {
    __sigma__: typeof sigmaAPI;
  }
}

const sigmaAPI = {
  version: '1.0.0',

  // 선택 모드 시작 요청
  startSelectMode: function () {
    window.dispatchEvent(new CustomEvent('sigma:cmd:start-select'));
  },

  // 선택 모드 종료 요청
  stopSelectMode: function () {
    window.dispatchEvent(new CustomEvent('sigma:cmd:stop-select'));
  },

  // 셀렉터로 요소 추출 요청
  extractElement: function (selector: string): Promise<unknown> {
    return new Promise(function (resolve) {
      const handler = function (e: Event) {
        window.removeEventListener('sigma:extracted', handler);
        resolve((e as CustomEvent).detail);
      };
      window.addEventListener('sigma:extracted', handler);
      window.dispatchEvent(
        new CustomEvent('sigma:cmd:extract', { detail: { selector: selector } })
      );
      // 타임아웃 5초
      setTimeout(function () {
        window.removeEventListener('sigma:extracted', handler);
        resolve(null);
      }, 5000);
    });
  },

  // 좌표로 요소 추출 요청
  extractElementAt: function (x: number, y: number): Promise<unknown> {
    return new Promise(function (resolve) {
      const handler = function (e: Event) {
        window.removeEventListener('sigma:extracted', handler);
        resolve((e as CustomEvent).detail);
      };
      window.addEventListener('sigma:extracted', handler);
      window.dispatchEvent(
        new CustomEvent('sigma:cmd:extract', { detail: { x: x, y: y } })
      );
      setTimeout(function () {
        window.removeEventListener('sigma:extracted', handler);
        resolve(null);
      }, 5000);
    });
  },

  // 선택 모드 상태 확인 (비동기)
  isSelectMode: function (): Promise<boolean> {
    return new Promise(function (resolve) {
      const handler = function (e: Event) {
        window.removeEventListener('sigma:status', handler);
        resolve((e as CustomEvent).detail.isSelectMode);
      };
      window.addEventListener('sigma:status', handler);
      window.dispatchEvent(new CustomEvent('sigma:cmd:status'));
      setTimeout(function () {
        window.removeEventListener('sigma:extracted', handler);
        resolve(false);
      }, 1000);
    });
  },
};

// API 노출
window.__sigma__ = sigmaAPI;

// API 준비 완료 알림
window.dispatchEvent(
  new CustomEvent('sigma:ready', { detail: { version: '1.0.0' } })
);
console.log('[Sigma] API injected on window.__sigma__');
