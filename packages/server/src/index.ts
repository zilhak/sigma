import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { getRequestListener } from '@hono/node-server';
import { HTTP_PORT, WS_PORT } from '@sigma/shared';
import { FigmaWebSocketServer } from './websocket/server.js';
import { createHttpServer } from './http/server.js';
import { createMcpRequestHandler, getMcpSessionCount } from './mcp/server.js';

async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║           Sigma Server v0.1.0         ║');
  console.log('╚═══════════════════════════════════════╝');

  // Start WebSocket server for Figma
  const wsServer = new FigmaWebSocketServer(WS_PORT);

  // Create Hono HTTP app
  const httpApp = createHttpServer(wsServer);
  const honoListener = getRequestListener(httpApp.fetch);

  // Create MCP request handler
  const mcpHandler = createMcpRequestHandler({ wsServer });

  // Create unified HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '';

    // Handle MCP status endpoint
    if (url === '/api/mcp/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ activeSessions: getMcpSessionCount() }));
      return;
    }

    // Route MCP requests to MCP handler
    if (url.startsWith('/api/mcp')) {
      // Parse JSON body for POST requests
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
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
            return;
          }
          try {
            await mcpHandler(req, res, parsedBody);
          } catch (handlerError) {
            console.error('[MCP] Handler error:', handlerError);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'MCP handler error', details: String(handlerError) }));
          }
        });
      } else {
        await mcpHandler(req, res);
      }
      return;
    }

    // Route all other requests to Hono
    honoListener(req, res);
  });

  server.listen(HTTP_PORT, () => {
    console.log(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.log(`[HTTP] Dashboard: http://localhost:${HTTP_PORT}/`);
  });

  console.log('');
  console.log('Ready to receive connections:');
  console.log(`  - Chrome Extension: http://localhost:${HTTP_PORT}/api/extracted`);
  console.log(`  - Figma Plugin: ws://localhost:${WS_PORT}`);
  console.log(`  - MCP: http://localhost:${HTTP_PORT}/api/mcp`);
  console.log(`  - Dashboard: http://localhost:${HTTP_PORT}/`);
  console.log('');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    wsServer.close();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    wsServer.close();
    server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
