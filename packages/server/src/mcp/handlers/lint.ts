import {
  runBuiltinRules, collectFixableViolations, mergeFixesBySection, runMatchRule, isEnabled,
  fullyOccludedSiblingRule,
  type TreeNode, type Violation, type LintConfig, type LayoutFix,
} from '@sigma/shared';
import { validateFigmaAccess, jsonResponse, type ToolContext, type ToolResult } from '../helpers.js';
import { loadLintConfig, validateLintConfigShape, LintConfigError } from '../../lint/load-config.js';
import { buildLintNodes, collectNodeIds, type BuildLintNodesResult, type NodeInfoLike } from '../../lint/enrich.js';
import { runPredicateRule } from '../../lint/run-custom-rule.js';
import { resolvePageConfig, readStoredConfig, type ConfigMode } from '../../lint/resolve-config.js';
import { writeLintReport, type PageLintResult } from '../../lint/report.js';
import { filterSuppressed, collectSubjectNodeIds } from '../../lint/suppress.js';

/**
 * sigma_lint — 빌트인 규칙 카탈로그(기하 8종 + 구조/이름/가시성 6종 + occlusion 1종 + opt-in 5종) + config.custom
 * (JSON shorthand / JS predicate) 커스텀 규칙을 함께 실행한다.
 *
 * scope: 'page'(바인딩된 1페이지, 기본) | 'file'(전 페이지 순회)
 * configMode: 'uniform'(명시 config 하나, 기본) | 'per-page'(페이지 저장 config) | 'merge'(base+페이지 override)
 * config 출처: inline `config` 객체 > `configPath` 파일 > 문서 저장 'lint' (merge/per-page 의 base).
 * 파일 lint 결과는 md 리포트 파일로 떨구고 응답엔 요약+경로만 싣는다.
 */

/**
 * lint 트리 순회 노드 상한(기본값). get_tree 기본 limit(1000)은 인터랙티브 탐색용이라 큰 페이지에서 잘리는데,
 * lint 가 그 잘린 트리를 쓰면 뒤쪽 노드가 아예 검사되지 않고 "clean" 으로 오보한다(silent false-clean).
 * lint 는 완전성이 생명이라 훨씬 높은 기본 상한으로 뜬다(현실 Figma 페이지는 이 값에 안 걸림).
 * 상한 자체가 필요한 이유: 병적으로 큰 페이지에서 플러그인 직렬화·JSON parse·enrich 2차 왕복이
 * sendCommand 60초 월에 부딪혀 죽기 전에, "truncated: 부분검사"로 우아하게 끝내기 위함(안전밸브).
 * `treeNodeLimit` 인자로 호출별 override 가능(괴물 페이지에서 비용 감수하고 올리거나, 낮춰서 빠르게).
 * 이 상한에 실제로 걸리면 응답에 scanTruncated/scannedNodes/scanWarning 로 명시 노출하고 clean=false.
 */
const LINT_TREE_NODE_LIMIT = 200000;

/**
 * lint 트리 조회 타임아웃(기본, ms). getTree 기본 60초는 인터랙티브용인데, treeNodeLimit 을 크게 올려
 * 괴물 페이지를 통째로 뜨면 플러그인 직렬화가 60초를 넘겨 명령이 reject 될 수 있다(상한만 올리고
 * 타임아웃이 고정이면 반쪽). `treeTimeoutMs` 인자로 함께 올려 완주시킨다.
 */
const LINT_TREE_TIMEOUT_MS = 60000;

/** args.treeNodeLimit(양의 정수)로 override, 아니면 기본값. 0/음수/비정수는 무시하고 기본값. */
function resolveTreeLimit(args: Record<string, unknown>): number {
  const v = args.treeNodeLimit;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : LINT_TREE_NODE_LIMIT;
}

/** args.treeTimeoutMs(양의 정수 ms)로 override, 아니면 기본값. */
function resolveTreeTimeout(args: Record<string, unknown>): number {
  const v = args.treeTimeoutMs;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : LINT_TREE_TIMEOUT_MS;
}

function fixesToOps(fixes: LayoutFix[]): Array<{ nodeId: string; method: string; args: Record<string, unknown> }> {
  return fixes.flatMap((f) => [
    { nodeId: f.sectionId, method: 'resize', args: { width: f.width, height: f.height } },
    { nodeId: f.sectionId, method: 'move', args: { x: f.x, y: f.y } },
  ]);
}

