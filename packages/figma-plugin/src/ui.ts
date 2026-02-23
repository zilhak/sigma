import { SERVER_URL, WEBSOCKET_URL } from '@sigma/shared';
import {
  dom, getWs, setWs, getFileInfo,
  getPollingInterval, setPollingInterval,
  setIsMinimized,
  log, showMessage, hideMessage, updateStatus,
  setExportResultCallback, escapeHtml,
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
const sectionMap: Record<string, HTMLDivElement> = {
  info: dom.infoSection,
  server: dom.serverSection,
  log: dom.logSection,
  object: dom.objectSection,
};

dom.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = (tab as HTMLElement).dataset.tab;
    if (!tabName) return;

    dom.tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    // 모든 섹션 비활성화 후 해당 섹션만 활성화
    Object.values(sectionMap).forEach(s => s.classList.remove('active'));
    const target = sectionMap[tabName];
    if (target) target.classList.add('active');
  });
});

// === 개체 탭: Import/Export (직접 포맷 버튼) ===

// --- Import 버튼들 ---
let importFormat: string = 'json';

function openImportModal(format: string) {
  importFormat = format;
  dom.importModalTitle.textContent = `Import ${format.toUpperCase()}`;
  dom.importTextArea.value = '';
  dom.importModalSubmit.disabled = true;
  dom.importModal.classList.add('active');
  dom.importTextArea.focus();
}

dom.importHtmlBtn.addEventListener('click', () => openImportModal('html'));
dom.importJsonBtn.addEventListener('click', () => openImportModal('json'));

dom.importTextArea.addEventListener('input', () => {
  const value = dom.importTextArea.value.trim();
  if (!value) {
    dom.importModalSubmit.disabled = true;
    return;
  }

  if (importFormat === 'json') {
    try {
      const data = JSON.parse(value);
      dom.importModalSubmit.disabled = !(data.tagName && data.styles);
      if (dom.importModalSubmit.disabled && value.length > 10) {
        showMessage('유효한 ExtractedNode JSON이 아닙니다.', 'error');
      } else {
        hideMessage();
      }
    } catch {
      dom.importModalSubmit.disabled = true;
      if (value.length > 10) {
        showMessage('JSON 파싱 오류', 'error');
      }
    }
  } else {
    dom.importModalSubmit.disabled = !(value.startsWith('<') && value.includes('>'));
    if (dom.importModalSubmit.disabled && value.length > 10) {
      showMessage('유효한 HTML이 아닙니다.', 'error');
    } else {
      hideMessage();
    }
  }
});

dom.importModalSubmit.addEventListener('click', () => {
  const value = dom.importTextArea.value.trim();
  if (!value) return;

  if (importFormat === 'json') {
    try {
      const data = JSON.parse(value);
      sendToPlugin('create-from-json', data);
    } catch {
      showMessage('JSON 파싱 오류', 'error');
      return;
    }
  } else {
    sendToPlugin('create-from-html', value);
  }

  dom.importModal.classList.remove('active');
  hideMessage();
});

dom.importModalCancel.addEventListener('click', () => {
  dom.importModal.classList.remove('active');
  hideMessage();
});

// --- Import 서버 목록 ---
let selectedServerId: string | null = null;

