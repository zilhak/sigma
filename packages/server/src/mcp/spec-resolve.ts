/**
 * 컴포넌트 스펙 alias → 레코드 해석.
 *
 * 스펙 워크플로는 컴포넌트를 **(namespace, alias)** 로 가리킨다 — 등록·인스턴스 생성·삭제가 모두
 * 그렇다. 이 해석기가 handlers/component-spec.ts 안에만 있어서 다른 핸들러(sigma_swap_component)는
 * raw `componentKey` 를 요구했고, 그 key 를 얻으려면 상세 조회를 한 번 더 돌아야 했다.
 * 핸들러끼리 서로 import 하지 않도록 여기로 뺀다.
 */
import type { ComponentSpecRecord } from '@sigma/shared';
import { jsonResponse, type ToolResult } from './helpers.js';
import {
  getComponentSpec,
  listComponentSpecs,
  findComponentSpecsByAlias,
} from '../storage/component-specs.js';

/**
 * 오타 후보 추리기 — 전체 카탈로그를 덤프하지 않기 위한 것.
 *
 * 배경: docs/history/001-unknown-alias-error-dumped-1427-specs.md
 * 오타 하나에 등록 스펙 전체(실측 1427개)가 응답에 실려 수만 토큰이 나갔다. 그 목록은
 * 사람도 모델도 읽지 않는다 — 필요한 건 "혹시 이건가" 몇 개다.
 *
 * 점수: 완전포함 > 접두 공유 길이. 정렬 후 상위 N개만. 라이브러리 없이 충분하다.
 */
function suggest(alias: string, candidates: string[], limit = 8): string[] {
  const a = alias.toLowerCase();
  const scored = candidates
    .map((c) => {
      const base = (c.includes('/') ? c.slice(c.indexOf('/') + 1) : c).toLowerCase();
      let score = 0;
      if (base === a) score = 1000;
      else if (base.includes(a) || a.includes(base)) score = 500 + Math.min(base.length, a.length);
      else {
        let i = 0;
        while (i < base.length && i < a.length && base[i] === a[i]) i++;
        score = i;
      }
      return { c, score };
    })
    .filter((x) => x.score > 1)
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((x) => x.c);
}

/** namespace(선택) + alias로 레코드 결정. 미지정 시 유일하면 그것, 모호하면 에러 */
export async function resolveSpec(
  alias: string,
  namespace: string | undefined
): Promise<{ record?: ComponentSpecRecord; error?: ToolResult }> {
  if (namespace) {
    const record = await getComponentSpec(namespace, alias);
    if (!record) {
      const inNs = (await listComponentSpecs(namespace)).map((r) => r.alias);
      const near = suggest(alias, inNs);
      return {
        error: jsonResponse({
          error: `네임스페이스 "${namespace}"에 등록되지 않은 alias: "${alias}"`,
          ...(near.length ? { didYouMean: near } : {}),
          registeredInNamespace: inNs.length,
          hint: 'sigma_list_component_specs(namespace) 로 목록을 조회하세요 (전체 나열은 응답이 커져 생략합니다).',
        }),
      };
    }
    return { record };
  }

  const matches = await findComponentSpecsByAlias(alias);
  if (matches.length === 0) {
    const all = (await listComponentSpecs()).map((r) => `${r.namespace}/${r.alias}`);
    const near = suggest(alias, all);
    return {
      error: jsonResponse({
        error: `등록되지 않은 alias: "${alias}"`,
        ...(near.length ? { didYouMean: near } : {}),
        registeredTotal: all.length,
        hint: 'sigma_list_component_specs(namespace) 로 좁혀 조회하세요 (전체 나열은 응답이 커져 생략합니다).',
      }),
    };
  }
  if (matches.length > 1) {
    return {
      error: jsonResponse({
        error: `alias "${alias}"가 여러 네임스페이스에 존재합니다 — namespace 인자로 지정하세요`,
        namespaces: matches.map((r) => r.namespace),
      }),
    };
  }
  return { record: matches[0] };
}
