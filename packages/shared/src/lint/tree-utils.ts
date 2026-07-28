/**
 * TreeNode 트리를 평탄화하고 부모/자식/형제/조상 관계 맵을 만든다.
 * predicate 커스텀 규칙의 `ctx.getSiblings/getAncestors/getChildren` 헬퍼와
 * 서버의 노드 enrichment(어떤 id들을 get_nodes_info 로 조회할지) 양쪽에서 재사용.
 */
import type { TreeNode } from '../types';

/**
 * `roots` 배열 자체도 실제 Figma에선 공통 부모(페이지, 또는 sigma_lint(nodeId:...)로 스코프한
 * 노드)를 공유하는 형제들이다. 예전엔 최상위 항목에 parentId:null 을 줘서 이 사실이 사라졌고,
 * 그 결과 fully_occluded_sibling/content_above_annotation 같은 "형제 z-order 비교" 규칙이
 * nodeId로 스코프했을 때 딱 그 스코프의 직속 자식들끼리는 비교를 못 하는 버그가 있었다
 * (자식의 자식들은 진짜 부모 id가 있어 정상 동작 — 딱 최상위 레벨만 새는 구멍이었음, 실측 발견).
 * VIRTUAL_ROOT 를 parentId로 써서 최상위 항목들도 하나의 형제 그룹으로 잡히게 한다.
 * ancestorsOf 는 이 심볼을 만나면 즉시 멈춰 predicate의 `ctx.getAncestors` 계약(최상위는 [])을
 * 그대로 보존한다 — VIRTUAL_ROOT 자체가 새어나가지 않음.
 */
const VIRTUAL_ROOT = '__sigma_lint_roots__';

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
  for (const r of roots) walk(r, VIRTUAL_ROOT);
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
    while (cur && cur !== VIRTUAL_ROOT) {
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
