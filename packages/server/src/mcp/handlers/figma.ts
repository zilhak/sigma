import type { ComponentSpecRecord, ExtractedNode } from '@sigma/shared';
import type { TreeNode } from '@sigma/shared';
import { queryNodes, type NodeQuery } from '@sigma/shared/lint';
import { resolveSpec } from '../spec-resolve.js';
import { buildLintNodes, collectNodeIds, type NodeInfoLike } from '../../lint/enrich.js';
import * as storage from '../../storage/index.js';
import { tokenStore } from '../../auth/token.js';
import {
  jsonResponse,
  validateFigmaAccess,
  getTargetFromBinding,
  type ToolContext,
  type ToolResult,
} from '../helpers.js';
import { processImage, saveSingleScreenshot, saveTiledScreenshots, type ScreenshotMode } from '../../image/process.js';

/**
 * 트리 조회만으로 채워지는 노드 필드. 이 밖의 field 를 조건에 쓰면 상세 조회
 * (get_nodes_info) 왕복이 한 번 추가된다 — sigma_lint 의 enrich 와 동일한 비용 구조.
 */
const TREE_ONLY_QUERY_FIELDS = new Set([
  'id', 'name', 'type', 'x', 'y', 'width', 'height', 'childCount', 'visible', 'locked',
]);

/** 조건이 상세 조회를 필요로 하는지 (field 의 첫 세그먼트로 판정) */
function queryNeedsNodeInfo(query: NodeQuery): boolean {
  return (query.checks || []).some((c) => {
    const root = String(c.field !== undefined ? c.field : '').split(/[.[]/)[0];
    return !TREE_ONLY_QUERY_FIELDS.has(root);
  });
}

function asNodesInfoArray(raw: unknown): NodeInfoLike[] {
  if (Array.isArray(raw)) return raw as NodeInfoLike[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { nodes?: unknown }).nodes)) {
    return (raw as { nodes: NodeInfoLike[] }).nodes;
  }
  return [];
}

const QUERY_DEFAULT_LIMIT = 200;

/**
 * 컨버터가 실제로 읽는 필드가 하나라도 있는지. `{}` 같은 빈 객체를 걸러내기 위한 최소 검사다.
 *
 * ⚠️ 왜 필요한가: 예전 가드는 `if (!data)` 뿐이라 `{}` 가 truthy 로 통과했고, 그러면 플러그인이
 * `createFigmaNode` 에서 null 을 받아 던지는데 그 예외가 응답에 실리지 않아 **성공 응답 + 아무
 * 노드도 없음**이 됐다. 여기서 미리 끊는다. 지나치게 좁히지 않으려고 "컨버터가 보는 필드가
 * 전혀 없을 때만" 거부한다.
 */
const CONVERTER_FIELDS = ['tagName', 'svgString', 'styles', 'boundingRect', 'children', 'textContent', 'imageDataUrl'] as const;

function describeInvalidFrameData(data: unknown, format: 'json' | 'html'): string | null {
  if (format === 'html') {
    if (typeof data !== 'string' || !data.trim()) return 'html 은 비어 있지 않은 문자열이어야 합니다';
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return 'data 는 추출 노드(ExtractedNode) 객체여야 합니다';
  }
  const has = CONVERTER_FIELDS.some((k) => (data as Record<string, unknown>)[k] !== undefined);
  if (!has) {
    return `data 에 변환에 쓸 필드가 없습니다 (${CONVERTER_FIELDS.join(', ')} 중 하나 이상 필요). 빈 객체로는 노드를 만들 수 없습니다`;
  }
  return null;
}

/**
 * where 조건 검색이 뜨는 트리의 노드 상한·타임아웃.
 *
 * ⚠️ getTree 기본 상한(1000)은 인터랙티브 탐색용이라 조건 검색에 그대로 쓰면 **큰 페이지에서
 * 뒤쪽 노드가 아예 후보에 들어오지 않는다.** 검색은 틀렸을 때 에러가 아니라 "조건에 맞는 게
 * 없다"로 보이므로 조용한 누락이 특히 위험하다 — 실사고: 스펙을 지우기 전 인스턴스가 0인지
 * 세려고 where 로 훑었는데 앞쪽 1000노드만 검사돼 0건이 나왔고, 잔존 인스턴스를 나중에 발견했다.
 * lint 가 같은 이유로 이미 상한을 크게 잡아 뒀다(LINT_TREE_NODE_LIMIT) — 검색도 같은 값을 쓴다.
 * 상한에 실제로 걸리면 응답에 truncated/scannedNodes 로 명시해 "못 본 곳이 있다"를 드러낸다.
 */
const QUERY_TREE_NODE_LIMIT = 200000;
const QUERY_TREE_TIMEOUT_MS = 60000;

/**
 * Figma 작업 관련 핸들러 (토큰 필수)
 */
