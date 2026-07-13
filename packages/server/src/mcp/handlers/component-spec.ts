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
  findComponentSpecsByAlias,
  deleteComponentSpec,
  DEFAULT_NAMESPACE,
} from '../../storage/component-specs.js';

/**
 * 컴포넌트 스펙 시스템 핸들러
 *
 * create_component_spec:          스펙 HTML 검증 → 플러그인 빌드(overwrite는 in-place 갱신) → 레지스트리 저장
 * list_component_specs:           카탈로그(alias/설명/params/size/sizing) 노출, alias 지정 시 HTML 원문 포함 상세
 * create_component_spec_instance: 레지스트리 조회 → 파일 스코프 검증 → 인스턴스 생성 + props 적용
 * delete_component_spec:          레지스트리 항목 삭제 (Figma 노드는 유지)
 *
 * 유일성 키는 (namespace, alias). namespace는 기획/디자인 등 스타일 체계 구분용.
 */

/** namespace(선택) + alias로 레코드 결정. 미지정 시 유일하면 그것, 모호하면 에러 */
async function resolveSpec(
  alias: string,
  namespace: string | undefined
): Promise<{ record?: ComponentSpecRecord; error?: ToolResult }> {
  if (namespace) {
    const record = await getComponentSpec(namespace, alias);
    if (!record) {
      const inNs = (await listComponentSpecs(namespace)).map((r) => r.alias);
      return {
        error: jsonResponse({
          error: `네임스페이스 "${namespace}"에 등록되지 않은 alias: "${alias}"`,
          availableInNamespace: inNs,
        }),
      };
    }
    return { record };
  }

  const matches = await findComponentSpecsByAlias(alias);
  if (matches.length === 0) {
    const available = (await listComponentSpecs()).map((r) => `${r.namespace}/${r.alias}`);
    return {
      error: jsonResponse({ error: `등록되지 않은 alias: "${alias}"`, available }),
    };
  }
  if (matches.length > 1) {
    return {
      error: jsonResponse({
        error: `alias "${alias}"가 여러 네임스페이스에 존재합니다 — namespace 인자로 지정하세요`,
        namespaces: matches.map((r) => r.namespace),
      }),
    };
  }
  return { record: matches[0] };
}

