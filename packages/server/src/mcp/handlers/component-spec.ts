import {
  validateComponentSpecHtml,
  isValidSpecName,
  type ComponentSpecRecord,
} from '@sigma/shared';
import { jsonResponse, validateFigmaAccess, type ToolContext, type ToolResult } from '../helpers.js';
import {
  saveComponentSpec,
  getComponentSpec,
  listComponentSpecs,
  deleteComponentSpec,
} from '../../storage/component-specs.js';

/**
 * 컴포넌트 스펙 시스템 핸들러
 *
 * define: 스펙 HTML 검증 → 플러그인에서 컴포넌트 빌드 → 레지스트리 저장
 * list:   카탈로그(alias + 설명 + params) 노출, alias 지정 시 HTML 원문 포함 상세
 * use:    레지스트리 조회 → 플러그인에서 인스턴스 생성 + props 적용
 * delete: 레지스트리 항목 삭제 (Figma 노드는 기본 유지)
 */
export const componentSpecHandlers: Record<
  string,
  (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
> = {
  async sigma_define_component(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const alias = args.alias as string;
    const description = args.description as string;
    const html = args.html as string;

    if (!alias || !isValidSpecName(alias)) {
      return jsonResponse({ error: `잘못된 alias: "${alias}" (규칙: 소문자로 시작, [a-z0-9_]만 사용. 예: ui_badge)` });
    }
    if (!description || !description.trim()) {
      return jsonResponse({ error: 'description은 필수입니다 — 에이전트가 카탈로그에서 컴포넌트를 고르는 근거가 됩니다' });
    }
    if (!html) {
      return jsonResponse({ error: 'html은 필수입니다' });
    }

    // 중복 alias 확인
    const existing = await getComponentSpec(alias);
    if (existing && !(args.overwrite as boolean | undefined)) {
      return jsonResponse({
        error: `이미 등록된 alias입니다: "${alias}". 교체하려면 overwrite: true를 지정하세요`,
        existing: { alias: existing.alias, description: existing.description },
      });
    }

    // 스펙 HTML 검증 (화이트리스트 + slot 규칙) — 위반 시 전체 목록과 함께 거부
    const validation = validateComponentSpecHtml(html);
    if (!validation.ok) {
      return jsonResponse({
        error: '스펙 HTML이 규칙을 위반했습니다 — 등록이 거부되었습니다',
        violations: validation.errors,
      });
    }

    const { pluginId, pageId } = access;
    try {
      const result = (await wsServer.buildComponentFromSpec(
        {
          html,
          alias,
          params: validation.params,
          position: args.position as { x: number; y: number } | undefined,
          pageId,
        },
        pluginId
      )) as { nodeId: string; key: string; propertyIds: Record<string, string> };

      const now = Date.now();
      const record: ComponentSpecRecord = {
        alias,
        description: description.trim(),
        html,
        params: validation.params,
        componentNodeId: result.nodeId,
        componentKey: result.key,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      await saveComponentSpec(record);

      return jsonResponse({
        success: true,
        message: `컴포넌트 "${alias}"가 등록되었습니다`,
        alias,
        params: validation.params,
        ...result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_list_components(args, _context) {
    const alias = args.alias as string | undefined;

    // alias 지정 시: HTML 원문 포함 상세 (계층화 노출의 2단계)
    if (alias) {
      const record = await getComponentSpec(alias);
      if (!record) {
        return jsonResponse({ error: `등록되지 않은 alias: "${alias}"` });
      }
      return jsonResponse(record);
    }

    // 기본: 토큰 절약형 카탈로그 (alias + 설명 + param 이름/기본값만)
    const records = await listComponentSpecs();
    return jsonResponse({
      count: records.length,
      components: records.map((r) => ({
        alias: r.alias,
        description: r.description,
        params: r.params.map((p) => ({ name: p.name, type: p.type, defaultValue: p.defaultValue })),
      })),
      hint: '특정 컴포넌트의 HTML 원문은 alias 인자로 조회, 삽입은 sigma_use_component',
    });
  },

  async sigma_use_component(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const alias = args.alias as string;
    if (!alias) {
      return jsonResponse({ error: 'alias는 필수입니다' });
    }
    const record = await getComponentSpec(alias);
    if (!record) {
      const available = (await listComponentSpecs()).map((r) => r.alias);
      return jsonResponse({
        error: `등록되지 않은 alias: "${alias}"`,
        available,
      });
    }

    // props 사전 검증 (플러그인 왕복 전에 빠른 거부)
    const props = (args.props ? args.props : {}) as Record<string, string>;
    const validNames = new Set(record.params.map((p) => p.name));
    const unknown = Object.keys(props).filter((k) => !validNames.has(k));
    if (unknown.length > 0) {
      return jsonResponse({
        error: `알 수 없는 파라미터: ${unknown.join(', ')}`,
        params: record.params,
      });
    }

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.useComponentSpec(
        {
          componentNodeId: record.componentNodeId,
          alias,
          props,
          position:
            typeof args.x === 'number' && typeof args.y === 'number'
              ? { x: args.x as number, y: args.y as number }
              : undefined,
          parentId: args.parentId as string | undefined,
          pageId,
        },
        pluginId
      );
      return jsonResponse({ success: true, ...(result as object) });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_delete_component_spec(args, _context) {
    const alias = args.alias as string;
    if (!alias) {
      return jsonResponse({ error: 'alias는 필수입니다' });
    }
    const record = await getComponentSpec(alias);
    if (!record) {
      return jsonResponse({ error: `등록되지 않은 alias: "${alias}"` });
    }
    await deleteComponentSpec(alias);
    return jsonResponse({
      success: true,
      message: `레지스트리에서 "${alias}"를 삭제했습니다. Figma의 컴포넌트 노드(${record.componentNodeId})는 유지됩니다 — 삭제하려면 sigma_delete_frame을 사용하세요`,
    });
  },
};