function extractNodesInfo(raw: unknown): NodeInfoLike[] {
  if (Array.isArray(raw)) return raw as NodeInfoLike[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { nodes?: unknown }).nodes)) {
    return (raw as { nodes: NodeInfoLike[] }).nodes;
  }
  return [];
}

async function enrichIfNeeded(
  config: LintConfig,
  roots: TreeNode[],
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
): Promise<BuildLintNodesResult | null> {
  const needsCustom = (config.custom || []).length > 0;
  const needsOcclusion = isEnabled(config.builtins || {}, 'fully_occluded_sibling');
  if (!needsCustom && !needsOcclusion) return null;

  const nodeIds = collectNodeIds(roots);
  const nodesInfoRaw = await wsServer.getNodesInfo(nodeIds, pluginId);
  return buildLintNodes(roots, extractNodesInfo(nodesInfoRaw));
}

function runCustomRulesFromEnriched(config: LintConfig, enriched: BuildLintNodesResult): Promise<Violation[]> {
  const customRules = config.custom || [];
  return (async () => {
    const violations: Violation[] = [];
    for (const rule of customRules) {
      if (rule.kind === 'predicate') {
        violations.push(...await runPredicateRule({ rule, nodes: enriched.nodes, relations: enriched.relations }));
      } else {
        violations.push(...runMatchRule(rule, enriched.nodes));
      }
    }
    return violations;
  })();
}

/**
 * annotation_layer 규칙이 켜졌을 때, 기획 레이어로 태깅된 노드 id 집합을 수집한다.
 * 판정 = 노드 sharedPluginData("sigma","role") === "annotation-layer" (이름 아님).
 * 후보 = 모든 SECTION 의 직속 FRAME(레이어는 섹션 직속 프레임). 배치 1왕복으로 조회.
 * 규칙이 꺼져 있으면 조회 없이 빈 집합(비용 0).
 */
async function collectAnnotationLayerIds(
  builtins: LintConfig['builtins'],
  roots: TreeNode[],
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
): Promise<Set<string>> {
  const empty = new Set<string>();
  if (builtins?.annotation_layer?.enabled !== true) return empty;

  const candidates: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'SECTION') {
        for (const c of n.children ?? []) if (c.type === 'FRAME') candidates.push(c.id);
      }
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  if (candidates.length === 0) return empty;

  let data: Record<string, string> = {};
  try {
    const res = await wsServer.getNodesData(candidates, 'role', pluginId);
    data = res.data || {};
  } catch {
    return empty; // 조회 실패 시 면제·판정 없이 진행(안전 기본값)
  }
  const layerIds = new Set<string>();
  for (const [id, raw] of Object.entries(data)) {
    try {
      if (JSON.parse(raw) === 'annotation-layer') layerIds.add(id);
    } catch { /* JSON 아닌 값 무시 */ }
  }
  return layerIds;
}

/**
 * instance_default_name 규칙이 켜졌을 때, INSTANCE id → 마스터 컴포넌트 이름 맵을 만든다.
 * 마스터 이름은 TreeNode 에 없어 get_nodes_info(componentName)로 resolve 한다.
 * 후보 = 최상위(다른 INSTANCE 내부가 아닌) INSTANCE 노드. 배치 1왕복으로 조회.
 * 규칙이 꺼져 있으면 조회 없이 빈 맵(비용 0). 조회 실패 시에도 빈 맵(판정 없이 진행).
 */
async function collectInstanceComponentNames(
  builtins: LintConfig['builtins'],
  roots: TreeNode[],
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
): Promise<Map<string, string>> {
  const empty = new Map<string, string>();
  if (builtins?.instance_default_name?.enabled !== true) return empty;

  const candidates: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'INSTANCE') { candidates.push(n.id); continue; } // 중첩 인스턴스는 제외(엔진 규칙과 동일)
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  if (candidates.length === 0) return empty;

  let infos: NodeInfoLike[] = [];
  try {
    infos = extractNodesInfo(await wsServer.getNodesInfo(candidates, pluginId));
  } catch {
    return empty; // 조회 실패 시 판정 없이 진행(안전 기본값)
  }
  const map = new Map<string, string>();
  for (const info of infos) {
    if (!info.error && typeof info.componentName === 'string') map.set(info.nodeId, info.componentName);
  }
  return map;
}

