import { SERVER_MSG } from './constants';
import {
  getWs, setAssignedPluginId,
  log, updatePluginIdDisplay,
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

    case SERVER_MSG.PING:
      if (ws) ws.send(JSON.stringify({ type: 'PONG' }));
      break;

    default: {
      // 제네릭 패스스루: 명령은 UPPER_SNAKE → kebab-case 변환 후 플러그인으로 전달한다.
      //
      // ⚠️ 명시적 case 를 새로 만들지 말 것. 필드를 손으로 고르는 순간
      // "서버가 보냈는데 조용히 사라지는 인자"가 생긴다 — 실제로 세 번 났다
      // (get-tree 의 fields/includeAbsolute, build-component-from-spec 의 namespace).
      // 명시 case 가 정당한 경우는 ① 브리지 자체 상태를 바꾸거나(REGISTERED, CHUNK_*, PING)
      // ② 하나의 명령이 여러 code.ts case 로 갈라질 때(CREATE_FRAME) 뿐이다.
      if (msg.commandId && msg.type) {
        const kebabType = msg.type.toLowerCase().replace(/_/g, '-');

        // type만 제외하고 나머지(commandId 포함)를 플러그인에 전달 —
        // commandId를 함께 실어 code.ts가 응답에 그대로 echo하게 한다.
        const { type: _type, ...rest } = msg;

        // 어떤 인자가 실려 갔는지 남긴다 — 명시 case 가 만들던 상세 로그의 대체물.
        const keys = Object.keys(rest).filter(
          (k) => k !== 'commandId' && (rest as Record<string, unknown>)[k] !== undefined
        );
        log(`명령 전달: ${msg.type} → ${kebabType} { ${keys.join(', ')} }`, 'info');

        parent.postMessage(
          { pluginMessage: { type: kebabType, ...rest } },
          '*'
        );
      }
      break;
    }
  }
}
