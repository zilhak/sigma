/**
 * sigma_lint 빌트인 엔진 — 기하 8종(geometric.ts, 무변경 이관) + 구조/이름/가시성 6종(simple-rules.ts)을
 * config.builtins 로 켜고 끄고 파라미터화한다. 각 규칙은 미기재 시 기본 ON(opt-out 모델) —
 * 8개 기하 규칙은 sigma_layout_lint 시절부터 항상 켜져 있었으므로 그 동작을 그대로 보존한다.
 */
import type { TreeNode } from '../types';
import { DEFAULT_PADDING, DEFAULT_SECTION_GAP, lintLayout, mergeFixesBySection, type LayoutRule } from './geometric';
import {
  componentDescriptionEmptyRule, defaultNameRule, emptyContainerRule,
  fillSizingOrphanRule, hiddenLeafRule, rawNodeRule, strayPixelRule,
  type RawNodeConfig,
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
  // raw_node 는 카탈로그엔 있지만 **opt-in(기본 OFF)** — 다른 빌트인의 opt-out 모델과 달리
  // builtins.raw_node.enabled === true 로 명시해야만 실행된다(runBuiltinRules 참고). strict 정책이라 기본 강제 안 함.
  'raw_node',
  // annotation_layer 도 **opt-in(기본 OFF)** — builtins.annotation_layer.enabled === true 일 때만 실행.
  // "기획 레이어를 쓰려면(=이 규칙을 켜면) 모든 섹션이 기획 레이어를 갖는다"는 계약. 켜는 순간
  // 레이어 자동 면제(annotationLayerIds)도 함께 적용된다. 판정은 pluginData(role), 호출측 주입.
  'annotation_layer',
  // fully_occluded_sibling 은 여기 목록엔 있지만 runBuiltinRules 안에서 실행되지 않는다 —
  // fills/opacity(get_nodes_info 상세)가 필요해 서버가 LintNode 로 enrich 한 뒤
  // occlusion.ts 의 fullyOccludedSiblingRule 을 별도로 호출한다(isEnabled 로 opt-out 확인은 동일).
  'fully_occluded_sibling',
];

export function isEnabled(builtins: BuiltinsConfig, id: BuiltinRuleId): boolean {
  const cfg = builtins[id];
  return !cfg || cfg.enabled !== false;
}

/** runBuiltinRules 부가 입력 — 서버 핸들러가 pluginData 등에서 계산해 주입. */
export interface BuiltinRuleContext {
  /** 기획 레이어로 판정된 노드 id (pluginData role). 겹침/여백/오버플로우 면제 + annotation_layer 규칙 판정에 사용. */
  annotationLayerIds?: Iterable<string>;
}

/** 페이지 트리(roots)에 config.builtins 로 켜진 규칙만 실행해 Violation[] 를 반환. */
export function runBuiltinRules(roots: TreeNode[], builtins: BuiltinsConfig = {}, ctx: BuiltinRuleContext = {}): Violation[] {
  const out: Violation[] = [];
  const layerIds = new Set(ctx.annotationLayerIds || []);

  const anyGeometricEnabled = GEOMETRIC_RULES.some((id) => isEnabled(builtins, id));
  if (anyGeometricEnabled) {
    const paddingCfg = builtins.frame_padding?.padding;
    const gapCfg = builtins.section_gap?.gap;
    const result = lintLayout(roots, {
      padding: typeof paddingCfg === 'number' ? paddingCfg : DEFAULT_PADDING,
      sectionGap: typeof gapCfg === 'number' ? gapCfg : DEFAULT_SECTION_GAP,
      annotationLayerIds: layerIds,
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

  // raw_node 만 opt-in: 미기재/enabled≠true 면 실행 안 함(다른 빌트인의 opt-out 기본 ON 과 반대).
  if (builtins.raw_node?.enabled === true) out.push(...rawNodeRule(roots, builtins.raw_node as RawNodeConfig));

  // annotation_layer 도 opt-in: 켜진 페이지에서 모든 SECTION 은 기획 레이어를 직속 자식으로 가져야 한다.
  if (builtins.annotation_layer?.enabled === true) out.push(...annotationLayerRule(roots, layerIds));

  return out;
}

/**
 * annotation_layer (opt-in) — 모든 SECTION(중첩 포함)은 기획 레이어(annotation-layer)를
 * 직속 자식으로 최소 1개 가져야 한다. 레이어 판정은 pluginData(role) 기반 layerIds 로 주입된다.
 * "기획 레이어를 쓰는 파일이면 섹션마다 예외없이 둔다"는 규약을 강제한다.
 */
export function annotationLayerRule(roots: TreeNode[], layerIds: Set<string>): Violation[] {
  const out: Violation[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'SECTION') {
        const has = (n.children ?? []).some((c) => layerIds.has(c.id));
        if (!has) {
          out.push({
            rule: 'annotation_layer', source: 'builtin',
            message: `섹션 "${n.name}" (${n.id}) 에 기획 레이어(annotation-layer)가 없습니다 — sigma_create_annotation_layer 로 추가하세요`,
            nodes: [n.id],
          });
        }
      }
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** apply 모드에서 실제 적용할 안전 fix만 추출(빌트인 기하 규칙만 fix를 가짐). */
export function collectFixableViolations(violations: Violation[]) {
  return violations
    .map((v) => v.fix)
    .filter((f): f is NonNullable<Violation['fix']> => Boolean(f));
}
