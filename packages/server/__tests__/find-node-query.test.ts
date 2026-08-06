/**
 * sigma_find_node(where) 가 트리를 **끝까지** 뜨는지에 대한 회귀 테스트.
 *
 * 검색은 틀렸을 때 에러가 아니라 "조건에 맞는 게 없다"로 보인다 — getTree 기본 상한(1000)을
 * 그대로 쓰면 큰 페이지의 뒤쪽 노드가 후보에 들어오지도 못한 채 0건이 나온다(silent false-negative).
 * 실사고: 스펙 삭제 전 인스턴스가 0인지 세려고 where 로 훑었다가 잔존 인스턴스를 나중에 발견.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
// 핸들러가 import 시점에 잡아 둔 싱글톤과 같은 것을 써야 한다 —
// resetInstance() 로 갈아치우면 핸들러는 옛 인스턴스를 보고 "유효하지 않은 토큰"을 낸다.
import { tokenStore } from '../src/auth/token';
import { figmaHandlers } from '../src/mcp/handlers/figma';

interface GetTreeOptions { nodeId?: string; depth?: unknown; pageId?: string; limit?: number; timeoutMs?: number }

function makeContext(tree: Record<string, unknown>, seen: GetTreeOptions[]) {
  return {
    wsServer: {
      isFigmaConnected: () => true,
      getPluginById: () => ({ pluginId: 'p1' }),
      async getTree(options: GetTreeOptions) {
        seen.push(options);
        return tree;
      },
      async getNodesInfo() {
        return { nodes: [] };
      },
    },
  } as unknown as Parameters<typeof figmaHandlers.sigma_find_node>[1];
}

function parse(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe('sigma_find_node — where 검색의 트리 완전성', () => {
  let token: string;

  beforeEach(() => {
    token = tokenStore.createToken();
    tokenStore.bindToken(token, 'p1', 'page1', 'f.fig', 'Page');
  });

  test('getTree 를 큰 상한·타임아웃으로 부른다 (기본 1000 절단 금지)', async () => {
    const seen: GetTreeOptions[] = [];
    const ctx = makeContext({ children: [] }, seen);
    await figmaHandlers.sigma_find_node({ token, where: { select: { type: 'SECTION' } } }, ctx);

    expect(seen.length).toBe(1);
    expect(seen[0].limit).toBeGreaterThanOrEqual(200000);
    expect(seen[0].timeoutMs).toBeGreaterThanOrEqual(60000);
  });

  test('그래도 잘렸으면 결과를 "전부"로 읽지 못하게 응답에 명시한다', async () => {
    const seen: GetTreeOptions[] = [];
    const ctx = makeContext({ children: [], truncated: true, totalCount: 200000 }, seen);
    const res = parse(await figmaHandlers.sigma_find_node(
      { token, where: { select: { type: 'SECTION' } } },
      ctx,
    ) as never);

    expect(res.scanTruncated).toBe(true);
    expect(res.scannedNodes).toBe(200000);
    expect(typeof res.scanWarning).toBe('string');
  });

  test('잘리지 않았으면 경고 필드를 달지 않는다', async () => {
    const seen: GetTreeOptions[] = [];
    const ctx = makeContext({ children: [] }, seen);
    const res = parse(await figmaHandlers.sigma_find_node(
      { token, where: { select: { type: 'SECTION' } } },
      ctx,
    ) as never);

    expect(res.scanTruncated).toBeUndefined();
    expect(res.scanWarning).toBeUndefined();
  });
});
