import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  isInitializeRequest,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { toolDefinitions } from './tool-definitions.js';
import { handleTool } from './tool-handler.js';
import type { ToolContext } from './helpers.js';

/**
 * 에이전트에게 주입되는 서버 사용 안내.
 *
 * 반드시 ServerOptions 의 `instructions` 로 넘겨야 한다(두 번째 인자). 예전에는
 * serverInfo 의 `description` 에 넣었는데, 그 필드는 ImplementationSchema 에 실재해서
 * 검증은 통과하지만 클라이언트가 목록에 보여주는 짧은 소개용이라 컨텍스트로 주입되지
 * 않는다 — 즉 이 안내 전체가 조용히 아무 에이전트에게도 도달하지 않았다.
 * SDK 기준: server/index.js 가 `options.instructions` 만 initialize 응답에 실어 보낸다.
 */
const SERVER_INSTRUCTIONS = [
  'Sigma - Modular Design-to-Code Bridge.',
  '웹 컴포넌트 추출 → Figma 변환 자동화 MCP 서버.',
  '',
  '## 바인딩 개념',
  'Sigma는 "바인딩" 기반으로 동작합니다. 토큰을 특정 Figma 플러그인과 페이지에 바인딩하면,',
  '이후 모든 Figma 작업(프레임 생성, 노드 검색, 트리 탐색 등)이 해당 페이지를 대상으로 수행됩니다.',
  '',
  '## 작업 시작 절차',
  '1. sigma_login → 토큰 발급',
  '2. sigma_list_plugins → 연결된 플러그인 확인 (pluginId 획득)',
  '3. sigma_list_pages → 플러그인의 페이지 목록 확인 (pageId 획득)',
  '4. sigma_bind(token, pluginId, pageId) → 토큰을 플러그인+페이지에 바인딩',
  '5. 이후 모든 도구에 같은 token을 전달하면 바인딩된 대상에서 작업 수행',
  '',
  '## 멀티에이전트 동시 작업 (지원)',
  '여러 에이전트가 같은 Figma 파일에서 **동시에** 작업할 수 있습니다. 순번을 정해 한 번에',
  '하나씩 돌릴 필요가 없습니다. 각 에이전트는 sigma_login 으로 자기 토큰을 발급받고,',
  'sigma_bind 로 (가능하면 서로 다른) 페이지에 바인딩한 뒤 그대로 진행하면 됩니다.',
  '',
  '동시 작업이 안전한 근거:',
  '- 토큰·바인딩이 토큰별로 격리됩니다. 대상 페이지는 각 토큰의 바인딩 pageId 로 정해지며,',
  '  "현재 열려 있는 페이지"에 의존하는 도구는 없습니다.',
  '- 모든 명령이 고유 commandId 로 다중화됩니다. 명령이 겹쳐 인터리브되어도 응답이 서로',
  '  교차하지 않습니다.',
  '- 노드 조작은 nodeId 기반입니다. 서로 다른 노드를 다루는 한 간섭이 없습니다.',
  '- 어떤 도구도 부작용으로 페이지/뷰/선택 포커스를 바꾸지 않습니다. 따라서 다른 에이전트나',
  '  사람이 보고 있는 화면을 흔들지 않습니다(포커스 변경이 목적인 도구는 예외:',
  '  sigma_set_viewport, sigma_switch_page, sigma_set_selection).',
  '',
  '주의할 점:',
  '- **같은 노드를 동시에 수정하면 마지막 쓰기가 이깁니다**(Figma 자체 특성). 에이전트별로',
  '  담당 페이지나 서브트리를 나누는 것을 권장합니다.',
  '- **undo 는 문서 전역입니다.** sigma_trigger_undo 는 자기 작업이 아닌 마지막 변경을',
  '  되돌릴 수 있으므로 동시 작업 중에는 쓰지 마세요.',
  '- 자동 배치(position 미지정)는 호출 시점의 페이지 내용을 기준으로 좌표를 정합니다.',
  '  좌표를 확정하고 싶으면 position 을 명시하세요.',
  '',
  '## 도구 분류',
  '- 바인딩 불필요: sigma_save_extracted, sigma_list_saved, sigma_load_extracted, sigma_delete_extracted, sigma_get_playwright_scripts, sigma_storage_stats 등',
  '- 바인딩 필수: sigma_create_frame, sigma_find_node, sigma_get_tree, sigma_modify_node 등 Figma 조작 도구',
  '',
  '## 스토리지',
  '~/.sigma/에 저장되며 서버 시작 시 자동 정리됩니다 (7일 경과 삭제, 100MB 초과 시 50MB로 축소).',
].join('\n');

export function createMcpServer(context: ToolContext) {
  const server = new Server(
    {
      name: 'sigma',
      version: '0.1.0',
      // 클라이언트 목록 표시용 한 줄 소개. 상세 안내는 아래 instructions 로 간다.
      description: 'Sigma - 웹 컴포넌트 추출 → Figma 변환 자동화 MCP 서버 (멀티에이전트 동시 작업 지원).',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions,
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleTool(name, args as Record<string, unknown>, context);
  });

  return server;
}

// Session management for MCP
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

export function createMcpRequestHandler(context: ToolContext) {
  return async (req: IncomingMessage, res: ServerResponse, body?: any) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // 세션 만료 오류 응답 헬퍼
    const sendSessionExpiredError = (requestId?: number | string | null) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: [
              'MCP 세션이 만료되었습니다.',
              '',
              '해결 방법:',
              '1. Claude Code를 재시작하거나',
              '2. /mcp 명령어로 MCP 연결 상태를 확인하세요.',
              '',
              '서버가 재시작되면 기존 세션이 무효화됩니다.',
            ].join('\n'),
            data: {
              shouldReinitialize: true,
              hint: 'Restart Claude Code or check MCP connection with /mcp command',
            },
          },
          id: requestId !== undefined ? requestId : null,
        })
      );
    };

    // Handle DELETE request for session cleanup
    if (req.method === 'DELETE') {
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        transports.delete(sessionId);
      } else {
        console.log('[MCP] DELETE - Session expired:', sessionId);
        sendSessionExpiredError(body?.id);
      }
      return;
    }

    // Handle GET request for SSE stream
    if (req.method === 'GET') {
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
      } else {
        console.log('[MCP] GET - Session expired:', sessionId);
        sendSessionExpiredError(body?.id);
      }
      return;
    }

    // Handle POST request
    if (req.method === 'POST') {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing session
        transport = transports.get(sessionId)!;
      } else if (isInitializeRequest(body)) {
        // New session initialization (sessionId 유무와 관계없이)
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport);
            console.log('[MCP] Session initialized:', id);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
            console.log('[MCP] Session closed:', transport.sessionId);
          }
        };

        const server = createMcpServer(context);
        await server.connect(transport);
      } else if (sessionId && !transports.has(sessionId)) {
        // 세션 ID가 있지만 서버에 세션이 없는 경우 (서버 재시작 등)
        console.log('[MCP] POST - Session expired:', sessionId);
        sendSessionExpiredError(body?.id);
        return;
      } else {
        // sessionId도 없고 초기화 요청도 아닌 경우
        console.log('[MCP] POST - No session and not an initialize request');
        sendSessionExpiredError(body?.id);
        return;
      }

      await transport.handleRequest(req, res, body);
      return;
    }

    // Method not allowed
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  };
}

export function getMcpSessionCount(): number {
  return transports.size;
}
