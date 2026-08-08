/**
 * get_tree 의 세 모드 — 전체 / 자르기(omit) / 남기기(keep).
 *
 * 기존 `filter` 는 이름만 "필터" 고 동작은 화이트리스트 prune 이라,
 * `filter.types:["TEXT"]` 가 **오류 없이 0건**을 돌려줬다(TEXT 의 부모가 먼저 잘림).
 * 배경: docs/history/008-get-tree-filter-was-a-prune.md
 */
import { describe, test, expect } from 'bun:test';
import { getTreeWithFilter } from '../src/node-ops/tree';
import type { TreeNode } from '@sigma/shared';

interface FakeNode {
  id: string; name: string; type: string;
  x: number; y: number; width: number; height: number;
  visible: boolean; locked: boolean;
  parent: FakeNode | null;
  children?: FakeNode[];
  characters?: string;
}

function n(id: string, name: string, type: string, children: FakeNode[] = []): FakeNode {
  const node: FakeNode = {
    id, name, type, x: 0, y: 0, width: 10, height: 10,
    visible: true, locked: false, parent: null,
    ...(type === 'TEXT' ? { characters: name } : {}),
    ...(children.length || type === 'FRAME' || type === 'SECTION' ? { children } : {}),
  };
  for (const c of children) c.parent = node;
  return node;
}

/**
 *  section
 *   └ frame
 *      ├ label (TEXT)
 *      ├ marker (INSTANCE)
 *      └ icon (FRAME) ├ v1 (VECTOR) └ v2 (VECTOR)
 */
function fixture() {
  const label = n('t1', 'label', 'TEXT');
  const marker = n('i1', 'marker', 'INSTANCE');
  const icon = n('f2', 'icon', 'FRAME', [n('v1', 'v1', 'VECTOR'), n('v2', 'v2', 'VECTOR')]);
  const frame = n('f1', 'frame', 'FRAME', [label, marker, icon]);
  const section = n('s1', 'section', 'SECTION', [frame]);
  return { section, page: { id: 'p1', name: 'Page', children: [section] } };
}

function withFigma<T>(page: { id: string; name: string; children: FakeNode[] }, fn: () => T): T {
  const g = globalThis as unknown as { figma?: unknown };
  const prev = g.figma;
  g.figma = { currentPage: page, root: { children: [page] }, getNodeById: () => null };
  try { return fn(); } finally { g.figma = prev; }
}

/** 트리를 평탄화해 이름 목록으로 */
function names(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: TreeNode[]) => { for (const x of ns) { out.push(x.name); walk(x.children ?? []); } };
  walk(nodes);
  return out.sort();
}

