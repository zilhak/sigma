import type { ExtractedNode } from '@sigma/shared';

// DOM 요소
const selectBtn = document.getElementById('selectBtn') as HTMLButtonElement;
const batchSelectBtn = document.getElementById('batchSelectBtn') as HTMLButtonElement;
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const preview = document.getElementById('preview') as HTMLDivElement;
const previewTag = document.getElementById('previewTag') as HTMLSpanElement;
const previewClass = document.getElementById('previewClass') as HTMLSpanElement;
const previewSize = document.getElementById('previewSize') as HTMLSpanElement;
const batchPreview = document.getElementById('batchPreview') as HTMLDivElement;
const batchCount = document.getElementById('batchCount') as HTMLSpanElement;
const batchTags = document.getElementById('batchTags') as HTMLDivElement;
const serverStatus = document.getElementById('serverStatus') as HTMLDivElement;
const componentName = document.getElementById('componentName') as HTMLInputElement;
const toast = document.getElementById('toast') as HTMLDivElement;

let extractedData: ExtractedNode | null = null;
let batchExtractedData: ExtractedNode[] = [];
let isBatchMode = false;
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

  // 배치 데이터 확인
  const batchResponse = await chrome.runtime.sendMessage({ type: 'GET_BATCH_DATA' });
  if (batchResponse?.data?.length > 0) {
    isBatchMode = true;
    batchExtractedData = batchResponse.data;
    updateBatchPreview();
  }

  // 이벤트 리스너
  selectBtn.addEventListener('click', startSelectMode);
  batchSelectBtn.addEventListener('click', startBatchSelectMode);
  copyBtn.addEventListener('click', copyToClipboard);
  sendBtn.addEventListener('click', sendToServer);

  // Background에서 오는 메시지 수신
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'EXTRACTION_COMPLETE') {
      isBatchMode = false;
      setExtractedData(message.data);
      showToast('컴포넌트 추출 완료!');
    } else if (message.type === 'BATCH_UPDATE') {
      isBatchMode = true;
      batchExtractedData = message.data;
      updateBatchPreview();
    } else if (message.type === 'BATCH_COMPLETE') {
      isBatchMode = true;
      batchExtractedData = message.data;
      updateBatchPreview();
      showToast(`${batchExtractedData.length}개 컴포넌트 추출 완료!`);
    } else if (message.type === 'BATCH_RESET') {
      isBatchMode = false;
      batchExtractedData = [];
      hideBatchPreview();
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
  const hasData = isBatchMode ? batchExtractedData.length > 0 : !!extractedData;

  // 복사 버튼: 데이터 있으면 활성화
  copyBtn.disabled = !hasData;

  // 서버 전송 버튼: 데이터 있고 서버 연결되어 있으면 활성화
  sendBtn.disabled = !hasData || !isServerConnected;
}

/**
 * 추출된 데이터 설정 (단일 모드)
 */
function setExtractedData(data: ExtractedNode) {
  extractedData = data;

  // 배치 미리보기 숨기기
  hideBatchPreview();

  // 단일 미리보기 표시
  preview.style.display = 'block';
  previewTag.textContent = `<${data.tagName}>`;
  previewClass.textContent = data.className ? `.${data.className.split(' ')[0]}` : '';
  previewSize.textContent = `${Math.round(data.boundingRect.width)} × ${Math.round(data.boundingRect.height)}px`;

  updateButtons();
}

/**
 * 배치 미리보기 업데이트
 */
function updateBatchPreview() {
  // 단일 미리보기 숨기기
  preview.style.display = 'none';

  // 배치 미리보기 표시
  batchPreview.style.display = 'block';
  batchCount.textContent = `${batchExtractedData.length}`;

  // 태그 목록 갱신
  batchTags.innerHTML = '';
  batchExtractedData.forEach((node, i) => {
    const tag = document.createElement('span');
    tag.className = 'batch-tag';
    const label = node.className
      ? `.${node.className.split(' ')[0]}`
      : `<${node.tagName}>`;
    tag.innerHTML = `<span class="tag-num">${i + 1}</span> ${label}`;
    batchTags.appendChild(tag);
  });

  updateButtons();
}

/**
 * 배치 미리보기 숨기기
 */
function hideBatchPreview() {
  batchPreview.style.display = 'none';
  batchTags.innerHTML = '';
}

/**
 * 선택 모드 시작 (단일)
 */
async function startSelectMode() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  await chrome.tabs.sendMessage(tab.id, { type: 'START_SELECT_MODE' });
  window.close();
}

/**
 * 배치 선택 모드 시작
 */
async function startBatchSelectMode() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  await chrome.tabs.sendMessage(tab.id, { type: 'START_BATCH_SELECT_MODE' });
  window.close();
}

/**
 * 클립보드에 복사
 */
async function copyToClipboard() {
  const format = getSelectedFormat();

  try {
    if (isBatchMode && batchExtractedData.length > 0) {
      await chrome.runtime.sendMessage({
        type: 'COPY_BATCH_TO_CLIPBOARD',
        format,
      });
      showToast(`${batchExtractedData.length}개 컴포넌트 복사됨!`);
    } else if (extractedData) {
      await chrome.runtime.sendMessage({
        type: 'COPY_TO_CLIPBOARD',
        format,
      });
      showToast('클립보드에 복사됨!');
    }
  } catch (error) {
    showToast('복사 실패');
  }
}

/**
 * 서버로 전송
 */
async function sendToServer() {
  if (!isServerConnected) return;

  const format = getSelectedFormat();
  const name = componentName.value.trim();

  try {
    if (isBatchMode && batchExtractedData.length > 0) {
      const response = await chrome.runtime.sendMessage({
        type: 'SEND_BATCH_TO_SERVER',
        name: name || undefined,
        format,
      });
      if (response?.success) {
        showToast(`${batchExtractedData.length}개 컴포넌트 전송됨!`);
      } else {
        showToast('전송 실패: ' + (response?.error || '알 수 없는 오류'));
      }
    } else if (extractedData) {
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
