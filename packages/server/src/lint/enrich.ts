/**
 * TreeNode(구조/좌표) + get_nodes_info(스타일/텍스트 상세)를 합쳐 커스텀 규칙이 보는
 * LintNode[] 와 관계 맵(ctx.getSiblings 등)을 만든다. 빌트인 규칙은 TreeNode만으로 충분하므로
 * 이 enrichment는 config.custom 이 있을 때만 호출한다(불필요한 왕복 방지).
 */
import { flattenTree, buildRelationMaps, type TreeNode, type LintNode } from '@sigma/shared';
import type { CtxRelations } from './run-custom-rule';

/** wsServer.getNodesInfo() 가 WS 왕복으로 돌려주는 항목 — 플러그인의 NodeDetailInfo를
 *  서버에선 비구조화된 unknown 으로 받으므로 여기서 필요한 필드만 느슨하게 타이핑한다. */
export interface NodeInfoLike {
  nodeId: string;
  error?: string;
  opacity?: number;
  fills?: unknown;
  strokes?: unknown;
  strokeWeight?: number;
  cornerRadius?: unknown;
  characters?: string;
  fontSize?: unknown;
  fontName?: unknown;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  layoutMode?: string;
}

export interface BuildLintNodesResult {
  nodes: LintNode[];
  relations: CtxRelations;
}

export function buildLintNodes(roots: TreeNode[], nodesInfo: NodeInfoLike[]): BuildLintNodesResult {
  const infoById = new Map(nodesInfo.filter((n) => !n.error).map((n) => [n.nodeId, n]));
  const flat = flattenTree(roots);

  const nodes: LintNode[] = flat.map(({ node }) => {
    const info = infoById.get(node.id);
    const base: LintNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: node.boundingBox.x,
      y: node.boundingBox.y,
      width: node.boundingBox.width,
      height: node.boundingBox.height,
      childCount: node.childCount,
      visible: node.meta?.visible,
      locked: node.meta?.locked,
    };
    if (info) {
      base.opacity = info.opacity;
      base.fills = info.fills;
      base.strokes = info.strokes;
      base.strokeWeight = info.strokeWeight;
      base.cornerRadius = info.cornerRadius;
      base.characters = info.characters;
      base.fontSize = info.fontSize;
      base.fontName = info.fontName;
      base.textAlignHorizontal = info.textAlignHorizontal;
      base.textAlignVertical = info.textAlignVertical;
      base.layoutMode = info.layoutMode;
    }
    return base;
  });

  const rel = buildRelationMaps(roots);
  const byId: Record<string, LintNode> = {};
  for (const n of nodes) byId[n.id] = n;

  const siblings: Record<string, string[]> = {};
  const ancestors: Record<string, string[]> = {};
  const children: Record<string, string[]> = {};
  for (const n of nodes) {
    siblings[n.id] = rel.siblingsOf(n.id);
    ancestors[n.id] = rel.ancestorsOf(n.id);
    children[n.id] = rel.childrenIdsOf(n.id);
  }

  return { nodes, relations: { byId, siblings, ancestors, children } };
}

/** 트리의 모든 노드 id를 모아 get_nodes_info 배치 호출에 넘길 목록을 만든다. */
export function collectNodeIds(roots: TreeNode[]): string[] {
  return flattenTree(roots).map(({ node }) => node.id);
}
