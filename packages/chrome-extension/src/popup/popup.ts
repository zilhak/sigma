import type { ExtractedNode } from '@sigma/shared';

// DOM 요소
const selectBtn = document.getElementById('selectBtn') as HTMLButtonElement;
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const preview = document.getElementById('preview') as HTMLDivElement;
const previewTag = document.getElementById('previewTag') as HTMLSpanElement;
const previewClass = document.getElementById('previewClass') as HTMLSpanElement;
const previewSize = document.getElementById('previewSize') as HTMLSpanElement;
const serverStatus = document.getElementById('serverStatus') as HTMLDivElement;
const componentName = document.getElementById('componentName') as HTMLInputElement;
const toast = document.getElementById('toast') as HTMLDivElement;

let extractedData: ExtractedNode | null = null;
let isServerConnected = false;

/**
 * 초기화
 */
async function init() {
  // 서버 상태 확인
  await checkServerStatus();
  setInterval(checkServerStatus, 5000);

  // 기존 추출 데이터 확인
  const response = await chrome.runtime.sendMessage({ type: 'GET_EXTRACTED_DATA' });
  if (response?.data) {
    setExtractedData(response.data);
  }

  // 이벤트 리스너
  selectBtn.addEventListener('click', startSelectMode);
  copyBtn.addEventListener('click', copyToClipboard);
  sendBtn.addEventListener('click', sendToServer);

  // Background에서 오는 메시지 수신
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'EXTRACTION_COMPLETE') {
      setExtractedData(message.data);
      showToast('컴포넌트 추출 완료!');
    }
  });
}

/**
 * 서버 상태 확인
 */
async function checkServerStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'CHECK_SERVER_STATUS' });
  isServerConnected = response?.connected ?? false;
  updateServerStatus();
  updateButtons();
}

/**
 * 서버 상태 UI 업데이트
 */
function updateServerStatus() {
  if (isServerConnected) {
    serverStatus.className = 'server-status connected';
    serverStatus.querySelector('.status-text')!.textContent = '서버 연결됨';
  } else {
    serverStatus.className = 'server-status disconnected';
    serverStatus.querySelector('.status-text')!.textContent = '서버 없음';
  }
}

/**
 * 버튼 상태 업데이트
 */
function updateButtons() {
  // 복사 버튼: 데이터 있으면 활성화
  copyBtn.disabled = !extractedData;

  // 서버 전송 버튼: 데이터 있고 서버 연결되어 있으면 활성화
  sendBtn.disabled = !extractedData || !isServerConnected;
}

/**
 * 추출된 데이터 설정
 */
function setExtractedData(data: ExtractedNode) {
  extractedData = data;

  // 미리보기 표시
  preview.style.display = 'block';
  previewTag.textContent = `<${data.tagName}>`;
  previewClass.textContent = data.className ? `.${data.className.split(' ')[0]}` : '';
  previewSize.textContent = `${Math.round(data.boundingRect.width)} × ${Math.round(data.boundingRect.height)}px`;

  updateButtons();
}

/**
 * 선택 모드 시작
 */
async function startSelectMode() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  await chrome.tabs.sendMessage(tab.id, { type: 'START_SELECT_MODE' });

  // 팝업 닫기 (선택 모드로 전환)
  window.close();
}

/**
 * 클립보드에 복사
 */
async function copyToClipboard() {
  if (!extractedData) return;

  const format = getSelectedFormat();

  try {
    await chrome.runtime.sendMessage({
      type: 'COPY_TO_CLIPBOARD',
      format,
    });
    showToast('클립보드에 복사됨!');
  } catch (error) {
    showToast('복사 실패');
  }
}

/**
 * 서버로 전송
 */
async function sendToServer() {
  if (!extractedData || !isServerConnected) return;

  const format = getSelectedFormat();
  const name = componentName.value.trim();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_TO_SERVER',
      name: name || undefined,
      format,
    });

    if (response?.success) {
      showToast('서버로 전송됨!');
    } else {
      showToast('전송 실패: ' + (response?.error || '알 수 없는 오류'));
    }
  } catch (error) {
    showToast('전송 실패');
  }
}

/**
 * 선택된 형식 가져오기
 */
function getSelectedFormat(): 'json' | 'html' {
  const radio = document.querySelector('input[name="format"]:checked') as HTMLInputElement;
  return (radio?.value as 'json' | 'html') || 'json';
}

/**
 * 토스트 메시지 표시
 */
function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// 초기화 실행
init();
