import type { ExtractedNode } from '@sigma/shared';
import * as storage from '../../storage/index.js';
import { jsonResponse, type ToolContext, type ToolResult } from '../helpers.js';

/**
 * 스토리지 관련 핸들러 (토큰 불필요)
 */
export const storageHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async save_extracted(args) {
    const component = await storage.saveComponent(
      args.name as string,
      args.data as ExtractedNode
    );
    return jsonResponse({
      success: true,
      message: `컴포넌트 '${component.name}'이 저장되었습니다`,
      id: component.id,
    });
  },

  async list_saved() {
    const components = await storage.listComponents();
    return jsonResponse({
      count: components.length,
      components: components.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
      })),
    });
  },

  async load_extracted(args) {
    let component;
    if (args.id) {
      component = await storage.getComponent(args.id as string);
    } else if (args.name) {
      component = await storage.getComponentByName(args.name as string);
    }

    if (!component) {
      return jsonResponse({ error: '컴포넌트를 찾을 수 없습니다' });
    }

    return jsonResponse({
      id: component.id,
      name: component.name,
      data: component.data,
      createdAt: component.createdAt,
    });
  },

  async delete_extracted(args) {
    const deleted = await storage.deleteComponent(args.id as string);
    return jsonResponse({
      success: deleted,
      message: deleted ? '삭제되었습니다' : '컴포넌트를 찾을 수 없습니다',
    });
  },
};
