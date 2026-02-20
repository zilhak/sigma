import type { ExtractedNode } from '@sigma/shared';
import * as storage from '../../storage/index.js';
import { tokenStore } from '../../auth/token.js';
import {
  jsonResponse,
  validateFigmaAccess,
  getTargetFromBinding,
  type ToolContext,
  type ToolResult,
} from '../helpers.js';

/**
 * Figma 작업 관련 핸들러 (토큰 필수)
 */
export const figmaHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_create_frame(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const format = (args.format as 'json' | 'html') || 'json';
    const position = args.position as { x: number; y: number } | undefined;

    if (format === 'html') {
      if (!args.html) {
        return jsonResponse({ error: 'html 필드가 필요합니다' });
      }
      await wsServer.createFrame(null, args.name as string | undefined, position, 'html', args.html as string, pluginId, pageId);
    } else {
      if (!args.data) {
        return jsonResponse({ error: 'data 필드가 필요합니다' });
      }
      await wsServer.createFrame(args.data as ExtractedNode, args.name as string | undefined, position, 'json', undefined, pluginId, pageId);
    }

    return jsonResponse({
      success: true,
      message: 'Figma에 프레임이 생성되었습니다',
      target: {
        pluginId: pluginId || '(default)',
        pageId: pageId || '(current)',
      },
      format,
      position: position || 'auto',
    });
  },

  async sigma_import_file(args, context) {
    const { wsServer } = context;

    // 토큰 검증만 먼저 (컴포넌트 로드 전)
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const component = await storage.getComponent(args.id as string);
    if (!component) {
      return jsonResponse({ error: '컴포넌트를 찾을 수 없습니다' });
    }

    const { pluginId, pageId } = access;
    const importPosition = args.position as { x: number; y: number } | undefined;
    await wsServer.createFrame(component.data, (args.name as string) || component.name, importPosition, 'json', undefined, pluginId, pageId);

    return jsonResponse({
      success: true,
      message: `'${component.name}'이 Figma로 가져와졌습니다`,
      target: {
        pluginId: pluginId || '(default)',
        pageId: pageId || '(current)',
      },
      format: 'json',
      position: importPosition || 'auto',
    });
  },

  async sigma_get_frames(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const frames = await wsServer.getFrames(pluginId, pageId);

    return jsonResponse({
      success: true,
      target: {
        pluginId: pluginId || '(default)',
        pageId: pageId || '(current)',
      },
      count: frames.length,
      frames: frames,
    });
  },

  async sigma_delete_frame(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const deleteResult = await wsServer.deleteFrame(args.nodeId as string, pluginId, pageId);

    return jsonResponse({
      success: deleteResult.deleted,
      message: deleteResult.deleted
        ? `프레임 '${deleteResult.name}'이 삭제되었습니다`
        : '삭제 실패',
      target: {
        pluginId: pluginId || '(default)',
        pageId: pageId || '(current)',
      },
      nodeId: args.nodeId,
      deletedName: deleteResult.name,
    });
  },

  async sigma_update_frame(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const updateFormat = (args.format as 'json' | 'html') || 'json';
    const updateNodeId = args.nodeId as string;

    if (updateFormat === 'html') {
      if (!args.html) {
        return jsonResponse({ error: 'html 필드가 필요합니다' });
      }
      const result = await wsServer.updateFrame(
        updateNodeId, 'html', null, args.html as string,
        args.name as string | undefined, pluginId, pageId
      );
      return jsonResponse({
        success: true,
        message: '프레임 내용이 업데이트되었습니다',
        ...result,
        target: {
          pluginId: pluginId || '(default)',
          pageId: pageId || '(current)',
        },
        format: 'html',
      });
    } else {
      if (!args.data) {
        return jsonResponse({ error: 'data 필드가 필요합니다' });
      }
      const result = await wsServer.updateFrame(
        updateNodeId, 'json', args.data as any, undefined,
        args.name as string | undefined, pluginId, pageId
      );
      return jsonResponse({
        success: true,
        message: '프레임 내용이 업데이트되었습니다',
        ...result,
        target: {
          pluginId: pluginId || '(default)',
          pageId: pageId || '(current)',
        },
        format: 'json',
      });
    }
  },

  async sigma_modify_node(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    const modifyNodeId = args.nodeId as string;
    const modifyMethod = args.method as string;
    const modifyArgs = (args.args as Record<string, unknown>) || {};

    try {
      const modifyResult = await wsServer.modifyNode(modifyNodeId, modifyMethod, modifyArgs, pluginId);
      return jsonResponse({
        success: true,
        message: `${modifyMethod} 실행 완료`,
        nodeId: modifyNodeId,
        method: modifyMethod,
        result: modifyResult,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 허용되지 않은 메서드 호출 시 사용 가능한 메서드 목록 반환
      try {
        const parsedError = JSON.parse(errorMessage);
        if (parsedError.availableMethods) {
          return jsonResponse({
            error: parsedError.error,
            availableMethods: parsedError.availableMethods,
          });
        }
      } catch {
        // JSON 파싱 실패 시 원래 에러 반환
      }

      return jsonResponse({
        error: errorMessage,
        nodeId: modifyNodeId,
        method: modifyMethod,
      });
    }
  },

  async sigma_find_node(args, context) {
    const { wsServer } = context;
    const token = args.token as string;
    const path = args.path as string | string[];
    const typeFilter = args.type as string | undefined;

    // 토큰 검증
    const tokenEntry = tokenStore.validateToken(token);
    if (!tokenEntry) {
      return jsonResponse({ error: '유효하지 않은 토큰입니다. sigma_login으로 새 토큰을 발급받으세요.' });
    }

    // Figma 연결 확인
    if (!wsServer.isFigmaConnected()) {
      return jsonResponse({ error: 'Figma Plugin이 연결되어 있지 않습니다.' });
    }

    // 바인딩 확인
    const binding = tokenEntry.binding;
    const pluginId = binding?.pluginId;
    const pageId = binding?.pageId;

    if (binding) {
      const plugin = wsServer.getPluginById(pluginId!);
      if (!plugin) {
        return jsonResponse({ error: `바인딩된 플러그인(${pluginId})이 연결되어 있지 않습니다.` });
      }
    }

    try {
      const result = await wsServer.findNode(path, typeFilter, pluginId, pageId);
      return jsonResponse(result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: errMsg });
    }
  },

  async sigma_get_tree(args, context) {
    const { wsServer } = context;
    const token = args.token as string;
    const nodeId = args.nodeId as string | undefined;
    const path = args.path as string | string[] | undefined;
    const depth = args.depth as number | 'full' | undefined;
    const filter = args.filter as { types?: string[]; namePattern?: string } | undefined;
    const limit = args.limit as number | undefined;

    // 토큰 검증
    const tokenEntry = tokenStore.validateToken(token);
    if (!tokenEntry) {
      return jsonResponse({ error: '유효하지 않은 토큰입니다. sigma_login으로 새 토큰을 발급받으세요.' });
    }

    // Figma 연결 확인
    if (!wsServer.isFigmaConnected()) {
      return jsonResponse({ error: 'Figma Plugin이 연결되어 있지 않습니다.' });
    }

    // 바인딩 확인
    const binding = tokenEntry.binding;
    const pluginId = binding?.pluginId;
    const pageId = binding?.pageId;

    if (binding) {
      const plugin = wsServer.getPluginById(pluginId!);
      if (!plugin) {
        return jsonResponse({ error: `바인딩된 플러그인(${pluginId})이 연결되어 있지 않습니다.` });
      }
    }

    try {
      const result = await wsServer.getTree(
        { nodeId, path, depth, filter, limit, pageId },
        pluginId
      );
      return jsonResponse(result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: errMsg });
    }
  },

  async sigma_screenshot(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    const screenshotNodeId = args.nodeId as string;
    const screenshotFormat = (args.format as 'PNG' | 'SVG' | 'JPG' | 'PDF') || 'PNG';
    const screenshotScale = (args.scale as number) || 2;

    try {
      const exportResult = await wsServer.exportImage(
        screenshotNodeId,
        { format: screenshotFormat, scale: screenshotScale },
        pluginId
      );

      // 파일명 생성
      const ext = screenshotFormat.toLowerCase();
      const safeName = (exportResult.nodeName || 'node')
        .toLowerCase()
        .replace(/[^a-z0-9가-힣-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const timestamp = Date.now();
      const filename = (args.filename as string) || `${safeName}-${timestamp}.${ext}`;

      // 파일 저장
      const filePath = await storage.saveScreenshot(exportResult.base64, filename);

      return jsonResponse({
        success: true,
        filePath,
        filename,
        nodeId: exportResult.nodeId,
        nodeName: exportResult.nodeName,
        width: exportResult.width,
        height: exportResult.height,
        format: screenshotFormat,
        scale: screenshotScale,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({
        error: errorMessage,
        nodeId: screenshotNodeId,
      });
    }
  },

  async sigma_extract_node(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    const extractNodeId = args.nodeId as string;

    try {
      const extractResult = await wsServer.extractNode(extractNodeId, pluginId);
      return jsonResponse({
        success: true,
        nodeId: extractResult.nodeId,
        nodeName: extractResult.nodeName,
        nodeType: extractResult.nodeType,
        data: extractResult.data,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage, nodeId: extractNodeId });
    }
  },

  async sigma_test_roundtrip(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const rtNodeId = args.nodeId as string;

    try {
      // 1. 노드를 JSON으로 추출
      const extractResult = await wsServer.extractNode(rtNodeId, pluginId);

      // 2. 추출된 JSON으로 새 프레임 생성
      const frameName = `[Test] ${extractResult.nodeName}`;
      await wsServer.createFrame(
        extractResult.data as ExtractedNode,
        frameName,
        undefined,
        'json',
        undefined,
        pluginId,
        pageId
      );

      return jsonResponse({
        success: true,
        message: `라운드트립 테스트 완료: "${extractResult.nodeName}" → "${frameName}" 생성됨`,
        original: {
          nodeId: extractResult.nodeId,
          nodeName: extractResult.nodeName,
          nodeType: extractResult.nodeType,
        },
        created: {
          name: frameName,
          format: 'json',
        },
        target: {
          pluginId: pluginId || '(default)',
          pageId: pageId || '(current)',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage, nodeId: rtNodeId });
    }
  },

  async sigma_create_section(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const sectionName = args.name as string;
    const sectionOptions = {
      position: args.position as { x: number; y: number } | undefined,
      size: args.size as { width: number; height: number } | undefined,
      children: args.children as string[] | undefined,
      fills: args.fills as unknown[] | undefined,
      pageId,
    };

    try {
      const sectionResult = await wsServer.createSection(sectionName, sectionOptions, pluginId);
      return jsonResponse({
        success: true,
        message: `Section '${sectionResult.name}'이 생성되었습니다`,
        ...sectionResult,
        target: {
          pluginId: pluginId || '(default)',
          pageId: pageId || '(current)',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_move_node(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    const moveNodeId = args.nodeId as string;
    const moveParentId = args.parentId as string;
    const moveIndex = args.index as number | undefined;

    try {
      const moveResult = await wsServer.moveNode(moveNodeId, moveParentId, moveIndex, pluginId);
      return jsonResponse({
        success: true,
        message: `'${moveResult.nodeName}'이 '${moveResult.newParentName}'으로 이동되었습니다`,
        ...moveResult,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({
        error: errorMessage,
        nodeId: moveNodeId,
        parentId: moveParentId,
      });
    }
  },

  async sigma_clone_node(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    const cloneNodeId = args.nodeId as string;
    const cloneParentId = args.parentId as string | undefined;
    const clonePosition = args.position as { x: number; y: number } | undefined;
    const cloneName = args.name as string | undefined;

    try {
      const cloneResult = await wsServer.cloneNode(
        cloneNodeId,
        { parentId: cloneParentId, position: clonePosition, name: cloneName },
        pluginId
      );
      return jsonResponse({
        success: true,
        message: `'${cloneResult.name}' 노드가 복제되었습니다`,
        ...cloneResult,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({
        error: errorMessage,
        nodeId: cloneNodeId,
      });
    }
  },
};
