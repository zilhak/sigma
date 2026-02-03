import type { ExtractedNode } from '@sigma/shared';
import * as storage from '../storage/index.js';
import type { FigmaWebSocketServer } from '../websocket/server.js';

export interface ToolContext {
  wsServer: FigmaWebSocketServer;
}

// Tool definitions for MCP
export const toolDefinitions = [
  // === Storage Tools ===
  {
    name: 'save_extracted',
    description: '추출된 컴포넌트 데이터를 저장합니다',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '컴포넌트 이름',
        },
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터',
        },
      },
      required: ['name', 'data'],
    },
  },
  {
    name: 'list_saved',
    description: '저장된 컴포넌트 목록을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'load_extracted',
    description: '저장된 컴포넌트를 불러옵니다',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '컴포넌트 ID',
        },
        name: {
          type: 'string',
          description: '컴포넌트 이름 (ID가 없을 경우)',
        },
      },
    },
  },
  {
    name: 'delete_extracted',
    description: '저장된 컴포넌트를 삭제합니다',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '삭제할 컴포넌트 ID',
        },
      },
      required: ['id'],
    },
  },

  // === Figma Tools ===
  {
    name: 'figma_status',
    description: 'Figma Plugin 연결 상태를 확인합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'figma_create_frame',
    description: 'Figma에 프레임을 생성합니다',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터',
        },
        name: {
          type: 'string',
          description: '프레임 이름',
        },
        position: {
          type: 'object',
          description: '프레임 생성 위치 (x, y 좌표)',
          properties: {
            x: { type: 'number', description: 'X 좌표' },
            y: { type: 'number', description: 'Y 좌표' },
          },
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'figma_import_file',
    description: '저장된 컴포넌트를 Figma로 가져옵니다',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '가져올 컴포넌트 ID',
        },
        name: {
          type: 'string',
          description: '프레임 이름 (선택사항)',
        },
        position: {
          type: 'object',
          description: '프레임 생성 위치 (x, y 좌표)',
          properties: {
            x: { type: 'number', description: 'X 좌표' },
            y: { type: 'number', description: 'Y 좌표' },
          },
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'figma_get_frames',
    description: 'Figma 현재 페이지의 모든 프레임 위치와 크기를 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'figma_delete_frame',
    description: 'Figma에서 프레임을 삭제합니다',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '삭제할 노드 ID (예: "123:456")',
        },
      },
      required: ['nodeId'],
    },
  },

  // === Combined Tools ===
  {
    name: 'save_and_import',
    description: '컴포넌트를 저장하고 바로 Figma로 가져옵니다',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '컴포넌트 이름',
        },
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터',
        },
      },
      required: ['name', 'data'],
    },
  },

  // === Server Status ===
  {
    name: 'server_status',
    description: '서버 전체 상태를 확인합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Tool handlers
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { wsServer } = context;

  try {
    switch (name) {
      // === Storage Tools ===
      case 'save_extracted': {
        const component = await storage.saveComponent(
          args.name as string,
          args.data as ExtractedNode
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `컴포넌트 '${component.name}'이 저장되었습니다`,
                id: component.id,
              }),
            },
          ],
        };
      }

      case 'list_saved': {
        const components = await storage.listComponents();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: components.length,
                components: components.map((c) => ({
                  id: c.id,
                  name: c.name,
                  createdAt: c.createdAt,
                })),
              }),
            },
          ],
        };
      }

      case 'load_extracted': {
        let component;
        if (args.id) {
          component = await storage.getComponent(args.id as string);
        } else if (args.name) {
          component = await storage.getComponentByName(args.name as string);
        }

        if (!component) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '컴포넌트를 찾을 수 없습니다' }) }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: component.id,
                name: component.name,
                data: component.data,
                createdAt: component.createdAt,
              }),
            },
          ],
        };
      }

      case 'delete_extracted': {
        const deleted = await storage.deleteComponent(args.id as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: deleted,
                message: deleted ? '삭제되었습니다' : '컴포넌트를 찾을 수 없습니다',
              }),
            },
          ],
        };
      }

      // === Figma Tools ===
      case 'figma_status': {
        const status = wsServer.getStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                connected: status.figmaConnected,
                clients: status.figmaClients,
              }),
            },
          ],
        };
      }

      case 'figma_create_frame': {
        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const position = args.position as { x: number; y: number } | undefined;
        await wsServer.createFrame(args.data as ExtractedNode, args.name as string | undefined, position);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Figma에 프레임이 생성되었습니다',
                position: position || 'auto',
              }),
            },
          ],
        };
      }

      case 'figma_import_file': {
        const component = await storage.getComponent(args.id as string);
        if (!component) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '컴포넌트를 찾을 수 없습니다' }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const importPosition = args.position as { x: number; y: number } | undefined;
        await wsServer.createFrame(component.data, (args.name as string) || component.name, importPosition);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `'${component.name}'이 Figma로 가져와졌습니다`,
                position: importPosition || 'auto',
              }),
            },
          ],
        };
      }

      case 'figma_get_frames': {
        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const frames = await wsServer.getFrames();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: frames.length,
                frames: frames,
              }),
            },
          ],
        };
      }

      case 'figma_delete_frame': {
        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const deleteResult = await wsServer.deleteFrame(args.nodeId as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: deleteResult.deleted,
                message: deleteResult.deleted
                  ? `프레임 '${deleteResult.name}'이 삭제되었습니다`
                  : '삭제 실패',
                nodeId: args.nodeId,
                deletedName: deleteResult.name,
              }),
            },
          ],
        };
      }

      // === Combined Tools ===
      case 'save_and_import': {
        // Save first
        const component = await storage.saveComponent(
          args.name as string,
          args.data as ExtractedNode
        );

        // Then import to Figma if connected
        if (wsServer.isFigmaConnected()) {
          await wsServer.createFrame(component.data, component.name);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `'${component.name}'이 저장되고 Figma로 가져와졌습니다`,
                  id: component.id,
                }),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `'${component.name}'이 저장되었습니다 (Figma 연결 없음)`,
                  id: component.id,
                }),
              },
            ],
          };
        }
      }

      // === Server Status ===
      case 'server_status': {
        const figmaStatus = wsServer.getStatus();
        const storageStats = await storage.getStorageStats();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                server: 'running',
                figma: figmaStatus,
                storage: storageStats,
                timestamp: new Date().toISOString(),
              }),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    };
  }
}
