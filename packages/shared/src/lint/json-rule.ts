/**
 * JSON 선언적 규칙(MatchRule) → 프레디케이트 컴파일러.
 *
 * 1단계 벤치마킹(§3·§4)에서 실측 확인한 경계: "필드 등가/범위/정규식/열거/존재" 계열은
 * 소수 범용 연산자로 충분하지만, 관계형(형제/조상)·유도값(변수 바인딩) 검사는 여기 넣으면
 * 연산자가 끝없이 늘어나 축소판 언어를 재발명하게 된다 — 그런 경우는 `kind:"predicate"`로 보낸다.
 * 이 파일은 절대 연산자를 늘리지 않는다(가드레일).
 */
import type { JsonCheck, LintNode, MatchRule, Violation } from './types';

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** select 가 아는 키. 이 밖의 키는 조용히 무시하지 않고 거부한다(아래 assertQueryShape 참고). */
const SELECT_KEYS = new Set(['type', 'namePattern']);
/** check 가 아는 연산자와 키. */
const CHECK_OPS = new Set(['equals', 'range', 'regex', 'oneOf', 'exists']);
const CHECK_KEYS = new Set(['op', 'field', 'value', 'min', 'max', 'pattern', 'values']);

/** 조건 스펙 오류. 호출자가 그대로 사용자에게 보여 준다. */
export class QueryShapeError extends Error {}

/**
 * select/checks 의 키·연산자를 검사한다.
 *
 * ⚠️ 왜 있는가: 모르는 키를 무시하면 **조건이 통째로 사라진 채 "전부 매칭"이 된다.**
 * 실사고 — `select:{nameContains:"tbl_"}` 로 노드를 세려다 페이지 전체를 받았고,
 * 응답이 정상이라 "필터가 동작하지 않는다"고 도구 버그로 오진했다. 조건 검색은
 * 틀렸을 때 0건이 아니라 **전건**이 나오는 방향으로 실패하므로 조용한 무시가 특히 위험하다.
 */
export function assertQueryShape(query: NodeQuery, where = 'where'): void {
  // ⚠️ `where` **자신의** 키부터 본다. 사고를 낸 호출 모양이 정확히 이것이었다 —
  // `select` 로 감싸지 않고 `where:{nameContains:"…"}` 처럼 평탄한 키를 바로 준 것.
  // select 안쪽만 검사하면 이 모양은 "조건이 하나도 없음"이 되어 전건 매칭으로 조용히 통과한다.
  for (const k of Object.keys(query || {})) {
    if (k !== 'select' && k !== 'checks') {
      throw new QueryShapeError(
        `${where} 에 모르는 키 "${k}" 가 있습니다. ${where} 의 키는 select·checks 뿐입니다` +
        (SELECT_KEYS.has(k) || k === 'name' || k === 'nameContains'
          ? ` — 노드를 고르는 조건은 ${where}.select 안에 넣으세요(예: ${where}: { select: { namePattern: "^tbl_" } }).`
          : '.')
      );
    }
  }
  if (!query.select && !(query.checks && query.checks.length > 0)) {
    throw new QueryShapeError(
      `${where} 에 조건이 하나도 없습니다 — 이대로면 **전건**이 매칭됩니다. select 나 checks 를 주세요(정말 전건을 원하면 조건 없이 부르지 말고 목록 조회 도구를 쓰세요).`
    );
  }
  if (query.select) {
    for (const k of Object.keys(query.select)) {
      if (!SELECT_KEYS.has(k)) {
        throw new QueryShapeError(
          `${where}.select 에 모르는 키 "${k}" 가 있습니다. 쓸 수 있는 키는 ${[...SELECT_KEYS].join('·')} 뿐입니다` +
          (k === 'name' || k === 'nameContains'
            ? ` — 이름으로 좁히려면 정규식 namePattern 을 쓰세요(예: namePattern: "^${'tbl_'}").`
            : '.')
        );
      }
    }
  }
  for (const check of query.checks || []) {
    for (const k of Object.keys(check)) {
      if (!CHECK_KEYS.has(k)) {
        throw new QueryShapeError(`${where}.checks 에 모르는 키 "${k}" 가 있습니다. 쓸 수 있는 키는 ${[...CHECK_KEYS].join('·')} 뿐입니다.`);
      }
    }
    if (!CHECK_OPS.has(check.op as string)) {
      throw new QueryShapeError(`${where}.checks 의 op "${check.op}" 는 없는 연산자입니다. 쓸 수 있는 연산자는 ${[...CHECK_OPS].join('·')} 뿐입니다.`);
    }
    if (typeof check.field !== 'string' || check.field === '') {
      throw new QueryShapeError(`${where}.checks 의 항목에 field 가 없습니다.`);
    }
    // 연산자별 필수 인자. ⚠️ 없으면 **전건 매칭으로 조용히 무너진다** — 특히 regex 는
    // 배경: docs/history/016-regex-check-without-pattern-matched-everything.md
    // `new RegExp('')` 이 어떤 문자열에나 맞아서, 빠진 것을 결과만 보고는 알 수 없다.
    // 실사고: `{op:'regex', field:'characters', value:'…'}` 로 불렀다(진짜 키는 pattern).
    // `value` 는 equals 의 키라 「모르는 키」 검사에도 안 걸려, 서로 다른 패턴 셋이
    // 전부 같은 1047건을 돌려줬다. 조건 검색은 틀렸을 때 0건이 아니라 전건으로 실패한다.
    const missing =
      check.op === 'regex' ? (typeof check.pattern === 'string' && check.pattern !== '' ? null : 'pattern')
      : check.op === 'oneOf' ? (Array.isArray(check.values) ? null : 'values')
      : check.op === 'equals' ? (check.value !== undefined ? null : 'value')
      : check.op === 'range' ? (check.min !== undefined || check.max !== undefined ? null : 'min 이나 max')
      : null;
    if (missing) {
      throw new QueryShapeError(
        `${where}.checks 의 op "${check.op}" 에 ${missing} 가 없습니다 — 이대로면 조건이 사라져 **전건**이 매칭됩니다.` +
        (check.op === 'regex' && check.value !== undefined
          ? ' regex 의 패턴은 value 가 아니라 pattern 에 넣습니다(예: { op: "regex", field: "characters", pattern: "^tbl_" }).'
          : '')
      );
    }
  }
}