/**
 * 한 트리(roots)에 config 를 적용해 위반 목록을 낸다(빌트인+occlusion+커스텀).
 * `isPageRoot` — roots 가 페이지 최상위인지(= nodeId/path 스코프가 아닌지). 페이지 절대좌표를
 * 전제하는 규칙(origin_anchor/content_spread)이 서브트리 검사에서 오탐하지 않도록 엔진에 넘긴다.
 * `scopeRoot` — nodeId/path 로 좁혔을 때의 시작 노드 자신(get_tree 의 rootNode). roots 는 이 노드의
 * 자식이므로, 넘겨야 자식이 "페이지 직속"으로 오인되지 않고(outside_section 오탐) 컨테이너 밖으로
 * 나갔는지도 판정된다(child_overflow). 구버전 플러그인이면 undefined 로 와서 페이지 전용 규칙만 꺼진다.
 */
async function runLintOnRoots(
  config: LintConfig,
  roots: TreeNode[],
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
  isPageRoot: boolean,
  scopeRoot?: TreeNode,
): Promise<Violation[]> {
  const enriched = await enrichIfNeeded(config, roots, wsServer, pluginId);
  const annotationLayerIds = await collectAnnotationLayerIds(config.builtins, roots, wsServer, pluginId);
  const instanceComponentNames = await collectInstanceComponentNames(config.builtins, roots, wsServer, pluginId);
  return [
    ...runBuiltinRules(roots, config.builtins || {}, { annotationLayerIds, instanceComponentNames, isPageRoot, scopeRoot }),
    ...(enriched && isEnabled(config.builtins || {}, 'fully_occluded_sibling')
      ? fullyOccludedSiblingRule(enriched.nodes, enriched.relations.children)
      : []),
    ...(enriched ? await runCustomRulesFromEnriched(config, enriched) : []),
  ];
}

/**
 * 노드 단위 inline suppress 적용 — 위반 주체 노드의 sigma "lint-ignore" 를 배치 조회해 억제.
 * 위반이 없으면 조회 자체를 건너뛴다(왕복 0).
 */
async function suppressViolations(
  violations: Violation[],
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
): Promise<{ violations: Violation[]; suppressedCount: number }> {
  if (violations.length === 0) return { violations, suppressedCount: 0 };
  const nodeIds = collectSubjectNodeIds(violations);
  if (nodeIds.length === 0) return { violations, suppressedCount: 0 };
  let ignoreMap: Record<string, string> = {};
  try {
    const res = await wsServer.getNodesData(nodeIds, 'lint-ignore', pluginId);
    ignoreMap = res.data || {};
  } catch {
    // 조회 실패 시 억제 없이 원본 유지(안전 기본값)
    return { violations, suppressedCount: 0 };
  }
  const { kept, suppressedCount } = filterSuppressed(violations, ignoreMap);
  return { violations: kept, suppressedCount };
}

/** base config 해석: inline > configPath > 문서 저장 'lint'. 없으면 null. */
async function resolveBaseConfig(
  args: Record<string, unknown>,
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
): Promise<{ config: LintConfig | null; label: string; error?: string }> {
  const inline = args.config;
  if (inline !== undefined) {
    try {
      return { config: validateLintConfigShape(inline, 'inline config'), label: 'inline' };
    } catch (error) {
      return { config: null, label: 'inline', error: error instanceof LintConfigError ? error.message : String(error) };
    }
  }
  const configPath = args.configPath as string | undefined;
  if (configPath) {
    try {
      return { config: await loadLintConfig(configPath), label: configPath };
    } catch (error) {
      return { config: null, label: configPath, error: error instanceof LintConfigError ? error.message : String(error) };
    }
  }
  // 문서 저장 base
  const docStored = await readStoredConfig(wsServer, 'document', pluginId);
  if (docStored.config) return { config: docStored.config, label: 'document-stored' };
  return { config: null, label: 'none', error: docStored.error };
}

export const lintHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_lint(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId, pageId } = access;

    const scope = (args.scope as string) === 'file' ? 'file' : 'page';
    const configMode = (['uniform', 'per-page', 'merge'].includes(args.configMode as string)
      ? args.configMode : 'uniform') as ConfigMode;

    const baseResolved = await resolveBaseConfig(args, wsServer, pluginId);
    // uniform 은 base 필수. per-page/merge 는 base 없어도 페이지 저장 config 로 동작 가능.
    if (configMode === 'uniform' && !baseResolved.config) {
      return jsonResponse({
        error: baseResolved.error
          ? `base config 를 로드할 수 없습니다: ${baseResolved.error}`
          : 'config 가 필요합니다 — inline `config` 객체, `configPath` 파일, 또는 문서 저장 lint config 중 하나.',
      });
    }
    const baseConfig = baseResolved.config;

    try {
      if (scope === 'file') {
        return await runFileLint(args, context, pluginId, configMode, baseConfig, baseResolved.label);
      }
      return await runPageLint(args, context, pluginId, pageId, configMode, baseConfig);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },
};