describe('get_tree 필터 모드', () => {
  test('positive control — 필터 없이는 전부 나온다', async () => {
    const { page } = fixture();
    const r = await withFigma(page, () => getTreeWithFilter({ depth: 'full' }));
    expect(names(r.children)).toEqual(['frame', 'icon', 'label', 'marker', 'section', 'v1', 'v2']);
  });

  test('레거시 filter 는 종전대로 화이트리스트 prune 이다 (회귀)', async () => {
    const { page } = fixture();
    // TEXT 만 남기려 해도 0건 — 부모가 먼저 잘리기 때문. 이게 이 TODO 의 출발점이고,
    // 기존 호출자를 위해 **동작을 바꾸지 않았다.**
    const r = await withFigma(page, () => getTreeWithFilter({ depth: 'full', filter: { types: ['TEXT'] } }));
    expect(r.children).toEqual([]);
  });

  test('omit 은 매칭 노드를 서브트리째 자른다', async () => {
    const { page } = fixture();
    const r = await withFigma(page, () => getTreeWithFilter({ depth: 'full', omit: { types: ['VECTOR'] } }));
    expect(names(r.children)).toEqual(['frame', 'icon', 'label', 'marker', 'section']);
  });

  test('omit 은 컨테이너를 자르면 그 안쪽도 사라진다', async () => {
    const { page } = fixture();
    const r = await withFigma(page, () => getTreeWithFilter({ depth: 'full', omit: { namePattern: '^icon$' } }));
    expect(names(r.children)).toEqual(['frame', 'label', 'marker', 'section']);
  });

  test('keep 은 매칭 노드를 조상 뼈대와 함께 남긴다', async () => {
    const { page } = fixture();
    const r = await withFigma(page, () => getTreeWithFilter({ depth: 'full', keep: { types: ['TEXT'] } }));
    // label 과 그 경로(section > frame)만
    expect(names(r.children)).toEqual(['frame', 'label', 'section']);
    // 매칭은 1건, 나머지는 뼈대 — truncated/limit 이 뼈대에 먹히지 않도록 따로 센다
    expect(r.totalCount).toBe(1);
    expect(r.skeletonCount).toBe(2);
  });

  test('keep 은 매칭이 없으면 그 가지를 통째로 없앤다', async () => {
    const { page } = fixture();
    const r = await withFigma(page, () => getTreeWithFilter({ depth: 'full', keep: { namePattern: '^없는이름$' } }));
    expect(r.children).toEqual([]);
    expect(r.totalCount).toBe(0);
  });

  test('omit 과 keep 은 함께 쓸 수 있다 (omit 먼저)', async () => {
    const { page } = fixture();
    const r = await withFigma(page, () => getTreeWithFilter({
      depth: 'full', omit: { types: ['VECTOR'] }, keep: { types: ['FRAME'] },
    }));
    expect(names(r.children)).toEqual(['frame', 'icon', 'section']);
  });

  test('filter 와 omit/keep 을 섞으면 거부한다 (조용히 무시하지 않는다)', async () => {
    const { page } = fixture();
    // 이제 async 라 동기 throw 가 아니라 rejection 이다.
    await expect(withFigma(page, () => getTreeWithFilter({
      filter: { types: ['FRAME'] }, omit: { types: ['VECTOR'] },
    }))).rejects.toThrow(/함께 쓸 수 없습니다/);
  });
});

/**
 * 순회 예산 — 큰 페이지에서 메인 스레드를 오래 점유하면 Figma 가 플러그인을 죽인다.
 * 실측: 가장 큰 페이지에 sigma_lint 를 돌리면 2/2 로 플러그인이 끊기고, 그 뒤 pluginId 가
 * 1분 간격으로 계속 바뀌며 단일 노드 조회조차 타임아웃했다.
 * 배경: docs/history/015-big-page-lint-killed-the-plugin.md
 */
async function withFigmaAsync<T>(page: { id: string; name: string; children: FakeNode[] }, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as unknown as { figma?: unknown };
  const prev = g.figma;
  g.figma = { currentPage: page, root: { children: [page] }, getNodeById: () => null };
  try { return await fn(); } finally { g.figma = prev; }
}

/** YIELD_EVERY(2000)를 넘기는 납작한 트리 — 양보 지점을 실제로 지나게 한다. */
function wideFixture(count: number) {
  const kids = Array.from({ length: count }, (_, i) => n(`k${i}`, `k${i}`, 'TEXT'));
  const root = n('r', 'root', 'FRAME', kids);
  return { page: { id: 'p1', name: 'Page', children: [root] } };
}

describe('get_tree 순회 예산', () => {
  test('예산이 없으면 끝까지 순회한다 (기본 동작 무변경)', async () => {
    const { page } = wideFixture(3000);
    const r = await withFigmaAsync(page, () => getTreeWithFilter({ depth: 'full', limit: 100000 }));
    expect(r.totalCount).toBe(3001);
    expect(r.timedOut).toBeUndefined();
  });

  test('예산을 넘기면 죽지 않고 부분 결과 + timedOut 을 돌려준다', async () => {
    const { page } = wideFixture(6000);
    const r = await withFigmaAsync(page, () => getTreeWithFilter({ depth: 'full', limit: 100000, budgetMs: 1 }));
    expect(r.timedOut).toBe(true);
    // 부분이라는 뜻이지 0건이라는 뜻이 아니다 — 거기까지의 결과는 살아 있어야 한다.
    expect(r.totalCount).toBeGreaterThan(0);
    expect(r.totalCount).toBeLessThan(6001);
  });

  test('예산이 넉넉하면 timedOut 없이 완주한다', async () => {
    const { page } = wideFixture(3000);
    const r = await withFigmaAsync(page, () => getTreeWithFilter({ depth: 'full', limit: 100000, budgetMs: 60000 }));
    expect(r.timedOut).toBeUndefined();
    expect(r.totalCount).toBe(3001);
  });
});
