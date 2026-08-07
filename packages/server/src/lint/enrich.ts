/**
 * TreeNode(구조/좌표) + get_nodes_info(스타일/텍스트 상세)를 합쳐 커스텀 규칙이 보는
 * LintNode[] 와 관계 맵(ctx.getSiblings 등)을 만든다. 빌트인 규칙은 TreeNode만으로 충분하므로
 * 이 enrichment는 config.custom 이 있을 때만 호출한다(불필요한 왕복 방지).
 */
import { flattenTree, buildRelationMaps, type TreeNode, type LintNode } from '@sigma/shared';
import type { CtxRelations } from './run-custom-rule';

/** GET_NODES_INFO 명령이 WS 왕복으로 돌려주는 항목 — 플러그인의 NodeDetailInfo를
 *  서버에선 비구조화된 unknown 으로 받으므로 여기서 필요한 필드만 느슨하게 타이핑한다. */
export interface NodeInfoLike {
  nodeId: string;
  error?: string;
  /** INSTANCE 의 마스터 컴포넌트 이름 (get_nodes_info 가 인스턴스에 대해 반환). instance_default_name 규칙용. */
  componentName?: string;
  /** INSTANCE 의 마스터 크기·스펙 alias. instance_resized_from_spec 규칙용. */
  componentWidth?: number;
  componentHeight?: number;
  specAlias?: string;
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
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  description?: string;
  /** TEXT 에 걸린 하이퍼링크 구간. 링크는 range 속성이라 이걸 안 실어 주면 규칙이 배선 여부를
   *  전혀 볼 수 없다(기획 주석 마커 ↔ 범례 왕복 링크 누락 검사용). */
  hyperlinks?: Array<{ start: number; end: number; type: string; value: string }>;
}

export interface BuildLintNodesResult {
  nodes: LintNode[];
  relations: CtxRelations;
}

export function buildLintNodes(
  roots: TreeNode[],
  nodesInfo: NodeInfoLike[],
  /** 기획 레이어로 판정된 노드 id. 빌트인은 이미 주입받아 쓰는데 커스텀 규칙만 못 봐서
   *  이름으로 짐작해야 했다(레이어 이름 규약을 만들지 않는다는 원칙과 어긋난다). */
  annotationLayerIds?: Iterable<string>,
): BuildLintNodesResult {
  const layerIds = new Set(annotationLayerIds || []);
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
      // 기획 레이어 본체(pluginData role 판정). 하위 노드는 false — 조상으로 거슬러
      // 판정하려면 ctx.getAncestors 를 쓴다.
      isAnnotationLayer: layerIds.has(node.id),
      // 절대좌표(요청했을 때만 실림) — 서로 다른 컨테이너에 있는 노드끼리 거리를 재려면 이게 필요하다.
      ...(node.absolute ? { absoluteX: node.absolute.x, absoluteY: node.absolute.y } : {}),
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
      base.layoutSizingHorizontal = info.layoutSizingHorizontal;
      base.layoutSizingVertical = info.layoutSizingVertical;
      base.description = info.description;
      base.hyperlinks = info.hyperlinks;
      base.componentWidth = info.componentWidth;
      base.componentHeight = info.componentHeight;
      base.specAlias = info.specAlias;
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