function evalCheck(check: JsonCheck, actual: unknown): boolean {
  switch (check.op) {
    case 'equals':
      return actual === check.value;
    case 'range': {
      if (typeof actual !== 'number') return false;
      const min = check.min !== undefined ? check.min : -Infinity;
      const max = check.max !== undefined ? check.max : Infinity;
      return actual >= min && actual <= max;
    }
    case 'regex':
      return typeof actual === 'string' && new RegExp(check.pattern || '').test(actual);
    case 'oneOf':
      return Array.isArray(check.values) && check.values.includes(actual);
    case 'exists':
      return actual !== undefined && actual !== null;
    default:
      // 여기 오면 스펙 검사(assertQueryShape)를 건너뛴 경로가 있다는 뜻이다.
      // 조용히 통과시키면 조건이 사라진 채 전건 매칭이 되므로 터뜨린다.
      throw new QueryShapeError(`없는 연산자 op "${(check as JsonCheck).op}" 입니다.`);
  }
}

function matchesSelect(node: LintNode, select: MatchRule['select']): boolean {
  if (select.type && node.type !== select.type) return false;
  if (select.namePattern && !new RegExp(select.namePattern).test(node.name)) return false;
  return true;
}

function formatMessage(template: string | undefined, rule: MatchRule, node: LintNode, actual: unknown): string {
  const base = template !== undefined
    ? template
    : `"{name}" 규칙 "${rule.id}" 위반 (현재 {actual})`;
  return base.replace(/\{name\}/g, node.name).replace(/\{actual\}/g, String(actual));
}

/** 컴파일된 규칙: 노드 하나를 받아 위반이면 Violation, 매칭 안되거나 통과하면 null. */
export type CompiledMatchRule = (node: LintNode) => Violation | null;

export function compileMatchRule(rule: MatchRule): CompiledMatchRule {
  assertQueryShape({ select: rule.select, checks: [rule.check] }, `custom 규칙 "${rule.id}"`);
  return (node) => {
    if (!matchesSelect(node, rule.select)) return null;
    const actual = getByPath(node, rule.check.field);
    if (evalCheck(rule.check, actual)) return null;
    return {
      rule: rule.id,
      source: 'custom',
      message: formatMessage(rule.message, rule, node, actual),
      nodes: [node.id],
    };
  };
}

/** 트리 전체(평탄화된 노드 목록)에 하나의 MatchRule 을 적용. */
export function runMatchRule(rule: MatchRule, nodes: LintNode[]): Violation[] {
  const compiled = compileMatchRule(rule);
  const out: Violation[] = [];
  for (const n of nodes) {
    const v = compiled(n);
    if (v) out.push(v);
  }
  return out;
}

// === 검색(query) 용도 ===
// lint 는 "조건에 맞으면 위반", 검색은 "조건에 맞으면 결과"로 의미가 반대지만
// 판정에 쓰는 부품(select 매칭 · 필드 접근 · 연산자)은 완전히 같다. 여기서 그 부품을
// 그대로 재사용한다 — 연산자를 늘리지 않는 이 파일의 가드레일도 함께 상속한다.

/** 검색 조건. checks 는 모두 만족해야 하는 AND 결합(OR 는 호출을 나눈다). */
export interface NodeQuery {
  select?: { type?: string; namePattern?: string };
  checks?: JsonCheck[];
}

/** 노드 하나가 검색 조건을 만족하는지. */
export function matchesQuery(node: LintNode, query: NodeQuery): boolean {
  if (query.select && !matchesSelect(node, query.select)) return false;
  for (const check of query.checks || []) {
    if (!evalCheck(check, getByPath(node, check.field))) return false;
  }
  return true;
}

/** 평탄화된 노드 목록에서 조건에 맞는 노드를 고른다(입력 순서 유지). */
export function queryNodes(nodes: LintNode[], query: NodeQuery): LintNode[] {
  assertQueryShape(query);
  return nodes.filter((n) => matchesQuery(n, query));
}
