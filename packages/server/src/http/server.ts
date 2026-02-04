import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ExtractedNode } from '@sigma/shared';
import * as storage from '../storage/index.js';
import type { FigmaWebSocketServer } from '../websocket/server.js';

export function createHttpServer(wsServer: FigmaWebSocketServer) {
  const app = new Hono();

  // Middleware
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })
  );

  // Health check
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      figma: wsServer.getStatus(),
    });
  });

  // === Extension API ===

  // Receive extracted data from extension
  app.post('/api/extracted', async (c) => {
    try {
      const body = await c.req.json<{ name?: string; data: ExtractedNode }>();

      if (!body.data) {
        return c.json({ error: 'data is required' }, 400);
      }

      const name = body.name || body.data.className || body.data.tagName || 'component';
      const component = await storage.saveComponent(name, body.data);

      return c.json({
        success: true,
        component: {
          id: component.id,
          name: component.name,
          createdAt: component.createdAt,
        },
      });
    } catch (error) {
      console.error('[HTTP] Save error:', error);
      return c.json({ error: 'Failed to save component' }, 500);
    }
  });

  // List all saved components
  app.get('/api/extracted', async (c) => {
    try {
      const components = await storage.listComponents();

      return c.json({
        components: components.map((comp) => ({
          id: comp.id,
          name: comp.name,
          createdAt: comp.createdAt,
          updatedAt: comp.updatedAt,
        })),
      });
    } catch (error) {
      console.error('[HTTP] List error:', error);
      return c.json({ error: 'Failed to list components' }, 500);
    }
  });

  // Get specific component
  app.get('/api/extracted/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const component = await storage.getComponent(id);

      if (!component) {
        return c.json({ error: 'Component not found' }, 404);
      }

      return c.json({ component });
    } catch (error) {
      console.error('[HTTP] Get error:', error);
      return c.json({ error: 'Failed to get component' }, 500);
    }
  });

  // Delete component
  app.delete('/api/extracted/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const deleted = await storage.deleteComponent(id);

      if (!deleted) {
        return c.json({ error: 'Component not found' }, 404);
      }

      return c.json({ success: true });
    } catch (error) {
      console.error('[HTTP] Delete error:', error);
      return c.json({ error: 'Failed to delete component' }, 500);
    }
  });

  // === Figma API ===

  // Get Figma connection status
  app.get('/api/figma/status', (c) => {
    return c.json(wsServer.getStatus());
  });

  // Send data to Figma
  app.post('/api/figma/import', async (c) => {
    try {
      const body = await c.req.json<{
        data?: ExtractedNode;
        html?: string;
        format?: 'json' | 'html';
        id?: string;
        name?: string;
        position?: { x: number; y: number };
      }>();

      const format = body.format || 'json';
      let data: ExtractedNode | null = null;
      let html: string | undefined;
      let name: string | undefined = body.name;
      const position = body.position;

      // Load from storage if ID provided
      if (body.id) {
        const component = await storage.getComponent(body.id);
        if (!component) {
          return c.json({ error: 'Component not found' }, 404);
        }
        data = component.data;
        name = name || component.name;
      } else if (format === 'html' && body.html) {
        html = body.html;
      } else if (format === 'json' && body.data) {
        data = body.data;
      } else {
        return c.json({ error: format === 'html' ? 'html field is required' : 'Either data or id is required' }, 400);
      }

      // Check Figma connection
      if (!wsServer.isFigmaConnected()) {
        return c.json({ error: 'Figma Plugin이 연결되어 있지 않습니다' }, 503);
      }

      // Send to Figma with optional position
      await wsServer.createFrame(data, name, position, format, html);

      return c.json({ success: true, message: 'Figma에 프레임이 생성되었습니다', format });
    } catch (error) {
      console.error('[HTTP] Figma import error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ error: message }, 500);
    }
  });

  // Get list of frames in Figma
  app.get('/api/figma/frames', async (c) => {
    try {
      // Check Figma connection
      if (!wsServer.isFigmaConnected()) {
        return c.json({ error: 'Figma Plugin이 연결되어 있지 않습니다' }, 503);
      }

      // Get frames from Figma
      const frames = await wsServer.getFrames();

      return c.json({ success: true, frames });
    } catch (error) {
      console.error('[HTTP] Figma frames error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ error: message }, 500);
    }
  });

  // === Dashboard ===

  // Simple dashboard HTML
  app.get('/', (c) => {
    return c.html(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sigma Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      padding: 24px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { margin-bottom: 24px; color: #333; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .card h2 { font-size: 16px; color: #666; margin-bottom: 12px; }
    .status { display: flex; gap: 24px; }
    .status-item { display: flex; align-items: center; gap: 8px; }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ccc;
    }
    .status-dot.connected { background: #18a058; }
    .component-list { list-style: none; }
    .component-list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #eee;
    }
    .component-list li:last-child { border-bottom: none; }
    .component-name { font-weight: 500; }
    .component-time { color: #999; font-size: 14px; }
    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .btn-primary { background: #18a058; color: white; }
    .btn-danger { background: #e53935; color: white; }
    .btn:hover { opacity: 0.9; }
    .empty { color: #999; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Sigma Dashboard</h1>

    <div class="card">
      <h2>연결 상태</h2>
      <div class="status">
        <div class="status-item">
          <div class="status-dot connected"></div>
          <span>서버 실행 중</span>
        </div>
        <div class="status-item">
          <div class="status-dot" id="figmaStatus"></div>
          <span id="figmaStatusText">Figma 확인 중...</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>저장된 컴포넌트</h2>
      <ul class="component-list" id="componentList">
        <li class="empty">로딩 중...</li>
      </ul>
    </div>
  </div>

  <script>
    async function loadStatus() {
      try {
        const res = await fetch('/api/figma/status');
        const data = await res.json();
        const dot = document.getElementById('figmaStatus');
        const text = document.getElementById('figmaStatusText');

        if (data.figmaConnected) {
          dot.classList.add('connected');
          text.textContent = 'Figma 연결됨';
        } else {
          dot.classList.remove('connected');
          text.textContent = 'Figma 대기 중';
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function loadComponents() {
      try {
        const res = await fetch('/api/extracted');
        const data = await res.json();
        const list = document.getElementById('componentList');

        if (data.components.length === 0) {
          list.innerHTML = '<li class="empty">저장된 컴포넌트가 없습니다</li>';
          return;
        }

        list.innerHTML = data.components.map(c => \`
          <li>
            <div>
              <div class="component-name">\${c.name}</div>
              <div class="component-time">\${new Date(c.createdAt).toLocaleString()}</div>
            </div>
            <div>
              <button class="btn btn-primary" onclick="sendToFigma('\${c.id}')">Figma로 보내기</button>
              <button class="btn btn-danger" onclick="deleteComponent('\${c.id}')">삭제</button>
            </div>
          </li>
        \`).join('');
      } catch (e) {
        console.error(e);
      }
    }

    async function sendToFigma(id) {
      try {
        const res = await fetch('/api/figma/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
          alert('Figma로 전송되었습니다!');
        } else {
          alert('오류: ' + data.error);
        }
      } catch (e) {
        alert('전송 실패: ' + e.message);
      }
    }

    async function deleteComponent(id) {
      if (!confirm('정말 삭제하시겠습니까?')) return;
      try {
        await fetch('/api/extracted/' + id, { method: 'DELETE' });
        loadComponents();
      } catch (e) {
        alert('삭제 실패');
      }
    }

    loadStatus();
    loadComponents();
    setInterval(loadStatus, 5000);
  </script>
</body>
</html>
    `);
  });

  return app;
}
