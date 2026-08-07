/**
 * cloneNode 의 childIdMap 스펙.
 *
 * Figma 의 clone() 은 자식 전부에 새 id 를 부여하는데 그 대응을 API 가 주지 않는다.
 * 원본/복제본을 같은 순서로 동시 순회해 재구성하므로, **한 칸 밀려도 개수는 맞는다** —
 * 그래서 개수가 아니라 대응 값을 검증한다.
 * 배경: docs/history/006-clone-node-hid-its-child-ids.md
 */
import { describe, test, expect } from 'bun:test';
import { cloneNode } from '../src/node-ops/move';

interface FakeNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent: FakeNode | null;
  children?: FakeNode[];
  characters?: string;
  links?: Array<{ start: number; end: number; type: string; value: string }>;
  clone(): FakeNode;
  appendChild(n: FakeNode): void;
  remove(): void;
  getStyledTextSegments(_: string[]): Array<{ start: number; end: number; hyperlink: { type: string; value: string } | null }>;
  setRangeHyperlink(start: number, end: number, link: { type: string; value: string }): void;
}

let seq = 0;
function mk(name: string, type: string, children: FakeNode[] = [], links?: FakeNode['links']): FakeNode {
  const node: FakeNode = {
    id: `s${++seq}`, name, type, x: 0, y: 0, width: 10, height: 10,
    parent: null, children, characters: type === 'TEXT' ? 'text' : undefined, links,
    clone() {
      const copy = mk(this.name, this.type, (this.children || []).map((c) => c.clone()),
        this.links ? this.links.map((l) => ({ ...l })) : undefined);
      for (const c of copy.children || []) c.parent = copy;
      copy.parent = CURRENT_PAGE;
      return copy;
    },
    appendChild(n) { n.parent = this; (this.children = this.children || []).push(n); },
    remove() { this.parent = null; },
    getStyledTextSegments() {
      return (this.links || []).map((l) => ({ start: l.start, end: l.end, hyperlink: { type: l.type, value: l.value } }));
    },
    setRangeHyperlink(start, end, link) {
      const hit = (this.links || []).find((l) => l.start === start && l.end === end);
      if (hit) { hit.type = link.type; hit.value = link.value; }
    },
  };
  for (const c of children) c.parent = node;
  return node;
}

const CURRENT_PAGE = mk('Page', 'PAGE');

function find(root: FakeNode, id: string): FakeNode | null {
  if (root.id === id) return root;
  for (const c of root.children || []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
}

function withFigma<T>(root: FakeNode, fn: () => T): T {
  const g = globalThis as unknown as { figma?: unknown };
  const prev = g.figma;
  const index = new Map<string, FakeNode>();
  const walk = (n: FakeNode) => { index.set(n.id, n); for (const c of n.children || []) walk(c); };
  walk(root);
  g.figma = { getNodeById: (id: string) => index.get(id) ?? null, currentPage: CURRENT_PAGE };
  try { return fn(); } finally { g.figma = prev; }
}

describe('cloneNode childIdMap', () => {
  test('중첩 구조의 자식 대응이 이름·타입까지 정확히 맞는다', () => {
    const leaf = mk('cell', 'TEXT');
    const row = mk('row', 'FRAME', [leaf]);
    const shell = mk('shell', 'FRAME', [row]);
    const parent = mk('page-root', 'FRAME', [shell]);

    const result = withFigma(parent, () => cloneNode(shell.id, undefined, undefined, undefined, { includeNames: true }));

    expect(result.clonedChildCount).toBe(2);
    const map = result.childIdMap as Record<string, { id: string; name: string; type: string }>;
    // 한 칸 밀리면 개수는 맞고 이름이 어긋난다 — 그래서 이름·타입까지 본다
    expect(map[row.id].name).toBe('row');
    expect(map[row.id].type).toBe('FRAME');
    expect(map[leaf.id].name).toBe('cell');
    expect(map[leaf.id].type).toBe('TEXT');
    // 복제본 id 는 원본과 달라야 한다 (매핑이 항등이면 아무 의미가 없다)
    expect(map[row.id].id).not.toBe(row.id);
  });

  test('includeChildIdMap:false 면 매핑을 아예 싣지 않는다', () => {
    const shell = mk('shell', 'FRAME', [mk('row', 'FRAME')]);
    const parent = mk('root', 'FRAME', [shell]);
    const result = withFigma(parent, () => cloneNode(shell.id, undefined, undefined, undefined, { includeChildIdMap: false }));
    expect(result.childIdMap).toBeUndefined();
    expect(result.clonedChildCount).toBeUndefined();
  });

  test('상한을 넘으면 조용히 자르지 않고 truncated 를 명시한다', () => {
    const kids = Array.from({ length: 5 }, (_, i) => mk(`k${i}`, 'FRAME'));
    const shell = mk('shell', 'FRAME', kids);
    const parent = mk('root', 'FRAME', [shell]);
    const result = withFigma(parent, () => cloneNode(shell.id, undefined, undefined, undefined, { childIdMapLimit: 2 }));
    expect(Object.keys(result.childIdMap!)).toHaveLength(2);
    expect(result.clonedChildCount).toBe(5);
    expect(result.childIdMapTruncated).toBe(true);
  });
});

describe('cloneNode 내부 하이퍼링크', () => {
  test('복제 범위 안을 가리키던 링크는 기본적으로 경고만 한다', () => {
    const legend = mk('legend', 'TEXT');
    const marker = mk('marker', 'TEXT', [], [{ start: 0, end: 1, type: 'NODE', value: legend.id }]);
    const shell = mk('shell', 'FRAME', [marker, legend]);
    const parent = mk('root', 'FRAME', [shell]);

    const result = withFigma(parent, () => cloneNode(shell.id));
    expect(result.hyperlinks).toEqual({ internalPointingToSource: 1 });
  });

  test('rewireInternalLinks:true 면 복제본 내부로 다시 연결한다', () => {
    const legend = mk('legend', 'TEXT');
    const marker = mk('marker', 'TEXT', [], [{ start: 0, end: 1, type: 'NODE', value: legend.id }]);
    const shell = mk('shell', 'FRAME', [marker, legend]);
    const parent = mk('root', 'FRAME', [shell]);

    const result = withFigma(parent, () => cloneNode(shell.id, undefined, undefined, undefined, { rewireInternalLinks: true }));
    expect(result.hyperlinks).toEqual({ internalPointingToSource: 0, rewired: 1 });

    // 복제본 마커가 실제로 **복제본 범례**를 가리키는지 (원본이 아니라)
    const map = result.childIdMap as Record<string, string>;
    const clonedMarkerId = map[marker.id];
    const clonedLegendId = map[legend.id];
    // 복제본은 parentId 미지정이라 원본과 같은 부모(root)로 되돌려진다
    const clonedMarker = find(parent, clonedMarkerId)!;
    expect(clonedMarker.links![0].value).toBe(clonedLegendId);
  });

  test('복제 범위 밖을 가리키는 링크는 건드리지 않는다', () => {
    const outside = mk('outside', 'TEXT');
    const marker = mk('marker', 'TEXT', [], [{ start: 0, end: 1, type: 'NODE', value: outside.id }]);
    const shell = mk('shell', 'FRAME', [marker]);
    const parent = mk('root', 'FRAME', [shell, outside]);

    const result = withFigma(parent, () => cloneNode(shell.id, undefined, undefined, undefined, { rewireInternalLinks: true }));
    expect(result.hyperlinks).toBeUndefined();
  });
});
