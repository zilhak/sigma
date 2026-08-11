import type { ExtractedNode } from '@sigma/shared';
import * as storage from '../../storage/index.js';
import { tokenStore } from '../../auth/token.js';
import {
  jsonResponse,
  formatSize,
  validateToken,
  getTargetFromBinding,
  type ToolContext,
  type ToolResult,
} from '../helpers.js';

/**
 * 서버 관리/유틸리티 관련 핸들러
 */
export const managementHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_storage_stats() {
    const fullStats = await storage.getFullStorageStats();

    return jsonResponse({
      extracted: {
        count: fullStats.extracted.count,
        size: formatSize(fullStats.extracted.totalSize),
        sizeBytes: fullStats.extracted.totalSize,
      },
      screenshots: {
        count: fullStats.screenshots.count,
        size: formatSize(fullStats.screenshots.totalSize),
        sizeBytes: fullStats.screenshots.totalSize,
      },
      reports: {
        count: fullStats.reports.count,
        size: formatSize(fullStats.reports.totalSize),
        sizeBytes: fullStats.reports.totalSize,
      },
      total: {
        count: fullStats.total.count,
        size: formatSize(fullStats.total.totalSize),
        sizeBytes: fullStats.total.totalSize,
      },
      autoCleanup: {
        ttlDays: 7,
        startupThreshold: '100MB',
        startupTarget: '50MB',
      },
    });
  },

  async sigma_cleanup(args) {
    const olderThanDays = args.olderThanDays != null ? (args.olderThanDays as number) : 7;
    const category = (args.category as 'extracted' | 'screenshots' | 'reports' | 'all') || 'all';

    const result = await storage.cleanup({ olderThanDays, category });

    return jsonResponse({
      success: true,
      deleted: result.deleted,
      freedSize: formatSize(result.freedBytes),
      freedBytes: result.freedBytes,
      criteria: {
        olderThanDays,
        category,
      },
      message: result.deleted > 0
        ? `${result.deleted}개 파일 삭제됨 (${formatSize(result.freedBytes)} 확보)`
        : '삭제할 파일이 없습니다',
    });
  },

  async sigma_list_screenshots() {
    const screenshots = await storage.listScreenshots();

    return jsonResponse({
      count: screenshots.length,
      screenshots: screenshots.map(s => ({
        filename: s.filename,
        path: s.path,
        size: formatSize(s.size),
        sizeBytes: s.size,
        createdAt: s.createdAt,
      })),
    });
  },

  async sigma_delete_screenshot(args) {
    const filename = args.filename as string;
    const deleted = await storage.deleteScreenshot(filename);
    return jsonResponse({
      success: deleted,
      message: deleted ? `'${filename}' 삭제됨` : `'${filename}'을 찾을 수 없습니다`,
    });
  },

  async sigma_server_status(_args, context) {
    const { wsServer } = context;
    const figmaStatus = wsServer.getStatus();
    const storageStats = await storage.getFullStorageStats();
    const tokenStatus = tokenStore.getStatus();

    // 죽은 플러그인의 정황은 서버 로그에만 있었고, 그건 에이전트가 볼 수 없는 자리다 (020).
    const recentDisconnects = wsServer.getRecentDisconnects().map((d) => ({
      pluginId: d.pluginId,
      at: new Date(d.at).toISOString(),
      closeCode: d.code,
      reason: d.reason,
      livedSec: d.livedSec,
      commands: d.commands,
      bytesInMB: Number((d.bytesIn / 1024 / 1024).toFixed(1)),
      lastCommandType: d.lastCommandType,
      msSinceLastCommand: d.msSinceLastCommand,
      fileName: d.fileName,
    }));

    return jsonResponse({
      server: 'running',
      figma: figmaStatus,
      storage: storageStats,
      tokens: tokenStatus,
      ...(recentDisconnects.length > 0 ? { recentDisconnects } : {}),
      timestamp: new Date().toISOString(),
    });
  },

  async sigma_save_and_import(args, context) {
    const { wsServer } = context;
    const saveImportToken = args.token as string;
    const saveImportValidation = validateToken(saveImportToken);
    const saveImportPosition = args.position as { x: number; y: number } | undefined;

    if (!saveImportValidation.valid) {
      return jsonResponse({ error: saveImportValidation.error });
    }

    const saveFormat = (args.format as 'json' | 'html') || 'json';
    const saveLayoutMode = (args.layoutMode as 'auto' | 'absolute') || 'auto';
    const { pluginId: saveImportPluginId, pageId: saveImportPageId } = getTargetFromBinding(saveImportValidation.binding);

    // 바인딩된 플러그인 연결 확인
    if (saveImportPluginId) {
      const targetPlugin = wsServer.getPluginById(saveImportPluginId);
      if (!targetPlugin) {
        return jsonResponse({
          error: `바인딩된 플러그인(${saveImportPluginId})이 연결되어 있지 않습니다. ${wsServer.describePluginLoss(saveImportPluginId)}`,
        });
      }
    }

    // HTML인 경우 저장은 하지 않고 바로 Figma로 전송 (HTML은 스토리지에 저장하지 않음)
    if (saveFormat === 'html') {
      if (!args.data) {
        return jsonResponse({ error: 'data 필드가 필요합니다' });
      }

      if (wsServer.isFigmaConnected()) {
        const htmlFrame = await wsServer.createFrame(args.data as string, args.name as string, saveImportPosition, 'html', saveImportPluginId, saveImportPageId, saveLayoutMode);
        return jsonResponse({
          success: true,
          message: `'${args.name}'이 Figma로 가져와졌습니다 (HTML, 저장 안 함)`,
          created: htmlFrame,
          target: {
            pluginId: saveImportPluginId || '(default)',
            pageId: saveImportPageId || '(current)',
          },
          format: 'html',
        });
      } else {
        return jsonResponse({ error: 'Figma Plugin이 연결되어 있지 않습니다' });
      }
    }

    // JSON인 경우 기존 로직
    if (!args.data) {
      return jsonResponse({ error: 'data 필드가 필요합니다' });
    }

    // 먼저 저장
    const savedComponent = await storage.saveComponent(
      args.name as string,
      args.data as ExtractedNode
    );

    // Figma 연결 시 가져오기
    if (wsServer.isFigmaConnected()) {
      const savedFrame = await wsServer.createFrame(savedComponent.data, savedComponent.name, saveImportPosition, 'json', saveImportPluginId, saveImportPageId, saveLayoutMode);
      return jsonResponse({
        success: true,
        message: `'${savedComponent.name}'이 저장되고 Figma로 가져와졌습니다`,
        id: savedComponent.id,
        created: savedFrame,
        target: {
          pluginId: saveImportPluginId || '(default)',
          pageId: saveImportPageId || '(current)',
        },
        format: 'json',
      });
    } else {
      return jsonResponse({
        success: true,
        message: `'${savedComponent.name}'이 저장되었습니다 (Figma 연결 없음)`,
        id: savedComponent.id,
        format: 'json',
      });
    }
  },
};