export const figmaHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_create_frame(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    // html 인자는 data의 별칭 (스키마가 html을 광고하므로 둘 다 수용).
    // html로 전달되면 format 미지정 시 'html'로 자동 판정.
    const data = args.data !== undefined ? args.data : args.html;
    const format = (args.format as 'json' | 'html')
      || (args.data === undefined && args.html !== undefined ? 'html' : 'json');
    const position = args.position as { x: number; y: number } | undefined;
    const layoutMode = (args.layoutMode as 'auto' | 'absolute') || 'auto';

    if (!data) {
      return jsonResponse({ error: 'data 또는 html 필드가 필요합니다' });
    }
    const invalid = describeInvalidFrameData(data, format);
    if (invalid) {
      return jsonResponse({ error: invalid });
    }
    const created = await wsServer.createFrame(data, args.name as string | undefined, position, format, pluginId, pageId, layoutMode);

    // 응답은 **플러그인이 만든 것**을 그대로 싣는다. 요청받은 pageId 를 되울리면
    // 아무것도 만들어지지 않았을 때조차 성공처럼 보인다(그 사고가 실제로 있었다).
    return jsonResponse({
      success: true,
      message: `Figma에 프레임이 생성되었습니다: ${created.name} (${created.nodeId})`,
      created: {
        nodeId: created.nodeId,
        name: created.name,
        childCount: created.childCount,
        pageName: created.pageName,
      },
      target: {
        pluginId: pluginId || '(default)',
        pageId: pageId || '(current)',
      },
      format,
      layoutMode,
      position: position || 'auto',
    });
  },

  async sigma_import_saved(args, context) {
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
    const importLayoutMode = (args.layoutMode as 'auto' | 'absolute') || 'auto';
    const importedFrame = await wsServer.createFrame(component.data, (args.name as string) || component.name, importPosition, 'json', pluginId, pageId, importLayoutMode);

    return jsonResponse({
      success: true,
      message: `'${component.name}'이 Figma로 가져와졌습니다`,
      created: importedFrame,
      target: {
        pluginId: pluginId || '(default)',
        pageId: pageId || '(current)',
      },
      format: 'json',
      layoutMode: importLayoutMode,
      position: importPosition || 'auto',
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
    const rawArgs = args.args;
    const modifyArgs: Record<string, unknown> = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs as Record<string, unknown>) || {};

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

    // where 모드: 속성 조건으로 여러 노드를 찾는다(경로 매칭과 상호배타).
    // 조건 평가는 sigma_lint 와 같은 부품(select 매칭 · 필드 접근 · 5개 연산자)을 쓴다.
    const where = args.where as NodeQuery | undefined;
    if (where) {
      const rawLimit = args.limit as number | undefined;
      const limit = rawLimit !== undefined && rawLimit > 0 ? Math.floor(rawLimit) : QUERY_DEFAULT_LIMIT;
      const startNodeId = args.nodeId as string | undefined;

      try {
        const tree = await wsServer.getTree(
          { nodeId: startNodeId, depth: 'full', pageId, limit: QUERY_TREE_NODE_LIMIT, timeoutMs: QUERY_TREE_TIMEOUT_MS },
          pluginId
        );
        const roots = (tree as { children?: unknown }).children as TreeNode[];
        const scanTruncated = (tree as { truncated?: boolean }).truncated === true;
        const scannedNodes = (tree as { totalCount?: number }).totalCount;

        // 기본 필드만 쓰는 조건이면 트리 하나로 끝난다(왕복 없음).
        const nodesInfo = queryNeedsNodeInfo(where)
          ? asNodesInfoArray(await wsServer.command('GET_NODES_INFO', { nodeIds: collectNodeIds(roots) }, { pluginId }))
          : [];
        const { nodes } = buildLintNodes(roots, nodesInfo);

        const matched = queryNodes(nodes, where);
        const truncated = matched.length > limit;

        return jsonResponse({
          matchCount: matched.length,
          returned: truncated ? limit : matched.length,
          truncated,
          ...(scanTruncated
            ? {
                scanTruncated: true,
                scannedNodes,
                scanWarning: `트리가 ${QUERY_TREE_NODE_LIMIT} 노드에서 잘렸습니다 — 검사되지 않은 노드가 있어 이 결과를 "전부"로 볼 수 없습니다. nodeId 로 범위를 좁혀 나눠 검색하세요.`,
              }
            : {}),
          ...(truncated
            ? { note: `조건에 맞는 노드가 ${matched.length}개입니다. 앞 ${limit}개만 반환했습니다 — limit 을 올리거나 조건을 좁히세요.` }
            : {}),
          enriched: nodesInfo.length > 0,
          nodes: matched.slice(0, limit).map((n) => ({
            nodeId: n.id,
            name: n.name,
            type: n.type,
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
          })),
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return jsonResponse({ error: errMsg });
      }
    }

    if (!path) {
      return jsonResponse({ error: 'path 또는 where 중 하나가 필요합니다.' });
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
    // omit = 매칭 노드를 서브트리째 자르기 / keep = 매칭 노드만 계층째 남기기.
    // filter(레거시 화이트리스트 prune)와의 상호배타 검증은 플러그인에서 한다(내부 호출 경로도 덮으려고).
    const omit = args.omit as { types?: string[]; namePattern?: string } | undefined;
    const keep = args.keep as { types?: string[]; namePattern?: string } | undefined;
    const limit = args.limit as number | undefined;
    // 좌표 전용 축약 응답. 잘못된 값은 무시하고 기본('all')로 — 조용히 필드가 빠지는 것보다 안전하다.
    const fields = args.fields === 'geometry' ? 'geometry' as const : undefined;
    // 'all' 응답에도 절대좌표를 함께 싣는다 — meta/fullPath 를 잃지 않고 컨테이너를 넘나드는 좌표 비교를 하려면 필요하다.
    const includeAbsolute = args.includeAbsolute === true;

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
        { nodeId, path, depth, filter, omit, keep, limit, pageId, fields, includeAbsolute },
        pluginId
      );
      return jsonResponse(result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: errMsg });
    }
  },

  async sigma_set_page_data(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId, pageId: boundPageId } = access;

    const key = args.key as string;
    const value = args.value as string;
    const argPageId = args.pageId as string | undefined;

    // 형식 강제 — namespace는 항상 "sigma"(플러그인 고정), key/value는 여기서 검증
    if (!key || !/^[a-zA-Z0-9_.-]+$/.test(key)) {
      return jsonResponse({ error: `유효하지 않은 key입니다. ^[a-zA-Z0-9_.-]+$ 만 허용됩니다: ${key}` });
    }
    if (typeof value !== 'string') {
      return jsonResponse({ error: 'value는 JSON 문자열이어야 합니다' });
    }
    try {
      JSON.parse(value);
    } catch {
      return jsonResponse({ error: 'value가 유효한 JSON이 아닙니다. 객체/배열/원시값을 JSON 문자열로 직렬화해 전달하세요.' });
    }

    // pageId 미지정 시 바인딩 페이지 사용("document"는 명시 시에만)
    const targetPageId = argPageId !== undefined ? argPageId : boundPageId;

    try {
      const result = await wsServer.setPageData(key, value, { pageId: targetPageId }, pluginId);
      return jsonResponse({ success: true, ...result });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async sigma_get_page_data(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId, pageId: boundPageId } = access;

    const key = args.key as string | undefined;
    const argPageId = args.pageId as string | undefined;
    if (key !== undefined && !/^[a-zA-Z0-9_.-]+$/.test(key)) {
      return jsonResponse({ error: `유효하지 않은 key입니다: ${key}` });
    }
    const targetPageId = argPageId !== undefined ? argPageId : boundPageId;

    try {
      const result = await wsServer.getPageData({ key, pageId: targetPageId }, pluginId);
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async sigma_delete_page_data(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId, pageId: boundPageId } = access;

    const key = args.key as string;
    const argPageId = args.pageId as string | undefined;
    if (!key || !/^[a-zA-Z0-9_.-]+$/.test(key)) {
      return jsonResponse({ error: `유효하지 않은 key입니다: ${key}` });
    }
    const targetPageId = argPageId !== undefined ? argPageId : boundPageId;

    // 빈 문자열 저장 = Figma sharedPluginData 키 삭제(plugin set-page-data 경로 재사용).
    try {
      await wsServer.setPageData(key, '', { pageId: targetPageId }, pluginId);
      return jsonResponse({ success: true, deleted: key, pageId: targetPageId ?? '(bound)' });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async sigma_set_node_data(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId } = access;

    const nodeId = args.nodeId as string;
    const key = args.key as string;
    const value = args.value as string;
    if (!nodeId) return jsonResponse({ error: 'nodeId 가 필요합니다' });
    if (!key || !/^[a-zA-Z0-9_.-]+$/.test(key)) {
      return jsonResponse({ error: `유효하지 않은 key입니다. ^[a-zA-Z0-9_.-]+$ 만 허용됩니다: ${key}` });
    }
    if (typeof value !== 'string') return jsonResponse({ error: 'value는 JSON 문자열이어야 합니다' });
    try {
      JSON.parse(value);
    } catch {
      return jsonResponse({ error: 'value가 유효한 JSON이 아닙니다. 객체/배열/원시값을 JSON 문자열로 직렬화해 전달하세요.' });
    }
    try {
      const result = await wsServer.setNodeData(nodeId, key, value, pluginId);
      return jsonResponse({ success: true, ...result });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async sigma_get_node_data(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId } = access;

    const nodeId = args.nodeId as string;
    const key = args.key as string | undefined;
    if (!nodeId) return jsonResponse({ error: 'nodeId 가 필요합니다' });
    if (key !== undefined && !/^[a-zA-Z0-9_.-]+$/.test(key)) {
      return jsonResponse({ error: `유효하지 않은 key입니다: ${key}` });
    }
    try {
      const result = await wsServer.getNodeData(nodeId, { key }, pluginId);
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async sigma_delete_node_data(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId } = access;

    const nodeId = args.nodeId as string;
    const key = args.key as string;
    if (!nodeId) return jsonResponse({ error: 'nodeId 가 필요합니다' });
    if (!key || !/^[a-zA-Z0-9_.-]+$/.test(key)) {
      return jsonResponse({ error: `유효하지 않은 key입니다: ${key}` });
    }
    try {
      await wsServer.setNodeData(nodeId, key, '', pluginId);  // 빈 값 = 키 삭제
      return jsonResponse({ success: true, deleted: key, nodeId });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async sigma_screenshot(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    const screenshotNodeId = args.nodeId as string;
    const screenshotFormat = (args.format as 'PNG' | 'SVG' | 'JPG' | 'PDF') || 'PNG';
    const userScale = (args.scale as number) || 2;
    const mode = (args.mode as ScreenshotMode) || 'auto';

    // thumbnail 모드: 플러그인에서 scale 절반으로 받아 전송량 절감
    const isThumbnail = mode === 'thumbnail';
    const screenshotScale = isThumbnail ? userScale * 0.5 : userScale;

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

      // 옵션 파싱
      const crop = args.crop as { x: number; y: number; width: number; height: number } | undefined;
      const manualResize = args.manualResize as string | undefined;
      const tileSize = args.tileSize as { width: number; height: number } | undefined;

      // SVG/PDF는 이미지 처리 불가 → 바이패스
      if (screenshotFormat === 'SVG' || screenshotFormat === 'PDF') {
        const filePath = await storage.saveScreenshot(exportResult.base64, filename);
        return jsonResponse({
          success: true,
          filePath,
          filename,
          nodeId: exportResult.nodeId,
          nodeName: exportResult.nodeName,
          original: { width: exportResult.width * screenshotScale, height: exportResult.height * screenshotScale },
          final: { width: exportResult.width * screenshotScale, height: exportResult.height * screenshotScale },
          format: screenshotFormat,
          mode: 'none',
          resizeApplied: false,
          resizeScale: 1,
          estimatedTokens: 0,
          withinTokenLimit: true,
        });
      }

      // 이미지 처리 파이프라인: Crop → mode별 처리 → Save
      const inputBuffer = Buffer.from(exportResult.base64, 'base64');
      const processResult = await processImage(inputBuffer, screenshotFormat, {
        crop,
        mode,
        manualResize,
        tileSize,
        thumbnailPreScaled: isThumbnail,
      });

      if (processResult.type === 'tiled') {
        const tiles = await saveTiledScreenshots(processResult, filename, screenshotFormat);
        return jsonResponse({
          success: true,
          nodeId: exportResult.nodeId,
          nodeName: exportResult.nodeName,
          format: screenshotFormat,
          mode: processResult.mode,
          original: processResult.original,
          ...(processResult.cropped ? { cropped: processResult.cropped } : {}),
          final: processResult.final,
          resizeApplied: processResult.resizeApplied,
          resizeScale: processResult.resizeScale,
          tileSize: processResult.tileSize,
          grid: processResult.grid,
          tiles,
          totalTiles: tiles.length,
        });
      }

      // 단일 이미지
      const saved = await saveSingleScreenshot(processResult, filename);
      return jsonResponse({
        success: true,
        filePath: saved.filePath,
        filename: saved.filename,
        nodeId: exportResult.nodeId,
        nodeName: exportResult.nodeName,
        format: screenshotFormat,
        mode: processResult.mode,
        original: processResult.original,
        ...(processResult.cropped ? { cropped: processResult.cropped } : {}),
        final: processResult.final,
        resizeApplied: processResult.resizeApplied,
        resizeScale: processResult.resizeScale,
        ...(processResult.resizeIterations ? { resizeIterations: processResult.resizeIterations } : {}),
        estimatedTokens: processResult.estimatedTokens,
        withinTokenLimit: processResult.withinTokenLimit,
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

  async sigma_create_annotation_layer(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const sectionId = args.sectionId as string;
    const name = (args.name as string) || '📝 기획 주석';
    if (!sectionId) return jsonResponse({ error: 'sectionId 가 필요합니다' });

    try {
      const info = await wsServer.command('GET_NODE_INFO', { nodeId: sectionId }, { pluginId }) as { type?: string; width?: number; height?: number };
      if (info?.type !== 'SECTION') {
        return jsonResponse({
          error: `sectionId(${sectionId}) 가 SECTION 이 아닙니다 (type: ${info?.type ?? 'unknown'}). 기획 레이어는 섹션의 직속 자식이어야 합니다.`,
        });
      }
      const width = typeof info.width === 'number' && info.width > 0 ? info.width : 800;
      const height = typeof info.height === 'number' && info.height > 0 ? info.height : 600;

      const frameRes = await wsServer.command('CREATE_EMPTY_FRAME', {
        pageId, parentId: sectionId, x: 0, y: 0, width, height, name,
        fillColor: { r: 1, g: 1, b: 1, a: 0 }, layoutMode: 'NONE',
      } as any, { pluginId }) as { nodeId?: string };
      const frameId = frameRes?.nodeId;
      if (!frameId) return jsonResponse({ error: '기획 레이어 프레임 생성 실패', detail: frameRes });

      // 클리핑 해제(주석이 프레임 경계를 넘어도 보이게) + pluginData(role) 태깅.
      await wsServer.modifyNode(frameId, 'setClipsContent', { clips: false }, pluginId);
      await wsServer.setNodeData(frameId, 'role', JSON.stringify('annotation-layer'), pluginId);

      return jsonResponse({
        success: true,
        message: `기획 레이어 '${name}' 생성 — 섹션 ${sectionId} 덮음, pluginData role=annotation-layer 태깅`,
        nodeId: frameId, sectionId, name, width, height,
        hint: 'anno/wire 주석 인스턴스를 이 레이어의 자식으로 넣으세요. lint 에서 annotation_layer 규칙(페이지 config, opt-in)을 켜면 이 레이어는 겹침/여백/오버플로우에서 자동 면제되고, 섹션마다 레이어 존재가 강제됩니다. (이름이 아니라 pluginData 로 판정하므로 이름은 자유)',
      });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_RECTANGLE', {
        pageId,
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
      }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_TEXT', {
        pageId,
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
      }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const frameArgs: Record<string, unknown> = {
        x: args.x, y: args.y, width: args.width, height: args.height,
        pageId,
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
      const result = await wsServer.command('CREATE_EMPTY_FRAME', frameArgs as any, { pluginId });
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
      const result = await wsServer.command('GET_VIEWPORT', {}, { pluginId });
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
      const result = await wsServer.command('SET_VIEWPORT', {
        center: args.center as { x: number; y: number } | undefined,
        zoom: args.zoom as number | undefined,
        nodeIds: args.nodeIds as string[] | undefined,
      }, { pluginId });
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
      const result = await wsServer.command('CREATE_PAGE', { name: args.name as string | undefined }, { pluginId });
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
      const result = await wsServer.command('RENAME_PAGE', { pageId: args.pageId as string, name: args.name as string }, { pluginId });
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
      const result = await wsServer.command('SWITCH_PAGE', { pageId: args.pageId as string }, { pluginId });
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
      const result = await wsServer.command('DELETE_PAGE', { pageId: args.pageId as string }, { pluginId });
      return jsonResponse({ success: true, message: '페이지가 삭제되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_reorder_page(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('REORDER_PAGE', { pageId: args.pageId as string, index: args.index as number }, { pluginId });
      return jsonResponse({ success: true, message: '페이지 순서가 변경되었습니다', ...result as object });
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
      const result = await wsServer.command('GROUP_NODES', { nodeIds: args.nodeIds as string[], name: args.name as string | undefined }, { pluginId });
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
      const result = await wsServer.command('UNGROUP_NODES', { nodeId: args.nodeId as string }, { pluginId });
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
      const result = await wsServer.command('FLATTEN_NODES', { nodeIds: args.nodeIds as string[], name: args.name as string | undefined }, { pluginId });
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
      const result = await wsServer.command('BOOLEAN_OPERATION', { nodeIds: args.nodeIds as string[], operation: args.operation as string, name: args.name as string | undefined }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_ELLIPSE', {
        pageId,
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
      }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_POLYGON', {
        pageId,
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
      }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_STAR', {
        pageId,
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
      }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_LINE', {
        pageId,
        x: args.x as number,
        y: args.y as number,
        length: args.length as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
        rotation: args.rotation as number | undefined,
      }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_VECTOR', {
        pageId,
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
      }, { pluginId });
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
      const result = await wsServer.command('CREATE_VARIABLE_COLLECTION', {
        name: args.name as string,
      }, { pluginId });
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
      const result = await wsServer.command('CREATE_VARIABLE', {
        name: args.name as string,
        collectionId: args.collectionId as string,
        resolvedType: args.resolvedType as string,
      }, { pluginId });
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
      const result = await wsServer.command('GET_VARIABLES', {
        variableType: args.type as string | undefined,
      }, { pluginId });
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
      const result = await wsServer.command('SET_VARIABLE_VALUE', {
        variableId: args.variableId as string,
        modeId: args.modeId as string,
        value: args.value,
      }, { pluginId });
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
      const result = await wsServer.command('BIND_VARIABLE', {
        nodeId: args.nodeId as string,
        field: args.field as string,
        variableId: args.variableId as string,
      }, { pluginId });
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
      const result = await wsServer.command('ADD_VARIABLE_MODE', {
        collectionId: args.collectionId as string,
        name: args.name as string,
      }, { pluginId });
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
      const result = await wsServer.command('CREATE_PAINT_STYLE', {
        name: args.name as string,
        paints: args.paints as any[],
        description: args.description as string | undefined,
      }, { pluginId });
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
      const result = await wsServer.command('CREATE_TEXT_STYLE', {
        name: args.name as string,
        fontSize: args.fontSize as number | undefined,
        fontFamily: args.fontFamily as string | undefined,
        fontWeight: args.fontWeight as string | undefined,
        lineHeight: args.lineHeight as any,
        letterSpacing: args.letterSpacing as any,
        textCase: args.textCase as string | undefined,
        textDecoration: args.textDecoration as string | undefined,
        description: args.description as string | undefined,
      }, { pluginId });
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
      const result = await wsServer.command('CREATE_EFFECT_STYLE', {
        name: args.name as string,
        effects: args.effects as any[],
        description: args.description as string | undefined,
      }, { pluginId });
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
      const result = await wsServer.command('CREATE_GRID_STYLE', {
        name: args.name as string,
        grids: args.grids as any[],
        description: args.description as string | undefined,
      }, { pluginId });
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
      const result = await wsServer.command('APPLY_STYLE', {
        nodeId: args.nodeId as string,
        styleType: args.styleType as string,
        styleId: args.styleId as string,
      }, { pluginId });
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
      const result = await wsServer.command('DELETE_STYLE', {
        styleId: args.styleId as string,
      }, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_IMAGE_NODE', {
        pageId,
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        imageData: args.imageData as string,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
        scaleMode: args.scaleMode as string | undefined,
        cornerRadius: args.cornerRadius as number | undefined,
      }, { pluginId });
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
      const result = await wsServer.command('GET_SELECTION', {}, { pluginId });
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
      const result = await wsServer.command('SET_SELECTION', { nodeIds: args.nodeIds as string[], zoomToFit: args.zoomToFit as boolean | undefined }, { pluginId });
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
      const result = await wsServer.command('GET_LOCAL_COMPONENTS', {}, { pluginId });
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

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_COMPONENT_INSTANCE', { componentKey: args.componentKey as string, x: args.x as number, y: args.y as number, parentId: args.parentId as string | undefined, pageId }, { pluginId });
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
      const result = await wsServer.command('GET_INSTANCE_OVERRIDES', { nodeId: args.nodeId as string | undefined }, { pluginId });
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
      const result = await wsServer.command('SET_INSTANCE_OVERRIDES', { nodeId: args.nodeId as string, overrides: args.overrides as Record<string, unknown> }, { pluginId });
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
      const result = await wsServer.command('GET_NODE_INFO', { nodeId: args.nodeId as string }, { pluginId });
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
      const result = await wsServer.command('GET_DOCUMENT_INFO', {}, { pluginId });
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
      const result = await wsServer.command('GET_STYLES', {}, { pluginId });
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
      const result = await wsServer.command('SCAN_TEXT_NODES', { nodeId: args.nodeId as string }, { pluginId });
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
      const result = await wsServer.command('SCAN_NODES_BY_TYPES', { nodeId: args.nodeId as string, types: args.types as string[] }, { pluginId });
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
      const result = await wsServer.command('BATCH_DELETE', { nodeIds: args.nodeIds as string[] }, { pluginId });
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
      const result = await wsServer.command('GET_NODES_INFO', { nodeIds: args.nodeIds as string[] }, { pluginId });
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_get_selection_details(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('READ_MY_DESIGN', {}, { pluginId });
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
      const result = await wsServer.command('SET_MULTIPLE_ANNOTATIONS', { items: args.items as Array<{ nodeId: string; label: string; labelType?: string }> }, { pluginId });
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
      const result = await wsServer.command('GET_ANNOTATIONS', { nodeId: args.nodeId as string | undefined }, { pluginId });
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
      const result = await wsServer.command('SET_ANNOTATION', { nodeId: args.nodeId as string, label: args.label as string, labelType: args.labelType as string | undefined }, { pluginId });
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
      const result = await wsServer.command('GET_REACTIONS', { nodeId: args.nodeId as string | undefined }, { pluginId });
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
      const result = await wsServer.command('ADD_REACTION', {
        nodeId: args.nodeId as string,
        trigger: args.trigger as string,
        action: args.action as string,
        destinationId: args.destinationId as string | undefined,
        url: args.url as string | undefined,
        transition: args.transition as { type: string; duration?: number; direction?: string } | undefined,
        preserveScrollPosition: args.preserveScrollPosition as boolean | undefined,
      }, { pluginId });
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_delete_reactions(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('REMOVE_REACTIONS', { nodeId: args.nodeId as string, triggerType: args.triggerType as string | undefined }, { pluginId });
      return jsonResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_hyperlink(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    const links = args.links as Array<{ a: string; b: string }> | undefined;
    if (!Array.isArray(links) || links.length === 0) {
      return jsonResponse({ error: 'links 배열이 필요합니다 (최소 1쌍)' });
    }
    const invalid = links.findIndex((l) => !l || typeof l.a !== 'string' || typeof l.b !== 'string');
    if (invalid !== -1) {
      return jsonResponse({ error: `links[${invalid}] 에 a/b 노드 ID 가 없습니다` });
    }

    try {
      const result = await wsServer.command('SET_HYPERLINK', {
          links,
          direction: args.direction as string | undefined,
          slot: args.slot as string | undefined,
          remove: args.remove as boolean | undefined,
        }, { pluginId });
      return jsonResponse({
        success: true,
        ...(result as Record<string, unknown>),
        hint: '이 링크는 프로토타입 재생 모드가 아니라 편집 캔버스에서 바로 클릭되며, 클릭하면 뷰가 대상 노드로 이동합니다. 배선 확인은 응답의 aTextId/bTextId 를 sigma_get_node_info 로 조회(TEXT 노드는 hyperlinks 필드를 반환)하세요.',
      });
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
        {
          parentId: cloneParentId, position: clonePosition, name: cloneName,
          includeChildIdMap: args.includeChildIdMap as boolean | undefined,
          includeNames: args.includeNames as boolean | undefined,
          childIdMapLimit: args.childIdMapLimit as number | undefined,
          rewireInternalLinks: args.rewireInternalLinks as boolean | undefined,
        },
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

  // === Group B: Component System ===

  async sigma_create_component(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_COMPONENT', {
        pageId,
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
      }, { pluginId });
      return jsonResponse({ success: true, message: '컴포넌트가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_convert_to_component(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('CONVERT_TO_COMPONENT', { nodeId: args.nodeId as string }, { pluginId });
      return jsonResponse({ success: true, message: '노드가 컴포넌트로 변환되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_component_set(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_COMPONENT_SET', { componentIds: args.componentIds as string[], name: args.name as string | undefined, pageId }, { pluginId });
      return jsonResponse({ success: true, message: '컴포넌트 세트가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_add_component_property(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('ADD_COMPONENT_PROPERTY', {
        nodeId: args.nodeId as string,
        propertyName: args.propertyName as string,
        propertyType: args.propertyType as string,
        defaultValue: args.defaultValue,
      }, { pluginId });
      return jsonResponse({ success: true, message: '컴포넌트 속성이 추가되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_edit_component_property(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('EDIT_COMPONENT_PROPERTY', {
        nodeId: args.nodeId as string,
        propertyName: args.propertyName as string,
        newValues: args.newValues as Record<string, unknown>,
      }, { pluginId });
      return jsonResponse({ success: true, message: '컴포넌트 속성이 수정되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_delete_component_property(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('DELETE_COMPONENT_PROPERTY', {
        nodeId: args.nodeId as string,
        propertyName: args.propertyName as string,
      }, { pluginId });
      return jsonResponse({ success: true, message: '컴포넌트 속성이 삭제되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_get_component_properties(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('GET_COMPONENT_PROPERTIES', { nodeId: args.nodeId as string }, { pluginId });
      return jsonResponse({ success: true, message: '컴포넌트 속성을 조회했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_detach_instance(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('DETACH_INSTANCE', { nodeId: args.nodeId as string }, { pluginId });
      return jsonResponse({ success: true, message: '인스턴스가 분리되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_swap_component(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    // 컴포넌트 스펙은 어디서나 (namespace, alias) 로 가리킨다 — 등록·인스턴스 생성·삭제가 전부 그렇다.
    // 여기만 raw key 를 요구하면 "상태 교체"라는 가장 흔한 쓰임에서 상세 조회를 한 번 더 돌아야 하고,
    // 그걸 모르면 "인스턴스를 새로 만들고 옛 것을 지우는" 우회로 새어 나간다(자식 순서·pluginData 손실).
    const alias = args.alias as string | undefined;
    let newComponentKey = args.newComponentKey as string | undefined;
    if (alias) {
      const { record, error } = await resolveSpec(alias, args.namespace as string | undefined);
      if (error) return error;
      newComponentKey = (record as ComponentSpecRecord).componentKey;
    }
    if (!newComponentKey) {
      return jsonResponse({
        error: 'newComponentKey 또는 alias 중 하나가 필요합니다 — 등록된 컴포넌트 스펙이면 alias(+namespace)를 주세요.',
      });
    }

    const { pluginId } = access;
    try {
      const result = await wsServer.command('SWAP_COMPONENT', { nodeId: args.nodeId as string, newComponentKey }, { pluginId });
      return jsonResponse({ success: true, message: '컴포넌트가 교체되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Group C: Creation & Query ===

  async sigma_create_node_from_svg(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_NODE_FROM_SVG', {
        pageId,
        svgString: args.svgString as string,
        x: args.x as number,
        y: args.y as number,
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
      }, { pluginId });
      return jsonResponse({ success: true, message: 'SVG 노드가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_list_fonts(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('LIST_FONTS', {}, { pluginId });
      return jsonResponse({ success: true, message: '사용 가능한 폰트 목록을 조회했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_get_css(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('GET_CSS', { nodeId: args.nodeId as string }, { pluginId });
      return jsonResponse({ success: true, message: '노드의 CSS를 조회했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Group D: Variable Advanced ===

  async sigma_set_variable_scopes(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('SET_VARIABLE_SCOPES', {
        variableId: args.variableId as string,
        scopes: args.scopes as string[],
      }, { pluginId });
      return jsonResponse({ success: true, message: '변수 스코프가 설정되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_variable_alias(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('SET_VARIABLE_ALIAS', {
        variableId: args.variableId as string,
        modeId: args.modeId as string,
        aliasTargetId: args.aliasTargetId as string,
      }, { pluginId });
      return jsonResponse({ success: true, message: '변수 alias가 설정되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_variable_code_syntax(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('SET_VARIABLE_CODE_SYNTAX', {
        variableId: args.variableId as string,
        platform: args.platform as string,
        syntax: args.syntax as string,
      }, { pluginId });
      return jsonResponse({ success: true, message: '변수 코드 구문이 설정되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_rename_variable(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('RENAME_VARIABLE', {
        variableId: args.variableId as string,
        name: args.name as string,
      }, { pluginId });
      return jsonResponse({ success: true, message: '변수 이름이 변경되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_delete_variable(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('DELETE_VARIABLE', {
        variableId: args.variableId as string,
      }, { pluginId });
      return jsonResponse({ success: true, message: '변수가 삭제되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Group E: Team Library ===

  async sigma_list_libraries(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('GET_LIBRARIES', {}, { pluginId, timeoutMs: 30000 });
      return jsonResponse({ success: true, message: '사용 가능한 라이브러리 목록을 조회했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_list_library_components(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('GET_LIBRARY_COMPONENTS', { libraryKey: args.libraryKey as string }, { pluginId, timeoutMs: 30000 });
      return jsonResponse({ success: true, message: '라이브러리 컴포넌트를 조회했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_list_library_variables(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('GET_LIBRARY_VARIABLES', { collectionKey: args.collectionKey as string }, { pluginId, timeoutMs: 30000 });
      return jsonResponse({ success: true, message: '라이브러리 변수를 조회했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_import_library_component(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('IMPORT_LIBRARY_COMPONENT', { key: args.key as string }, { pluginId });
      return jsonResponse({ success: true, message: '라이브러리 컴포넌트를 가져왔습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_import_library_style(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('IMPORT_LIBRARY_STYLE', { key: args.key as string }, { pluginId });
      return jsonResponse({ success: true, message: '라이브러리 스타일을 가져왔습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Group F: Utilities ===

  async sigma_notify(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('NOTIFY', { message: args.message as string, options: args.options as Record<string, unknown> | undefined }, { pluginId });
      return jsonResponse({ success: true, message: '알림을 전송했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_commit_undo(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('COMMIT_UNDO', {}, { pluginId });
      return jsonResponse({ success: true, message: 'Undo 스택에 커밋했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_trigger_undo(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('TRIGGER_UNDO', {}, { pluginId });
      return jsonResponse({ success: true, message: 'Undo를 실행했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_save_version(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('SAVE_VERSION', { title: args.title as string, description: args.description as string | undefined }, { pluginId, timeoutMs: 30000 });
      return jsonResponse({ success: true, message: '버전을 저장했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_set_export_settings(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('SET_EXPORT_SETTINGS', { nodeId: args.nodeId as string, settings: args.settings as unknown[] }, { pluginId });
      return jsonResponse({ success: true, message: 'Export 설정을 적용했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_get_export_settings(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId } = access;
    try {
      const result = await wsServer.command('GET_EXPORT_SETTINGS', { nodeId: args.nodeId as string }, { pluginId });
      return jsonResponse({ success: true, message: 'Export 설정을 조회했습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  // === Group G: FigJam ===

  async sigma_create_sticky(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_STICKY', {
        pageId,
        text: args.text as string,
        x: args.x as number,
        y: args.y as number,
        parentId: args.parentId as string | undefined,
      }, { pluginId });
      return jsonResponse({ success: true, message: 'Sticky 노트가 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_create_connector(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.command('CREATE_CONNECTOR', {
        pageId,
        startNodeId: args.startNodeId as string,
        endNodeId: args.endNodeId as string,
        strokeColor: args.strokeColor as any,
        strokeWeight: args.strokeWeight as number | undefined,
      }, { pluginId });
      return jsonResponse({ success: true, message: '연결선이 생성되었습니다', ...result as object });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },
};
