import {
  runBuiltinRules, collectFixableViolations, mergeFixesBySection, runMatchRule, isEnabled,
  fullyOccludedSiblingRule,
  type TreeNode, type Violation, type LintConfig, type LayoutFix,
} from '@sigma/shared';
import { validateFigmaAccess, jsonResponse, type ToolContext, type ToolResult } from '../helpers.js';
import { loadLintConfig, LintConfigError } from '../../lint/load-config.js';
import { buildLintNodes, collectNodeIds, type BuildLintNodesResult, type NodeInfoLike } from '../../lint/enrich.js';
import { runPredicateRule } from '../../lint/run-custom-rule.js';

/**
 * sigma_lint — 빌트인 규칙 카탈로그(기하 8종 + 구조/이름/가시성 6종 + occlusion 1종) + config.custom
 * (JSON shorthand / JS predicate) 커스텀 규칙을 config 파일 하나로 함께 실행한다.
 * sigma_layout_lint/sigma_layout_fix 를 완전히 대체(기하 8종은 빌트인 카탈로그의 일부로 흡수).
 * 설계 배경은 .claude-workspace/analysis/lint-benchmark-ideation.md 참조.
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

/**
 * config.custom 이 있거나 fully_occluded_sibling(fills/opacity 필요)이 켜져 있을 때만
 * get_nodes_info 왕복 + LintNode enrich를 한 번 수행한다(불필요한 왕복 방지 — 나머지
 * 빌트인은 TreeNode만으로 충분하므로 이 경로를 타지 않는다).
 */
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

export const lintHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_lint(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId, pageId } = access;

    const configPath = args.configPath as string | undefined;
    if (!configPath) {
      return jsonResponse({ error: 'configPath 는 필수입니다 (검사할 규칙을 정의한 JSON 파일 경로)' });
    }

    let config: LintConfig;
    try {
      config = await loadLintConfig(configPath);
    } catch (error) {
      if (error instanceof LintConfigError) return jsonResponse({ error: error.message });
      throw error;
    }

    const nodeId = args.nodeId as string | undefined;
    const path = args.path as string | string[] | undefined;
    const apply = args.apply === true;

    try {
      const tree = await wsServer.getTree({ nodeId, path, depth: 'full', pageId }, pluginId);
      const roots = tree.children as TreeNode[];

      const enriched = await enrichIfNeeded(config, roots, wsServer, pluginId);
      const violations: Violation[] = [
        ...runBuiltinRules(roots, config.builtins || {}),
        ...(enriched && isEnabled(config.builtins || {}, 'fully_occluded_sibling')
          ? fullyOccludedSiblingRule(enriched.nodes, enriched.relations.children)
          : []),
        ...(enriched ? await runCustomRulesFromEnriched(config, enriched) : []),
      ];

      const fixable = collectFixableViolations(violations);
      const merged = mergeFixesBySection(fixable);
      const ops = fixesToOps(merged);

      const base = {
        page: tree.pageName,
        scope: nodeId || path || '(page root)',
        clean: violations.length === 0,
        violationCount: violations.length,
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
      const afterViolations = runBuiltinRules(after.children as TreeNode[], config.builtins || {});

      return jsonResponse({
        ...base,
        mode: 'apply',
        applyResult,
        after: { violationCount: afterViolations.length, violations: afterViolations },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: errMsg });
    }
  },
};
