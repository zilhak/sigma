/**
 * sigma_lint 실행 오케스트레이션 — scope 별 흐름.
 *
 *   page: config 해석 → getTree → (필요 시) 컨텍스트 수집 → 룰 실행 → 억제 → (apply) 자동수정
 *   file: 페이지 순회 → 각 페이지 page 흐름 → md 리포트 파일
 *
 * ⚠️ 이 모듈은 MCP 응답 포맷(ToolResult/jsonResponse)을 모른다. 평범한 객체를 돌려주고
 * 감싸는 것은 handlers/lint.ts 의 일이다 — server/src/lint/ 의 다른 파일들과 같은 규칙이다.
 */
import type { TreeNode } from '@sigma/shared';
import {
  runBuiltinRules, collectFixableViolations, mergeFixesBySection, isEnabled, emptyCoverage, ALL_BUILTIN_RULE_IDS,
  fullyOccludedSiblingRule, instanceResizedFromSpecRule, annotationMarkerPairRule, annotationMarkerGapRule, fontNotDefaultRule,
  type InstanceResizedConfig, type AnnotationMarkerPairConfig, type AnnotationMarkerGapConfig, type FontNotDefaultConfig,
  type Violation, type LintConfig, type LayoutFix, type RuleCoverage, type BuiltinRuleId,
} from '@sigma/shared/lint';
import type { FigmaWebSocketServer } from '../websocket/server.js';
import { enrichIfNeeded } from './enrich.js';
import { runCustomRulesFromEnriched } from './run-custom-rule.js';
import { resolvePageConfig, type ConfigMode } from './resolve-config.js';
import { writeLintReport, type PageLintResult } from './report.js';
import { suppressViolations } from './suppress.js';
import {
  collectAnnotationLayerIds, collectInstanceComponentNames, collectSpecMasterIds,
  resolveDefaultFontFamily, resolveSpecSizing,
} from './collect-context.js';

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
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
  isPageRoot: boolean,
  scopeRoot?: TreeNode,
): Promise<{ violations: Violation[]; coverage: RuleCoverage; customRan: string[] }> {
  const hasCustom = (config.custom || []).length > 0;
  const annotationLayerIds = await collectAnnotationLayerIds(config.builtins, roots, wsServer, pluginId, hasCustom, scopeRoot);
  const enriched = await enrichIfNeeded(config, roots, wsServer, pluginId, annotationLayerIds);
  const instanceComponentNames = await collectInstanceComponentNames(config.builtins, roots, wsServer, pluginId);
  const specMasterIds = await collectSpecMasterIds(config.builtins, roots, wsServer, pluginId);
  const defaultFontFamily = await resolveDefaultFontFamily(config.builtins, wsServer, pluginId);
  const sizingByAlias = await resolveSpecSizing(config.builtins);

  // 커버리지는 엔진이 완성하지 못한다 — 아래 5종은 enrich 된 LintNode 가 필요해 여기서 직접 돈다.
  // 그 5종을 여기서 안 채우면 "돌았는데 목록에 없다" 가 되어, 이 기능이 없애려던 혼동을 새로 만든다.
  const coverage = emptyCoverage();
  /** enrich 가 필요한 규칙: 켰는데 enrich 가 없으면 optInOff 가 아니라 skipped 다 */
  const markEnrichRule = (id: BuiltinRuleId, on: boolean, optIn: boolean): boolean => {
    if (!on) { (optIn ? coverage.optInOff : coverage.disabled).push(id); return false; }
    if (!enriched) {
      coverage.skipped.push({ rule: id, reason: '노드 상세 정보(enrich)를 받지 못해 실행되지 않음' });
      return false;
    }
    coverage.ran.push(id);
    return true;
  };

  const violations = [
    ...runBuiltinRules(roots, config.builtins || {}, { annotationLayerIds, instanceComponentNames, specMasterIds, isPageRoot, scopeRoot }, coverage),
    ...(markEnrichRule('fully_occluded_sibling', isEnabled(config.builtins || {}, 'fully_occluded_sibling'), false)
      ? fullyOccludedSiblingRule(enriched!.nodes, enriched!.relations.children)
      : []),
    ...(markEnrichRule('instance_resized_from_spec', config.builtins?.instance_resized_from_spec?.enabled === true, true)
      ? instanceResizedFromSpecRule(enriched!.nodes, {
          ...(config.builtins!.instance_resized_from_spec as InstanceResizedConfig),
          sizingByAlias,
        })
      : []),
    ...(markEnrichRule('annotation_marker_pair', config.builtins?.annotation_marker_pair?.enabled === true, true)
      ? annotationMarkerPairRule(enriched!.nodes, enriched!.relations, config.builtins!.annotation_marker_pair as AnnotationMarkerPairConfig)
      : []),
    ...(markEnrichRule('annotation_marker_gap', config.builtins?.annotation_marker_gap?.enabled === true, true)
      ? annotationMarkerGapRule(enriched!.nodes, enriched!.relations, config.builtins!.annotation_marker_gap as AnnotationMarkerGapConfig)
      : []),
    ...(markEnrichRule('font_not_default', config.builtins?.font_not_default?.enabled === true, true)
      ? fontNotDefaultRule(enriched!.nodes, {
          ...(config.builtins!.font_not_default as FontNotDefaultConfig),
          family: defaultFontFamily,
        })
      : []),
    ...(enriched ? await runCustomRulesFromEnriched(config, enriched) : []),
  ];

  // 안전망: 24종 중 어디에도 안 담긴 id 가 있으면 그건 커버리지 등록을 빠뜨린 것이다.
  // 조용히 빠지면 호출자는 "안 돌았구나" 로 읽는데 실제로는 돌았을 수 있다 — 그 혼동이
  // 바로 이 기능이 없애려는 것이므로, 감추지 말고 응답에 드러낸다.
  const covered = new Set<string>([
    ...coverage.ran, ...coverage.disabled, ...coverage.optInOff, ...coverage.skipped.map((s) => s.rule),
  ]);
  for (const id of ALL_BUILTIN_RULE_IDS) {
    if (!covered.has(id)) {
      coverage.skipped.push({ rule: id, reason: '커버리지 미등록 — sigma 버그입니다(실행 여부를 알 수 없음)' });
    }
  }

  // 커스텀 규칙은 enrich 가 없으면 통째로 안 돈다 — 그 사실이 응답에 안 나오면 0건으로 읽힌다.
  const customRan = enriched ? (config.custom || []).map((r) => r.id) : [];
  return { violations, coverage, customRan };
}

