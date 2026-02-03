import { serve } from '@hono/node-server';
import { HTTP_PORT, WS_PORT } from '@sigma/shared';
import { FigmaWebSocketServer } from './websocket/server.js';
import { createHttpServer } from './http/server.js';
import { startMcpServer } from './mcp/server.js';

async function main() {
  const args = process.argv.slice(2);
  const isMcpMode = args.includes('--mcp');

  console.log('╔═══════════════════════════════════════╗');
  console.log('║           Sigma Server v0.1.0         ║');
  console.log('╚═══════════════════════════════════════╝');

  // Start WebSocket server for Figma
  const wsServer = new FigmaWebSocketServer(WS_PORT);

  // Start HTTP server
  const httpApp = createHttpServer(wsServer);
  serve(
    {
      fetch: httpApp.fetch,
      port: HTTP_PORT,
    },
    (info) => {
      console.log(`[HTTP] Server listening on http://localhost:${info.port}`);
      console.log(`[HTTP] Dashboard: http://localhost:${info.port}/`);
    }
  );

  // Start MCP server if requested
  if (isMcpMode) {
    await startMcpServer({ wsServer });
  }

  console.log('');
  console.log('Ready to receive connections:');
  console.log(`  - Chrome Extension: http://localhost:${HTTP_PORT}/api/extracted`);
  console.log(`  - Figma Plugin: ws://localhost:${WS_PORT}`);
  console.log(`  - Dashboard: http://localhost:${HTTP_PORT}/`);
  if (isMcpMode) {
    console.log('  - MCP: stdio (connected)');
  }
  console.log('');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    wsServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    wsServer.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
