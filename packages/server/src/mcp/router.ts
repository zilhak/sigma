import type { IncomingMessage, ServerResponse } from 'http';
import { createMcpRequestHandler, getMcpSessionCount } from './server.js';
import type { ToolContext } from './helpers.js';

export interface McpRouter {
  /** MCP 관련 요청을 처리. 처리한 경우 true, 아닌 경우 false 반환 */
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}

export function createMcpRouter(context: ToolContext): McpRouter {
  const mcpHandler = createMcpRequestHandler(context);

  return {
    async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = req.url || '';

      // MCP 상태 엔드포인트
      if (url === '/api/mcp/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ activeSessions: getMcpSessionCount() }));
        return true;
      }

      // MCP 요청이 아니면 처리하지 않음
      if (!url.startsWith('/api/mcp')) {
        return false;
      }

      // POST 요청: body 파싱 후 MCP 핸들러에 전달
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        await new Promise<void>((resolve) => {
          req.on('end', async () => {
            console.log('[MCP] Received body:', body);
            let parsedBody;
            try {
              parsedBody = body ? JSON.parse(body) : undefined;
              console.log('[MCP] Parsed body:', parsedBody);
            } catch (parseError) {
              console.error('[MCP] JSON parse error:', parseError);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              resolve();
              return;
            }
            try {
              await mcpHandler(req, res, parsedBody);
            } catch (handlerError) {
              console.error('[MCP] Handler error:', handlerError);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'MCP handler error', details: String(handlerError) }));
            }
            resolve();
          });
        });
      } else {
        // GET, DELETE 등 다른 메서드는 body 없이 핸들러에 전달
        await mcpHandler(req, res);
      }

      return true;
    },
  };
}
