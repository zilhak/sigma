import { SERVER_MSG } from './constants';
import {
  getWs, setPendingCommandId, setAssignedPluginId,
  log, showMessage, updatePluginIdDisplay,
} from './ui-state';
import { handleChunkStart, handleChunk, handleChunkEnd } from './chunk-handler';

// 플러그인(code.ts)으로 메시지 전송 헬퍼
export function sendToPlugin(
  type: string,
  data?: unknown,
  name?: string,
  position?: { x: number; y: number },
  fileKey?: string,
  nodeId?: string,
  pageId?: string,
) {
  parent.postMessage(
    {
      pluginMessage: { type, data, name, position, fileKey, nodeId, pageId },
    },
    '*'
  );
}

// 서버 메시지 타입 정의
interface ServerMessage {
  type: string;
  data?: unknown;
  html?: string;
  format?: 'json' | 'html';
  name?: string;
  commandId?: string;
  position?: { x: number; y: number };
  nodeId?: string;
  totalChunks?: number;
  index?: number;
  clientId?: string;
  pageId?: string;
  pluginId?: string;
  method?: string;
  args?: Record<string, unknown>;
  operation?: string;
  path?: string[];
  typeFilter?: string[];
  depth?: number;
  filter?: { type?: string[]; namePattern?: string; visible?: boolean };
  limit?: number;
  // chunk/section/move/clone 등에서 사용하는 확장 필드
  size?: { width: number; height: number };
  children?: string[];
  fills?: unknown;
  parentId?: string;
  scale?: number;
  // 제네릭 패스스루를 위한 인덱스 시그니처
  [key: string]: unknown;
}

