/**
 * Content Script 진입점 - 메시지 라우팅 전용
 */

import { extractElement } from '@sigma/shared/extractor';
import { startSelectMode, stopSelectMode } from './content/select-mode';
import { startBatchSelectMode, finishBatchSelect } from './content/batch-mode';
import { injectPageScript, setupCommandListeners } from './content/playwright';

// 초기화: 페이지 스크립트 주입 + 커맨드 리스너 등록
injectPageScript();
setupCommandListeners();

/**
 * Extension 메시지 리스너
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
