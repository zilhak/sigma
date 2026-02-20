import { storageHandlers } from './handlers/storage.js';
import { authHandlers } from './handlers/auth.js';
import { figmaHandlers } from './handlers/figma.js';
import { scriptsHandlers } from './handlers/scripts.js';
import { managementHandlers } from './handlers/management.js';
import { jsonResponse, type ToolContext, type ToolResult } from './helpers.js';

/**
 * 모든 핸들러를 하나의 Record로 통합
 */
const handlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  ...storageHandlers,
  ...authHandlers,
  ...figmaHandlers,
  ...scriptsHandlers,
  ...managementHandlers,
};

/**
 * 도구 이름으로 핸들러를 찾아 실행. 에러 래핑 포함.
 */
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const handler = handlers[name];
    if (!handler) {
      return jsonResponse({ error: `Unknown tool: ${name}` });
    }
    return await handler(args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message });
  }
}