export const componentSpecHandlers: Record<
  string,
  (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
> = {
  async sigma_create_component_spec(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const alias = args.alias as string;
    const namespace = (args.namespace as string | undefined) || DEFAULT_NAMESPACE;
    const description = args.description as string;
    const html = args.html as string;

    if (!alias || !isValidSpecName(alias)) {
      return jsonResponse({ error: `잘못된 alias: "${alias}" (규칙: 소문자로 시작, [a-z0-9_]만 사용. 예: ui_badge)` });
    }
    if (!isValidSpecName(namespace)) {
      return jsonResponse({ error: `잘못된 namespace: "${namespace}" (규칙: 소문자로 시작, [a-z0-9_]만 사용. 예: plan, design)` });
    }
    if (!description || !description.trim()) {
      return jsonResponse({ error: 'description은 필수입니다 — 에이전트가 카탈로그에서 컴포넌트를 고르는 근거가 됩니다' });
    }
    if (!html) {
      return jsonResponse({ error: 'html은 필수입니다' });
    }

    // 중복 확인 (같은 namespace 내 alias)
    const existing = await getComponentSpec(namespace, alias);
    if (existing && !(args.overwrite as boolean | undefined)) {
      return jsonResponse({
        error: `이미 등록된 alias입니다: "${namespace}/${alias}". 교체하려면 overwrite: true를 지정하세요 (기존 컴포넌트가 in-place 갱신되어 인스턴스에 전파됩니다)`,
        existing: { namespace: existing.namespace, alias: existing.alias, description: existing.description },
      });
    }

    // 스펙 HTML 검증 (화이트리스트 + 값 규칙 + slot 규칙) — 위반 시 전체 목록과 함께 거부
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
          // overwrite: 기존 노드 in-place 갱신 → 인스턴스 전파 (노드 소실 시 플러그인이 신규 빌드 폴백)
          existingNodeId: existing ? existing.componentNodeId : undefined,
        },
        pluginId
      )) as {
        nodeId: string;
        key: string;
        width: number;
        height: number;
        propertyIds: Record<string, string>;
        updated: boolean;
        fileId: string;
        fileName: string;
      };

      const now = Date.now();
      const record: ComponentSpecRecord = {
        alias,
        namespace,
        description: description.trim(),
        html,
        params: validation.params,
        componentNodeId: result.nodeId,
        componentKey: result.key,
        size: { width: result.width, height: result.height },
        sizing: validation.sizing,
        fileId: result.fileId,
        fileName: result.fileName,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      await saveComponentSpec(record);

      return jsonResponse({
        success: true,
        message: result.updated
          ? `컴포넌트 "${namespace}/${alias}"가 in-place 갱신되었습니다 — 기존 인스턴스에 반영됩니다`
          : `컴포넌트 "${namespace}/${alias}"가 등록되었습니다`,
        alias,
        namespace,
        params: validation.params,
        sizing: validation.sizing,
        ...result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_list_component_specs(args, _context) {
    const alias = args.alias as string | undefined;
    const namespace = args.namespace as string | undefined;

    // alias 지정 시: HTML 원문 포함 상세 (계층화 노출의 2단계)
    if (alias) {
      const { record, error } = await resolveSpec(alias, namespace);
      if (error) return error;
      return jsonResponse(record);
    }

    // 기본: 토큰 절약형 카탈로그
    const records = await listComponentSpecs(namespace);
    return jsonResponse({
      count: records.length,
      components: records.map((r) => ({
        alias: r.alias,
        namespace: r.namespace,
        description: r.description,
        // size: 기본 상태 크기. sizing: hug 축은 내용에 따라 늘어남 / fixed 축은 고정
        size: r.size,
        sizing: r.sizing,
        fileName: r.fileName,
        params: r.params.map((p) => ({
          name: p.name,
          type: p.type,
          defaultValue: p.defaultValue,
          ...(p.description ? { description: p.description } : {}),
          // truncates: 긴 값도 …처리되어 안전
          ...(p.truncates ? { truncates: true } : {}),
        })),
      })),
      hint: 'HTML 원문·미리보기는 alias 인자로 상세 조회 (componentNodeId를 sigma_screenshot으로 캡처 가능), 삽입은 sigma_create_component_spec_instance',
    });
  },

  async sigma_create_component_spec_instance(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const alias = args.alias as string;
    if (!alias) {
      return jsonResponse({ error: 'alias는 필수입니다' });
    }
    const { record, error } = await resolveSpec(alias, args.namespace as string | undefined);
    if (error) return error;
    const spec = record as ComponentSpecRecord;

    // props 사전 검증 (플러그인 왕복 전에 빠른 거부)
    const props = (args.props ? args.props : {}) as Record<string, string>;
    const validNames = new Set(spec.params.map((p) => p.name));
    const unknown = Object.keys(props).filter((k) => !validNames.has(k));
    if (unknown.length > 0) {
      return jsonResponse({
        error: `알 수 없는 파라미터: ${unknown.join(', ')}`,
        params: spec.params,
      });
    }

    const { pluginId, pageId } = access;
    try {
      const result = await wsServer.useComponentSpec(
        {
          componentNodeId: spec.componentNodeId,
          alias,
          props,
          position:
            typeof args.x === 'number' && typeof args.y === 'number'
              ? { x: args.x as number, y: args.y as number }
              : undefined,
          parentId: args.parentId as string | undefined,
          pageId,
          // 파일 스코프: 다른 파일에서 등록된 컴포넌트의 오사용 차단
          expectedFileId: spec.fileId,
          specFileName: spec.fileName,
        },
        pluginId
      );

      // 조용한 변형 감지: 고정폭 컴포넌트에서 긴 텍스트가 줄바꿈되면 높이가 급증한다
      // (영역 밖 침범이 아니라 플러그인의 넘침 경고에는 안 걸림)
      const r = result as { height?: number; warnings?: string[] };
      const warnings = r.warnings ? [...r.warnings] : [];
      if (
        spec.sizing && spec.sizing.horizontal === 'fixed' && spec.size &&
        typeof r.height === 'number' && r.height > spec.size.height * 1.5
      ) {
        warnings.push(
          `인스턴스 높이가 기본 ${spec.size.height}px에서 ${r.height}px로 늘었습니다 — 긴 텍스트가 줄바꿈된 것으로 보입니다. 더 짧은 값을 쓰거나 스펙 slot에 text-overflow: ellipsis를 고려하세요`
        );
      }

      return jsonResponse({
        success: true,
        ...(result as object),
        ...(warnings.length > 0 ? { warnings } : {}),
      });
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
    const { record, error } = await resolveSpec(alias, args.namespace as string | undefined);
    if (error) return error;
    const spec = record as ComponentSpecRecord;

    await deleteComponentSpec(spec.namespace, spec.alias);
    return jsonResponse({
      success: true,
      message: `레지스트리에서 "${spec.namespace}/${spec.alias}"를 삭제했습니다. Figma의 컴포넌트 노드(${spec.componentNodeId})는 유지됩니다 — 삭제하려면 sigma_delete_frame을 사용하세요`,
    });
  },
};
