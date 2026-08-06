import { storageHandlers } from './handlers/storage.js';
import { authHandlers } from './handlers/auth.js';
import { figmaHandlers } from './handlers/figma.js';
import { scriptsHandlers } from './handlers/scripts.js';
import { managementHandlers } from './handlers/management.js';
import { componentSpecHandlers } from './handlers/component-spec.js';
import { lintHandlers } from './handlers/lint.js';
import { jsonResponse, type ToolContext, type ToolResult } from './helpers.js';
import { toolDefinitions } from './tool-definitions.js';
import { getHangulEscapeFlag, TEXT_WRITING_TOOLS, HANGUL_ESCAPE_WARNING } from './hangul-escape.js';

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
  // token 은 거의 모든 도구가 받으므로, 안 받는 몇 개에 딸려 와도 그냥 무시한다.
  // 넘겨도 동작이 조용히 달라지는 일이 없어(인증 인자일 뿐) 이 거부의 대상이 아니다.
  const unknown = Object.keys(args).filter((k) => k !== 'token' && !known.has(k));
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
 * 텍스트를 만드는 도구의 응답에, 요청 원문에 한글 이스케이프가 있었다는 경고를 덧붙인다.
 * 작업은 그대로 진행된다 — 이스케이프 자체가 틀린 건 아니고, 그 경로에서 오타가 나기 때문이다.
 */
function withHangulEscapeWarning(name: string, result: ToolResult): ToolResult {
  if (!TEXT_WRITING_TOOLS.has(name)) return result;
  const escapes = getHangulEscapeFlag();
  if (!escapes) return result;
  const text = result.content?.[0]?.text;
  if (typeof text !== 'string') return result;
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object') {
      (data as Record<string, unknown>).hangulEscapeWarning = HANGUL_ESCAPE_WARNING;
      (data as Record<string, unknown>).hangulEscapesSeen = escapes;
      return jsonResponse(data);
    }
  } catch {
    // JSON 이 아니면 건드리지 않는다
  }
  return result;
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
    const result = await handler(args, context);
    return withHangulEscapeWarning(name, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message });
  }
}
