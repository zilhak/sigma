import { SERVER_MSG } from './constants';
import {
  getWs, setAssignedPluginId,
  log, showMessage, updatePluginIdDisplay,
} from './ui-state';
import { handleChunkStart, handleChunk, handleChunkEnd } from './chunk-handler';

// 플러그인(code.ts)으로 메시지 전송 헬퍼
// commandId를 함께 실어 보내 code.ts가 응답에 그대로 echo하도록 한다 (요청↔응답 end-to-end 상관).
export function sendToPlugin(
  type: string,
  data?: unknown,
  name?: string,
  position?: { x: number; y: number },
  fileKey?: string,
  nodeId?: string,
  pageId?: string,
  commandId?: string,
) {
  parent.postMessage(
    {
      pluginMessage: { type, data, name, position, fileKey, nodeId, pageId, commandId },
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
      const forceAbsolute = msg.layoutMode === 'absolute';
      log(
        `프레임 생성 요청: ${msg.name || 'Unnamed'} (${format})${forceAbsolute ? ' [absolute]' : ''}${msg.position ? ` (${msg.position.x}, ${msg.position.y})` : ''}${pageInfo}`,
        'info'
      );

      const msgType = format === 'html' ? 'create-from-html' : 'create-from-json';
      parent.postMessage(
        {
          pluginMessage: {
            type: msgType,
            data: msg.data,
            name: msg.name,
            position: msg.position,
            pageId: msg.pageId,
            forceAbsolute,
            commandId: msg.commandId,
          },
        },
        '*'
      );

      // 여기서 ack 를 쏘지 않는다 — create-frame-result 를 code.ts 에서 기다린다
      // (commandId 를 실어 보냈으므로 응답에 echo 되고, 제네릭 패스스루가 서버로 넘긴다).
      // 전달 직후 success 를 쏘면 **플러그인 안에서 무슨 일이 나든 응답은 항상 성공**이 된다:
      // 빈 data 로 아무것도 만들어지지 않아도 MCP 응답이 0.00 초에 성공으로 돌아왔다.
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

    case SERVER_MSG.GET_PAGES:
      log('페이지 목록 요청', 'info');
      sendToPlugin('get-pages', undefined, undefined, undefined, undefined, undefined, undefined, msg.commandId);
      break;

    case SERVER_MSG.DELETE_FRAME:
      log(`프레임 삭제 요청: ${msg.nodeId}${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      sendToPlugin('delete-frame', undefined, undefined, undefined, undefined, msg.nodeId, msg.pageId, msg.commandId);
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
            commandId: msg.commandId,
          },
        },
        '*'
      );
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
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.SET_PAGE_DATA: {
      log(`페이지 데이터 저장 요청: ${msg.key}${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      parent.postMessage(
        {
          pluginMessage: {
            type: 'set-page-data',
            key: msg.key,
            value: msg.value,
            pageId: msg.pageId,
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.GET_PAGE_DATA: {
      log(`페이지 데이터 조회 요청: ${msg.key ?? '(전체)'}${msg.pageId ? ` [page: ${msg.pageId}]` : ''}`, 'info');
      parent.postMessage(
        {
          pluginMessage: {
            type: 'get-page-data',
            key: msg.key,
            pageId: msg.pageId,
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.SET_NODE_DATA: {
      log(`노드 데이터 저장 요청: ${msg.nodeId} / ${msg.key}`, 'info');
      parent.postMessage({ pluginMessage: { type: 'set-node-data', nodeId: msg.nodeId, key: msg.key, value: msg.value, commandId: msg.commandId } }, '*');
      break;
    }

    case SERVER_MSG.GET_NODE_DATA: {
      log(`노드 데이터 조회 요청: ${msg.nodeId} / ${msg.key ?? '(전체)'}`, 'info');
      parent.postMessage({ pluginMessage: { type: 'get-node-data', nodeId: msg.nodeId, key: msg.key, commandId: msg.commandId } }, '*');
      break;
    }

    case SERVER_MSG.GET_NODES_DATA: {
      log(`노드 데이터 배치 조회: ${(msg.nodeIds as unknown[] | undefined)?.length ?? 0}개 / ${msg.key}`, 'info');
      parent.postMessage({ pluginMessage: { type: 'get-nodes-data', nodeIds: msg.nodeIds, key: msg.key, plain: msg.plain, commandId: msg.commandId } }, '*');
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
      sendToPlugin('extract-to-json', undefined, undefined, undefined, undefined, undefined, undefined, msg.commandId);
      break;

    case SERVER_MSG.EXTRACT_HTML:
      log('HTML 추출 요청', 'info');
      sendToPlugin('extract-to-html', undefined, undefined, undefined, undefined, undefined, undefined, msg.commandId);
      break;

    case SERVER_MSG.TEST_ROUNDTRIP_JSON:
      log(`JSON 라운드트립 테스트 요청: ${msg.name || 'Unnamed'}`, 'info');
      sendToPlugin('test-roundtrip-json', msg.data, msg.name as string | undefined, undefined, undefined, undefined, undefined, msg.commandId);
      break;

    case SERVER_MSG.TEST_ROUNDTRIP_HTML:
      log(`HTML 라운드트립 테스트 요청: ${msg.name || 'Unnamed'}`, 'info');
      sendToPlugin('test-roundtrip-html', msg.data, msg.name as string | undefined, undefined, undefined, undefined, undefined, msg.commandId);
      break;

    case SERVER_MSG.FIND_NODE: {
      log(`노드 찾기 요청: ${JSON.stringify(msg.path)}`, 'info');

      parent.postMessage(
        {
          pluginMessage: {
            type: 'find-node',
            path: msg.path,
            typeFilter: msg.typeFilter,
            pageId: msg.pageId,
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.GET_TREE: {
      log(`트리 조회 요청: nodeId=${msg.nodeId || 'root'}, depth=${msg.depth || 1}`, 'info');

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
            // ⚠️ 이 브리지는 필드를 손으로 골라 넘긴다 — 여기 빠진 인자는 **서버가 보내도 조용히 사라진다.**
            // 실제로 fields 가 빠져 있어 `fields:"geometry"` 가 MCP 경로에서 한 번도 동작하지 않았고
            // (응답에 fullPath·meta 가 그대로 오고 absolute 는 오지 않았다), 도구 설명은 그동안
            // 절대좌표를 준다고 적혀 있었다. 새 인자를 추가할 때 여기도 함께 늘릴 것.
            fields: msg.fields,
            includeAbsolute: msg.includeAbsolute,
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.EXPORT_IMAGE: {
      log(`이미지 export 요청: ${msg.nodeId} (${msg.format || 'PNG'}, scale: ${msg.scale || 2})`, 'info');

      parent.postMessage(
        {
          pluginMessage: {
            type: 'export-image',
            nodeId: msg.nodeId,
            format: msg.format,
            scale: msg.scale,
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.EXTRACT_NODE_JSON: {
      const extractFormat = msg.format || 'json';
      log(`노드 추출 요청: ${msg.nodeId} (${extractFormat})`, 'info');

      parent.postMessage(
        {
          pluginMessage: {
            type: 'extract-node-json',
            nodeId: msg.nodeId,
            format: extractFormat,
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.CREATE_SECTION: {
      const sectionPageInfo = msg.pageId ? ` [page: ${msg.pageId}]` : '';
      log(`Section 생성 요청: ${msg.name || 'Section'}${sectionPageInfo}`, 'info');

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
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.MOVE_NODE: {
      log(`노드 이동 요청: ${msg.nodeId} → ${msg.parentId}`, 'info');

      parent.postMessage(
        {
          pluginMessage: {
            type: 'move-node',
            nodeId: msg.nodeId,
            parentId: msg.parentId,
            index: msg.index,
            commandId: msg.commandId,
          },
        },
        '*'
      );
      break;
    }

    case SERVER_MSG.CLONE_NODE: {
      log(`노드 복제 요청: ${msg.nodeId}${msg.parentId ? ` → ${msg.parentId}` : ''}`, 'info');

      parent.postMessage(
        {
          pluginMessage: {
            type: 'clone-node',
            nodeId: msg.nodeId,
            parentId: msg.parentId,
            position: msg.position,
            name: msg.name,
            commandId: msg.commandId,
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

        // type만 제외하고 나머지(commandId 포함)를 플러그인에 전달 —
        // commandId를 함께 실어 code.ts가 응답에 그대로 echo하게 한다.
        const { type: _type, ...rest } = msg;
        parent.postMessage(
          { pluginMessage: { type: kebabType, ...rest } },
          '*'
        );
      }
      break;
    }
  }
}
