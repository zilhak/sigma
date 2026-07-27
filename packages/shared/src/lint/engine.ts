/**
 * sigma_lint 빌트인 엔진 — 기하 8종(geometric.ts, 무변경 이관) + 구조/이름/가시성 6종(simple-rules.ts)을
 * config.builtins 로 켜고 끄고 파라미터화한다. 각 규칙은 미기재 시 기본 ON(opt-out 모델) —
 * 8개 기하 규칙은 sigma_layout_lint 시절부터 항상 켜져 있었으므로 그 동작을 그대로 보존한다.
 */
import type { TreeNode } from '../types';
import { DEFAULT_PADDING, DEFAULT_SECTION_GAP, lintLayout, mergeFixesBySection, type LayoutRule } from './geometric';
import {
  componentDescriptionEmptyRule, defaultNameRule, emptyContainerRule,
  fillSizingOrphanRule, hiddenLeafRule, strayPixelRule,
} from './simple-rules';
import type { BuiltinRuleId, BuiltinsConfig, Violation } from './types';

export { mergeFixesBySection };
export type { LayoutFix } from './geometric';

const GEOMETRIC_RULES: LayoutRule[] = [
  'outside_section', 'section_overlap', 'section_gap', 'card_overlap',
  'frame_padding', 'instance_orphan', 'component_needs_frame', 'child_overflow',
];

export const ALL_BUILTIN_RULE_IDS: BuiltinRuleId[] = [
  ...GEOMETRIC_RULES,
  'stray_pixel', 'default_name', 'empty_container', 'hidden_leaf',
  'fill_sizing_orphan', 'component_description_empty',
  // fully_occluded_sibling 은 여기 목록엔 있지만 runBuiltinRules 안에서 실행되지 않는다 —
  // fills/opacity(get_nodes_info 상세)가 필요해 서버가 LintNode 로 enrich 한 뒤
  // occlusion.ts 의 fullyOccludedSiblingRule 을 별도로 호출한다(isEnabled 로 opt-out 확인은 동일).
  'fully_occluded_sibling',
];

export function isEnabled(builtins: BuiltinsConfig, id: BuiltinRuleId): boolean {
  const cfg = builtins[id];
  return !cfg || cfg.enabled !== false;
}

/** 페이지 트리(roots)에 config.builtins 로 켜진 규칙만 실행해 Violation[] 를 반환. */
export function runBuiltinRules(roots: TreeNode[], builtins: BuiltinsConfig = {}): Violation[] {
  const out: Violation[] = [];

  const anyGeometricEnabled = GEOMETRIC_RULES.some((id) => isEnabled(builtins, id));
  if (anyGeometricEnabled) {
    const paddingCfg = builtins.frame_padding?.padding;
    const gapCfg = builtins.section_gap?.gap;
    const result = lintLayout(roots, {
      padding: typeof paddingCfg === 'number' ? paddingCfg : DEFAULT_PADDING,
      sectionGap: typeof gapCfg === 'number' ? gapCfg : DEFAULT_SECTION_GAP,
    });
    for (const v of result.violations) {
      if (isEnabled(builtins, v.rule)) {
        out.push({ rule: v.rule, source: 'builtin', message: v.message, nodes: v.nodes, fix: v.fix });
      }
    }
  }

  if (isEnabled(builtins, 'stray_pixel')) out.push(...strayPixelRule(roots));
  if (isEnabled(builtins, 'default_name')) out.push(...defaultNameRule(roots));
  if (isEnabled(builtins, 'empty_container')) out.push(...emptyContainerRule(roots));
  if (isEnabled(builtins, 'hidden_leaf')) out.push(...hiddenLeafRule(roots));
  if (isEnabled(builtins, 'fill_sizing_orphan')) out.push(...fillSizingOrphanRule(roots));
  if (isEnabled(builtins, 'component_description_empty')) out.push(...componentDescriptionEmptyRule(roots));

  return out;
}

/** apply 모드에서 실제 적용할 안전 fix만 추출(빌트인 기하 규칙만 fix를 가짐). */
export function collectFixableViolations(violations: Violation[]) {
  return violations
    .map((v) => v.fix)
    .filter((f): f is NonNullable<Violation['fix']> => Boolean(f));
}
