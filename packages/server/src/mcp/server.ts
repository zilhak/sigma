import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { toolDefinitions, handleTool, type ToolContext } from './tools.js';

export function createMcpServer(context: ToolContext) {
  const server = new Server(
    {
      name: 'sigma',
      version: '0.1.0',
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

export async function startMcpServer(context: ToolContext) {
  const server = createMcpServer(context);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('[MCP] Server started on stdio');

  return server;
}
