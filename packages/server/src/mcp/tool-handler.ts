import { storageHandlers } from './handlers/storage.js';
import { authHandlers } from './handlers/auth.js';
import { figmaHandlers } from './handlers/figma.js';
import { scriptsHandlers } from './handlers/scripts.js';
import { managementHandlers } from './handlers/management.js';
import { componentSpecHandlers } from './handlers/component-spec.js';
import { lintHandlers } from './handlers/lint.js';
import { jsonResponse, type ToolContext, type ToolResult } from './helpers.js';
import { toolDefinitions } from './tool-definitions.js';

/**
 * 모든 핸들러를 하나의 Record로 통합
 */
const handlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  ...storageHandlers,
  ...authHandlers,
  ...figmaHandlers,
  ...scriptsHandlers,
  ...managementHandlers,
  ...componentSpecHandlers,
  ...lintHandlers,
};

/** 도구별로 inputSchema 가 선언한 인자 이름. 모르는 인자 거부(아래)에 쓴다. */
const knownArgsByTool = new Map<string, Set<string>>(
  toolDefinitions.map((t) => [
    t.name,
    new Set(Object.keys((t.inputSchema as { properties?: Record<string, unknown> }).properties || {})),
  ])
);

/** 자주 틀리는 인자 이름 → 올바른 이름. 거부 메시지에 실어 준다. */
const ARG_ALIASES: Record<string, string> = {
  data: 'args',           // sigma_modify_node — data 로 주면 메서드가 빈 인자로 돌아 no-op
  nameContains: 'where.select.namePattern',
  componentKey: 'newComponentKey',  // sigma_swap_component
};

/**
 * 스키마에 없는 인자가 오면 거부한다.
 *
 * ⚠️ 왜 있는가: 모르는 인자를 조용히 버리면 **호출은 성공으로 응답하고 아무 일도 일어나지 않는다.**
 * 실사고 3건 — ①`sigma_modify_node` 에 `args` 대신 `data` 를 줘서 메서드가 빈 인자로 돌았는데
 * `success: true` 가 왔다 ②`sigma_delete_component_spec({deleteNode:true})` 가 마스터 노드를
 * 남겼다 ③`where.select` 에 없는 키를 줘서 조건이 사라진 채 전건이 매칭됐다.
 * 어느 쪽도 응답만 보고는 알 수 없었고, 나중에 결과를 다시 확인하다가 발견했다.
 */
function rejectUnknownArgs(name: string, args: Record<string, unknown>): ToolResult | null {
  const known = knownArgsByTool.get(name);
  if (!known || known.size === 0) return null;   // 스키마 미상 도구는 통과(과거 호환)
  const unknown = Object.keys(args).filter((k) => !known.has(k));
  if (unknown.length === 0) return null;
  return jsonResponse({
    error:
      `${name} 이 모르는 인자를 받았습니다: ${unknown.map((k) => `"${k}"`).join(', ')}. ` +
      `조용히 무시하면 호출이 성공으로 보이면서 아무 일도 일어나지 않으므로 거부합니다.`,
    unknownArgs: unknown,
    ...(unknown.some((k) => ARG_ALIASES[k])
      ? { hint: unknown.filter((k) => ARG_ALIASES[k]).map((k) => `"${k}" → "${ARG_ALIASES[k]}"`).join(', ') }
      : {}),
    acceptedArgs: [...known],
  });
}

/**
 * 도구 이름으로 핸들러를 찾아 실행. 에러 래핑 포함.
 */
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const handler = handlers[name];
    if (!handler) {
      return jsonResponse({ error: `Unknown tool: ${name}` });
    }
    const rejected = rejectUnknownArgs(name, args);
    if (rejected) return rejected;
    return await handler(args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message });
  }
}
