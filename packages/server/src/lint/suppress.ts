/**
 * 노드 단위 lint 억제(inline suppress) — eslint-disable 대응.
 * 노드의 sigma sharedPluginData["lint-ignore"] 값을 해석해, 그 노드가 주체인 위반을 걸러낸다.
 *
 * 값 형태(JSON):
 *   true                                   → 이 노드의 모든 룰 억제
 *   ["raw_node", ...]                      → 지정 룰만 억제
 *   { "rules": ["raw_node"], "reason": …}  → 지정 룰 + 의도(reason) 기록
 *   { "rules": "all", "reason": … }        → 모든 룰 + 의도
 */
import type { Violation } from '@sigma/shared/lint';

export interface LintIgnore {
  all: boolean;
  rules: Set<string>;
  reason?: string;
}

/**
 * "lint-ignore" 원시 문자열(JSON) → 정규화된 LintIgnore. 파싱 실패/무의미하면 null.
 */
export function parseLintIgnore(raw: string | null | undefined): LintIgnore | null {
  if (raw == null || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === true) return { all: true, rules: new Set() };
  if (Array.isArray(parsed)) {
    const rules = new Set(parsed.filter((r): r is string => typeof r === 'string'));
    return rules.size ? { all: false, rules } : null;
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { rules?: unknown; reason?: unknown };
    const reason = typeof obj.reason === 'string' ? obj.reason : undefined;
    if (obj.rules === 'all') return { all: true, rules: new Set(), reason };
    if (Array.isArray(obj.rules)) {
      const rules = new Set(obj.rules.filter((r): r is string => typeof r === 'string'));
      if (rules.size) return { all: false, rules, reason };
    }
    // rules 없이 reason만 있으면 "모든 룰 억제 + 사유"로 관대하게 해석
    if (obj.rules === undefined && reason !== undefined) return { all: true, rules: new Set(), reason };
  }
  return null;
}

export function isSuppressed(ignore: LintIgnore, ruleId: string): boolean {
  return ignore.all || ignore.rules.has(ruleId);
}

/**
 * ignoreMap(nodeId → 원시 lint-ignore 문자열)을 적용해 억제된 위반을 걸러낸다.
 * 위반 주체는 v.nodes[0]. 반환: { kept, suppressedCount }.
 */
export function filterSuppressed(
  violations: Violation[],
  ignoreMap: Record<string, string>,
): { kept: Violation[]; suppressedCount: number } {
  const cache = new Map<string, LintIgnore | null>();
  const getIgnore = (nodeId: string): LintIgnore | null => {
    if (cache.has(nodeId)) return cache.get(nodeId)!;
    const ig = parseLintIgnore(ignoreMap[nodeId]);
    cache.set(nodeId, ig);
    return ig;
  };

  const kept: Violation[] = [];
  let suppressedCount = 0;
  for (const v of violations) {
    const subject = v.nodes[0];
    const ig = subject ? getIgnore(subject) : null;
    if (ig && isSuppressed(ig, v.rule)) {
      suppressedCount++;
      continue;
    }
    kept.push(v);
  }
  return { kept, suppressedCount };
}

/** 위반 주체 노드 id 집합(중복 제거) — 배치 lint-ignore 조회 대상. */
export function collectSubjectNodeIds(violations: Violation[]): string[] {
  const ids = new Set<string>();
  for (const v of violations) {
    if (v.nodes[0]) ids.add(v.nodes[0]);
  }
  return [...ids];
}
