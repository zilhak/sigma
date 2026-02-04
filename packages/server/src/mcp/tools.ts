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
    description: `Figma에 프레임을 생성합니다.

**중요: format은 반드시 'json'을 사용하세요.**
- json (기본값, 권장): ExtractedNode 구조로 정확한 스타일 보존. MCP 내부 동작 시 필수.
- html: 사람이 읽거나 타 프로그램 호환용. 스타일 손실 가능성 있음.`,
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터 (format이 json일 때)',
        },
        html: {
          type: 'string',
          description: 'HTML 문자열 (format이 html일 때)',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식. 'json' 권장 (기본값). MCP 사용 시 json 필수.",
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
      required: [],
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
    description: `컴포넌트를 저장하고 바로 Figma로 가져옵니다.

**중요: format은 반드시 'json'을 사용하세요.**
- json (기본값, 권장): ExtractedNode 구조로 정확한 스타일 보존. MCP 내부 동작 시 필수.
- html: 사람이 읽거나 타 프로그램 호환용. 스타일 손실 가능성 있음.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '컴포넌트 이름',
        },
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터 (format이 json일 때)',
        },
        html: {
          type: 'string',
          description: 'HTML 문자열 (format이 html일 때)',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식. 'json' 권장 (기본값). MCP 사용 시 json 필수.",
        },
      },
      required: ['name'],
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

        const format = (args.format as 'json' | 'html') || 'json';
        const position = args.position as { x: number; y: number } | undefined;

        if (format === 'html') {
          if (!args.html) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'html 필드가 필요합니다' }) }],
            };
          }
          await wsServer.createFrame(null, args.name as string | undefined, position, 'html', args.html as string);
        } else {
          if (!args.data) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'data 필드가 필요합니다' }) }],
            };
          }
          await wsServer.createFrame(args.data as ExtractedNode, args.name as string | undefined, position, 'json');
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Figma에 프레임이 생성되었습니다',
                format,
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
        // 저장된 컴포넌트는 항상 JSON 형식
        await wsServer.createFrame(component.data, (args.name as string) || component.name, importPosition, 'json');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `'${component.name}'이 Figma로 가져와졌습니다`,
                format: 'json',
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
        const saveFormat = (args.format as 'json' | 'html') || 'json';

        // HTML인 경우 저장은 하지 않고 바로 Figma로 전송 (HTML은 스토리지에 저장하지 않음)
        if (saveFormat === 'html') {
          if (!args.html) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'html 필드가 필요합니다' }) }],
            };
          }

          if (wsServer.isFigmaConnected()) {
            await wsServer.createFrame(null, args.name as string, undefined, 'html', args.html as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `'${args.name}'이 Figma로 가져와졌습니다 (HTML, 저장 안 함)`,
                    format: 'html',
                  }),
                },
              ],
            };
          } else {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
              ],
            };
          }
        }

        // JSON인 경우 기존 로직
        if (!args.data) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'data 필드가 필요합니다' }) }],
          };
        }

        // Save first
        const component = await storage.saveComponent(
          args.name as string,
          args.data as ExtractedNode
        );

        // Then import to Figma if connected
        if (wsServer.isFigmaConnected()) {
          await wsServer.createFrame(component.data, component.name, undefined, 'json');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `'${component.name}'이 저장되고 Figma로 가져와졌습니다`,
                  id: component.id,
                  format: 'json',
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
                  format: 'json',
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
