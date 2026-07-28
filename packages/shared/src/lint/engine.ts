/**
 * sigma_lint 빌트인 엔진 — 기하 8종(geometric.ts, 무변경 이관) + 구조/이름/가시성 6종(simple-rules.ts) +
 * 페이지 루트 전용 2종(page-rules.ts)을 config.builtins 로 켜고 끄고 파라미터화한다. 각 규칙은 미기재 시 기본 ON(opt-out 모델) —
 * 8개 기하 규칙은 sigma_layout_lint 시절부터 항상 켜져 있었으므로 그 동작을 그대로 보존한다.
 */
import type { TreeNode } from '../types';
import { DEFAULT_PADDING, DEFAULT_SECTION_GAP, lintLayout, mergeFixesBySection, type LayoutRule } from './geometric';
import {
  componentDescriptionEmptyRule, defaultNameRule, emptyContainerRule,
  fillSizingOrphanRule, hiddenLeafRule, rawNodeRule, strayPixelRule,
  type RawNodeConfig,
} from './simple-rules';
import { contentSpreadRule, DEFAULT_MAX_GAP, DEFAULT_ORIGIN_TOLERANCE, originAnchorRule } from './page-rules';
import { contentAboveAnnotationRule } from './annotation-order';
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
  // instance_default_name 도 **opt-in(기본 OFF)** — default_name 의 인스턴스 판. 인스턴스 이름이
  // 마스터 컴포넌트 이름 그대로면(=고유 이름 미부여) 위반. 마스터명은 TreeNode 에 없어 서버가
  // getNodesInfo(componentName)로 resolve 해 instanceComponentNames 로 주입한다. 실화면엔 마스터명
  // 유지 인스턴스가 흔해 기본 ON 이면 폭주 → strict 네이밍을 원하는 파일만 켠다.
  'instance_default_name',
  // origin_anchor / content_spread 도 **opt-in(기본 OFF)** 이고, 추가로 **페이지 루트에서만** 실행된다
  // (ctx.isPageRoot). nodeId/path 로 서브트리를 검사할 땐 roots 가 부모 로컬좌표라 원점·거리 판정이
  // 무의미해 오탐만 낸다. Figma 에서 원점은 시각적 의미가 없어 일반 파일엔 오탐이라 기본 OFF.
  'origin_anchor', 'content_spread',
  // instance_resized_from_spec 도 **opt-in(기본 OFF)** 이고, occlusion 과 마찬가지로 여기서 실행되지
  // 않는다 — 마스터 크기·스펙 alias 가 TreeNode 에 없어 서버가 enrich 한 LintNode 로 판정한다
  // (spec-instance.ts). 의도적으로 늘려 쓴 인스턴스가 많은 파일에선 폭주하므로 기본 강제 안 함.
  'instance_resized_from_spec',
  // annotation_marker_pair 도 **opt-in(기본 OFF)** — 기획 레이어 안의 마커 ↔ 범례 짝·왕복 링크 검사.
  // 관계(children/ancestors)와 하이퍼링크가 필요해 enrich 한 LintNode 로 판정한다(annotation-marker.ts).
  'annotation_marker_pair',
  // annotation_marker_gap 도 **opt-in(기본 OFF)** — 마커가 대상을 덮거나 떠 있는지. 절대좌표가
  // 필요해 서버가 get_tree 를 includeAbsolute 로 부른다(규칙이 켜졌을 때만 payload 를 치른다).
  'annotation_marker_gap',
  // font_not_default 도 **opt-in(기본 OFF)** — 파일 기본 폰트(문서 fonts.default)와 다른 TEXT 검출.
  // 기대 패밀리는 서버가 문서 노드에서 읽어 넣는다(config.family 로 override 가능). font.ts 참고.
  'font_not_default',
  // fully_occluded_sibling 은 여기 목록엔 있지만 runBuiltinRules 안에서 실행되지 않는다 —
  // fills/opacity(get_nodes_info 상세)가 필요해 서버가 LintNode 로 enrich 한 뒤
  // occlusion.ts 의 fullyOccludedSiblingRule 을 별도로 호출한다(isEnabled 로 opt-out 확인은 동일).
  'fully_occluded_sibling',
  'content_above_annotation',
];

