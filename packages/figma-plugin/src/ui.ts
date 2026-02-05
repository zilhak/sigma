import { HTTP_URL, WS_URL } from '@sigma/shared';

// DOM Elements
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusDotMini = document.getElementById('statusDotMini') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const tabs = document.querySelectorAll('.tab');
const pasteJsonSection = document.getElementById('pasteJsonSection') as HTMLDivElement;
const pasteHtmlSection = document.getElementById('pasteHtmlSection') as HTMLDivElement;
const serverSection = document.getElementById('serverSection') as HTMLDivElement;
const jsonInput = document.getElementById('jsonInput') as HTMLTextAreaElement;
const htmlInput = document.getElementById('htmlInput') as HTMLTextAreaElement;
const importJsonBtn = document.getElementById('importJsonBtn') as HTMLButtonElement;
const importHtmlBtn = document.getElementById('importHtmlBtn') as HTMLButtonElement;
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
let assignedPluginId: string | null = null;  // 서버에서 할당받은 고유 플러그인 ID

// Chunked transfer state
interface ChunkBuffer {
  commandId: string;
  totalChunks: number;
  receivedChunks: Map<number, string>;
  format: 'json' | 'html';
  name?: string;
  position?: { x: number; y: number };
  pageId?: string;
  operation?: 'create' | 'update';
  nodeId?: string;
}
let chunkBuffer: ChunkBuffer | null = null;
// 페이지 정보 타입
interface PageInfo {
  id: string;
  name: string;
}

let fileInfo: {
  fileKey: string | null;
  fileKeySource: 'api' | 'stored' | 'none';
  storedFileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
  pages: PageInfo[];  // 전체 페이지 목록
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

    pasteJsonSection.classList.toggle('active', tabName === 'paste-json');
    pasteHtmlSection.classList.toggle('active', tabName === 'paste-html');
    serverSection.classList.toggle('active', tabName === 'server');
  });
});

// JSON input validation
jsonInput.addEventListener('input', () => {
  const value = jsonInput.value.trim();
  importJsonBtn.disabled = !value;

  // Try to parse and validate
  if (value) {
    try {
      const data = JSON.parse(value);
      if (data.tagName && data.styles) {
        importJsonBtn.disabled = false;
        hideMessage();
      } else {
        importJsonBtn.disabled = true;
        showMessage('유효한 ExtractedNode JSON이 아닙니다.', 'error');
      }
    } catch {
      importJsonBtn.disabled = true;
      if (value.length > 10) {
        showMessage('JSON 파싱 오류', 'error');
      }
    }
  }
});

// HTML input validation
htmlInput.addEventListener('input', () => {
  const value = htmlInput.value.trim();
  importHtmlBtn.disabled = !value;

  // Basic HTML validation - check for opening tag
  if (value) {
    if (value.startsWith('<') && value.includes('>')) {
      importHtmlBtn.disabled = false;
      hideMessage();
    } else {
      importHtmlBtn.disabled = true;
      if (value.length > 10) {
        showMessage('유효한 HTML이 아닙니다.', 'error');
      }
    }
  }
});

// JSON Import button
importJsonBtn.addEventListener('click', () => {
  const value = jsonInput.value.trim();
  if (!value) return;

  try {
    const data = JSON.parse(value);
    sendToPlugin('create-from-json', data);
  } catch (error) {
    showMessage('JSON 파싱 오류', 'error');
  }
});

// HTML Import button
importHtmlBtn.addEventListener('click', () => {
  const value = htmlInput.value.trim();
  if (!value) return;

  sendToPlugin('create-from-html', value);
});

