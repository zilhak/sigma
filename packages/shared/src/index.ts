// Types
export type {
  RGBA,
  BoundingRect,
  ComputedStyles,
  ExtractedNode,
  ExtractedData,
  ApiResponse,
  ExtractPayload,
  WebSocketMessage,
  TreeFilter,
  TreeFields,
  TreeNode,
  FindNodeResult,
  GetTreeResult,
} from './types';

// Color utilities
export { parseColor, rgbaToString } from './colors';

// Component Spec (컴포넌트 스펙 시스템)
export type {
  ComponentParam,
  ComponentSizing,
  ComponentSpecRecord,
  SpecValidationResult,
  ComponentSpecStamp,
  ComponentSpecPolicy,
  SpecNamingRule,
} from './component-spec';
export {
  checkSpecNamingPolicy,
  validateComponentSpecHtml,
  isValidSpecName,
  ALLOWED_CSS_PROPS,
  ALLOWED_TAGS,
  SPEC_NAME_RE,
  SPEC_HTML_MAX_LENGTH,
} from './component-spec';

// Constants
export {
  PORTS,
  HTTP_PORT,
  WS_PORT,
  SERVER_URL,
  WEBSOCKET_URL,
  API,
  STORAGE_PATH,
  EXTRACTED_PATH,
} from './constants';

// Lint (sigma_lint) — 빌트인 20종 엔진(기하/구조/occlusion/페이지 루트), JSON/predicate 커스텀 규칙
export type {
  LayoutRule,
  LayoutFix,
  LayoutViolation,
  LintOptions,
  LintResult,
} from './lint/geometric';
export {
  DEFAULT_PADDING,
  DEFAULT_SECTION_GAP,
  lintLayout,
} from './lint/geometric';
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
} from './lint/types';
export {
  ALL_BUILTIN_RULE_IDS,
  collectFixableViolations,
  mergeFixesBySection,
  runBuiltinRules,
  isEnabled,
} from './lint/engine';
export { compileMatchRule, runMatchRule, matchesQuery, queryNodes, assertQueryShape, QueryShapeError, type CompiledMatchRule, type NodeQuery } from './lint/json-rule';
export {
  strayPixelRule, defaultNameRule, emptyContainerRule, hiddenLeafRule,
  fillSizingOrphanRule, componentDescriptionEmptyRule,
} from './lint/simple-rules';
export { fullyOccludedSiblingRule } from './lint/occlusion';
export { instanceResizedFromSpecRule, type InstanceResizedConfig } from './lint/spec-instance';
export { annotationMarkerPairRule, annotationMarkerGapRule, type AnnotationMarkerPairConfig, type AnnotationMarkerGapConfig } from './lint/annotation-marker';
export { fontNotDefaultRule, type FontNotDefaultConfig } from './lint/font';
export {
  originAnchorRule, contentSpreadRule,
  DEFAULT_ORIGIN_TOLERANCE, DEFAULT_MAX_GAP,
} from './lint/page-rules';
export { flattenTree, buildRelationMaps, type FlatEntry, type RelationMaps } from './lint/tree-utils';
