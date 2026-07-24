/**
 * TreeNode 트리를 평탄화하고 부모/자식/형제/조상 관계 맵을 만든다.
 * predicate 커스텀 규칙의 `ctx.getSiblings/getAncestors/getChildren` 헬퍼와
 * 서버의 노드 enrichment(어떤 id들을 get_nodes_info 로 조회할지) 양쪽에서 재사용.
 */
import type { TreeNode } from '../types';

export interface FlatEntry {
  node: TreeNode;
  parentId: string | null;
}

export function flattenTree(roots: TreeNode[]): FlatEntry[] {
  const out: FlatEntry[] = [];
  function walk(n: TreeNode, parentId: string | null) {
    out.push({ node: n, parentId });
    for (const c of n.children ?? []) walk(c, n.id);
  }
  for (const r of roots) walk(r, null);
  return out;
}

export interface RelationMaps {
  byId: Map<string, FlatEntry>;
  childrenOf: Map<string, string[]>;
  siblingsOf: (id: string) => string[];
  ancestorsOf: (id: string) => string[];
  childrenIdsOf: (id: string) => string[];
}

export function buildRelationMaps(roots: TreeNode[]): RelationMaps {
  const flat = flattenTree(roots);
  const byId = new Map(flat.map((f) => [f.node.id, f]));
  const childrenOf = new Map<string, string[]>();
  for (const f of flat) {
    if (f.parentId) {
      const arr = childrenOf.get(f.parentId) ?? [];
      arr.push(f.node.id);
      childrenOf.set(f.parentId, arr);
    }
  }

  function siblingsOf(id: string): string[] {
    const parentId = byId.get(id)?.parentId;
    if (!parentId) return [];
    return (childrenOf.get(parentId) ?? []).filter((cid) => cid !== id);
  }

  function ancestorsOf(id: string): string[] {
    const out: string[] = [];
    let cur = byId.get(id)?.parentId ?? null;
    while (cur) {
      out.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return out;
  }

  function childrenIdsOf(id: string): string[] {
    return childrenOf.get(id) ?? [];
  }

  return { byId, childrenOf, siblingsOf, ancestorsOf, childrenIdsOf };
}