// 서버(WebSocket) 메시지 핸들러
export function handleServerMessage(msg: ServerMessage) {
  const ws = getWs();

  switch (msg.type) {
    case SERVER_MSG.REGISTERED:
      // 서버에서 할당받은 고유 플러그인 ID 저장
      setAssignedPluginId((msg.pluginId || msg.clientId || null) as string | null);
      log(`플러그인 ID 할당됨: ${msg.pluginId || msg.clientId}`, 'success');
      updatePluginIdDisplay();
      break;

    case SERVER_MSG.CREATE_FRAME: {
      const format = msg.format || 'json';
      const pageInfo = msg.pageId ? ` [page: ${msg.pageId}]` : '';
      log(
        `프레임 생성 요청: ${msg.name || 'Unnamed'} (${format})${msg.position ? ` (${msg.position.x}, ${msg.position.y})` : ''}${pageInfo}`,
        'info'
      );

      if (format === 'html') {
        sendToPlugin('create-from-html', msg.data, msg.name, msg.position, undefined, undefined, msg.pageId);
      } else {
        sendToPlugin('create-from-json', msg.data, msg.name, msg.position, undefined, undefined, msg.pageId);
      }

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

    // === 청크 전송 핸들러 ===
    case SERVER_MSG.CHUNK_START:
      handleChunkStart(msg);
      break;

    case SERVER_MSG.CHUNK:
      handleChunk(msg);
      break;

    case SERVER_MSG.CHUNK_END:
      handleChunkEnd(msg);
      break;

    case SERVER_MSG.GET_FRAMES:
      log(`프레임 목록 요청${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      setPendingCommandId(msg.commandId || null);
      sendToPlugin('get-frames', undefined, undefined, undefined, undefined, undefined, msg.pageId);
      break;

    case SERVER_MSG.GET_PAGES:
      log('페이지 목록 요청', 'info');
      setPendingCommandId(msg.commandId || null);
      sendToPlugin('get-pages');
      break;

    case SERVER_MSG.DELETE_FRAME:
      log(`프레임 삭제 요청: ${msg.nodeId}${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      setPendingCommandId(msg.commandId || null);
      sendToPlugin('delete-frame', undefined, undefined, undefined, undefined, msg.nodeId, msg.pageId);
      break;

    case SERVER_MSG.UPDATE_FRAME: {
      const updateFormat = msg.format !== undefined ? msg.format : 'json';
      const upPageInfo = msg.pageId ? ` [page: ${msg.pageId}]` : '';
      log(`프레임 업데이트 요청: ${msg.nodeId} (${updateFormat})${upPageInfo}`, 'info');

      parent.postMessage(
        {
          pluginMessage: {
            type: 'update-frame',
            nodeId: msg.nodeId,
            format: updateFormat,
            data: msg.data,
            name: msg.name,
            pageId: msg.pageId,
          },
        },
        '*'
      );

      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);
      break;
    }

    case SERVER_MSG.MODIFY_NODE: {
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

      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);
      break;
    }

    case SERVER_MSG.PING:
      if (ws) ws.send(JSON.stringify({ type: 'PONG' }));
      break;

    case SERVER_MSG.IMPORTED:
      showMessage('프레임이 생성되었습니다!', 'success');
      break;

    case SERVER_MSG.EXTRACT_JSON:
      log('JSON 추출 요청', 'info');
      setPendingCommandId(msg.commandId || null);
      sendToPlugin('extract-to-json');
      break;

    case SERVER_MSG.EXTRACT_HTML:
      log('HTML 추출 요청', 'info');
      setPendingCommandId(msg.commandId || null);
      sendToPlugin('extract-to-html');
      break;

    case SERVER_MSG.TEST_ROUNDTRIP_JSON:
      log(`JSON 라운드트립 테스트 요청: ${msg.name || 'Unnamed'}`, 'info');
      setPendingCommandId(msg.commandId || null);
      sendToPlugin('test-roundtrip-json', msg.data, msg.name as string | undefined);
      break;

    case SERVER_MSG.TEST_ROUNDTRIP_HTML:
      log(`HTML 라운드트립 테스트 요청: ${msg.name || 'Unnamed'}`, 'info');
      setPendingCommandId(msg.commandId || null);
      sendToPlugin('test-roundtrip-html', msg.data, msg.name as string | undefined);
      break;

    case SERVER_MSG.FIND_NODE: {
      log(`노드 찾기 요청: ${JSON.stringify(msg.path)}`, 'info');
      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);

      parent.postMessage(
        {
          pluginMessage: {
            type: 'find-node',
            path: msg.path,
            typeFilter: msg.typeFilter,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.GET_TREE: {
      log(`트리 조회 요청: nodeId=${msg.nodeId || 'root'}, depth=${msg.depth || 1}`, 'info');
      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);

      parent.postMessage(
        {
          pluginMessage: {
            type: 'get-tree',
            nodeId: msg.nodeId,
            path: msg.path,
            depth: msg.depth,
            filter: msg.filter,
            limit: msg.limit,
            pageId: msg.pageId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.EXPORT_IMAGE: {
      log(`이미지 export 요청: ${msg.nodeId} (${msg.format || 'PNG'}, scale: ${msg.scale || 2})`, 'info');
      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);

      parent.postMessage(
        {
          pluginMessage: {
            type: 'export-image',
            nodeId: msg.nodeId,
            format: msg.format,
            scale: msg.scale,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.EXTRACT_NODE_JSON: {
      const extractFormat = msg.format || 'json';
      log(`노드 추출 요청: ${msg.nodeId} (${extractFormat})`, 'info');
      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);

      parent.postMessage(
        {
          pluginMessage: {
            type: 'extract-node-json',
            nodeId: msg.nodeId,
            format: extractFormat,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.CREATE_SECTION: {
      const sectionPageInfo = msg.pageId ? ` [page: ${msg.pageId}]` : '';
      log(`Section 생성 요청: ${msg.name || 'Section'}${sectionPageInfo}`, 'info');
      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);

      parent.postMessage(
        {
          pluginMessage: {
            type: 'create-section',
            name: msg.name,
            position: msg.position,
            size: msg.size,
            children: msg.children,
            fills: msg.fills,
            pageId: msg.pageId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.MOVE_NODE: {
      log(`노드 이동 요청: ${msg.nodeId} → ${msg.parentId}`, 'info');
      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);

      parent.postMessage(
        {
          pluginMessage: {
            type: 'move-node',
            nodeId: msg.nodeId,
            parentId: msg.parentId,
            index: msg.index,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.CLONE_NODE: {
      log(`노드 복제 요청: ${msg.nodeId}${msg.parentId ? ` → ${msg.parentId}` : ''}`, 'info');
      setPendingCommandId(msg.commandId !== undefined ? msg.commandId : null);

      parent.postMessage(
        {
          pluginMessage: {
            type: 'clone-node',
            nodeId: msg.nodeId,
            parentId: msg.parentId,
            position: msg.position,
            name: msg.name,
          },
        },
        '*'
      );
      break;
    }

    default: {
      // 제네릭 패스스루: 새 명령어는 UPPER_SNAKE → kebab-case 변환 후 플러그인으로 전달
      if (msg.commandId && msg.type) {
        const kebabType = msg.type.toLowerCase().replace(/_/g, '-');
        log(`명령 전달: ${msg.type} → ${kebabType}`, 'info');
        setPendingCommandId(msg.commandId);

        // type과 commandId를 제외한 모든 필드를 플러그인에 전달
        const { type: _type, commandId: _cmdId, ...rest } = msg;
        parent.postMessage(
          { pluginMessage: { type: kebabType, ...rest } },
          '*'
        );
      }
      break;
    }
  }
}
