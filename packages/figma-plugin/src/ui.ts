import { HTTP_URL, WS_URL } from '@sigma/shared';

// DOM Elements
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusDotMini = document.getElementById('statusDotMini') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const tabs = document.querySelectorAll('.tab');
const pasteSection = document.getElementById('pasteSection') as HTMLDivElement;
const serverSection = document.getElementById('serverSection') as HTMLDivElement;
const jsonInput = document.getElementById('jsonInput') as HTMLTextAreaElement;
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
const message = document.getElementById('message') as HTMLDivElement;
const serverConnected = document.getElementById('serverConnected') as HTMLDivElement;
const serverDisconnected = document.getElementById('serverDisconnected') as HTMLDivElement;
const minimizeBtn = document.getElementById('minimizeBtn') as HTMLButtonElement;
const expandBtn = document.getElementById('expandBtn') as HTMLButtonElement;
const fullView = document.getElementById('fullView') as HTMLDivElement;
const minimizedView = document.getElementById('minimizedView') as HTMLDivElement;
const logContainer = document.getElementById('logContainer') as HTMLDivElement;
const fileKeyInput = document.getElementById('fileKeyInput') as HTMLInputElement;
const fileKeyStatus = document.getElementById('fileKeyStatus') as HTMLSpanElement;
const fileKeyHint = document.getElementById('fileKeyHint') as HTMLDivElement;
const saveFileKeyBtn = document.getElementById('saveFileKeyBtn') as HTMLButtonElement;

// State
let ws: WebSocket | null = null;
let pollingInterval: number | null = null;
let isConnected = false;
let isMinimized = false;
let pendingCommandId: string | null = null;
let fileInfo: {
  fileKey: string | null;
  fileKeySource: 'api' | 'stored' | 'none';
  storedFileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
} | null = null;

// Figma URL에서 fileKey 추출
function extractFileKeyFromUrl(input: string): string {
  // URL 형식인지 체크
  if (input.includes('figma.com')) {
    // https://www.figma.com/design/{fileKey}/{fileName}?...
    // https://www.figma.com/file/{fileKey}/{fileName}?...
    const match = input.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  // URL이 아니면 그대로 반환
  return input;
}

// FileKey 저장 버튼 클릭
saveFileKeyBtn.addEventListener('click', () => {
  const rawValue = fileKeyInput.value.trim();
  if (rawValue) {
    const fileKey = extractFileKeyFromUrl(rawValue);
    // 추출된 값이 다르면 입력 필드도 업데이트
    if (fileKey !== rawValue) {
      fileKeyInput.value = fileKey;
      log(`URL에서 fileKey 추출: ${fileKey}`, 'info');
    }
    sendToPlugin('save-file-key', undefined, undefined, undefined, fileKey);
  }
});

// FileKey 입력 시 Enter 키 처리
fileKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    saveFileKeyBtn.click();
  }
});

// Log function
function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const time = new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // 최대 100개 로그 유지
  while (logContainer.children.length > 100) {
    logContainer.removeChild(logContainer.firstChild!);
  }
}

// Minimize/Expand functionality
minimizeBtn.addEventListener('click', () => {
  isMinimized = true;
  fullView.classList.add('hidden');
  minimizedView.classList.add('active');
  sendToPlugin('resize', { width: 200, height: 40 });
});

expandBtn.addEventListener('click', () => {
  isMinimized = false;
  fullView.classList.remove('hidden');
  minimizedView.classList.remove('active');
  sendToPlugin('resize', { width: 320, height: 400 });
});

// Tab switching
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = (tab as HTMLElement).dataset.tab;
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    pasteSection.classList.toggle('active', tabName === 'paste');
    serverSection.classList.toggle('active', tabName === 'server');
  });
});

// JSON input validation
jsonInput.addEventListener('input', () => {
  const value = jsonInput.value.trim();
  importBtn.disabled = !value;

  // Try to parse and validate
  if (value) {
    try {
      const data = JSON.parse(value);
      if (data.tagName && data.styles) {
        importBtn.disabled = false;
        hideMessage();
      } else {
        importBtn.disabled = true;
        showMessage('유효한 ExtractedNode JSON이 아닙니다.', 'error');
      }
    } catch {
      importBtn.disabled = true;
      if (value.length > 10) {
        showMessage('JSON 파싱 오류', 'error');
      }
    }
  }
});

// Import button
importBtn.addEventListener('click', () => {
  const value = jsonInput.value.trim();
  if (!value) return;

  try {
    const data = JSON.parse(value);
    sendToPlugin('create-from-json', data);
  } catch (error) {
    showMessage('JSON 파싱 오류', 'error');
  }
});

// Send message to plugin main code
function sendToPlugin(type: string, data?: unknown, name?: string, position?: { x: number; y: number }, fileKey?: string, nodeId?: string) {
  parent.postMessage(
    {
      pluginMessage: { type, data, name, position, fileKey, nodeId },
    },
    '*'
  );
}

