import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { VERSION, type ExtractedNode } from '@sigma/shared';
import * as storage from '../storage/index.js';
import type { FigmaWebSocketServer } from '../websocket/server.js';

// 현재 파일 기준으로 dashboard HTML 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DASHBOARD_HTML_PATH = resolve(__dirname, '../dashboard/index.html');

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

  // Version check
  app.get('/api/version', (c) => {
    return c.json({
      version: VERSION,
      name: 'Sigma Server',
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
        pluginId?: string;
        pageId?: string;
      }>();

      const format = body.format || 'json';
      let data: ExtractedNode | null = null;
      let html: string | undefined;
      let name: string | undefined = body.name;
      const position = body.position;
      const pluginId = body.pluginId;
      const pageId = body.pageId;

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

      // Check Figma connection (specific plugin if pluginId provided)
      if (pluginId) {
        const targetPlugin = wsServer.getPluginById(pluginId);
        if (!targetPlugin) {
          return c.json({ error: `지정된 플러그인(${pluginId})이 연결되어 있지 않습니다` }, 503);
        }
      } else if (!wsServer.isFigmaConnected()) {
        return c.json({ error: 'Figma Plugin이 연결되어 있지 않습니다' }, 503);
      }

      // Send to Figma with optional position, pluginId, and pageId
      await wsServer.createFrame(data, name, position, format, html, pluginId, pageId);

      return c.json({
        success: true,
        message: 'Figma에 프레임이 생성되었습니다',
        format,
        target: {
          pluginId: pluginId || '(default)',
          pageId: pageId || '(current)',
        },
      });
    } catch (error) {
      console.error('[HTTP] Figma import error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ error: message }, 500);
    }
  });

  // Get list of frames in Figma
  app.get('/api/figma/frames', async (c) => {
    try {
      // Get optional query parameters for targeting specific plugin/page
      const pluginId = c.req.query('pluginId');
      const pageId = c.req.query('pageId');

      // Check Figma connection (specific plugin if pluginId provided)
      if (pluginId) {
        const targetPlugin = wsServer.getPluginById(pluginId);
        if (!targetPlugin) {
          return c.json({ error: `지정된 플러그인(${pluginId})이 연결되어 있지 않습니다` }, 503);
        }
      } else if (!wsServer.isFigmaConnected()) {
        return c.json({ error: 'Figma Plugin이 연결되어 있지 않습니다' }, 503);
      }

      // Get frames from Figma with optional targeting
      const frames = await wsServer.getFrames(pluginId, pageId);

      return c.json({
        success: true,
        frames,
        target: {
          pluginId: pluginId || '(default)',
          pageId: pageId || '(current)',
        },
      });
    } catch (error) {
      console.error('[HTTP] Figma frames error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ error: message }, 500);
    }
  });

  // === Dashboard ===

  // Dashboard HTML (외부 파일에서 읽어서 반환)
  app.get('/', (c) => {
    const html = readFileSync(DASHBOARD_HTML_PATH, 'utf-8');
    return c.html(html);
  });

  return app;
}