/**
 * 규칙별로 받는 파라미터 이름. `enabled` 는 전 규칙 공통이라 여기 적지 않는다.
 * config 검증(`server/src/lint/load-config.ts`)이 이 목록에 없는 키를 **거부**한다.
 *
 * 배경: docs/history/011-lint-config-typos-were-silently-ignored.md
 * 규칙에 파라미터를 추가하면 **여기에도 넣을 것** — 안 넣으면 그 파라미터를 준 config 가
 * 거부된다(유닛테스트가 id 누락은 잡지만 키 누락은 못 잡는다).
 */
export const BUILTIN_RULE_PARAMS: Record<BuiltinRuleId, string[]> = {
  // 기하 8종 — 파라미터는 lintLayout 이 두 개만 받는다(나머지는 켜고 끄기만).
  outside_section: [],
  section_overlap: [],
  section_gap: ['gap'],
  card_overlap: [],
  frame_padding: ['padding'],
  instance_orphan: [],
  component_needs_frame: [],
  child_overflow: [],
  // 구조/이름/가시성 6종
  stray_pixel: ['includeInsideInstances'],
  default_name: ['includeInsideInstances', 'includeVectors'],
  empty_container: ['includeInsideInstances'],
  hidden_leaf: [],
  fill_sizing_orphan: [],
  component_description_empty: [],
  // opt-in
  raw_node: ['types', 'checkInsideComponent', 'exemptNamePattern'],
  annotation_layer: [],
  instance_default_name: [],
  origin_anchor: ['tolerance'],
  content_spread: ['maxGap'],
  // sizingByAlias 는 여기 없다 — 서버가 스펙 레지스트리에서 계산해 **항상 덮어쓰므로**
  // (server/src/lint/run.ts) 사용자가 줘도 무시된다. 받는 척하면 그게 곧 조용한 무시다.
  instance_resized_from_spec: ['tolerance', 'growthRatio', 'smallMaster', 'flagShrink'],
  annotation_marker_pair: ['markerAlias', 'legendAlias', 'requireHyperlink', 'symbolPattern'],
  annotation_marker_gap: ['markerAlias', 'maxGap', 'orphanRadius', 'backgroundAreaRatio', 'minCoverRatio'],
  font_not_default: ['family', 'allow', 'flagMixed'],
  fully_occluded_sibling: [],
  content_above_annotation: ['aliases'],
};

export function isEnabled(builtins: BuiltinsConfig, id: BuiltinRuleId): boolean {
  const cfg = builtins[id];
  return !cfg || cfg.enabled !== false;
}

/**
 * "무엇을 검사했는가" 기록. **위반 0건과 규칙이 안 돈 것을 가르는 유일한 신호**다.
 * 배경: docs/history/004-lint-zero-violations-was-unreadable.md
 *
 * ⚠️ 24종 중 5종은 `runBuiltinRules` **밖**(server/src/lint/run.ts)에서 실행된다 — 상세 노드
 * 정보(enrich)가 필요하기 때문이다. 그래서 이 객체는 엔진이 완성하지 않고, 서버가 이어서 채운다.
 * 최종 조립 후 `ran ∪ disabled ∪ optInOff ∪ skipped === ALL_BUILTIN_RULE_IDS` 여야 한다
 * (유닛테스트로 강제 — 안 그러면 규칙을 새로 추가한 사람이 등록을 빠뜨려도 아무도 모른다).
 */
export interface RuleCoverage {
  /** 실제로 실행된 규칙 */
  ran: BuiltinRuleId[];
  /** config 로 꺼서(enabled:false) 실행되지 않은 규칙 */
  disabled: BuiltinRuleId[];
  /** opt-in 인데 켜지 않아 실행되지 않은 규칙 */
  optInOff: BuiltinRuleId[];
  /** 켰는데도 실행되지 못한 규칙 + 사유 (예: 서브트리 스코프라 좌표 전제가 깨짐) */
  skipped: Array<{ rule: BuiltinRuleId; reason: string }>;
}