// Receive message from plugin main code
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'success':
      showMessage(msg.message, 'success');
      break;
    case 'error':
      showMessage(msg.message, 'error');
      break;
    case 'file-info':
      fileInfo = {
        fileKey: msg.fileKey,
        fileKeySource: msg.fileKeySource,
        storedFileKey: msg.storedFileKey,
        fileName: msg.fileName,
        pageId: msg.pageId,
        pageName: msg.pageName,
      };
      log(`파일 정보 수신: ${fileInfo.fileName} / ${fileInfo.pageName}`, 'info');

      // FileKey UI 업데이트
      updateFileKeyUI(fileInfo);

      // 연결된 상태면 서버에 파일 정보 업데이트
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'FILE_INFO',
          fileKey: fileInfo.fileKey,
          fileName: fileInfo.fileName,
          pageId: fileInfo.pageId,
          pageName: fileInfo.pageName,
        }));
        log('서버에 파일 정보 전송', 'success');
      }
      break;

    case 'frames-list':
      // 프레임 목록을 서버에 전달
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'FRAMES_LIST',
          frames: msg.frames,
          commandId: pendingCommandId,
        }));
        log(`프레임 목록 전송: ${msg.frames.length}개`, 'info');
        pendingCommandId = null;
      }
      break;

    case 'delete-result':
      // 삭제 결과를 서버에 전달
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'DELETE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        }));
        if (msg.success) {
          log(`프레임 삭제 완료: ${msg.result?.name || msg.result?.nodeId}`, 'success');
        } else {
          log(`프레임 삭제 실패: ${msg.error}`, 'error');
        }
        pendingCommandId = null;
      }
      break;

    case 'info':
      log(msg.message, 'info');
      break;
  }
};

// Show message
function showMessage(text: string, type: 'success' | 'error') {
  message.textContent = text;
  message.className = `message ${type}`;
}

// Hide message
function hideMessage() {
  message.className = 'message';
}

// Update connection status
function updateStatus(connected: boolean, text: string) {
  isConnected = connected;
  const statusClass = connected ? 'connected' : 'waiting';
  statusDot.className = `status-dot ${statusClass}`;
  statusDotMini.className = `status-dot ${statusClass}`;
  statusText.textContent = text;
  serverConnected.style.display = connected ? 'block' : 'none';
  serverDisconnected.style.display = connected ? 'none' : 'block';
}

// Start server detection with polling
function startServerDetection() {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${HTTP_URL}/api/health`, {
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

  // Initial check
  checkServer();
}

// Stop polling
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Check server once
async function checkServer() {
  try {
    const res = await fetch(`${HTTP_URL}/api/health`);
    if (res.ok) {
      stopPolling();
      connectWebSocket();
    }
  } catch {
    updateStatus(false, '서버 대기 중...');
  }
}

// Connect to WebSocket
function connectWebSocket() {
  if (ws) {
    ws.close();
  }

  log('WebSocket 연결 시도...', 'info');
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    updateStatus(true, '서버 연결됨');
    log('서버에 연결되었습니다', 'success');

    // Register as Figma plugin with file info
    const registerMsg = {
      type: 'REGISTER',
      client: 'figma-plugin',
      ...(fileInfo || {}),
    };
    ws?.send(JSON.stringify(registerMsg));
    log(`등록 완료 (file: ${fileInfo?.fileName || 'unknown'})`, 'info');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (error) {
      log(`메시지 파싱 오류: ${error}`, 'error');
    }
  };

  ws.onclose = () => {
    updateStatus(false, '연결 끊김');
    log('서버 연결이 끊어졌습니다', 'warn');
    ws = null;
    // Restart polling after disconnect
    setTimeout(() => startServerDetection(), 2000);
  };

  ws.onerror = () => {
    updateStatus(false, '연결 오류');
    log('WebSocket 연결 오류', 'error');
  };
}

// Handle server messages
function handleServerMessage(msg: { type: string; data?: unknown; name?: string; commandId?: string; position?: { x: number; y: number }; nodeId?: string }) {
  switch (msg.type) {
    case 'CREATE_FRAME':
      log(`프레임 생성 요청: ${msg.name || 'Unnamed'}${msg.position ? ` (${msg.position.x}, ${msg.position.y})` : ''}`, 'info');
      // Create frame in Figma with optional position
      sendToPlugin('create-from-json', msg.data, msg.name, msg.position);

      // Send result back to server
      ws?.send(
        JSON.stringify({
          type: 'RESULT',
          commandId: msg.commandId,
          success: true,
        })
      );
      log(`프레임 생성 완료: ${msg.name || 'Unnamed'}`, 'success');
      break;

    case 'GET_FRAMES':
      log('프레임 목록 요청', 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('get-frames');
      break;

    case 'DELETE_FRAME':
      log(`프레임 삭제 요청: ${msg.nodeId}`, 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('delete-frame', undefined, undefined, undefined, undefined, msg.nodeId);
      break;

    case 'PING':
      ws?.send(JSON.stringify({ type: 'PONG' }));
      break;

    case 'IMPORTED':
      // Data was imported successfully
      showMessage('프레임이 생성되었습니다!', 'success');
      break;
  }
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update FileKey UI
function updateFileKeyUI(info: typeof fileInfo) {
  if (!info) return;

  const { fileKey, fileKeySource, storedFileKey } = info;

  // 입력 필드에 현재 값 표시 (저장된 값 또는 API 값)
  fileKeyInput.value = storedFileKey || fileKey || '';

  // 상태 표시
  fileKeyStatus.className = 'filekey-status';
  if (fileKeySource === 'api') {
    fileKeyStatus.textContent = '(자동 감지)';
    fileKeyStatus.classList.add('auto');
    fileKeyHint.textContent = 'Figma API에서 자동으로 가져온 값입니다.';
  } else if (fileKeySource === 'stored') {
    fileKeyStatus.textContent = '(수동 저장)';
    fileKeyStatus.classList.add('manual');
    fileKeyHint.textContent = '이 파일에 저장된 값입니다. Figma API가 null을 반환합니다.';
  } else {
    fileKeyStatus.textContent = '(미설정)';
    fileKeyStatus.classList.add('none');
    fileKeyHint.textContent = 'File Key를 수동으로 입력해주세요.';
  }
}

// Start on load
startServerDetection();