/** scope=page — 바인딩된 페이지 1개. apply(자동수정) 지원. */
async function runPageLint(
  args: Record<string, unknown>,
  context: ToolContext,
  pluginId: string | undefined,
  pageId: string | undefined,
  configMode: ConfigMode,
  baseConfig: LintConfig | null,
): Promise<ToolResult> {
  const { wsServer } = context;
  const nodeId = args.nodeId as string | undefined;
  const path = args.path as string | string[] | undefined;
  const apply = args.apply === true;

  const resolved = await resolvePageConfig(wsServer, pageId || 'document', configMode, baseConfig, pluginId);
  if (!resolved.config) {
    return jsonResponse({
      clean: true, scope: nodeId || path || '(page root)', configMode,
      skipped: 'no config', configSource: resolved.source,
      ...(resolved.error ? { configError: resolved.error } : {}),
      note: 'per-page 모드인데 이 페이지에 저장된 lint config 도 base 도 없어 건너뜁니다.',
    });
  }
  const config = resolved.config;
  const treeLimit = resolveTreeLimit(args);
  const treeTimeout = resolveTreeTimeout(args);

  // nodeId/path 로 좁히면 roots 가 부모 로컬좌표 서브트리 → 페이지 절대좌표 전제 규칙은 실행 안 함.
  const isPageRoot = !nodeId && !path;

  const tree = await wsServer.getTree({ nodeId, path, depth: 'full', pageId, limit: treeLimit, timeoutMs: treeTimeout }, pluginId);
  const roots = tree.children as TreeNode[];
  const scopeRoot = tree.rootNode as TreeNode | undefined;
  const rawViolations = await runLintOnRoots(config, roots, wsServer, pluginId, isPageRoot, scopeRoot);
  const { violations, suppressedCount } = await suppressViolations(rawViolations, wsServer, pluginId);

  const fixable = collectFixableViolations(violations);
  const merged = mergeFixesBySection(fixable);
  const ops = fixesToOps(merged);

  const base = {
    page: tree.pageName,
    scope: nodeId || path || '(page root)',
    // 스코프 검사인데 컨테이너를 못 받았으면(구버전 플러그인) 그 사실을 명시한다 —
    // 이 상태에선 시작 노드 직속 자식의 child_overflow/frame_padding 을 판정할 수 없다.
    ...(!isPageRoot && !scopeRoot
      ? { scopeContainerUnknown: true,
          scopeWarning: '검사 시작 노드의 크기 정보를 받지 못해(플러그인 구버전) 직속 자식의 컨테이너 밖 이탈(child_overflow)·여백(frame_padding)은 검사되지 않았습니다. Figma 플러그인을 최신으로 다시 로드하세요.' }
      : {}),
    configMode,
    configSource: resolved.source,
    ...(resolved.error ? { configError: resolved.error } : {}),
    // 트리가 상한에서 잘렸으면 clean 은 신뢰불가(뒤쪽 미검사) — 절대 조용히 clean 으로 보고하지 않는다.
    ...(tree.truncated
      ? { scanTruncated: true, scannedNodes: tree.totalCount, treeNodeLimit: treeLimit,
          scanWarning: `트리가 상한 ${treeLimit} 노드에서 잘려 뒤쪽이 미검사입니다("clean" 은 스캔된 범위 한정). treeNodeLimit 인자로 상한을 올리거나, nodeId 스코프로 섹션별로 나눠 돌리세요.` }
      : {}),
    clean: violations.length === 0 && !tree.truncated,
    violationCount: violations.length,
    ...(suppressedCount ? { suppressed: suppressedCount } : {}),
    violations,
    autoFixable: merged.length,
  };

  if (!apply) {
    return jsonResponse({
      ...base,
      mode: 'dry-run',
      plannedFixOps: ops,
      note: '커스텀 규칙은 read-only라 자동수정 대상이 아닙니다. apply:true 로 빌트인 안전수정(섹션 확장)만 적용됩니다.',
    });
  }

  const applyResult = ops.length
    ? await wsServer.batchModifyNodes(ops, pluginId)
    : { skipped: true, reason: '자동수정 대상 없음' };

  const after = await wsServer.getTree({ nodeId, path, depth: 'full', pageId, limit: treeLimit, timeoutMs: treeTimeout }, pluginId);
  const afterRaw = await runLintOnRoots(config, after.children as TreeNode[], wsServer, pluginId, isPageRoot, after.rootNode as TreeNode | undefined);
  const afterViolations = (await suppressViolations(afterRaw, wsServer, pluginId)).violations;

  return jsonResponse({
    ...base,
    mode: 'apply',
    applyResult,
    after: { violationCount: afterViolations.length, violations: afterViolations },
  });
}

