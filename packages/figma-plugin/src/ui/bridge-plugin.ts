import { PLUGIN_MSG, RESPONSE_CHUNK_MSG } from './constants';
import {
  getWs,
  getIsConnected, getFileInfo, setFileInfo,
  log, showMessage, updateFileKeyUI, updateSelectionDisplay, notifyExportResult, notifyPageLintResult,
  type FileInfo, type SelectionNode,
} from './ui-state';

/**
 * 이 크기(문자 수)를 넘는 응답은 나눠 보낸다. 서버→플러그인 방향의 CHUNK_THRESHOLD 와 같은 1MB.
 *
 * ⚠️ 이 값을 크게 올리지 말 것. 서버(Bun)의 WebSocket 수신 상한은 **16MB 고정**이고
 * `ws` 의 `maxPayload` 로는 올릴 수 없다(실측). 넘으면 서버가 프레임을 거부하며 **소켓을 끊고**,
 * 플러그인은 code 1006 "Connection ended" 만 보고 이유를 알지 못한 채 재연결한다
 * (= pluginId 회전 → 모든 에이전트의 바인딩 무효).
 * 여기 단위는 **문자 수**이고 상한은 **바이트**다 — 한글은 UTF-8 에서 3배가 되므로
 * 1MB 문자 = 최대 3MB 바이트. 그래서 1MB 는 상한 대비 5배 이상의 여유를 남긴 값이다.
 * 배경: docs/history/021-plugin-to-server-had-no-chunking.md
 */
const RESPONSE_CHUNK_SIZE = 1024 * 1024;

let responseStreamSeq = 0;

// 서버(WebSocket)로 메시지 전송 헬퍼
function sendToServer(data: Record<string, unknown>) {
  const ws = getWs();
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const json = JSON.stringify(data);
  if (json.length <= RESPONSE_CHUNK_SIZE) {
    ws.send(json);
    return;
  }

  // 스트림 키는 commandId 를 쓴다 — 동시 명령이 겹쳐도 서버가 각 스트림을 따로 모은다.
  // commandId 가 없는 메시지(FILE_INFO 등)도 커질 수 있으므로 그때는 자체 키를 만든다.
  responseStreamSeq++;
  const streamId = typeof data.commandId === 'string' && data.commandId
    ? data.commandId
    : `stream-${Date.now()}-${responseStreamSeq}`;
  const totalChunks = Math.ceil(json.length / RESPONSE_CHUNK_SIZE);

  ws.send(JSON.stringify({
    type: RESPONSE_CHUNK_MSG.START,
    streamId,
    totalChunks,
    messageType: data.type,
    totalLength: json.length,
  }));
  for (let i = 0; i < totalChunks; i++) {
    ws.send(JSON.stringify({
      type: RESPONSE_CHUNK_MSG.CHUNK,
      streamId,
      index: i,
      data: json.slice(i * RESPONSE_CHUNK_SIZE, (i + 1) * RESPONSE_CHUNK_SIZE),
    }));
  }
  ws.send(JSON.stringify({ type: RESPONSE_CHUNK_MSG.END, streamId }));

  log(`대용량 응답 분할 전송: ${data.type} ${(json.length / 1024 / 1024).toFixed(1)}MB → ${totalChunks}청크`, 'info');
}

