import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { getRequestListener } from '@hono/node-server';
import { HTTP_PORT, WS_PORT } from '@sigma/shared';
import { FigmaWebSocketServer } from './websocket/server.js';
import { createHttpServer } from './http/server.js';
import { createMcpRouter } from './mcp/router.js';
import { startupCleanup } from './storage/index.js';

async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║           Sigma Server v0.1.0         ║');
  console.log('╚═══════════════════════════════════════╝');

  // Storage cleanup on startup (TTL + size limit)
  await startupCleanup();

  // Start WebSocket server for Figma
  const wsServer = new FigmaWebSocketServer(WS_PORT);

  // Create Hono HTTP app
  const httpApp = createHttpServer(wsServer);
  const honoListener = getRequestListener(httpApp.fetch);

  // MCP 라우터 생성
  const mcpRouter = createMcpRouter({ wsServer });

  // Create unified HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // MCP 요청을 라우터에 위임
    const handled = await mcpRouter.handleRequest(req, res);
    if (handled) return;

    // 나머지 요청은 Hono로 라우팅
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
