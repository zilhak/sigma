import { HTTP_URL, WS_URL } from '@sigma/shared';

// DOM Elements
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const tabs = document.querySelectorAll('.tab');
const pasteSection = document.getElementById('pasteSection') as HTMLDivElement;
const serverSection = document.getElementById('serverSection') as HTMLDivElement;
const jsonInput = document.getElementById('jsonInput') as HTMLTextAreaElement;
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
const message = document.getElementById('message') as HTMLDivElement;
const serverConnected = document.getElementById('serverConnected') as HTMLDivElement;
const serverDisconnected = document.getElementById('serverDisconnected') as HTMLDivElement;
const recentList = document.getElementById('recentList') as HTMLDivElement;

// State
let ws: WebSocket | null = null;
let pollingInterval: number | null = null;
let isConnected = false;

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
function sendToPlugin(type: string, data?: unknown, name?: string) {
  parent.postMessage(
    {
      pluginMessage: { type, data, name },
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
  statusDot.className = `status-dot ${connected ? 'connected' : 'waiting'}`;
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

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    updateStatus(true, '서버 연결됨');

    // Register as Figma plugin
    ws?.send(
      JSON.stringify({
        type: 'REGISTER',
        client: 'figma-plugin',
      })
    );
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  };

  ws.onclose = () => {
    updateStatus(false, '연결 끊김');
    ws = null;
    // Restart polling after disconnect
    setTimeout(() => startServerDetection(), 2000);
  };

  ws.onerror = () => {
    updateStatus(false, '연결 오류');
  };
}

// Handle server messages
function handleServerMessage(msg: { type: string; data?: unknown; name?: string; commandId?: string }) {
  switch (msg.type) {
    case 'CREATE_FRAME':
      // Create frame in Figma
      sendToPlugin('create-from-json', msg.data, msg.name);

      // Add to recent list
      addToRecentList(msg.name || 'Unnamed', new Date());

      // Send result back to server
      ws?.send(
        JSON.stringify({
          type: 'RESULT',
          commandId: msg.commandId,
          success: true,
        })
      );
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

// Add item to recent list
function addToRecentList(name: string, time: Date) {
  const item = document.createElement('div');
  item.className = 'recent-item';
  item.innerHTML = `
    <span class="recent-item-name">${escapeHtml(name)}</span>
    <span class="recent-item-time">${formatTime(time)}</span>
  `;

  // Add to top of list
  recentList.insertBefore(item, recentList.firstChild);

  // Limit to 10 items
  while (recentList.children.length > 10) {
    recentList.removeChild(recentList.lastChild!);
  }
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format time
function formatTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Start on load
startServerDetection();
