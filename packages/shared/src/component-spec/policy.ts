/**
 * 컴포넌트 스펙 등록 정책 — 파일(문서)에 저장된 lint config 의 `componentSpec` 블록으로
 * "이 파일에서 이런 이름의 스펙을 등록/갱신하면 경고" 를 건다.
 *
 * 스코프를 의도적으로 좁게 둔다:
 * - **경고만** 한다. 등록을 막지 않는다 — 거부는 카탈로그 작업을 중단시키므로, 규약을 아직
 *   합의 못 한 팀에서 도구가 먼저 벽이 되는 걸 피한다(필요해지면 action 을 추가).
 * - 판정 입력은 alias/namespace **와 HTML·description 패턴**이다. 형식 규칙(무엇이 유효한 HTML 인가)은
 *   여전히 validate.ts 의 몫이고, 여기는 **파일의 정책**(이 파일에서 이런 걸 등록하면 알려 달라)만 본다.
 *   HTML 을 판정 입력에 넣은 이유는 실제 사고 때문이다 — 아이콘 창작 금지 같은 규약은 alias 로는
 *   못 잡는다. 위반이 대부분 *아이콘 스펙이 아니라 다른 컴포넌트 HTML 안에 inline `<svg>` 로 묻힌*
 *   형태라서다(손그림 고래·정렬 캐럿·가짜 로고가 전부 그렇게 들어왔다).
 * - 게이트는 **sigma 도구 경로만** 덮는다. 사람이 Figma 에서 직접 만든 컴포넌트는 여기 안 걸린다.
 */

export interface SpecNamingRule {
  /** 사람이 읽는 메모. 검증만 통과하고 동작에는 쓰이지 않는다.
   *  배경: docs/history/013-strict-config-left-no-room-for-notes.md */
  $comment?: string | string[];
  /** alias 에 적용할 정규식 (예: "^table$", "^btn_") */
  aliasPattern?: string;
  /** 스펙 HTML 에 적용할 정규식 (예: "<svg" — 아이콘을 새로 그렸는지) */
  htmlPattern?: string;
  /** description 이 이 정규식에 걸리면 **면제**한다 (예: 출처를 적어 뒀으면 통과) */
  unlessDescription?: string;
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
  target: { alias: string; namespace: string; html?: string; description?: string },
): string[] {
  const rules = policy?.warn;
  if (!rules || rules.length === 0) return [];

  const out: string[] = [];
  for (const rule of rules) {
    if (rule.namespace && rule.namespace !== target.namespace) continue;

    // 조건이 하나도 없는 규칙은 "전부 매칭" 이 되어 경고를 무의미하게 만든다 — 규칙 쪽 실수로 본다.
    if (!rule.aliasPattern && !rule.htmlPattern) {
      out.push('정책 규칙에 aliasPattern 도 htmlPattern 도 없어 건너뛰었습니다 (조건 없는 규칙은 전부 매칭됩니다)');
      continue;
    }

    const test = (pattern: string, value: string, field: string): boolean | null => {
      try {
        return new RegExp(pattern).test(value);
      } catch {
        out.push(`정책 규칙의 ${field} 이 올바른 정규식이 아니라 건너뛰었습니다: "${pattern}"`);
        return null;
      }
    };

    if (rule.aliasPattern) {
      const hit = test(rule.aliasPattern, target.alias, 'aliasPattern');
      if (hit === null) continue;
      if (!hit) continue;
    }
    if (rule.htmlPattern) {
      // html 을 넘겨받지 못한 호출(구 호출부)에서는 이 조건을 판정할 수 없으므로 규칙을 적용하지 않는다.
      if (target.html === undefined) continue;
      const hit = test(rule.htmlPattern, target.html, 'htmlPattern');
      if (hit === null) continue;
      if (!hit) continue;
    }
    if (rule.unlessDescription) {
      const exempt = test(rule.unlessDescription, target.description || '', 'unlessDescription');
      if (exempt === null) continue;
      if (exempt) continue;
    }
    out.push(rule.message);
  }
  return out;
}
