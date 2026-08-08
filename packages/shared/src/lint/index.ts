/**
 * Lint 엔진 (`sigma_lint`) 공개 표면.
 *
 * 기본 배럴(`@sigma/shared`)이 아니라 서브패스 `@sigma/shared/lint` 로만 노출한다 —
 * 소비자가 서버 하나뿐인데 기본 배럴에 얹으면 플러그인·확장의 타입 표면까지 오염되고,
 * shared 가 무슨 패키지인지 알 수 없게 된다. `./extractor` 와 같은 정책이다.
 */

// Lint (sigma_lint) — 빌트인 20종 엔진(기하/구조/occlusion/페이지 루트), JSON/predicate 커스텀 규칙
export type {
  LayoutRule,
  LayoutFix,
  LayoutViolation,
  LintOptions,
  LintResult,
} from './geometric';
export {
  DEFAULT_PADDING,
  DEFAULT_SECTION_GAP,
  lintLayout,
} from './geometric';
export type {
  BuiltinRuleId,
  BuiltinRuleConfig,
  BuiltinsConfig,
  CustomRuleRecord,
  JsonCheck,
  JsonOp,
  LintConfig,
  LintNode,
  MatchRule,
  PredicateRule,
  Violation,
} from './types';
export {
  ALL_BUILTIN_RULE_IDS,
  BUILTIN_RULE_PARAMS,
  collectFixableViolations,
  mergeFixesBySection,
  runBuiltinRules,
  isEnabled,
  emptyCoverage,
  ENGINE_EXTERNAL_RULE_IDS,
  type RuleCoverage,
} from './engine';
export { compileMatchRule, runMatchRule, matchesQuery, queryNodes, assertQueryShape, QueryShapeError, type CompiledMatchRule, type NodeQuery } from './json-rule';
export {
  strayPixelRule, defaultNameRule, emptyContainerRule, hiddenLeafRule,
  fillSizingOrphanRule, componentDescriptionEmptyRule,
} from './simple-rules';
export { fullyOccludedSiblingRule } from './occlusion';
export { instanceResizedFromSpecRule, type InstanceResizedConfig } from './spec-instance';
export { annotationMarkerPairRule, annotationMarkerGapRule, type AnnotationMarkerPairConfig, type AnnotationMarkerGapConfig } from './annotation-marker';
export { fontNotDefaultRule, type FontNotDefaultConfig } from './font';
export {
  originAnchorRule, contentSpreadRule,
  DEFAULT_ORIGIN_TOLERANCE, DEFAULT_MAX_GAP,
} from './page-rules';
export { flattenTree, buildRelationMaps, type FlatEntry, type RelationMaps } from './tree-utils';
