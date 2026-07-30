import { SERVER_URL, WEBSOCKET_URL } from '@sigma/shared';
import {
  dom, getWs, setWs, getFileInfo,
  getPollingInterval, setPollingInterval,
  setIsMinimized,
  log, showMessage, hideMessage, updateStatus,
  setExportResultCallback, setPageLintResultCallback, escapeHtml,
  copyNodeInfoToClipboard,
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
  general: dom.generalSection,
  page: dom.pageSection,
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

// 사람이 플러그인 UI 에서 직접 가져오는 경로 — 생성 후 그 프레임으로 뷰를 옮긴다
// (focusView). MCP(에이전트) 경로는 focusView 를 보내지 않아 뷰/선택이 그대로 유지된다.
function sendImportToPlugin(type: 'create-from-json' | 'create-from-html', data: unknown) {
  parent.postMessage({ pluginMessage: { type, data, focusView: true } }, '*');
}

// === 일반 탭: 노드 정보 복사 ===
dom.copyNodeInfoBtn.addEventListener('click', () => {
  copyNodeInfoToClipboard();
});

// === 일반 탭: 뷰포트 좌표 이동 ===
// code.ts의 기존 'set-viewport'(figma.viewport.center 대입)를 그대로 재사용한다.
// sendToPlugin은 positional 인자에 center가 없어 직접 postMessage로 보낸다.
// 결과는 상단 뷰포트 표시(code.ts의 500ms 폴링)로 확인된다.
function gotoViewportCenter() {
  const rawX = dom.viewportGotoX.value.trim();
  const rawY = dom.viewportGotoY.value.trim();
  const x = Number(rawX);
  const y = Number(rawY);

  if (rawX === '' || rawY === '' || !Number.isFinite(x) || !Number.isFinite(y)) {
    showMessage('x, y 좌표를 숫자로 입력하세요', 'error');
    return;
  }

  parent.postMessage({ pluginMessage: { type: 'set-viewport', center: { x, y } } }, '*');
  log(`뷰포트 이동 요청: (${x}, ${y})`, 'info');
}

dom.viewportGotoBtn.addEventListener('click', gotoViewportCenter);

[dom.viewportGotoX, dom.viewportGotoY].forEach((input) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gotoViewportCenter();
  });
});

// === 일반 탭: 노드 ID로 뷰포트 이동 ===
// 좌표 이동과 달리 존재하지 않는 id 를 넣는 실수가 흔해, UI 전용 'goto-node'로
// 검증 결과를 돌려받아 성공/실패를 메시지로 표시한다 (다른 페이지 노드면 페이지도 전환).
function gotoNode() {
  const nodeId = dom.gotoNodeIdInput.value.trim();
  if (!nodeId) {
    showMessage('노드 ID를 입력하세요', 'error');
    return;
  }
  sendToPlugin('goto-node', undefined, undefined, undefined, undefined, nodeId);
}

dom.gotoNodeBtn.addEventListener('click', gotoNode);

dom.gotoNodeIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') gotoNode();
});

// === 페이지 탭: lint 설정 보기/편집 (현재 페이지, UI 전용) ===
// lint 실행은 서버가 담당하고, 여기서는 페이지 저장 config 메타데이터의 조회/편집만 한다.
// 열려는 모달을 기억해 get-page-lint 응답으로 채운다.
let lintModalPending: 'view' | 'set' | null = null;

dom.lintViewBtn.addEventListener('click', () => {
  lintModalPending = 'view';
  dom.lintViewTextArea.value = '';
  dom.lintViewTextArea.placeholder = '불러오는 중...';
  dom.lintViewModal.classList.add('active');
  sendToPlugin('get-page-lint');
});

dom.lintSetBtn.addEventListener('click', () => {
  lintModalPending = 'set';
  dom.lintSetTextArea.value = '';
  dom.lintSetTextArea.placeholder = '불러오는 중...';
  dom.lintSetModal.classList.add('active');
  sendToPlugin('get-page-lint');  // 기존 값 프리필용
});

setPageLintResultCallback((result) => {
  if (result.pageName) dom.pageLintPageName.textContent = result.pageName;

  if (result.action === 'get') {
    // 저장값(있으면 pretty-print)으로 열린 모달을 채운다
    let pretty = '';
    if (result.value) {
      try { pretty = JSON.stringify(JSON.parse(result.value), null, 2); }
      catch { pretty = result.value; }
    }
    if (lintModalPending === 'view') {
      dom.lintViewTextArea.value = pretty;
      dom.lintViewTextArea.placeholder = pretty ? '' : '(이 페이지에 저장된 lint 설정 없음)';
    } else if (lintModalPending === 'set') {
      dom.lintSetTextArea.value = pretty;
      dom.lintSetTextArea.placeholder = '{ "builtins": { "raw_node": { "enabled": true } } }';
    }
    lintModalPending = null;
    return;
  }

  // set / clear 결과
  if (result.success) {
    showMessage(result.action === 'clear' ? '이 페이지 lint 설정을 삭제했습니다.' : 'lint 설정을 저장했습니다.', 'success');
    dom.lintSetModal.classList.remove('active');
  } else {
    showMessage(result.error || 'lint 설정 저장 실패', 'error');
  }
});

dom.lintViewModalClose.addEventListener('click', () => {
  dom.lintViewModal.classList.remove('active');
});

dom.lintViewModalCopy.addEventListener('click', async () => {
  const text = dom.lintViewTextArea.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showMessage('클립보드에 복사되었습니다.', 'success');
  } catch {
    dom.lintViewTextArea.select();
    document.execCommand('copy');
    showMessage('클립보드에 복사되었습니다.', 'success');
  }
});

dom.lintSetModalCancel.addEventListener('click', () => {
  dom.lintSetModal.classList.remove('active');
  hideMessage();
});

dom.lintSetModalClear.addEventListener('click', () => {
  sendToPlugin('set-page-lint', '');  // 빈 문자열 = 삭제
});

dom.lintSetModalSave.addEventListener('click', () => {
  const value = dom.lintSetTextArea.value.trim();
  if (!value) {
    showMessage('내용이 비어 있습니다. 삭제하려면 "삭제" 버튼을 누르세요.', 'error');
    return;
  }
  try {
    JSON.parse(value);
  } catch {
    showMessage('유효한 JSON이 아닙니다.', 'error');
    return;
  }
  sendToPlugin('set-page-lint', value);
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
      sendImportToPlugin('create-from-json', data);
    } catch {
      showMessage('JSON 파싱 오류', 'error');
      return;
    }
  } else {
    sendImportToPlugin('create-from-html', value);
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
      sendImportToPlugin('create-from-json', comp.data);
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
