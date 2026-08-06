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

/** namespace(선택) + alias로 레코드 결정. 미지정 시 유일하면 그것, 모호하면 에러 */
export async function resolveSpec(
  alias: string,
  namespace: string | undefined
): Promise<{ record?: ComponentSpecRecord; error?: ToolResult }> {
  if (namespace) {
    const record = await getComponentSpec(namespace, alias);
    if (!record) {
      const inNs = (await listComponentSpecs(namespace)).map((r) => r.alias);
      return {
        error: jsonResponse({
          error: `네임스페이스 "${namespace}"에 등록되지 않은 alias: "${alias}"`,
          availableInNamespace: inNs,
        }),
      };
    }
    return { record };
  }

  const matches = await findComponentSpecsByAlias(alias);
  if (matches.length === 0) {
    const available = (await listComponentSpecs()).map((r) => `${r.namespace}/${r.alias}`);
    return {
      error: jsonResponse({ error: `등록되지 않은 alias: "${alias}"`, available }),
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
