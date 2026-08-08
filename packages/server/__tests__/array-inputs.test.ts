/**
 * 배열 입력 규약(`docs/tool-conventions.md` §3) — "단일 처리 도구 + batch_* 도구를 쌍으로
 * 만들지 않는다. 같은 도구가 스칼라와 배열을 모두 받게 한다."
 *
 * 여기서 지키는 것은 **배치 봉투(envelope)** 다: 상호배타 검증, 빈 배열 거부,
 * 부분 실패 허용(하나가 틀려도 나머지를 버리지 않는다), 개수 집계.
 * 배경: docs/history/009-node-ids-were-copied-by-hand.md
 *       docs/history/010-instance-creation-had-no-array-input.md
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { tokenStore } from '../src/auth/token';
import { figmaHandlers } from '../src/mcp/handlers/figma';
import { componentSpecHandlers } from '../src/mcp/handlers/component-spec';
import { toolDefinitions } from '../src/mcp/tool-definitions';

function parse(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    wsServer: {
      isFigmaConnected: () => true,
      getPluginById: () => ({ pluginId: 'p1' }),
      async command() { return {}; },
      ...overrides,
    },
  } as never;
}

describe('sigma_find_node — paths 배열 입력', () => {
  let token: string;
  beforeEach(() => {
    token = tokenStore.createToken();
    tokenStore.bindToken(token, 'p1', 'page1', 'f.fig', 'Page');
  });

  test('스키마에 paths 가 있고 path 와 함께 쓰지 말라고 적혀 있다', () => {
    const def = toolDefinitions.find((d) => d.name === 'sigma_find_node')!;
    const props = (def.inputSchema as unknown as { properties: Record<string, { description?: string }> }).properties;
    expect(props.paths).toBeDefined();
    expect(props.path.description).toContain('paths');
  });

  test('path 와 paths 를 함께 주면 거부한다', async () => {
    const r = parse(await figmaHandlers.sigma_find_node(
      { token, path: 'A', paths: ['A', 'B'] }, makeContext(),
    ) as { content: Array<{ text: string }> });
    expect(r.error).toContain('함께 쓸 수 없습니다');
  });

  test('빈 배열은 거부한다 (조용히 0건을 돌려주지 않는다)', async () => {
    const r = parse(await figmaHandlers.sigma_find_node(
      { token, paths: [] }, makeContext(),
    ) as { content: Array<{ text: string }> });
    expect(r.error).toContain('비어 있지 않은 배열');
  });

  test('플러그인 응답을 그대로 싣고 resolved/failed 를 센다', async () => {
    const ctx = makeContext({
      async resolvePaths() {
        return { results: [
          { path: 'A/B', nodeId: '1:1', name: 'B', type: 'FRAME' },
          { path: 'A/없음', error: '해당 경로의 노드를 찾을 수 없습니다' },
        ] };
      },
    });
    const r = parse(await figmaHandlers.sigma_find_node(
      { token, paths: ['A/B', 'A/없음'] }, ctx,
    ) as { content: Array<{ text: string }> });
    expect(r.resolved).toBe(1);
    expect(r.failed).toBe(1);
    expect((r.results as unknown[]).length).toBe(2);
  });
});

describe('sigma_create_component_spec_instance — instances 배열 입력', () => {
  let token: string;
  beforeEach(() => {
    token = tokenStore.createToken();
    tokenStore.bindToken(token, 'p1', 'page1', 'f.fig', 'Page');
  });

  test('스키마: alias 는 더 이상 required 가 아니고 instances 가 있다', () => {
    const def = toolDefinitions.find((d) => d.name === 'sigma_create_component_spec_instance')!;
    const schema = def.inputSchema as unknown as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.instances).toBeDefined();
    // alias 를 required 로 두면 배열 전용 호출이 스키마에서 먼저 막힌다
    expect(schema.required).toEqual(['token']);
  });

  test('alias 와 instances 를 함께 주면 거부한다', async () => {
    const r = parse(await componentSpecHandlers.sigma_create_component_spec_instance(
      { token, alias: 'x', instances: [{ alias: 'y' }] }, makeContext(),
    ) as { content: Array<{ text: string }> });
    expect(r.error).toContain('함께 쓸 수 없습니다');
  });

  test('빈 배열은 거부한다', async () => {
    const r = parse(await componentSpecHandlers.sigma_create_component_spec_instance(
      { token, instances: [] }, makeContext(),
    ) as { content: Array<{ text: string }> });
    expect(r.error).toContain('비어 있지 않은 배열');
  });

  test('부분 실패를 허용하고 index 로 어느 원소인지 알려준다', async () => {
    // 등록되지 않은 alias 두 개 — 레지스트리를 건드리지 않고 배치 봉투만 확인한다
    const r = parse(await componentSpecHandlers.sigma_create_component_spec_instance(
      { token, instances: [{ alias: '_존재하지않는스펙_a' }, { alias: '_존재하지않는스펙_b' }] },
      makeContext(),
    ) as { content: Array<{ text: string }> });
    expect(r.success).toBe(false);
    expect(r.created).toBe(0);
    expect(r.failed).toBe(2);
    const results = r.results as Array<Record<string, unknown>>;
    expect(results.map((x) => x.index)).toEqual([0, 1]);
    expect(results[0].error).toBeDefined();
  });
});
