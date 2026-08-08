/**
 * GET_NODES_INFO 배치 스펙.
 *
 * ⛔ 배치가 없으면 **플러그인이 죽는다.** 페이지 전 노드를 한 왕복에 요청하면 응답이
 * ~18MB 부근에서 Figma 플러그인을 무너뜨리고, 재연결하면서 pluginId 가 바뀌어 같은 파일에서
 * 작업 중인 다른 에이전트의 바인딩까지 끊긴다.
 *
 * 실측(2026-08-08, 28,979 노드 페이지): 27,500=17.5MB/16.7s 까지 선형으로 통과하고
 * 28,979(~18.4MB)에서 **정상 처리 시간인 16.6초 만에 사망**했다 — 느려서가 아니라 넘기다
 * 죽은 것이라 타임아웃을 늘려도 해결되지 않는다. 그래서 이 테스트는 **왕복 횟수와 배치 크기**를
 * 본다(시간이 아니라).
 */
import { describe, test, expect } from 'bun:test';
import { fetchNodesInfoBatched } from '../src/lint/enrich';
import type { FigmaWebSocketServer } from '../src/websocket/server';

/** command() 호출을 기록하는 최소 목. 배치마다 그 배치의 노드만 돌려준다. */
function mockServer() {
  const calls: string[][] = [];
  const opts: Array<Record<string, unknown> | undefined> = [];
  const ws = {
    command: async (_type: string, payload: Record<string, unknown>, o?: Record<string, unknown>) => {
      const ids = payload.nodeIds as string[];
      calls.push(ids);
      opts.push(o);
      return { total: ids.length, succeeded: ids.length, nodes: ids.map((id) => ({ nodeId: id })) };
    },
  } as unknown as FigmaWebSocketServer;
  return { ws, calls, opts };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `1:${i}`);

describe('fetchNodesInfoBatched', () => {
  test('상한 이하면 왕복 1번', async () => {
    const { ws, calls } = mockServer();
    const out = await fetchNodesInfoBatched(ids(4000), ws, 'p1');
    expect(calls.length).toBe(1);
    expect(out.length).toBe(4000);
  });

  test('상한을 넘으면 쪼개고, 어떤 배치도 상한을 넘지 않는다', async () => {
    const { ws, calls } = mockServer();
    const out = await fetchNodesInfoBatched(ids(9000), ws, 'p1');
    expect(calls.length).toBe(3);
    for (const c of calls) expect(c.length).toBeLessThanOrEqual(4000);
    expect(out.length).toBe(9000);
  });

  test('실측 절벽(28,979)에서도 배치당 크기가 안전 구간에 머문다', async () => {
    const { ws, calls } = mockServer();
    await fetchNodesInfoBatched(ids(28979), ws, 'p1');
    // 27,500(17.5MB) 이 마지막 성공값이므로, 어떤 배치도 그 근처에 가면 안 된다.
    for (const c of calls) expect(c.length).toBeLessThan(20000);
  });

  test('노드 순서와 내용이 배치 경계를 넘어 보존된다', async () => {
    const { ws } = mockServer();
    const out = await fetchNodesInfoBatched(ids(9000), ws, 'p1');
    expect(out[0]!.nodeId).toBe('1:0');
    expect(out[3999]!.nodeId).toBe('1:3999');
    expect(out[4000]!.nodeId).toBe('1:4000');   // 경계 직후
    expect(out[8999]!.nodeId).toBe('1:8999');
  });

  test('배치마다 timeout 을 명시하고 로그에 개수를 남긴다', async () => {
    // 개수를 안 남겨서 1차 진단이 GET_TREE 를 범인으로 오인했다 — 그 재발 방지.
    const { ws, opts } = mockServer();
    await fetchNodesInfoBatched(ids(5000), ws, 'p1');
    for (const o of opts) {
      expect(o?.timeoutMs).toBe(60000);
      expect(String(o?.logSuffix)).toMatch(/\d+ nodes/);
    }
  });

  test('빈 입력이면 왕복 0', async () => {
    const { ws, calls } = mockServer();
    const out = await fetchNodesInfoBatched([], ws, 'p1');
    expect(calls.length).toBe(0);
    expect(out).toEqual([]);
  });
});
