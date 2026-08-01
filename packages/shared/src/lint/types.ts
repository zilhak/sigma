import type { LayoutFix } from './geometric';

/**
 * 커스텀/JSON 규칙이 보는 노드 뷰. TreeNode(구조/좌표) + get_node_info 상세 필드(스타일/텍스트 등)를
 * 서버가 합쳐서 만든다. 상세 필드는 요청 스코프 안에서만 채워지므로 전부 옵셔널.
 * [key: string]로 열어둔 건 json-rule 의 `check.field` 임의 경로 조회를 허용하기 위함.
 */
export interface LintNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childCount: number;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  fills?: unknown;
  strokes?: unknown;
  strokeWeight?: number;
  cornerRadius?: unknown;
  characters?: string;
  fontSize?: unknown;
  fontName?: unknown;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  layoutMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Violation {
  /** 빌트인 규칙 id 또는 커스텀 규칙의 `id` */
  rule: string;
  source: 'builtin' | 'custom';
  message: string;
  /** 관련 노드 id (첫 번째가 위반 주체) */
  nodes: string[];
  /** 자동수정 가능하면 안전 fix. 빌트인 기하 규칙(frame_padding/child_overflow)만 가짐 — 커스텀은 read-only */
  fix?: LayoutFix;
  /** predicate 규칙이 타임아웃/예외로 실패하면 결과 대신 여기 기록 (부분 실패 허용) */
  error?: string;
}

export type BuiltinRuleId =
  | 'outside_section' | 'section_overlap' | 'section_gap' | 'card_overlap'
  | 'frame_padding' | 'instance_orphan' | 'component_needs_frame' | 'child_overflow'
  | 'stray_pixel' | 'default_name' | 'empty_container' | 'hidden_leaf'
  | 'fill_sizing_orphan' | 'component_description_empty' | 'fully_occluded_sibling'
  | 'raw_node' | 'annotation_layer' | 'instance_default_name'
  | 'origin_anchor' | 'content_spread';

export interface BuiltinRuleConfig {
  /** 생략하면 기본 ON (opt-out 모델 — 8개 기하 규칙의 기존 동작을 그대로 유지하기 위함) */
  enabled?: boolean;
  [param: string]: unknown;
}

export type BuiltinsConfig = Partial<Record<BuiltinRuleId, BuiltinRuleConfig>>;

export type JsonOp = 'equals' | 'range' | 'regex' | 'oneOf' | 'exists';

export interface JsonCheck {
  op: JsonOp;
  /** 노드에서 값을 꺼낼 경로. "cornerRadius", "fills[0].opacity" 등 */
  field: string;
  value?: unknown;
  min?: number;
  max?: number;
  pattern?: string;
  values?: unknown[];
}

export interface MatchRule {
  id: string;
  kind?: 'match';
  select: { type?: string; namePattern?: string };
  check: JsonCheck;
  /** {name}/{actual} 치환 지원. 생략 시 기본 메시지 */
  message?: string;
}

export interface PredicateRule {
  id: string;
  kind: 'predicate';
  /** `export default function(node, ctx) { return null 또는 {message} }` 형태의 JS 소스 */
  code: string;
  /** 규칙 전체 실행(전 노드 순회) 타임아웃(ms). 기본 2000 */
  timeoutMs?: number;
}

export type CustomRuleRecord = MatchRule | PredicateRule;

export interface LintConfig {
  builtins?: BuiltinsConfig;
  custom?: CustomRuleRecord[];
}
