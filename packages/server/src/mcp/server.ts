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

export function createMcpServer(context: ToolContext) {
  const server = new Server(
    {
      name: 'sigma',
      version: '0.1.0',
      description: [
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
        '## 도구 분류',
        '- 바인딩 불필요: save_extracted, list_saved, load_extracted, delete_extracted, get_playwright_scripts, sigma_storage_stats 등',
        '- 바인딩 필수: sigma_create_frame, sigma_find_node, sigma_get_tree, sigma_modify_node 등 Figma 조작 도구',
        '',
        '## 스토리지',
        '~/.sigma/에 저장되며 서버 시작 시 자동 정리됩니다 (7일 경과 삭제, 100MB 초과 시 50MB로 축소).',
      ].join('\n'),
    },
    {
      capabilities: {
        tools: {},
      },
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