export function emptyCoverage(): RuleCoverage {
  return { ran: [], disabled: [], optInOff: [], skipped: [] };
}

/**
 * `runBuiltinRules` **밖**에서 실행되는 규칙 — 전부 enrich 된 LintNode(fills/opacity/관계 등)가
 * 필요해 서버(`server/src/lint/run.ts`)가 직접 호출한다. 엔진의 커버리지에는 안 담기므로
 * 서버가 이어서 채워야 한다. 규칙을 새로 그쪽에 추가하면 **이 목록에도 넣을 것.**
 */
export const ENGINE_EXTERNAL_RULE_IDS: BuiltinRuleId[] = [
  'fully_occluded_sibling',
  'instance_resized_from_spec',
  'annotation_marker_pair',
  'annotation_marker_gap',
  'font_not_default',
];

/** runBuiltinRules 부가 입력 — 서버 핸들러가 pluginData 등에서 계산해 주입. */
export interface BuiltinRuleContext {
  /** 기획 레이어로 판정된 노드 id (pluginData role). 겹침/여백/오버플로우 면제 + annotation_layer 규칙 판정에 사용. */
  annotationLayerIds?: Iterable<string>;
  /** INSTANCE id → 마스터 컴포넌트 이름. instance_default_name 규칙에서 인스턴스 이름과 비교. TreeNode 에
   *  componentName 이 없어 서버가 getNodesInfo 로 resolve 해 주입한다(규칙이 켜졌을 때만). */
  instanceComponentNames?: ReadonlyMap<string, string>;
  /** roots 가 페이지 최상위인가(= nodeId/path 스코프가 아님). origin_anchor/content_spread 는 좌표가
   *  페이지 절대좌표일 때만 의미가 있어 이 플래그가 true 일 때만 실행된다. 미지정 = false(안전측). */
  isPageRoot?: boolean;
  /** nodeId/path 로 스코프를 좁혔을 때의 **시작 노드 자신**(get_tree 의 rootNode). roots 는 이 노드의
   *  자식이므로, 이걸 넘겨야 자식이 "페이지 직속"으로 오인되지 않고(outside_section 오탐) 컨테이너
   *  밖으로 나갔는지도 판정된다(child_overflow). 페이지 전체 검사에선 undefined. */
  scopeRoot?: TreeNode;
  /** scopeRoot 가 INSTANCE 안쪽인가(`get_tree` 의 `rootNodeInsideInstance`). 조상은 트리 밖이라
   *  규칙이 스스로 판정할 수 없다 — 이게 true 면 인스턴스 내부를 면제하는 규칙에서 scopeRoot 를 뺀다. */
  scopeRootInsideInstance?: boolean;
  /** 스펙 스탬프(pluginData `sigma-spec`)가 찍힌 COMPONENT id — 그 **안쪽**은 스펙 HTML 소관이라
   *  이름·소수좌표·빈프레임 규칙에서 제외한다. 인스턴스만 제외하면 마스터 페이지에서 같은 오탐이
   *  그대로 남아(OneUI 452 · SEC 마스터 1851 등 100% COMPONENT 내부) 페이지 config 로 규칙을
   *  통째로 끄는 수밖에 없었다. 스탬프 **없는** 로컬 COMPONENT 는 사람이 조립한 것이라 계속 검사한다. */
  specMasterIds?: Iterable<string>;
}

/**
 * 페이지 트리(roots)에 config.builtins 로 켜진 규칙만 실행해 Violation[] 를 반환.
 * `coverage` 를 주면 어떤 규칙이 돌았는지 함께 채운다(안 주면 동작이 100% 종전과 같다).
 */