/**
 * 규칙 id → 위반 건수. **실행된 규칙은 0 이어도 키를 남긴다** — 그게 "돌았는데 0건" 과
 * "아예 안 돔"(키 없음)을 가르는 유일한 신호다. 배경은 coverage 와 같다.
 */
function countByRule(violations: Violation[], ranRules: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ranRules) out[id] = 0;
  for (const v of violations) out[v.rule] = (out[v.rule] || 0) + 1;
  return out;
}

/** 커스텀 규칙이 실행 자체를 실패한 경우(정의 오류·타임아웃·Worker 에러). 조용히 0건이 되지 않게 드러낸다. */
function customFailures(violations: Violation[]): Array<{ rule: string; error: string }> {
  return violations
    .filter((v) => v.source === 'custom' && v.error)
    .map((v) => ({ rule: v.rule, error: v.error as string }));
}

/** scope=page — 바인딩된 페이지 1개. apply(자동수정) 지원. */
export async function runPageLint(
  args: Record<string, unknown>,
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
  pageId: string | undefined,
  configMode: ConfigMode,
  baseConfig: LintConfig | null,
): Promise<Record<string, unknown>> {
  const nodeId = args.nodeId as string | undefined;
  const path = args.path as string | string[] | undefined;
  const apply = args.apply === true;

  const resolved = await resolvePageConfig(wsServer, pageId || 'document', configMode, baseConfig, pluginId);
  if (!resolved.config) {
    return {
      clean: true, scope: nodeId || path || '(page root)', configMode,
      skipped: 'no config', configSource: resolved.source,
      ...(resolved.error ? { configError: resolved.error } : {}),
      note: 'per-page 모드인데 이 페이지에 저장된 lint config 도 base 도 없어 건너뜁니다.',
    };
  }
  const config = resolved.config;
  const treeLimit = resolveTreeLimit(args);
  const treeTimeout = resolveTreeTimeout(args);

  // nodeId/path 로 좁히면 roots 가 부모 로컬좌표 서브트리 → 페이지 절대좌표 전제 규칙은 실행 안 함.
  const isPageRoot = !nodeId && !path;

  // annotation_marker_gap 은 컨테이너를 넘나드는 거리를 재야 해서 절대좌표가 필요하다(켰을 때만 payload 를 치른다).
  const includeAbsolute = config.builtins?.annotation_marker_gap?.enabled === true;
  const tree = await wsServer.getTree({ nodeId, path, depth: 'full', pageId, limit: treeLimit, timeoutMs: treeTimeout, includeAbsolute }, pluginId);
  const roots = tree.children as TreeNode[];
  const scopeRoot = tree.rootNode as TreeNode | undefined;
  const ran = await runLintOnRoots(config, roots, wsServer, pluginId, isPageRoot, scopeRoot);
  const { violations, suppressedCount } = await suppressViolations(ran.violations, wsServer, pluginId);
  const failedCustom = customFailures(violations);

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
    // 0건이 "깨끗함" 인지 "규칙이 안 돌았음" 인지는 violations 만 봐서는 알 수 없다.
    // coverage(무엇이 돌았나) + byRule(각각 몇 건인가) 을 항상 싣는다 — 옵션으로 만들면
    // 정작 사고가 나는 상황(=의심 없이 0건을 읽는 상황)에서 안 켠다.
    coverage: {
      scannedNodes: tree.totalCount,
      truncated: tree.truncated === true,
      builtinRan: ran.coverage.ran,
      builtinDisabled: ran.coverage.disabled,
      builtinOptInOff: ran.coverage.optInOff,
      ...(ran.coverage.skipped.length ? { builtinSkipped: ran.coverage.skipped } : {}),
      customRan: ran.customRan,
      ...(failedCustom.length ? { customFailed: failedCustom } : {}),
    },
    byRule: countByRule(violations, [...ran.coverage.ran, ...ran.customRan]),
    violations,
    autoFixable: merged.length,
  };

  if (!apply) {
    return {
      ...base,
      mode: 'dry-run',
      plannedFixOps: ops,
      note: '커스텀 규칙은 read-only라 자동수정 대상이 아닙니다. apply:true 로 빌트인 안전수정(섹션 확장)만 적용됩니다.',
    };
  }

  const applyResult = ops.length
    ? await wsServer.batchModifyNodes(ops, pluginId)
    : { skipped: true, reason: '자동수정 대상 없음' };

  const after = await wsServer.getTree({ nodeId, path, depth: 'full', pageId, limit: treeLimit, timeoutMs: treeTimeout, includeAbsolute }, pluginId);
  const afterRan = await runLintOnRoots(config, after.children as TreeNode[], wsServer, pluginId, isPageRoot, after.rootNode as TreeNode | undefined);
  const afterViolations = (await suppressViolations(afterRan.violations, wsServer, pluginId)).violations;

  return {
    ...base,
    mode: 'apply',
    applyResult,
    after: {
      violationCount: afterViolations.length,
      byRule: countByRule(afterViolations, [...afterRan.coverage.ran, ...afterRan.customRan]),
      violations: afterViolations,
    },
  };
}