// 플러그인(code.ts) → UI 메시지 핸들러
export function handlePluginMessage(msg: Record<string, unknown>) {
  if (!msg) return;

  const ws = getWs();
  // 응답에 실린 commandId를 그대로 서버로 되돌린다 — code.ts가 요청 시 받은 commandId를
  // echo하므로, 동시 명령이 겹쳐도 각 결과가 자기 commandId를 정확히 달고 올라간다.
  // (과거엔 전역 단일 슬롯 pendingCommandId를 읽어 응답이 교차되는 버그가 있었다.)
  const pendingCommandId = msg.commandId as string | undefined;

  switch (msg.type) {
    case PLUGIN_MSG.SUCCESS:
      showMessage(msg.message as string, 'success');
      break;

    case PLUGIN_MSG.ERROR:
      showMessage(msg.message as string, 'error');
      break;

    case PLUGIN_MSG.FILE_INFO: {
      const newFileInfo: FileInfo = {
        fileKey: msg.fileKey as string | null,
        fileId: msg.fileId as string,
        fileKeySource: msg.fileKeySource as 'api' | 'stored' | 'none',
        storedFileKey: msg.storedFileKey as string | null,
        fileName: msg.fileName as string,
        pageId: msg.pageId as string,
        pageName: msg.pageName as string,
        pages: (msg.pages as FileInfo['pages']) || [],
      };
      setFileInfo(newFileInfo);
      log(
        `파일 정보 수신: ${newFileInfo.fileName} / ${newFileInfo.pageName} (${newFileInfo.pages.length} pages)`,
        'info'
      );

      // FileKey UI 업데이트
      updateFileKeyUI(newFileInfo);

      // 연결된 상태면 서버에 파일 정보 업데이트
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendToServer({
          type: 'FILE_INFO',
          fileKey: newFileInfo.fileKey,
          fileId: newFileInfo.fileId,
          fileName: newFileInfo.fileName,
          pageId: newFileInfo.pageId,
          pageName: newFileInfo.pageName,
          pages: newFileInfo.pages.map(p => ({ pageId: p.id, pageName: p.name })),
        });
        log('서버에 파일 정보 전송', 'success');
      }
      break;
    }

    case PLUGIN_MSG.PAGES_LIST:
      // 페이지 목록을 서버에 전달
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendToServer({
          type: 'PAGES_LIST',
          pages: msg.pages,
          currentPageId: msg.currentPageId,
          commandId: pendingCommandId,
        });
        log(`페이지 목록 전송: ${(msg.pages as unknown[]).length}개`, 'info');      }
      break;

    case PLUGIN_MSG.PAGE_LINT_RESULT:
      // UI 전용 결과 — 서버로 forward 하지 않고 모달 콜백만 호출한다.
      notifyPageLintResult({
        action: msg.action as 'get' | 'set' | 'clear',
        success: msg.success as boolean,
        pageName: msg.pageName as string | undefined,
        value: (msg.value ?? null) as string | null,
        error: msg.error as string | undefined,
      });
      break;

    case PLUGIN_MSG.GOTO_NODE_RESULT: {
      // UI 전용 결과 — 서버로 forward 하지 않는다.
      if (msg.success) {
        const r = msg.result as { nodeName: string; nodeType: string; pageSwitched: boolean; pageName: string };
        const suffix = r.pageSwitched ? ` (페이지 전환: ${r.pageName})` : '';
        showMessage(`이동: ${r.nodeName} [${r.nodeType}]${suffix}`, 'success');
        log(`노드로 뷰포트 이동: ${r.nodeName} [${r.nodeType}]${suffix}`, 'success');
      } else {
        showMessage(msg.error as string, 'error');
        log(`노드 이동 실패: ${msg.error}`, 'error');
      }
      break;
    }

    case PLUGIN_MSG.INFO:
      log(msg.message as string, 'info');
      break;

    case PLUGIN_MSG.SELECTION_CHANGED: {
      const nodes = (msg.nodes || []) as SelectionNode[];
      const viewport = msg.viewport as { centerX: number; centerY: number; zoom: number };
      updateSelectionDisplay(nodes, viewport);
      break;
    }

    case PLUGIN_MSG.EXTRACT_RESULT:
      // 추출 결과 처리
      if (msg.success) {
        log(`추출 완료 (${msg.format})`, 'success');
      } else {
        log(`추출 실패: ${msg.error}`, 'error');
      }

      // Export 모달 결과 콜백 호출
      notifyExportResult(
        msg.format as string,
        msg.success as boolean,
        msg.data,
        msg.error as string | undefined
      );

      // 서버로 결과 전송
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'EXTRACT_RESULT',
          commandId: pendingCommandId,
          format: msg.format,
          success: msg.success,
          data: msg.data,
          error: msg.error,
        });      }
      break;

    default: {
      // 제네릭 패스스루: kebab-case-result → UPPER_SNAKE_RESULT 변환 후 서버로 전달
      const msgType = msg.type as string;
      if (msgType && msgType.endsWith('-result') && pendingCommandId) {
        const upperType = msgType.toUpperCase().replace(/-/g, '_');
        if (ws && ws.readyState === WebSocket.OPEN) {
          sendToServer({
            type: upperType,
            commandId: pendingCommandId,
            success: msg.success,
            result: msg.result,
            error: msg.error,
          });
          if (msg.success) {
            log(`완료: ${msgType}`, 'success');
          } else {
            log(`실패: ${msgType} - ${msg.error}`, 'error');
          }
        }
      }
      break;
    }
  }
}
