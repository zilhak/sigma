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

    if (!args.data) {
      return jsonResponse({ error: 'data 필드가 필요합니다' });
    }
    await wsServer.createFrame(args.data, args.name as string | undefined, position, format, pluginId, pageId);

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
    await wsServer.createFrame(component.data, (args.name as string) || component.name, importPosition, 'json', pluginId, pageId);

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

    if (!args.data) {
      return jsonResponse({ error: 'data 필드가 필요합니다' });
    }
    const result = await wsServer.updateFrame(
      updateNodeId, updateFormat, args.data,
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
      format: updateFormat,
    });
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
    const extractFormat = (args.format as 'json' | 'html') || 'json';

    try {
      const extractResult = await wsServer.extractNode(extractNodeId, pluginId, extractFormat);
      return jsonResponse({
        success: true,
        nodeId: extractResult.nodeId,
        nodeName: extractResult.nodeName,
        nodeType: extractResult.nodeType,
        format: extractFormat,
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
    const rtFormat = (args.format as 'json' | 'html') || 'json';

    try {
      // 1. 노드를 지정 포맷으로 추출
      const extractResult = await wsServer.extractNode(rtNodeId, pluginId, rtFormat);

      // 2. 추출된 데이터로 새 프레임 생성
      const frameName = `[Test-${rtFormat.toUpperCase()}] ${extractResult.nodeName}`;
      await wsServer.createFrame(
        extractResult.data,
        frameName,
        undefined,
        rtFormat,
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
          format: rtFormat,
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

  // === Create Nodes ===

  async sigma_create_rectangle(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createRectangle({
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        fillColor: args.fillColor as any,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
        cornerRadius: args.cornerRadius as number | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: '사각형이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_text(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createTextNode({
        x: args.x as number,
        y: args.y as number,
        text: args.text as string,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        fontSize: args.fontSize as number | undefined,
        fontFamily: args.fontFamily as string | undefined,
        fontWeight: args.fontWeight as number | undefined,
        fontColor: args.fontColor as any,
        textAlignHorizontal: args.textAlignHorizontal as string | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: '텍스트가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_empty_frame(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const frameArgs: Record<string, unknown> = {
        x: args.x, y: args.y, width: args.width, height: args.height,
      };
      // 선택적 옵션 전달
      const optionalKeys = [
        'name', 'parentId', 'fillColor', 'strokeColor', 'strokeWeight',
        'layoutMode', 'layoutWrap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'primaryAxisAlignItems', 'counterAxisAlignItems',
        'layoutSizingHorizontal', 'layoutSizingVertical',
        'itemSpacing', 'counterAxisSpacing', 'cornerRadius',
      ];
      for (const key of optionalKeys) {
        if (args[key] !== undefined) frameArgs[key] = args[key];
      }
      const result = await wsServer.createEmptyFrame(frameArgs as any, pluginId);
      return jsonResponse({ success: true, message: '프레임이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Viewport ===

  async sigma_get_viewport(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getViewport(pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_viewport(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.setViewport({
        center: args.center as { x: number; y: number } | undefined,
        zoom: args.zoom as number | undefined,
        nodeIds: args.nodeIds as string[] | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: '뷰포트가 변경되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Page Management ===

  async sigma_create_page(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createPage(args.name as string | undefined, pluginId);
      return jsonResponse({ success: true, message: '페이지가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_rename_page(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.renamePage(args.pageId as string, args.name as string, pluginId);
      return jsonResponse({ success: true, message: '페이지 이름이 변경되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_switch_page(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.switchPage(args.pageId as string, pluginId);
      return jsonResponse({ success: true, message: '페이지가 전환되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_delete_page(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.deletePage(args.pageId as string, pluginId);
      return jsonResponse({ success: true, message: '페이지가 삭제되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Group / Ungroup / Flatten ===

  async sigma_group_nodes(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.groupNodes(
        args.nodeIds as string[],
        args.name as string | undefined,
        pluginId
      );
      return jsonResponse({ success: true, message: '노드가 그룹화되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_ungroup(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.ungroupNodes(args.nodeId as string, pluginId);
      return jsonResponse({ success: true, message: '그룹이 해제되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_flatten(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.flattenNodes(
        args.nodeIds as string[],
        args.name as string | undefined,
        pluginId
      );
      return jsonResponse({ success: true, message: '노드가 Flatten되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Boolean Operations ===

  async sigma_boolean_operation(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.booleanOperation(
        args.nodeIds as string[],
        args.operation as string,
        args.name as string | undefined,
        pluginId
      );
      return jsonResponse({ success: true, message: 'Boolean 연산이 완료되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_ellipse(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createEllipse({
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        fillColor: args.fillColor as any,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
        arcData: args.arcData as any,
      }, pluginId);
      return jsonResponse({ success: true, message: '타원이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_polygon(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createPolygon({
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        fillColor: args.fillColor as any,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
        pointCount: args.pointCount as number | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: '다각형이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_star(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createStar({
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        fillColor: args.fillColor as any,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
        pointCount: args.pointCount as number | undefined,
        innerRadius: args.innerRadius as number | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: '별이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_line(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createLine({
        x: args.x as number,
        y: args.y as number,
        length: args.length as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
        rotation: args.rotation as number | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: '선이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_vector(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createVector({
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        fillColor: args.fillColor as any,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
        vectorPaths: args.vectorPaths as any,
      }, pluginId);
      return jsonResponse({ success: true, message: '벡터가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Variables ===

  async sigma_create_variable_collection(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createVariableCollection({
        name: args.name as string,
      }, pluginId);
      return jsonResponse({ success: true, message: '변수 컬렉션이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_variable(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createVariable({
        name: args.name as string,
        collectionId: args.collectionId as string,
        resolvedType: args.resolvedType as string,
      }, pluginId);
      return jsonResponse({ success: true, message: '변수가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_get_variables(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getVariables({
        type: args.type as string | undefined,
      }, pluginId);
      return jsonResponse(result as object);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_variable_value(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.setVariableValue({
        variableId: args.variableId as string,
        modeId: args.modeId as string,
        value: args.value,
      }, pluginId);
      return jsonResponse({ success: true, message: '변수 값이 설정되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_bind_variable(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.bindVariable({
        nodeId: args.nodeId as string,
        field: args.field as string,
        variableId: args.variableId as string,
      }, pluginId);
      return jsonResponse({ success: true, message: '변수가 바인딩되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_add_variable_mode(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.addVariableMode({
        collectionId: args.collectionId as string,
        name: args.name as string,
      }, pluginId);
      return jsonResponse({ success: true, message: '변수 모드가 추가되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Styles ===

  async sigma_create_paint_style(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createPaintStyle({
        name: args.name as string,
        paints: args.paints as any[],
        description: args.description as string | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: 'Paint 스타일이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_text_style(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createTextStyle({
        name: args.name as string,
        fontSize: args.fontSize as number | undefined,
        fontFamily: args.fontFamily as string | undefined,
        fontWeight: args.fontWeight as string | undefined,
        lineHeight: args.lineHeight as any,
        letterSpacing: args.letterSpacing as any,
        textCase: args.textCase as string | undefined,
        textDecoration: args.textDecoration as string | undefined,
        description: args.description as string | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: 'Text 스타일이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_effect_style(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createEffectStyle({
        name: args.name as string,
        effects: args.effects as any[],
        description: args.description as string | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: 'Effect 스타일이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_grid_style(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createGridStyle({
        name: args.name as string,
        grids: args.grids as any[],
        description: args.description as string | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: 'Grid 스타일이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_apply_style(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.applyStyle({
        nodeId: args.nodeId as string,
        styleType: args.styleType as string,
        styleId: args.styleId as string,
      }, pluginId);
      return jsonResponse({ success: true, message: '스타일이 적용되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_delete_style(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.deleteStyle({
        styleId: args.styleId as string,
      }, pluginId);
      return jsonResponse({ success: true, message: '스타일이 삭제되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_image(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createImageNode({
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        imageData: args.imageData as string,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        scaleMode: args.scaleMode as string | undefined,
        cornerRadius: args.cornerRadius as number | undefined,
      }, pluginId);
      return jsonResponse({ success: true, message: '이미지 노드가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Selection ===

  async sigma_get_selection(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getSelection(pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_selection(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.setSelectionNodes(
        args.nodeIds as string[],
        args.zoomToFit as boolean | undefined,
        pluginId
      );
      return jsonResponse({ success: true, ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Components ===

  async sigma_get_local_components(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getLocalComponents(pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_component_instance(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.createComponentInstance(
        args.componentKey as string,
        args.x as number,
        args.y as number,
        args.parentId as string | undefined,
        pluginId
      );
      return jsonResponse({ success: true, message: '컴포넌트 인스턴스가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_get_instance_overrides(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getInstanceOverrides(args.nodeId as string | undefined, pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_instance_overrides(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.setInstanceOverrides(
        args.nodeId as string,
        args.overrides as Record<string, unknown>,
        pluginId
      );
      return jsonResponse({ success: true, message: '오버라이드가 적용되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Query ===

  async sigma_get_node_info(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getNodeInfo(args.nodeId as string, pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage, nodeId: args.nodeId });
    }
  },

  async sigma_get_document_info(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getDocumentInfo(pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_get_styles(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getStylesInfo(pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Batch ===

  async sigma_scan_text_nodes(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.scanTextNodes(args.nodeId as string, pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage, nodeId: args.nodeId });
    }
  },

  async sigma_scan_nodes_by_types(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.scanNodesByTypes(
        args.nodeId as string,
        args.types as string[],
        pluginId
      );
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage, nodeId: args.nodeId });
    }
  },

  async sigma_batch_modify(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.batchModifyNodes(
        args.operations as Array<{ nodeId: string; method: string; args?: Record<string, unknown> }>,
        pluginId
      );
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_batch_delete(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.batchDeleteNodes(args.nodeIds as string[], pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Batch Text ===

  async sigma_set_multiple_text_contents(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.setMultipleTextContents(
        args.items as Array<{ nodeId: string; text: string }>,
        pluginId
      );
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Query Batch ===

  async sigma_get_nodes_info(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getNodesInfo(args.nodeIds as string[], pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_read_my_design(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.readMyDesign(pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Batch Annotations ===

  async sigma_set_multiple_annotations(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.setMultipleAnnotations(
        args.items as Array<{ nodeId: string; label: string; labelType?: string }>,
        pluginId
      );
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Annotations ===

  async sigma_get_annotations(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getAnnotations(args.nodeId as string | undefined, pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_annotation(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.setAnnotation(
        args.nodeId as string,
        args.label as string,
        args.labelType as string | undefined,
        pluginId
      );
      return jsonResponse({ success: true, message: '주석이 추가되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Prototyping ===

  async sigma_get_reactions(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.getReactions(args.nodeId as string | undefined, pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_add_reaction(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.addReaction({
        nodeId: args.nodeId as string,
        trigger: args.trigger as string,
        action: args.action as string,
        destinationId: args.destinationId as string | undefined,
        url: args.url as string | undefined,
        transition: args.transition as { type: string; duration?: number; direction?: string } | undefined,
        preserveScrollPosition: args.preserveScrollPosition as boolean | undefined,
      }, pluginId);
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_remove_reactions(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.removeReactions(
        args.nodeId as string,
        args.triggerType as string | undefined,
        pluginId
      );
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
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
