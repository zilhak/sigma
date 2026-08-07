import {
  validateComponentSpecHtml,
  isValidSpecName,
  checkSpecNamingPolicy,
  type ComponentSpecRecord,
} from '@sigma/shared';
import { jsonResponse, validateFigmaAccess, type ToolContext, type ToolResult } from '../helpers.js';
import { readStoredConfig } from '../../lint/resolve-config.js';
import { resolveSpec } from '../spec-resolve.js';
import {
  saveComponentSpec,
  getComponentSpec,
  listComponentSpecs,
  deleteComponentSpec,
  DEFAULT_NAMESPACE,
} from '../../storage/component-specs.js';
import { SPEC_PRESETS, SPEC_PRESET_NAMES } from '../spec-presets.js';

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

/**
 * 이 Figma 파일(문서)에 저장된 등록 정책으로 alias 를 검사해 경고 문구를 만든다.
 * 저장소는 lint config 와 같다 — sigma_set_page_data({ pageId:"document", key:"lint" }) 의 `componentSpec`.
 * 조회/파싱에 실패하면 경고 없이 진행한다(정책 조회 실패가 등록을 막지 않는다).
 */
async function collectSpecPolicyWarnings(
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
  target: { alias: string; namespace: string; html?: string; description?: string },
): Promise<string[]> {
  const stored = await readStoredConfig(wsServer, 'document', pluginId);
  if (!stored.config) return [];
  return checkSpecNamingPolicy(stored.config.componentSpec, target);
}

