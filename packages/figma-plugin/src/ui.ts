import { SERVER_URL, WEBSOCKET_URL } from '@sigma/shared';
import {
  dom, getWs, setWs, getFileInfo,
  getPollingInterval, setPollingInterval,
  setIsMinimized,
  log, showMessage, hideMessage, updateStatus,
} from './ui/ui-state';
import { sendToPlugin } from './ui/bridge-server';
import { handleServerMessage } from './ui/bridge-server';
import { handlePluginMessage } from './ui/bridge-plugin';

// === Figma URL에서 fileKey 추출 ===
function extractFileKeyFromUrl(input: string): string {
  if (input.includes('figma.com')) {
    const match = input.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return input;
}

// === FileKey 저장 이벤트 ===
dom.saveFileKeyBtn.addEventListener('click', () => {
  const rawValue = dom.fileKeyInput.value.trim();
  if (rawValue) {
    const fileKey = extractFileKeyFromUrl(rawValue);
    if (fileKey !== rawValue) {
      dom.fileKeyInput.value = fileKey;
      log(`URL에서 fileKey 추출: ${fileKey}`, 'info');
    }
    sendToPlugin('save-file-key', undefined, undefined, undefined, fileKey);
  }
});

dom.fileKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    dom.saveFileKeyBtn.click();
  }
});

// === 최소화/확장 ===
dom.minimizeBtn.addEventListener('click', () => {
  setIsMinimized(true);
  dom.fullView.classList.add('hidden');
  dom.minimizedView.classList.add('active');
  sendToPlugin('resize', { width: 200, height: 40 });
});

dom.expandBtn.addEventListener('click', () => {
  setIsMinimized(false);
  dom.fullView.classList.remove('hidden');
  dom.minimizedView.classList.remove('active');
  sendToPlugin('resize', { width: 320, height: 400 });
});

// === 탭 전환 ===
dom.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = (tab as HTMLElement).dataset.tab;
    dom.tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    dom.pasteJsonSection.classList.toggle('active', tabName === 'paste-json');
    dom.pasteHtmlSection.classList.toggle('active', tabName === 'paste-html');
    dom.serverSection.classList.toggle('active', tabName === 'server');
  });
});

// === JSON 입력 검증 ===
dom.jsonInput.addEventListener('input', () => {
  const value = dom.jsonInput.value.trim();
  dom.importJsonBtn.disabled = !value;

  if (value) {
    try {
      const data = JSON.parse(value);
      if (data.tagName && data.styles) {
        dom.importJsonBtn.disabled = false;
        hideMessage();
      } else {
        dom.importJsonBtn.disabled = true;
        showMessage('유효한 ExtractedNode JSON이 아닙니다.', 'error');
      }
    } catch {
      dom.importJsonBtn.disabled = true;
      if (value.length > 10) {
        showMessage('JSON 파싱 오류', 'error');
      }
    }
  }
});

// === HTML 입력 검증 ===
dom.htmlInput.addEventListener('input', () => {
  const value = dom.htmlInput.value.trim();
  dom.importHtmlBtn.disabled = !value;

  if (value) {
    if (value.startsWith('<') && value.includes('>')) {
      dom.importHtmlBtn.disabled = false;
      hideMessage();
    } else {
      dom.importHtmlBtn.disabled = true;
      if (value.length > 10) {
        showMessage('유효한 HTML이 아닙니다.', 'error');
      }
    }
  }
});

// === Import 버튼 ===
dom.importJsonBtn.addEventListener('click', () => {
  const value = dom.jsonInput.value.trim();
  if (!value) return;

  try {
    const data = JSON.parse(value);
    sendToPlugin('create-from-json', data);
  } catch (error) {
    showMessage('JSON 파싱 오류', 'error');
  }
});

dom.importHtmlBtn.addEventListener('click', () => {
  const value = dom.htmlInput.value.trim();
  if (!value) return;

  sendToPlugin('create-from-html', value);
});

// === 플러그인(code.ts) 메시지 수신 ===
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  handlePluginMessage(msg);
};

// === 서버 감지 및 WebSocket 연결 ===
function startServerDetection() {
  if (getPollingInterval()) return;

  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/health`, {
        method: 'GET',
        mode: 'cors',
      });

      if (res.ok) {
        stopPolling();
        connectWebSocket();
      }
    } catch {
      updateStatus(false, '서버 대기 중...');
    }
  }, 5000) as unknown as number;
  setPollingInterval(interval);

  // 즉시 한번 확인
  checkServer();
}

function stopPolling() {
  const interval = getPollingInterval();
  if (interval) {
    clearInterval(interval);
    setPollingInterval(null);
  }
}

async function checkServer() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`);
    if (res.ok) {
      stopPolling();
      connectWebSocket();
    }
  } catch {
    updateStatus(false, '서버 대기 중...');
  }
}

function connectWebSocket() {
  const currentWs = getWs();
  if (currentWs) {
    currentWs.close();
  }

  log('WebSocket 연결 시도...', 'info');
  const newWs = new WebSocket(WEBSOCKET_URL);
  setWs(newWs);

  newWs.onopen = () => {
    updateStatus(true, '서버 연결됨');
    log('서버에 연결되었습니다', 'success');

    // 파일 정보와 함께 등록
    const fileInfo = getFileInfo();
    const registerMsg: Record<string, unknown> = {
      type: 'REGISTER',
      client: 'figma-plugin',
    };

    if (fileInfo) {
      registerMsg.fileKey = fileInfo.fileKey;
      registerMsg.fileName = fileInfo.fileName;
      registerMsg.pageId = fileInfo.pageId;
      registerMsg.pageName = fileInfo.pageName;
      registerMsg.pages = fileInfo.pages.map(p => ({ pageId: p.id, pageName: p.name }));
    }

    const ws = getWs();
    if (ws) ws.send(JSON.stringify(registerMsg));
    log(
      `등록 완료 (file: ${fileInfo ? fileInfo.fileName : 'unknown'}, ${fileInfo ? fileInfo.pages.length : 0} pages)`,
      'info'
    );
  };

  newWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (error) {
      log(`메시지 파싱 오류: ${error}`, 'error');
    }
  };

  newWs.onclose = () => {
    updateStatus(false, '연결 끊김');
    log('서버 연결이 끊어졌습니다', 'warn');
    setWs(null);
    setTimeout(() => startServerDetection(), 2000);
  };

  newWs.onerror = () => {
    updateStatus(false, '연결 오류');
    log('WebSocket 연결 오류', 'error');
  };
}

// === 시작 ===
startServerDetection();
