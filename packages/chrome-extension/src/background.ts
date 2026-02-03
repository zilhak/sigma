import { SERVER_URL, API } from '@sigma/shared';
import type { ExtractedNode, ExtractPayload, ApiResponse } from '@sigma/shared';

// 현재 추출된 데이터 저장
let currentExtractedData: ExtractedNode | null = null;

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true; // async response
});

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  sendResponse: (response: unknown) => void
) {
  switch (message.type) {
    case 'ELEMENT_EXTRACTED':
      currentExtractedData = message.data as ExtractedNode;
      // Popup에 알림
      chrome.runtime.sendMessage({ type: 'EXTRACTION_COMPLETE', data: currentExtractedData });
      sendResponse({ success: true });
      break;

    case 'SELECT_CANCELLED':
      currentExtractedData = null;
      sendResponse({ success: true });
      break;

    case 'GET_EXTRACTED_DATA':
      sendResponse({ success: true, data: currentExtractedData });
      break;

    case 'COPY_TO_CLIPBOARD':
      if (currentExtractedData) {
        const format = (message.format as string) || 'json';
        const text =
          format === 'json'
            ? JSON.stringify(currentExtractedData, null, 2)
            : convertToHTML(currentExtractedData);

        // 클립보드에 복사 (offscreen document 사용)
        await copyToClipboard(text);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No data to copy' });
      }
      break;

    case 'SEND_TO_SERVER':
      if (currentExtractedData) {
        const result = await sendToServer(
          currentExtractedData,
          message.name as string,
          (message.format as 'json' | 'html') || 'json'
        );
        sendResponse(result);
      } else {
        sendResponse({ success: false, error: 'No data to send' });
      }
      break;

    case 'CHECK_SERVER_STATUS':
      const isConnected = await checkServerStatus();
      sendResponse({ success: true, connected: isConnected });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}

/**
 * 서버 상태 확인
 */
async function checkServerStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}${API.HEALTH}`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 서버로 데이터 전송
 */
async function sendToServer(
  data: ExtractedNode,
  name?: string,
  format: 'json' | 'html' = 'json'
): Promise<ApiResponse> {
  try {
    const payload: ExtractPayload = {
      name: name || `component-${Date.now()}`,
      data,
      format,
      timestamp: Date.now(),
      metadata: {
        url: await getCurrentTabUrl(),
        title: await getCurrentTabTitle(),
      },
    };

    const response = await fetch(`${SERVER_URL}${API.EXTRACTED}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return { success: response.ok, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * 현재 탭 URL 가져오기
 */
async function getCurrentTabUrl(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url;
}

/**
 * 현재 탭 제목 가져오기
 */
async function getCurrentTabTitle(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.title;
}

/**
 * 클립보드에 복사
 */
async function copyToClipboard(text: string): Promise<void> {
  // Service Worker에서는 navigator.clipboard를 직접 사용할 수 없음
  // 대신 offscreen document를 사용하거나, content script에 위임
  // 간단한 구현을 위해 content script에 위임
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'COPY_TEXT', text });
  }
}

/**
 * ExtractedNode를 HTML 문자열로 변환
 */
function convertToHTML(node: ExtractedNode): string {
  const style = buildStyleString(node.styles);
  const attrs = Object.entries(node.attributes)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

  const openTag = `<${node.tagName}${attrs ? ' ' + attrs : ''}${style ? ` style="${style}"` : ''}>`;
  const closeTag = `</${node.tagName}>`;

  if (node.children.length === 0) {
    return `${openTag}${node.textContent}${closeTag}`;
  }

  const childrenHTML = node.children.map((child) => convertToHTML(child)).join('\n');
  return `${openTag}\n${childrenHTML}\n${closeTag}`;
}

/**
 * 스타일 객체를 CSS 문자열로 변환
 */
function buildStyleString(styles: ExtractedNode['styles']): string {
  const cssProps: string[] = [];

  if (styles.display && styles.display !== 'block') {
    cssProps.push(`display: ${styles.display}`);
  }
  if (styles.backgroundColor) {
    const { r, g, b, a } = styles.backgroundColor;
    cssProps.push(`background-color: rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`);
  }
  if (styles.color) {
    const { r, g, b, a } = styles.color;
    cssProps.push(`color: rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`);
  }
  if (styles.fontSize) {
    cssProps.push(`font-size: ${styles.fontSize}px`);
  }
  if (styles.fontWeight && styles.fontWeight !== 'normal' && styles.fontWeight !== '400') {
    cssProps.push(`font-weight: ${styles.fontWeight}`);
  }
  if (styles.paddingTop || styles.paddingRight || styles.paddingBottom || styles.paddingLeft) {
    cssProps.push(
      `padding: ${styles.paddingTop}px ${styles.paddingRight}px ${styles.paddingBottom}px ${styles.paddingLeft}px`
    );
  }
  if (styles.borderTopLeftRadius) {
    cssProps.push(`border-radius: ${styles.borderTopLeftRadius}px`);
  }

  return cssProps.join('; ');
}