export const componentSpecHandlers: Record<
  string,
  (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
> = {
  async sigma_create_component_spec(args, context) {
    const { wsServer } = context;
    const validateOnly = args.validateOnly as boolean | undefined;

    const alias = args.alias as string;
    const namespace = (args.namespace as string | undefined) || DEFAULT_NAMESPACE;
    const description = args.description as string;

    // htmlPath: 스펙 HTML을 파일에서 읽는다. base64 data URI 이미지처럼 수십 KB짜리
    // 본문을 호출 인자로 옮겨 적으면 중간에 깨져도 등록은 통과하고 렌더만 실패한다
    // (createImage 예외 → 회색 플레이스홀더). 파일 경로로 받으면 그 전사 자체가 없어진다.
    let html = args.html as string | undefined;
    const htmlPath = args.htmlPath as string | undefined;
    if (htmlPath) {
      if (html) {
        return jsonResponse({ error: 'html과 htmlPath는 함께 쓸 수 없습니다 — 하나만 지정하세요' });
      }
      try {
        const { readFile } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        html = await readFile(resolve(htmlPath), 'utf-8');
      } catch (e) {
        return jsonResponse({
          error: `htmlPath를 읽지 못했습니다: ${htmlPath} (${e instanceof Error ? e.message : String(e)}). 서버가 컨테이너로 뜬 경우 컨테이너 경로여야 합니다 — 호스트 ~/.sigma 는 /root/.sigma 로 마운트됩니다`,
        });
      }
    }

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
      return jsonResponse({ error: 'html은 필수입니다 (또는 htmlPath로 파일에서 읽기)' });
    }

    // validateOnly: Figma 연결·토큰 없이 규칙 검증만 (사전 점검용 dry-run)
    if (validateOnly) {
      const dryRun = validateComponentSpecHtml(html);
      return jsonResponse({
        validateOnly: true,
        ok: dryRun.ok,
        ...(dryRun.warnings?.length ? { warnings: dryRun.warnings } : {}),
        ...(dryRun.ok
          ? { message: '스펙이 규칙을 통과했습니다 — validateOnly를 빼고 호출하면 등록됩니다', params: dryRun.params, sizing: dryRun.sizing }
          : { error: '스펙 HTML이 규칙을 위반했습니다', violations: dryRun.errors }),
      });
    }

    if (!args.token) {
      return jsonResponse({ error: '토큰이 필요합니다 — sigma_login으로 발급 후 sigma_bind로 바인딩하세요 (등록 없이 검증만 하려면 validateOnly: true)' });
    }
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

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
      const result = (await wsServer.command('BUILD_COMPONENT_FROM_SPEC', {
          html,
          alias,
          namespace,
          params: validation.params,
          position: args.position as { x: number; y: number } | undefined,
          pageId,
          // overwrite: 기존 노드 in-place 갱신 → 인스턴스 전파 (노드 소실 시 플러그인이 신규 빌드 폴백)
          existingNodeId: existing ? existing.componentNodeId : undefined,
        }, { pluginId })) as {
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

      // 파일 등록 정책(문서 저장 config.componentSpec) — 경고만, 등록은 이미 완료된 상태다.
      const policyWarnings = await collectSpecPolicyWarnings(wsServer, pluginId, {
        alias, namespace, html, description: description.trim(),
      });

      return jsonResponse({
        success: true,
        // 박스모델 경고 — 등록은 됐지만 이대로 두면 인스턴스마다 child_overflow 가 난다.
        ...(validation.warnings?.length ? { warnings: validation.warnings } : {}),
        ...(policyWarnings.length ? { policyWarnings } : {}),
        message: result.updated
          ? `컴포넌트 "${namespace}/${alias}"가 in-place 갱신되었습니다 — 기존 인스턴스에 반영됩니다`
          : `컴포넌트 "${namespace}/${alias}"가 등록되었습니다`,
        alias,
        namespace,
        params: validation.params,
        sizing: validation.sizing,
        ...result,
        // 응답에 `key` 로만 있어 sigma_swap_component(newComponentKey) 를 부르려면 목록을
        // 다시 조회해야 했다. 같은 값을 그 인자 이름으로도 실어 준다.
        componentKey: result.key,
        hint: `sigma_create_component_spec_instance(alias: "${alias}", props: {...})로 삽입하세요. 상태 교체는 sigma_swap_component(newComponentKey: "${result.key}"). 미리보기: sigma_screenshot(nodeId: "${result.nodeId}")`,
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
    // 빈 카탈로그 = 처음 쓰는 에이전트일 가능성 → 스펙 작성 규칙 요약을 함께 안내
    const bootstrapRules = records.length === 0
      ? {
          specRules: [
            '단일 루트 + inline style만 (<style>·class 불가)',
            '컨테이너는 div/button만, 자식이 있으면 display: flex 명시 필수',
            '텍스트 태그(span/p/h1~h6/a/strong/em/b/i)는 leaf 전용, img/br은 void',
            '길이는 px만(0만 단위 생략), 색상은 단색만(gradient·var 불가)',
            'position·text-align 불가 — 배치·정렬은 flex 속성(justify-content/align-items)으로',
            '텍스트 파라미터: <span data-sigma-slot="이름" data-sigma-desc="설명">기본값</span> (텍스트 태그에만, 루트 불가)',
            '고정폭 직계 부모 안의 slot에 text-overflow: ellipsis → 긴 값 …처리',
            '사전 점검: sigma_create_component_spec에 validateOnly: true (Figma 연결 불필요)',
          ],
        }
      : {};
    return jsonResponse({
      count: records.length,
      ...bootstrapRules,
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
      // 이 카탈로그는 토큰 절약형이라 html·componentKey·componentNodeId 를 뺀다. 어디에 있는지
      // 안 적어 두면 "그 값을 얻을 방법이 없다"고 오해한다(실제로 그렇게 오진한 적이 있다).
      hint: 'HTML 원문·componentKey·componentNodeId 는 alias 인자로 상세 조회 (componentNodeId를 sigma_screenshot으로 캡처 가능). 삽입은 sigma_create_component_spec_instance, 상태 교체는 sigma_swap_component(alias) — key 없이 alias 로 바로 된다',
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
      const result = await wsServer.command('USE_COMPONENT_SPEC', {
          componentNodeId: spec.componentNodeId,
          alias,
          props,
          position:
            typeof args.x === 'number' && typeof args.y === 'number'
              ? { x: args.x as number, y: args.y as number }
              : undefined,
          width: args.width as number | undefined,
          height: args.height as number | undefined,
          parentId: args.parentId as string | undefined,
          pageId,
          // 파일 스코프: 다른 파일에서 등록된 컴포넌트의 오사용 차단
          expectedFileId: spec.fileId,
          specFileName: spec.fileName,
        }, { pluginId });

      // 조용한 변형 감지: 고정폭 컴포넌트에서 긴 텍스트가 줄바꿈되면 높이가 급증한다
      // (영역 밖 침범이 아니라 플러그인의 넘침 경고에는 안 걸림)
      // 단, 호출자가 height를 명시했으면 의도된 크기이므로 검사하지 않는다
      const r = result as { height?: number; warnings?: string[] };
      const warnings = r.warnings ? [...r.warnings] : [];
      if (
        args.height === undefined &&
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

  async sigma_import_spec_preset(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const presetName = args.preset as string;
    const preset = SPEC_PRESETS[presetName];
    if (!preset) {
      return jsonResponse({
        error: `알 수 없는 프리셋: "${presetName}"`,
        available: SPEC_PRESET_NAMES,
      });
    }
    const overwrite = args.overwrite as boolean | undefined;

    const { pluginId, pageId } = access;
    const results: Array<Record<string, unknown>> = [];

    for (const item of preset.items) {
      const existing = await getComponentSpec(preset.namespace, item.alias);
      if (existing && !overwrite) {
        results.push({
          alias: item.alias,
          status: 'skipped',
          reason: '이미 등록됨 — 갱신하려면 overwrite: true',
        });
        continue;
      }

      const validation = validateComponentSpecHtml(item.html);
      if (!validation.ok) {
        // 유닛 테스트가 프리셋을 강제 검증하므로 정상 배포에선 도달 불가
        results.push({ alias: item.alias, status: 'failed', violations: validation.errors });
        continue;
      }

      try {
        const result = (await wsServer.command('BUILD_COMPONENT_FROM_SPEC', {
            html: item.html,
            alias: item.alias,
            params: validation.params,
            pageId,
            existingNodeId: existing ? existing.componentNodeId : undefined,
          }, { pluginId })) as {
          nodeId: string;
          key: string;
          width: number;
          height: number;
          updated: boolean;
          fileId: string;
          fileName: string;
        };

        const now = Date.now();
        const record: ComponentSpecRecord = {
          alias: item.alias,
          namespace: preset.namespace,
          description: item.description,
          html: item.html,
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

        results.push({
          alias: item.alias,
          nodeId: result.nodeId,
          status: result.updated ? 'updated' : 'created',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ alias: item.alias, status: 'failed', error: errorMessage });
      }
    }

    const failed = results.filter((r) => r.status === 'failed').length;
    return jsonResponse({
      success: failed === 0,
      preset: presetName,
      namespace: preset.namespace,
      summary: preset.summary,
      results,
      hint: `sigma_create_component_spec_instance(alias, namespace: "${preset.namespace}", props, ...)로 사용하세요. 카탈로그: sigma_list_component_specs(namespace: "${preset.namespace}")`,
    });
  },

  async sigma_set_component_spec_instance_props(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const nodeId = args.nodeId as string;
    const props = args.props as Record<string, string> | undefined;
    if (!nodeId) {
      return jsonResponse({ error: 'nodeId는 필수입니다' });
    }
    if (!props || Object.keys(props).length === 0) {
      return jsonResponse({ error: 'props는 필수입니다 — 재설정할 파라미터 값 매핑. 예: {text: "새 값"}' });
    }

    const { pluginId } = access;
    try {
      const result = await wsServer.command('SET_COMPONENT_SPEC_INSTANCE_PROPS', { nodeId, props }, { pluginId });
      return jsonResponse({ success: true, ...(result as object) });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return jsonResponse({ error: errorMessage });
    }
  },

  async sigma_delete_component_spec(args, context) {
    const alias = args.alias as string;
    if (!alias) {
      return jsonResponse({ error: 'alias는 필수입니다' });
    }
    const { record, error } = await resolveSpec(alias, args.namespace as string | undefined);
    if (error) return error;
    const spec = record as ComponentSpecRecord;

    // 마스터 노드까지 지운다. 레지스트리만 지우면 마스터가 마스터 페이지에 남아
    // "지웠는데 아직 보인다"가 되고, 두 번에 나눠 부르는 걸 잊기 쉽다.
    const deleteNode = args.deleteNode === true;
    let nodeDeleted: boolean | undefined;
    let nodeError: string | undefined;
    let nodeNote: string | undefined;
    if (deleteNode && spec.componentNodeId) {
      try {
        const res = await context.wsServer.deleteFrame(spec.componentNodeId);
        nodeDeleted = res.deleted;
        nodeNote = res.note;
      } catch (e) {
        nodeError = e instanceof Error ? e.message : String(e);
      }
    }

    await deleteComponentSpec(spec.namespace, spec.alias);
    return jsonResponse({
      success: true,
      componentNodeId: spec.componentNodeId,
      ...(deleteNode ? { nodeDeleted: nodeDeleted === true, ...(nodeError ? { nodeError } : {}), ...(nodeNote ? { nodeNote } : {}) } : {}),
      message: deleteNode
        ? (nodeDeleted
          ? `레지스트리와 Figma 마스터 노드(${spec.componentNodeId})를 모두 삭제했습니다: "${spec.namespace}/${spec.alias}"`
          : `레지스트리에서 "${spec.namespace}/${spec.alias}"를 삭제했지만 마스터 노드(${spec.componentNodeId}) 삭제는 실패했습니다${nodeError ? `: ${nodeError}` : ''} — sigma_batch_delete 로 직접 지우세요`)
        : `레지스트리에서 "${spec.namespace}/${spec.alias}"를 삭제했습니다. Figma의 컴포넌트 노드(${spec.componentNodeId})는 유지됩니다 — 함께 지우려면 deleteNode:true 를 주세요`,
    });
  },
};
