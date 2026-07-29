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
 * sigma_lint — 빌트인 규칙 카탈로그(기하 8종 + 구조/이름/가시성 6종 + occlusion 1종) + config.custom
 * (JSON shorthand / JS predicate) 커스텀 규칙을 함께 실행한다.
 *
 * scope: 'page'(바인딩된 1페이지, 기본) | 'file'(전 페이지 순회)
 * configMode: 'uniform'(명시 config 하나, 기본) | 'per-page'(페이지 저장 config) | 'merge'(base+페이지 override)
 * config 출처: inline `config` 객체 > `configPath` 파일 > 문서 저장 'lint' (merge/per-page 의 base).
 * 파일 lint 결과는 md 리포트 파일로 떨구고 응답엔 요약+경로만 싣는다.
 */

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

/** 한 트리(roots)에 config 를 적용해 위반 목록을 낸다(빌트인+occlusion+커스텀). */
async function runLintOnRoots(
  config: LintConfig,
  roots: TreeNode[],
  wsServer: ToolContext['wsServer'],
  pluginId: string | undefined,
): Promise<Violation[]> {
  const enriched = await enrichIfNeeded(config, roots, wsServer, pluginId);
  return [
    ...runBuiltinRules(roots, config.builtins || {}),
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

  const tree = await wsServer.getTree({ nodeId, path, depth: 'full', pageId }, pluginId);
  const roots = tree.children as TreeNode[];
  const rawViolations = await runLintOnRoots(config, roots, wsServer, pluginId);
  const { violations, suppressedCount } = await suppressViolations(rawViolations, wsServer, pluginId);

  const fixable = collectFixableViolations(violations);
  const merged = mergeFixesBySection(fixable);
  const ops = fixesToOps(merged);

  const base = {
    page: tree.pageName,
    scope: nodeId || path || '(page root)',
    configMode,
    configSource: resolved.source,
    ...(resolved.error ? { configError: resolved.error } : {}),
    clean: violations.length === 0,
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

  const after = await wsServer.getTree({ nodeId, path, depth: 'full', pageId }, pluginId);
  const afterRaw = await runLintOnRoots(config, after.children as TreeNode[], wsServer, pluginId);
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
      const tree = await wsServer.getTree({ depth: 'full', pageId: p.pageId }, pluginId);
      const rawViolations = await runLintOnRoots(resolved.config, tree.children as TreeNode[], wsServer, pluginId);
      const { violations, suppressedCount } = await suppressViolations(rawViolations, wsServer, pluginId);
      results.push({ pageId: p.pageId, pageName: p.pageName, configSource: resolved.source, configError: resolved.error, violations, suppressedCount });
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
    clean: total === 0,
    reportPath,
    summary: results.map(r => ({
      page: r.pageName,
      configSource: r.configSource,
      violations: r.configSource === 'skipped' ? null : r.violations.length,
      ...(r.suppressedCount ? { suppressed: r.suppressedCount } : {}),
      ...(r.configError ? { configError: r.configError } : {}),
    })),
    note: `전체 위반 상세는 리포트 파일에 있습니다: ${reportPath}`,
  });
}