// Send message to plugin main code
function sendToPlugin(type: string, data?: unknown, name?: string, position?: { x: number; y: number }, fileKey?: string, nodeId?: string, pageId?: string) {
  parent.postMessage(
    {
      pluginMessage: { type, data, name, position, fileKey, nodeId, pageId },
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
        pages: msg.pages || [],  // 전체 페이지 목록
      };
      log(`파일 정보 수신: ${fileInfo.fileName} / ${fileInfo.pageName} (${fileInfo.pages.length} pages)`, 'info');

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
          pages: fileInfo.pages.map(p => ({ pageId: p.id, pageName: p.name })),  // 서버 형식으로 변환
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
          pageId: msg.pageId,
          pageName: msg.pageName,
          commandId: pendingCommandId,
        }));
        log(`프레임 목록 전송: ${msg.frames.length}개 (페이지: ${msg.pageName || 'unknown'})`, 'info');
        pendingCommandId = null;
      }
      break;

    case 'pages-list':
      // 페이지 목록을 서버에 전달
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'PAGES_LIST',
          pages: msg.pages,
          currentPageId: msg.currentPageId,
          commandId: pendingCommandId,
        }));
        log(`페이지 목록 전송: ${msg.pages.length}개`, 'info');
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

    case 'update-result':
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        ws.send(JSON.stringify({
          type: 'UPDATE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        }));
        if (msg.success) {
          log(`프레임 업데이트 완료: ${(msg.result as any)?.name !== undefined ? (msg.result as any).name : (msg.result as any)?.nodeId}`, 'success');
        } else {
          log(`프레임 업데이트 실패: ${msg.error}`, 'error');
        }
        pendingCommandId = null;
      }
      break;

    case 'modify-result':
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        ws.send(JSON.stringify({
          type: 'MODIFY_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        }));
        if (msg.success) {
          log('노드 조작 완료', 'success');
        } else {
          log(`노드 조작 실패: ${msg.error}`, 'error');
        }
        pendingCommandId = null;
      }
      break;

    case 'info':
      log(msg.message, 'info');
      break;

    case 'extract-result':
      // 추출 결과 처리 (서버 연동 전용)
      if (msg.success) {
        log(`추출 완료 (${msg.format})`, 'success');
      } else {
        log(`추출 실패: ${msg.error}`, 'error');
      }

      // 서버로 결과 전송
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        ws.send(JSON.stringify({
          type: 'EXTRACT_RESULT',
          commandId: pendingCommandId,
          format: msg.format,
          success: msg.success,
          data: msg.data,
          error: msg.error,
        }));
        pendingCommandId = null;
      }
      break;

    case 'roundtrip-result':
      // 라운드트립 테스트 결과 처리 (서버 연동 전용)
      if (msg.success) {
        if (msg.identical) {
          log(`라운드트립 테스트 성공 (${msg.format}): 완전 동일`, 'success');
        } else {
          const diffCount = msg.differences ? msg.differences.length : 0;
          log(`라운드트립 테스트 완료 (${msg.format}): ${diffCount}개 차이점`, 'warn');
        }
      } else {
        log(`라운드트립 테스트 실패: ${msg.error}`, 'error');
      }

      // 서버로 결과 전송
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        ws.send(JSON.stringify({
          type: 'ROUNDTRIP_RESULT',
          commandId: pendingCommandId,
          format: msg.format,
          success: msg.success,
          identical: msg.identical,
          differences: msg.differences,
          original: msg.original,
          extracted: msg.extracted,
          createdFrameId: msg.createdFrameId,
          error: msg.error,
        }));
        pendingCommandId = null;
      }
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

  // 연결 해제 시 플러그인 ID 초기화
  if (!connected) {
    assignedPluginId = null;
    updatePluginIdDisplay();
  }
}

// Update plugin ID display in UI
function updatePluginIdDisplay() {
  const pluginIdElement = document.getElementById('clientId');  // DOM ID는 유지 (HTML 수정 최소화)
  if (pluginIdElement) {
    if (assignedPluginId) {
      pluginIdElement.textContent = assignedPluginId;
      pluginIdElement.title = `플러그인 ID: ${assignedPluginId}\n클릭하여 복사`;
    } else {
      pluginIdElement.textContent = '-';
      pluginIdElement.title = '';
    }
  }
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

    // Register as Figma plugin with file info and pages
    const registerMsg: Record<string, unknown> = {
      type: 'REGISTER',
      client: 'figma-plugin',
    };

    // 파일 정보가 있으면 추가
    if (fileInfo) {
      registerMsg.fileKey = fileInfo.fileKey;
      registerMsg.fileName = fileInfo.fileName;
      registerMsg.pageId = fileInfo.pageId;
      registerMsg.pageName = fileInfo.pageName;
      registerMsg.pages = fileInfo.pages.map(p => ({ pageId: p.id, pageName: p.name }));  // 서버 형식으로 변환
    }

    if (ws) ws.send(JSON.stringify(registerMsg));
    log(`등록 완료 (file: ${fileInfo ? fileInfo.fileName : 'unknown'}, ${fileInfo ? fileInfo.pages.length : 0} pages)`, 'info');
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
function handleServerMessage(msg: { type: string; data?: unknown; html?: string; format?: 'json' | 'html'; name?: string; commandId?: string; position?: { x: number; y: number }; nodeId?: string; totalChunks?: number; index?: number; clientId?: string; pageId?: string; pluginId?: string; method?: string; args?: Record<string, unknown>; operation?: string }) {
  switch (msg.type) {
    case 'REGISTERED':
      // 서버에서 할당받은 고유 플러그인 ID 저장
      assignedPluginId = (msg.pluginId || msg.clientId || null) as string | null;  // pluginId 우선, 하위호환 clientId
      log(`플러그인 ID 할당됨: ${assignedPluginId}`, 'success');
      updatePluginIdDisplay();
      break;

    case 'CREATE_FRAME': {
      const format = msg.format || 'json';
      const pageInfo = msg.pageId ? ` [page: ${msg.pageId}]` : '';
      log(`프레임 생성 요청: ${msg.name || 'Unnamed'} (${format})${msg.position ? ` (${msg.position.x}, ${msg.position.y})` : ''}${pageInfo}`, 'info');

      // Create frame in Figma with optional position and pageId
      if (format === 'html') {
        sendToPlugin('create-from-html', msg.html, msg.name, msg.position, undefined, undefined, msg.pageId);
      } else {
        sendToPlugin('create-from-json', msg.data, msg.name, msg.position, undefined, undefined, msg.pageId);
      }

      // Send result back to server
      if (ws) ws.send(
        JSON.stringify({
          type: 'RESULT',
          commandId: msg.commandId,
          success: true,
        })
      );
      log(`프레임 생성 완료: ${msg.name || 'Unnamed'}`, 'success');
      break;
    }

    // === Chunked transfer handlers ===
    case 'CHUNK_START':
      log(`청크 전송 시작: ${msg.totalChunks}개 청크 예정 (${msg.format !== undefined ? msg.format : 'json'})${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      chunkBuffer = {
        commandId: msg.commandId !== undefined ? msg.commandId : '',
        totalChunks: msg.totalChunks !== undefined ? msg.totalChunks : 0,
        receivedChunks: new Map(),
        format: msg.format !== undefined ? msg.format : 'json',
        name: msg.name,
        position: msg.position,
        pageId: msg.pageId,
        operation: (msg as any).operation !== undefined ? (msg as any).operation : 'create',
        nodeId: msg.nodeId,
      };
      break;

    case 'CHUNK':
      if (!chunkBuffer || chunkBuffer.commandId !== msg.commandId) {
        log(`청크 버퍼 불일치: ${msg.commandId}`, 'warn');
        break;
      }
      chunkBuffer.receivedChunks.set(msg.index || 0, msg.data as string);
      // 진행 상황 로그 (10개마다 또는 마지막)
      const received = chunkBuffer.receivedChunks.size;
      const total = chunkBuffer.totalChunks;
      if (received % 10 === 0 || received === total) {
        log(`청크 수신 중: ${received}/${total}`, 'info');
      }
      break;

    case 'CHUNK_END':
      if (!chunkBuffer || chunkBuffer.commandId !== msg.commandId) {
        log(`청크 종료 불일치: ${msg.commandId}`, 'warn');
        break;
      }

      // 모든 청크가 도착했는지 확인
      if (chunkBuffer.receivedChunks.size !== chunkBuffer.totalChunks) {
        log(`청크 누락: ${chunkBuffer.receivedChunks.size}/${chunkBuffer.totalChunks}`, 'error');
        if (ws) ws.send(JSON.stringify({
          type: 'RESULT',
          commandId: msg.commandId,
          success: false,
          error: `Missing chunks: received ${chunkBuffer.receivedChunks.size}/${chunkBuffer.totalChunks}`,
        }));
        chunkBuffer = null;
        break;
      }

      // 청크 조립
      log('청크 조립 중...', 'info');
      let assembledData = '';
      for (let i = 0; i < chunkBuffer.totalChunks; i++) {
        assembledData += chunkBuffer.receivedChunks.get(i) !== undefined ? chunkBuffer.receivedChunks.get(i) : '';
      }

      try {
        if (chunkBuffer.operation === 'update') {
          // UPDATE_FRAME via chunks
          const updateData = chunkBuffer.format === 'html'
            ? assembledData
            : JSON.parse(assembledData);

          log(`프레임 업데이트 요청 (청크/${chunkBuffer.format}): ${chunkBuffer.nodeId}`, 'info');

          parent.postMessage({
            pluginMessage: {
              type: 'update-frame',
              nodeId: chunkBuffer.nodeId,
              format: chunkBuffer.format,
              data: updateData,
              name: chunkBuffer.name,
              pageId: chunkBuffer.pageId,
            },
          }, '*');

          pendingCommandId = msg.commandId !== undefined ? msg.commandId : null;
          // Don't send RESULT here - wait for update-result from code.ts
        } else {
          // CREATE_FRAME via chunks (existing logic)
          if (chunkBuffer.format === 'html') {
            // HTML 형식
            log(`프레임 생성 요청 (청크/HTML): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}${chunkBuffer.pageId ? ` [page: ${chunkBuffer.pageId}]` : ''}`, 'info');
            sendToPlugin('create-from-html', assembledData, chunkBuffer.name, chunkBuffer.position, undefined, undefined, chunkBuffer.pageId);
          } else {
            // JSON 형식
            const data = JSON.parse(assembledData);
            log(`프레임 생성 요청 (청크/JSON): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}${chunkBuffer.pageId ? ` [page: ${chunkBuffer.pageId}]` : ''}`, 'info');
            sendToPlugin('create-from-json', data, chunkBuffer.name, chunkBuffer.position, undefined, undefined, chunkBuffer.pageId);
          }

          if (ws) ws.send(JSON.stringify({
            type: 'RESULT',
            commandId: msg.commandId,
            success: true,
          }));
          log(`프레임 생성 완료 (청크): ${chunkBuffer.name !== undefined ? chunkBuffer.name : 'Unnamed'}`, 'success');
        }
      } catch (err) {
        log(`청크 파싱 오류: ${err}`, 'error');
        if (ws) ws.send(JSON.stringify({
          type: 'RESULT',
          commandId: msg.commandId,
          success: false,
          error: `Parse error: ${err}`,
        }));
      }

      chunkBuffer = null;
      break;

    case 'GET_FRAMES':
      log(`프레임 목록 요청${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('get-frames', undefined, undefined, undefined, undefined, undefined, msg.pageId);
      break;

    case 'GET_PAGES':
      log('페이지 목록 요청', 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('get-pages');
      break;

    case 'DELETE_FRAME':
      log(`프레임 삭제 요청: ${msg.nodeId}${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('delete-frame', undefined, undefined, undefined, undefined, msg.nodeId, msg.pageId);
      break;

    case 'UPDATE_FRAME': {
      const updateFormat = msg.format !== undefined ? msg.format : 'json';
      const pageInfo = msg.pageId ? ` [page: ${msg.pageId}]` : '';
      log(`프레임 업데이트 요청: ${msg.nodeId} (${updateFormat})${pageInfo}`, 'info');

      // Use direct postMessage (sendToPlugin doesn't support format field)
      parent.postMessage(
        {
          pluginMessage: {
            type: 'update-frame',
            nodeId: msg.nodeId,
            format: updateFormat,
            data: updateFormat === 'html' ? msg.html : msg.data,
            name: msg.name,
            pageId: msg.pageId,
          },
        },
        '*'
      );

      pendingCommandId = msg.commandId !== undefined ? msg.commandId : null;
      break;
    }

    case 'MODIFY_NODE': {
      log(`노드 조작 요청: ${msg.nodeId} / ${msg.method}`, 'info');

      parent.postMessage(
        {
          pluginMessage: {
            type: 'modify-node',
            nodeId: msg.nodeId,
            method: msg.method,
            args: msg.args,
          },
        },
        '*'
      );

      pendingCommandId = msg.commandId !== undefined ? msg.commandId : null;
      break;
    }

    case 'PING':
      if (ws) ws.send(JSON.stringify({ type: 'PONG' }));
      break;

    case 'IMPORTED':
      // Data was imported successfully
      showMessage('프레임이 생성되었습니다!', 'success');
      break;

    case 'EXTRACT_JSON':
      log('JSON 추출 요청', 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('extract-to-json');
      break;

    case 'EXTRACT_HTML':
      log('HTML 추출 요청', 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('extract-to-html');
      break;

    case 'TEST_ROUNDTRIP_JSON':
      log(`JSON 라운드트립 테스트 요청: ${msg.name || 'Unnamed'}`, 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('test-roundtrip-json', msg.data, msg.name as string | undefined);
      break;

    case 'TEST_ROUNDTRIP_HTML':
      log(`HTML 라운드트립 테스트 요청: ${msg.name || 'Unnamed'}`, 'info');
      pendingCommandId = msg.commandId || null;
      sendToPlugin('test-roundtrip-html', msg.data, msg.name as string | undefined);
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