export function runBuiltinRules(
  roots: TreeNode[],
  builtins: BuiltinsConfig = {},
  ctx: BuiltinRuleContext = {},
  coverage?: RuleCoverage,
): Violation[] {
  const out: Violation[] = [];
  const layerIds = new Set(ctx.annotationLayerIds || []);

  /**
   * **노드 자신만 보고 판정되는 규칙**이 쓰는 검사 대상. `ctx.scopeRoot` 는 이미 자식(roots)이
   * 붙은 "시작 노드 + 서브트리 전부" 다(server 의 `scopeContainer`).
   *
   * ⚠️ `roots` 는 스코프 루트의 **자식들**이라, 이걸 그대로 쓰면 `nodeId` 로 찍은 노드 자신이
   * 검사에서 빠진다. 그런데 커버리지는 "규칙이 돌았다"로 기록되므로 `byRule` 에 0 이 실려
   * **안 돈 걸 돌았다고 보고한다**(실측: 프레임을 부모 스코프에서 재면 default_name 1건,
   * 그 프레임 자신을 스코프로 주면 0건).
   *
   * ⛔ **부모/조상 문맥이 필요한 규칙에는 쓰지 않는다.** 스코프 루트의 부모는 트리 밖이라
   * `fill_sizing_orphan` 은 "부모 없음(루트)"으로, `raw_node` 는 "INSTANCE 조상 없음"으로
   * 잘못 읽어 정상 노드를 위반으로 만든다. 그 둘은 `roots` 를 그대로 쓴다.
   * 배경: docs/history/019-scope-root-skipped-by-name-rules.md
   */
  const selfRoots = ctx.scopeRoot ? [ctx.scopeRoot] : roots;

  /** opt-out 규칙: 켜졌으면 ran, 껐으면 disabled */
  const markOptOut = (id: BuiltinRuleId, on: boolean) => {
    if (coverage) (on ? coverage.ran : coverage.disabled).push(id);
    return on;
  };
  /** opt-in 규칙: enabled===true 여야 ran, 아니면 optInOff */
  const markOptIn = (id: BuiltinRuleId, on: boolean) => {
    if (coverage) (on ? coverage.ran : coverage.optInOff).push(id);
    return on;
  };

  const anyGeometricEnabled = GEOMETRIC_RULES.some((id) => isEnabled(builtins, id));
  // 기하 8종은 lintLayout 한 번으로 함께 도는데, 커버리지는 규칙 단위로 남긴다 —
  // 하나도 안 켜졌으면 lintLayout 자체를 건너뛰므로 전부 disabled 다.
  for (const id of GEOMETRIC_RULES) {
    markOptOut(id, anyGeometricEnabled && isEnabled(builtins, id));
  }
  if (anyGeometricEnabled) {
    const paddingCfg = builtins.frame_padding?.padding;
    const gapCfg = builtins.section_gap?.gap;
    const result = lintLayout(roots, {
      padding: typeof paddingCfg === 'number' ? paddingCfg : DEFAULT_PADDING,
      sectionGap: typeof gapCfg === 'number' ? gapCfg : DEFAULT_SECTION_GAP,
      annotationLayerIds: layerIds,
      scopeRoot: ctx.scopeRoot,
      isPageRoot: ctx.isPageRoot !== false,
    });
    for (const v of result.violations) {
      if (isEnabled(builtins, v.rule)) {
        out.push({ rule: v.rule, source: 'builtin', message: v.message, nodes: v.nodes, fix: v.fix, ...(v.metrics ? { metrics: v.metrics } : {}) });
      }
    }
  }

  // 이 셋은 **스펙이 만든 트리 내부를 기본으로 건너뛴다** — 스펙 HTML 이 만든 래퍼 이름("Frame")·
  // CSS 계산 소수 좌표·자식 없는 아이콘 프레임이 오탐의 전부였고(L1-2 실측: default_name 5277건,
  // empty_container 72건이 100% 인스턴스 내부), 그것 때문에 세 규칙이 통째로 꺼져 있었다.
  // 인스턴스뿐 아니라 **스탬프 찍힌 마스터(COMPONENT) 내부도** 같은 이유로 제외한다(specMasterIds).
  // 스펙 자체를 감사할 때는 includeInsideInstances: true 로 안쪽까지 켠다.
  const specMasters = ctx.specMasterIds ? new Set(ctx.specMasterIds) : undefined;
  const instScope = (id: BuiltinRuleId) => ({
    includeInsideInstances: (builtins[id] as { includeInsideInstances?: boolean } | undefined)?.includeInsideInstances === true,
    specMasterIds: specMasters,
  });

  /**
   * 위 세 규칙(+instance_default_name)이 쓰는 검사 대상. 면제는 **조상**을 보고 정해지는데 스코프
   * 루트의 조상은 트리 밖이라, 스코프 루트가 인스턴스 안쪽이면 규칙이 면제를 못 걸고 스펙이 만든
   * "Frame" 래퍼를 그대로 위반으로 올린다(실측: 통합 기획 파일 한 페이지에 그런 노드가 7870개).
   * 그래서 그때만 스코프 루트를 뺀다 — 조상 판정은 플러그인이 `rootNodeInsideInstance` 로 준다.
   * `includeInsideInstances: true`(스펙 자체를 감사할 때)면 애초에 면제가 없으므로 그대로 넣는다.
   */
  const exemptRoots = (id: BuiltinRuleId) =>
    ctx.scopeRootInsideInstance === true && !instScope(id).includeInsideInstances ? roots : selfRoots;
  if (markOptOut('stray_pixel', isEnabled(builtins, 'stray_pixel'))) out.push(...strayPixelRule(exemptRoots('stray_pixel'), instScope('stray_pixel')));
  if (markOptOut('default_name', isEnabled(builtins, 'default_name'))) out.push(...defaultNameRule(exemptRoots('default_name'), { ...instScope('default_name'), includeVectors: (builtins.default_name as { includeVectors?: boolean } | undefined)?.includeVectors === true }));
  if (markOptOut('empty_container', isEnabled(builtins, 'empty_container'))) out.push(...emptyContainerRule(exemptRoots('empty_container'), instScope('empty_container')));
  if (markOptOut('hidden_leaf', isEnabled(builtins, 'hidden_leaf'))) out.push(...hiddenLeafRule(selfRoots));
  // ⛔ fill_sizing_orphan 만 roots — 부모를 봐야 판정되므로 스코프 루트를 넣으면 그 노드가
  //    "부모 없음(루트)" 으로 읽혀 정상 FILL 노드가 위반이 된다(selfRoots 주석 참조).
  if (markOptOut('fill_sizing_orphan', isEnabled(builtins, 'fill_sizing_orphan'))) out.push(...fillSizingOrphanRule(roots));
  if (markOptOut('component_description_empty', isEnabled(builtins, 'component_description_empty'))) out.push(...componentDescriptionEmptyRule(selfRoots));
  // content_above_annotation 도 노드 자신(과 그 자식들)만 보고 판정되는 구조 규칙이라 selfRoots —
  // roots(자식들)만 쓰면 스코프 루트 자신의 직속 자식 사이 z-order(anno vs 콘텐츠)를 못 본다.
  if (markOptOut('content_above_annotation', isEnabled(builtins, 'content_above_annotation'))) {
    const extraAliases = builtins.content_above_annotation?.aliases;
    out.push(...contentAboveAnnotationRule(selfRoots, Array.isArray(extraAliases) ? extraAliases as string[] : undefined));
  }

  // raw_node 만 opt-in: 미기재/enabled≠true 면 실행 안 함(다른 빌트인의 opt-out 기본 ON 과 반대).
  // ⛔ roots — 조상에 INSTANCE/COMPONENT 가 있으면 면제하는 규칙이라, 조상이 트리 밖인
  //    스코프 루트를 넣으면 인스턴스 안의 정상 프레임이 "raw" 로 잡힌다(selfRoots 주석 참조).
  if (markOptIn('raw_node', builtins.raw_node?.enabled === true)) out.push(...rawNodeRule(roots, builtins.raw_node as RawNodeConfig));

  // annotation_layer 도 opt-in: 켜진 페이지에서 모든 SECTION 은 기획 레이어를 직속 자식으로 가져야 한다.
  // ⚠️ 스코프 루트 자신도 봐야 한다 — 섹션 하나를 nodeId 로 검사하면 그 섹션은 roots 가 아니라
  // scopeRoot 로 오므로, roots 만 보면 "레이어가 없어도 0건" 이 된다.
  // 배경: docs/history/017-scope-root-was-never-linted.md
  if (markOptIn('annotation_layer', builtins.annotation_layer?.enabled === true)) {
    out.push(...annotationLayerRule(selfRoots, layerIds));
  }

  // instance_default_name 도 opt-in: 인스턴스 이름이 마스터 컴포넌트 이름 그대로면 위반.
  // 스코프 루트가 인스턴스 안쪽이면 그건 **중첩 인스턴스**라 이 규칙의 대상이 아니다(exemptRoots).
  if (markOptIn('instance_default_name', builtins.instance_default_name?.enabled === true)) {
    out.push(...instanceDefaultNameRule(exemptRoots('instance_default_name'), ctx.instanceComponentNames || new Map()));
  }

  // 페이지 루트 전용 2종(opt-in) — 서브트리 스코프에선 좌표 기준이 달라져 아예 실행하지 않는다.
  // 켰는데 스코프 때문에 못 돈 경우는 optInOff 가 아니라 skipped 다("껐다"와 "못 돌았다"는 다르다).
  for (const id of ['origin_anchor', 'content_spread'] as const) {
    const on = builtins[id]?.enabled === true;
    if (!on) { coverage?.optInOff.push(id); continue; }
    if (!ctx.isPageRoot) {
      coverage?.skipped.push({ rule: id, reason: 'nodeId/path 서브트리 스코프 — 페이지 절대좌표 전제라 실행되지 않음' });
      continue;
    }
    coverage?.ran.push(id);
    if (id === 'origin_anchor') {
      const tol = builtins.origin_anchor!.tolerance;
      out.push(...originAnchorRule(roots, typeof tol === 'number' ? tol : DEFAULT_ORIGIN_TOLERANCE));
    } else {
      const gap = builtins.content_spread!.maxGap;
      out.push(...contentSpreadRule(roots, typeof gap === 'number' ? gap : DEFAULT_MAX_GAP));
    }
  }

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

/**
 * instance_default_name (opt-in) — INSTANCE 의 이름이 마스터 컴포넌트 이름과 같으면(=인스턴스에
 * 고유 이름을 부여하지 않았으면) 위반. componentNames 는 서버가 getNodesInfo 로 채운 INSTANCE id →
 * 마스터 이름 맵. 맵에 없는 인스턴스는 판정 불가로 건너뛴다(조회 실패 안전 기본값).
 * 중첩 인스턴스(다른 INSTANCE 내부)는 검사하지 않는다 — 마스터 정의의 사본이라 독립 저작 대상이
 * 아니다(raw_node 의 "INSTANCE 내부 제외"와 동일). INSTANCE 를 만나면 자기만 판정하고 하위로 내려가지 않는다.
 */
export function instanceDefaultNameRule(roots: TreeNode[], componentNames: ReadonlyMap<string, string>): Violation[] {
  const out: Violation[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'INSTANCE') {
        const master = componentNames.get(n.id);
        if (master && n.name === master) {
          out.push({
            rule: 'instance_default_name', source: 'builtin',
            message: `인스턴스 "${n.name}" (${n.id}) 가 마스터 컴포넌트 이름 그대로입니다 — 고유 이름을 부여하세요`,
            nodes: [n.id],
          });
        }
        continue; // INSTANCE 내부(중첩 인스턴스 포함)는 검사 대상 아님
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
