// === 타입 정의 ===
export interface ChunkBuffer {
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

export interface PageInfo {
  id: string;
  name: string;
}

export interface FileInfo {
  fileKey: string | null;
  fileKeySource: 'api' | 'stored' | 'none';
  storedFileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
  pages: PageInfo[];
}

// === DOM 요소 참조 ===
export const dom = {
  statusDot: document.getElementById('statusDot') as HTMLDivElement,
  statusDotMini: document.getElementById('statusDotMini') as HTMLDivElement,
  statusText: document.getElementById('statusText') as HTMLSpanElement,
  tabs: document.querySelectorAll('.tab'),
  pasteJsonSection: document.getElementById('pasteJsonSection') as HTMLDivElement,
  pasteHtmlSection: document.getElementById('pasteHtmlSection') as HTMLDivElement,
  serverSection: document.getElementById('serverSection') as HTMLDivElement,
  jsonInput: document.getElementById('jsonInput') as HTMLTextAreaElement,
  htmlInput: document.getElementById('htmlInput') as HTMLTextAreaElement,
  importJsonBtn: document.getElementById('importJsonBtn') as HTMLButtonElement,
  importHtmlBtn: document.getElementById('importHtmlBtn') as HTMLButtonElement,
  message: document.getElementById('message') as HTMLDivElement,
  serverConnected: document.getElementById('serverConnected') as HTMLDivElement,
  serverDisconnected: document.getElementById('serverDisconnected') as HTMLDivElement,
  minimizeBtn: document.getElementById('minimizeBtn') as HTMLButtonElement,
  expandBtn: document.getElementById('expandBtn') as HTMLButtonElement,
  fullView: document.getElementById('fullView') as HTMLDivElement,
  minimizedView: document.getElementById('minimizedView') as HTMLDivElement,
  logContainer: document.getElementById('logContainer') as HTMLDivElement,
  fileKeyInput: document.getElementById('fileKeyInput') as HTMLInputElement,
  fileKeyStatus: document.getElementById('fileKeyStatus') as HTMLSpanElement,
  fileKeyHint: document.getElementById('fileKeyHint') as HTMLDivElement,
  saveFileKeyBtn: document.getElementById('saveFileKeyBtn') as HTMLButtonElement,
};

// === 상태 변수 ===
let ws: WebSocket | null = null;
let pollingInterval: number | null = null;
let isConnected = false;
let isMinimized = false;
let pendingCommandId: string | null = null;
let assignedPluginId: string | null = null;
let chunkBuffer: ChunkBuffer | null = null;
let fileInfo: FileInfo | null = null;

// === 상태 getter/setter ===
export function getWs(): WebSocket | null { return ws; }
export function setWs(value: WebSocket | null) { ws = value; }

export function getPollingInterval(): number | null { return pollingInterval; }
export function setPollingInterval(value: number | null) { pollingInterval = value; }

export function getIsConnected(): boolean { return isConnected; }
export function setIsConnected(value: boolean) { isConnected = value; }

export function getIsMinimized(): boolean { return isMinimized; }
export function setIsMinimized(value: boolean) { isMinimized = value; }

export function getPendingCommandId(): string | null { return pendingCommandId; }
export function setPendingCommandId(value: string | null) { pendingCommandId = value; }

export function getAssignedPluginId(): string | null { return assignedPluginId; }
export function setAssignedPluginId(value: string | null) { assignedPluginId = value; }

export function getChunkBuffer(): ChunkBuffer | null { return chunkBuffer; }
export function setChunkBuffer(value: ChunkBuffer | null) { chunkBuffer = value; }

export function getFileInfo(): FileInfo | null { return fileInfo; }
export function setFileInfo(value: FileInfo | null) { fileInfo = value; }

// === DOM 헬퍼 함수 ===

// HTML 이스케이프
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 로그 출력
export function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const time = new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  dom.logContainer.appendChild(entry);
  dom.logContainer.scrollTop = dom.logContainer.scrollHeight;

  // 최대 100개 로그 유지
  while (dom.logContainer.children.length > 100) {
    dom.logContainer.removeChild(dom.logContainer.firstChild!);
  }
}

// 메시지 표시
export function showMessage(text: string, type: 'success' | 'error') {
  dom.message.textContent = text;
  dom.message.className = `message ${type}`;
}

// 메시지 숨기기
export function hideMessage() {
  dom.message.className = 'message';
}

// 연결 상태 업데이트
export function updateStatus(connected: boolean, text: string) {
  isConnected = connected;
  const statusClass = connected ? 'connected' : 'waiting';
  dom.statusDot.className = `status-dot ${statusClass}`;
  dom.statusDotMini.className = `status-dot ${statusClass}`;
  dom.statusText.textContent = text;
  dom.serverConnected.style.display = connected ? 'block' : 'none';
  dom.serverDisconnected.style.display = connected ? 'none' : 'block';

  // 연결 해제 시 플러그인 ID 초기화
  if (!connected) {
    assignedPluginId = null;
    updatePluginIdDisplay();
  }
}

// 플러그인 ID 표시 업데이트
export function updatePluginIdDisplay() {
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

// FileKey UI 업데이트
export function updateFileKeyUI(info: FileInfo | null) {
  if (!info) return;

  const { fileKey, fileKeySource, storedFileKey } = info;

  // 입력 필드에 현재 값 표시 (저장된 값 또는 API 값)
  dom.fileKeyInput.value = storedFileKey || fileKey || '';

  // 상태 표시
  dom.fileKeyStatus.className = 'filekey-status';
  if (fileKeySource === 'api') {
    dom.fileKeyStatus.textContent = '(자동 감지)';
    dom.fileKeyStatus.classList.add('auto');
    dom.fileKeyHint.textContent = 'Figma API에서 자동으로 가져온 값입니다.';
  } else if (fileKeySource === 'stored') {
    dom.fileKeyStatus.textContent = '(수동 저장)';
    dom.fileKeyStatus.classList.add('manual');
    dom.fileKeyHint.textContent = '이 파일에 저장된 값입니다. Figma API가 null을 반환합니다.';
  } else {
    dom.fileKeyStatus.textContent = '(미설정)';
    dom.fileKeyStatus.classList.add('none');
    dom.fileKeyHint.textContent = 'File Key를 수동으로 입력해주세요.';
  }
}
