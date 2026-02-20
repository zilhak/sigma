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
        '스토리지(~/.sigma/)는 서버 시작 시 자동 정리됩니다 (7일 경과 파일 삭제, 100MB 초과 시 50MB로 축소).',
        '그래도 가끔씩 sigma_storage_stats로 용량을 확인하고, 필요하면 sigma_cleanup으로 수동 정리하는 것을 권장합니다.',
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