/** scope=file — 전 페이지 순회. read-only. md 리포트 파일로 떨구고 요약+경로 반환. */
async function runFileLint(
  args: Record<string, unknown>,
  context: ToolContext,
  pluginId: string | undefined,
  configMode: ConfigMode,
  baseConfig: LintConfig | null,
  baseLabel: string,
): Promise<ToolResult> {
  const { wsServer } = context;
  const treeLimit = resolveTreeLimit(args);
  const treeTimeout = resolveTreeTimeout(args);
  const pages = wsServer.getPluginPages(pluginId || '');
  if (!pages) {
    return jsonResponse({ error: '플러그인 페이지 목록을 가져올 수 없습니다. sigma_bind 로 바인딩됐는지 확인하세요.' });
  }

  const fileName = (pluginId && wsServer.getPluginPageInfo(pluginId, pages[0].pageId)?.fileName) || '(unknown)';
  const results: PageLintResult[] = [];

  for (const p of pages) {
    const resolved = await resolvePageConfig(wsServer, p.pageId, configMode, baseConfig, pluginId);
    if (!resolved.config) {
      results.push({ pageId: p.pageId, pageName: p.pageName, configSource: resolved.source, configError: resolved.error, violations: [] });
      continue;
    }
    try {
      const tree = await wsServer.getTree({ depth: 'full', pageId: p.pageId, limit: treeLimit, timeoutMs: treeTimeout }, pluginId);
      // scope=file 은 언제나 페이지 루트 전체를 뜬다 → 페이지 절대좌표 전제 규칙 실행 가능.
      const rawViolations = await runLintOnRoots(resolved.config, tree.children as TreeNode[], wsServer, pluginId, true);
      const { violations, suppressedCount } = await suppressViolations(rawViolations, wsServer, pluginId);
      results.push({
        pageId: p.pageId, pageName: p.pageName, configSource: resolved.source, configError: resolved.error,
        violations, suppressedCount,
        ...(tree.truncated ? { truncated: true, scannedNodes: tree.totalCount } : {}),
      });
    } catch (error) {
      results.push({
        pageId: p.pageId, pageName: p.pageName, configSource: resolved.source,
        configError: (resolved.error ? resolved.error + ' / ' : '') + `트리 조회 실패: ${error instanceof Error ? error.message : String(error)}`,
        violations: [],
      });
    }
  }

  const timestamp = Date.now();
  const reportPath = await writeLintReport(results, {
    fileName, scope: 'file', configMode, baseConfigLabel: baseLabel, timestamp,
  });

  const total = results.reduce((s, r) => s + r.violations.length, 0);
  const totalSuppressed = results.reduce((s, r) => s + (r.suppressedCount || 0), 0);
  const truncatedPages = results.filter(r => r.truncated);
  const checked = results.filter(r => r.configSource !== 'skipped');
  return jsonResponse({
    scope: 'file',
    configMode,
    baseConfig: baseLabel,
    fileName,
    pagesChecked: checked.length,
    pagesSkipped: results.length - checked.length,
    totalViolations: total,
    ...(totalSuppressed ? { totalSuppressed } : {}),
    // 잘린 페이지가 있으면 그 페이지는 부분 검사라 clean 이 신뢰불가.
    clean: total === 0 && truncatedPages.length === 0,
    ...(truncatedPages.length
      ? { scanTruncatedPages: truncatedPages.map(r => ({ page: r.pageName, scannedNodes: r.scannedNodes })),
          treeNodeLimit: treeLimit,
          scanWarning: `${truncatedPages.length}개 페이지가 노드 상한(${treeLimit})에서 잘려 부분 검사됐습니다. treeNodeLimit 인자로 상한을 올리거나, 해당 페이지를 scope=page + nodeId 스코프로 나눠 돌리세요.` }
      : {}),
    reportPath,
    summary: results.map(r => ({
      page: r.pageName,
      configSource: r.configSource,
      violations: r.configSource === 'skipped' ? null : r.violations.length,
      ...(r.truncated ? { scanTruncated: true, scannedNodes: r.scannedNodes } : {}),
      ...(r.suppressedCount ? { suppressed: r.suppressedCount } : {}),
      ...(r.configError ? { configError: r.configError } : {}),
    })),
    note: `전체 위반 상세는 리포트 파일에 있습니다: ${reportPath}`,
  });
}
