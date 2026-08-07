/**
 * sigma_swap_component 가 컴포넌트 스펙을 **alias 로** 가리킬 수 있는지에 대한 회귀 테스트.
 *
 * 왜 있는가: 스펙 워크플로는 어디서나 (namespace, alias) 로 컴포넌트를 가리키는데 swap 만
 * raw `newComponentKey` 를 요구했다. 그 key 를 카탈로그 조회에서 못 찾자(상세 조회에만 있다)
 * "얻을 방법이 없다"고 오진하고, 인스턴스를 새로 만들고 옛 것을 지우는 우회로 새어 나갔다 —
 * 그러면 자식 순서·pluginData·하이퍼링크가 함께 날아간다.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { tokenStore } from '../src/auth/token';
import { figmaHandlers } from '../src/mcp/handlers/figma';
import { toolDefinitions } from '../src/mcp/tool-definitions';

function parse(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

function makeContext(seen: Array<{ nodeId: string; key: string }>) {
  return {
    wsServer: {
      isFigmaConnected: () => true,
      getPluginById: () => ({ pluginId: 'p1' }),
      // 핸들러는 명령별 래퍼가 아니라 공용 command() 로 플러그인에 보낸다.
      // 여기서 SWAP_COMPONENT 만 걸러 payload 를 관찰한다 — 다른 명령이 새어 오면 즉시 드러난다.
      async command(commandType: string, payload: Record<string, unknown>) {
        expect(commandType).toBe('SWAP_COMPONENT');
        seen.push({ nodeId: payload.nodeId as string, key: payload.newComponentKey as string });
        return { nodeId: payload.nodeId };
      },
    },
  } as unknown as Parameters<typeof figmaHandlers.sigma_swap_component>[1];
}

describe('sigma_swap_component — alias 로 교체', () => {
  let token: string;

  beforeEach(() => {
    token = tokenStore.createToken();
    tokenStore.bindToken(token, 'p1', 'page1', 'f.fig', 'Page');
  });

  test('스키마: newComponentKey 는 더 이상 필수가 아니고 alias/namespace 를 받는다', () => {
    const def = toolDefinitions.find((d) => d.name === 'sigma_swap_component');
    expect(def).toBeDefined();
    const schema = def!.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.required).toEqual(['token', 'nodeId']);
    expect(schema.properties.alias).toBeDefined();
    expect(schema.properties.namespace).toBeDefined();
    // 스펙이 아닌 일반 컴포넌트를 위해 key 경로는 남아 있어야 한다
    expect(schema.properties.newComponentKey).toBeDefined();
  });

  test('newComponentKey 를 주면 그대로 전달한다 (기존 경로 보존)', async () => {
    const seen: Array<{ nodeId: string; key: string }> = [];
    const res = parse(await figmaHandlers.sigma_swap_component(
      { token, nodeId: '1:2', newComponentKey: 'abc123' },
      makeContext(seen),
    ) as never);

    expect(res.success).toBe(true);
    expect(seen).toEqual([{ nodeId: '1:2', key: 'abc123' }]);
  });

  test('alias 도 key 도 없으면 거부한다 — 조용히 통과하면 아무 일도 안 일어난다', async () => {
    const seen: Array<{ nodeId: string; key: string }> = [];
    const res = parse(await figmaHandlers.sigma_swap_component(
      { token, nodeId: '1:2' },
      makeContext(seen),
    ) as never);

    expect(typeof res.error).toBe('string');
    expect(res.error as string).toContain('alias');
    expect(seen.length).toBe(0);
  });

  test('등록되지 않은 alias 는 플러그인을 부르지 않고 거부한다', async () => {
    const seen: Array<{ nodeId: string; key: string }> = [];
    const res = parse(await figmaHandlers.sigma_swap_component(
      { token, nodeId: '1:2', alias: 'zz_definitely_not_registered', namespace: 'zz_no_such_ns' },
      makeContext(seen),
    ) as never);

    expect(typeof res.error).toBe('string');
    expect(seen.length).toBe(0);
  });
});
