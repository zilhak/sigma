import { getPlaywrightScripts } from '../../scripts/registry.js';
import { jsonResponse, type ToolContext, type ToolResult } from '../helpers.js';

/**
 * Playwright 스크립트 관련 핸들러
 */
export const scriptsHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async get_playwright_scripts() {
    const scripts = getPlaywrightScripts();
    return jsonResponse({
      scripts: scripts.map((s) => ({
        name: s.name,
        description: s.description,
        path: s.path,
        exists: s.exists,
        api: s.api,
        usage: s.usage,
      })),
    });
  },
};