dom.importServerBtn.addEventListener('click', async () => {
  selectedServerId = null;
  dom.serverListImport.disabled = true;
  dom.serverList.innerHTML = '<div class="server-list-empty">로딩 중...</div>';
  dom.serverListModal.classList.add('active');

  try {
    const res = await fetch(`${SERVER_URL}/api/extracted`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    const components = result.components || [];

    if (components.length === 0) {
      dom.serverList.innerHTML = '<div class="server-list-empty">저장된 항목이 없습니다.</div>';
      return;
    }

    dom.serverList.innerHTML = '';
    for (const comp of components) {
      const item = document.createElement('div');
      item.className = 'server-list-item';
      item.dataset.id = comp.id;
      const d = new Date(comp.updatedAt || comp.createdAt);
      const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      item.innerHTML = `<div class="server-list-item-name">${escapeHtml(comp.name)}</div><div class="server-list-item-meta">${date}</div>`;
      item.addEventListener('click', () => {
        dom.serverList.querySelectorAll('.server-list-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedServerId = comp.id;
        dom.serverListImport.disabled = false;
      });
      dom.serverList.appendChild(item);
    }
  } catch (err) {
    dom.serverList.innerHTML = `<div class="server-list-empty">서버 연결 실패: ${err}</div>`;
  }
});

dom.serverListClose.addEventListener('click', () => {
  dom.serverListModal.classList.remove('active');
});

dom.serverListImport.addEventListener('click', async () => {
  if (!selectedServerId) return;
  dom.serverListImport.disabled = true;
  dom.serverListImport.textContent = '불러오는 중...';

  try {
    const res = await fetch(`${SERVER_URL}/api/extracted/${selectedServerId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    const comp = result.component;

    if (comp && comp.data) {
      sendToPlugin('create-from-json', comp.data);
      dom.serverListModal.classList.remove('active');
      log(`서버에서 "${comp.name}" 불러옴`, 'success');
    } else {
      showMessage('데이터가 없습니다.', 'error');
    }
  } catch (err) {
    showMessage(`불러오기 실패: ${err}`, 'error');
  } finally {
    dom.serverListImport.textContent = 'Import';
    dom.serverListImport.disabled = !selectedServerId;
  }
});

// --- Export 버튼들 ---
let exportFormat: string = 'json';
let exportData: unknown = null;

function openExportModal(format: string) {
  exportFormat = format;
  exportData = null;
  dom.exportModalTitle.textContent = `Export ${format.toUpperCase()}`;
  dom.exportTextArea.value = '';
  dom.exportTextArea.placeholder = '추출 중...';
  dom.exportModal.classList.add('active');

  if (format === 'json') {
    sendToPlugin('extract-to-json');
  } else {
    sendToPlugin('extract-to-html');
  }
}

dom.exportHtmlBtn.addEventListener('click', () => openExportModal('html'));
dom.exportJsonBtn.addEventListener('click', () => openExportModal('json'));

// Export 결과 콜백 등록
setExportResultCallback((format: string, success: boolean, data: unknown, error?: string) => {
  if (!dom.exportModal.classList.contains('active')) return;

  if (success && data) {
    exportData = data;
    if (format === 'json') {
      dom.exportTextArea.value = JSON.stringify(data, null, 2);
    } else {
      dom.exportTextArea.value = data as string;
    }
    dom.exportTextArea.placeholder = '';
  } else {
    dom.exportTextArea.value = '';
    dom.exportTextArea.placeholder = error || '추출 실패';
  }
});

dom.exportModalClose.addEventListener('click', () => {
  dom.exportModal.classList.remove('active');
  exportData = null;
});

dom.exportModalCopy.addEventListener('click', async () => {
  const text = dom.exportTextArea.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    showMessage('클립보드에 복사되었습니다.', 'success');
  } catch {
    dom.exportTextArea.select();
    document.execCommand('copy');
    showMessage('클립보드에 복사되었습니다.', 'success');
  }
});

dom.exportModalSave.addEventListener('click', () => {
  if (!exportData) return;

  const blob = new Blob(
    [dom.exportTextArea.value],
    { type: exportFormat === 'json' ? 'application/json' : 'text/html' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export.${exportFormat === 'json' ? 'json' : 'html'}`;
  a.click();
  URL.revokeObjectURL(url);
  showMessage('파일이 저장되었습니다.', 'success');
});

// --- Export 서버에 저장 ---
dom.exportModalSaveServer.addEventListener('click', async () => {
  if (!exportData) return;

  const name = prompt('저장할 이름을 입력하세요:');
  if (!name) return;

  dom.exportModalSaveServer.disabled = true;
  dom.exportModalSaveServer.textContent = '저장 중...';

  try {
    const res = await fetch(`${SERVER_URL}/api/extracted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: exportData }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    if (result.success) {
      showMessage(`서버에 저장됨: ${result.component.id}`, 'success');
      log(`서버에 "${name}" 저장 완료 (${result.component.id})`, 'success');
    } else {
      showMessage('서버 저장 실패', 'error');
    }
  } catch (err) {
    showMessage(`서버 저장 실패: ${err}`, 'error');
  } finally {
    dom.exportModalSaveServer.disabled = false;
    dom.exportModalSaveServer.textContent = '서버';
  }
});

// === 플러그인(code.ts) 메시지 수신 ===
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  handlePluginMessage(msg);
};

// === 재시도 버튼 ===
dom.retryConnectBtn.addEventListener('click', () => {
  log('수동 재연결 시도...', 'info');
  checkServer();
});

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
