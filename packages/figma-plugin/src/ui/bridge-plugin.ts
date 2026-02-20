import { PLUGIN_MSG } from './constants';
import {
  getWs, getPendingCommandId, setPendingCommandId,
  getIsConnected, getFileInfo, setFileInfo,
  log, showMessage, updateFileKeyUI,
  type FileInfo,
} from './ui-state';

// 서버(WebSocket)로 메시지 전송 헬퍼
function sendToServer(data: Record<string, unknown>) {
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// 플러그인(code.ts) → UI 메시지 핸들러
export function handlePluginMessage(msg: Record<string, unknown>) {
  if (!msg) return;

  const ws = getWs();
  const pendingCommandId = getPendingCommandId();

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
          fileName: newFileInfo.fileName,
          pageId: newFileInfo.pageId,
          pageName: newFileInfo.pageName,
          pages: newFileInfo.pages.map(p => ({ pageId: p.id, pageName: p.name })),
        });
        log('서버에 파일 정보 전송', 'success');
      }
      break;
    }

    case PLUGIN_MSG.FRAMES_LIST:
      // 프레임 목록을 서버에 전달
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendToServer({
          type: 'FRAMES_LIST',
          frames: msg.frames,
          pageId: msg.pageId,
          pageName: msg.pageName,
          commandId: pendingCommandId,
        });
        log(`프레임 목록 전송: ${(msg.frames as unknown[]).length}개 (페이지: ${msg.pageName || 'unknown'})`, 'info');
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.PAGES_LIST:
      // 페이지 목록을 서버에 전달
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendToServer({
          type: 'PAGES_LIST',
          pages: msg.pages,
          currentPageId: msg.currentPageId,
          commandId: pendingCommandId,
        });
        log(`페이지 목록 전송: ${(msg.pages as unknown[]).length}개`, 'info');
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.DELETE_RESULT:
      // 삭제 결과를 서버에 전달
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendToServer({
          type: 'DELETE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log(`프레임 삭제 완료: ${(msg.result as any)?.name || (msg.result as any)?.nodeId}`, 'success');
        } else {
          log(`프레임 삭제 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.UPDATE_RESULT:
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'UPDATE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log(
            `프레임 업데이트 완료: ${(msg.result as any)?.name !== undefined ? (msg.result as any).name : (msg.result as any)?.nodeId}`,
            'success'
          );
        } else {
          log(`프레임 업데이트 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.MODIFY_RESULT:
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'MODIFY_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log('노드 조작 완료', 'success');
        } else {
          log(`노드 조작 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.INFO:
      log(msg.message as string, 'info');
      break;

    case PLUGIN_MSG.EXTRACT_RESULT:
      // 추출 결과 처리 (서버 연동 전용)
      if (msg.success) {
        log(`추출 완료 (${msg.format})`, 'success');
      } else {
        log(`추출 실패: ${msg.error}`, 'error');
      }

      // 서버로 결과 전송
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'EXTRACT_RESULT',
          commandId: pendingCommandId,
          format: msg.format,
          success: msg.success,
          data: msg.data,
          error: msg.error,
        });
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.ROUNDTRIP_RESULT:
      // 라운드트립 테스트 결과 처리
      if (msg.success) {
        if (msg.identical) {
          log(`라운드트립 테스트 성공 (${msg.format}): 완전 동일`, 'success');
        } else {
          const diffCount = msg.differences ? (msg.differences as unknown[]).length : 0;
          log(`라운드트립 테스트 완료 (${msg.format}): ${diffCount}개 차이점`, 'warn');
        }
      } else {
        log(`라운드트립 테스트 실패: ${msg.error}`, 'error');
      }

      // 서버로 결과 전송
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
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
        });
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.FIND_NODE_RESULT:
      if (pendingCommandId && getIsConnected() && ws) {
        sendToServer({
          type: 'FIND_NODE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log('노드 찾기 완료', 'success');
        } else {
          log(`노드 찾기 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.TREE_RESULT:
      if (pendingCommandId && getIsConnected() && ws) {
        sendToServer({
          type: 'TREE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log('트리 조회 완료', 'success');
        } else {
          log(`트리 조회 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.EXPORT_IMAGE_RESULT:
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'EXPORT_IMAGE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log(`이미지 export 완료: ${(msg.result as any)?.nodeName || 'unknown'}`, 'success');
        } else {
          log(`이미지 export 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.EXTRACT_NODE_JSON_RESULT:
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'EXTRACT_NODE_JSON_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log(`노드 JSON 추출 완료: ${(msg.result as any)?.nodeName || 'unknown'}`, 'success');
        } else {
          log(`노드 JSON 추출 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.CREATE_SECTION_RESULT:
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'CREATE_SECTION_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log(`Section 생성 완료: ${(msg.result as any)?.name || 'unknown'} (${(msg.result as any)?.nodeId})`, 'success');
        } else {
          log(`Section 생성 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.MOVE_NODE_RESULT:
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'MOVE_NODE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log(
            `노드 이동 완료: ${(msg.result as any)?.nodeName || 'unknown'} → ${(msg.result as any)?.newParentName || 'unknown'}`,
            'success'
          );
        } else {
          log(`노드 이동 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;

    case PLUGIN_MSG.CLONE_NODE_RESULT:
      if (ws && ws.readyState === WebSocket.OPEN && pendingCommandId) {
        sendToServer({
          type: 'CLONE_NODE_RESULT',
          commandId: pendingCommandId,
          success: msg.success,
          result: msg.result,
          error: msg.error,
        });
        if (msg.success) {
          log(`노드 복제 완료: ${(msg.result as any)?.name || 'unknown'} (${(msg.result as any)?.nodeId})`, 'success');
        } else {
          log(`노드 복제 실패: ${msg.error}`, 'error');
        }
        setPendingCommandId(null);
      }
      break;
  }
}