/** scope=file — 전 페이지 순회. read-only. md 리포트 파일로 떨구고 요약+경로 반환. */
export async function runFileLint(
  args: Record<string, unknown>,
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
  configMode: ConfigMode,
  baseConfig: LintConfig | null,
  baseLabel: string,
): Promise<Record<string, unknown>> {
  const treeLimit = resolveTreeLimit(args);
  const treeTimeout = resolveTreeTimeout(args);
  const pages = wsServer.getPluginPages(pluginId || '');
  if (!pages) {
    return { error: '플러그인 페이지 목록을 가져올 수 없습니다. sigma_bind 로 바인딩됐는지 확인하세요.' };
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
      const tree = await wsServer.getTree({
        depth: 'full', pageId: p.pageId, limit: treeLimit, timeoutMs: treeTimeout,
        includeAbsolute: resolved.config.builtins?.annotation_marker_gap?.enabled === true,
      }, pluginId);
      // scope=file 은 언제나 페이지 루트 전체를 뜬다 → 페이지 절대좌표 전제 규칙 실행 가능.
      const ran = await runLintOnRoots(resolved.config, tree.children as TreeNode[], wsServer, pluginId, true);
      const { violations, suppressedCount } = await suppressViolations(ran.violations, wsServer, pluginId);
      results.push({
        pageId: p.pageId, pageName: p.pageName, configSource: resolved.source, configError: resolved.error,
        violations, suppressedCount,
        scannedNodes: tree.totalCount,
        ranCount: ran.coverage.ran.length + ran.customRan.length,
        byRule: countByRule(violations, [...ran.coverage.ran, ...ran.customRan]),
        ...(tree.truncated ? { truncated: true } : {}),
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
  return {
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
      // 규칙 전체 id 를 페이지마다 반복하면 응답이 커진다 — 여기선 규모(scannedNodes/ranCount)와
      // 규칙별 건수(byRule)만 싣고, 전체 목록은 리포트 md 에 한 번만 적는다.
      ...(r.scannedNodes !== undefined ? { scannedNodes: r.scannedNodes } : {}),
      ...(r.ranCount !== undefined ? { ranCount: r.ranCount } : {}),
      ...(r.byRule ? { byRule: r.byRule } : {}),
      ...(r.truncated ? { scanTruncated: true } : {}),
      ...(r.suppressedCount ? { suppressed: r.suppressedCount } : {}),
      ...(r.configError ? { configError: r.configError } : {}),
    })),
    note: `전체 위반 상세는 리포트 파일에 있습니다: ${reportPath}`,
  };
}
