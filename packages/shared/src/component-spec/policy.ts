/**
 * 컴포넌트 스펙 등록 정책 — 파일(문서)에 저장된 lint config 의 `componentSpec` 블록으로
 * "이 파일에서 이런 이름의 스펙을 등록/갱신하면 경고" 를 건다.
 *
 * 스코프를 의도적으로 좁게 둔다:
 * - **경고만** 한다. 등록을 막지 않는다 — 거부는 카탈로그 작업을 중단시키므로, 규약을 아직
 *   합의 못 한 팀에서 도구가 먼저 벽이 되는 걸 피한다(필요해지면 action 을 추가).
 * - 판정 입력은 **alias/namespace 뿐**이다. HTML 내용 검사는 validate.ts(형식 규칙)의 몫이고,
 *   문서에 이미 놓인 노드 검사는 sigma_lint 의 몫이다.
 * - 게이트는 **sigma 도구 경로만** 덮는다. 사람이 Figma 에서 직접 만든 컴포넌트는 여기 안 걸린다.
 */

export interface SpecNamingRule {
  /** alias 에 적용할 정규식 (예: "^table$", "^btn_") */
  aliasPattern: string;
  /** 매칭 시 보여줄 경고 문구 (왜 안 되는지 + 대안을 적는다) */
  message: string;
  /** 이 namespace 에서만 적용 (생략 시 전체) */
  namespace?: string;
}

export interface ComponentSpecPolicy {
  /** 매칭되면 경고를 붙인다(등록은 그대로 진행) */
  warn?: SpecNamingRule[];
}

/**
 * 등록하려는 (namespace, alias) 에 걸리는 경고 문구들을 반환한다. 없으면 빈 배열.
 * 잘못된 정규식은 조용히 넘기지 않고 그 사실 자체를 경고로 돌려준다 — 정책이 안 도는데
 * 통과한 것처럼 보이는 게 가장 나쁜 실패라서.
 */
export function checkSpecNamingPolicy(
  policy: ComponentSpecPolicy | undefined,
  target: { alias: string; namespace: string },
): string[] {
  const rules = policy?.warn;
  if (!rules || rules.length === 0) return [];

  const out: string[] = [];
  for (const rule of rules) {
    if (rule.namespace && rule.namespace !== target.namespace) continue;
    let re: RegExp;
    try {
      re = new RegExp(rule.aliasPattern);
    } catch {
      out.push(`정책 규칙의 aliasPattern 이 올바른 정규식이 아니라 건너뛰었습니다: "${rule.aliasPattern}"`);
      continue;
    }
    if (re.test(target.alias)) out.push(rule.message);
  }
  return out;
}
