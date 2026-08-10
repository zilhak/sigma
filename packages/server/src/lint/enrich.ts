/**
 * TreeNode(구조/좌표) + get_nodes_info(스타일/텍스트 상세)를 합쳐 커스텀 규칙이 보는
 * LintNode[] 와 관계 맵(ctx.getSiblings 등)을 만든다. 빌트인 규칙은 TreeNode만으로 충분하므로
 * 이 enrichment는 config.custom 이 있을 때만 호출한다(불필요한 왕복 방지).
 */
import type { TreeNode } from '@sigma/shared';
import { flattenTree, buildRelationMaps, isEnabled, type LintNode, type LintConfig } from '@sigma/shared/lint';
import type { FigmaWebSocketServer } from '../websocket/server.js';
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

/** GET_NODES_INFO 응답은 배열로 오기도 하고 { nodes: [...] } 로 오기도 한다 — 둘 다 받는다. */
export function extractNodesInfo(raw: unknown): NodeInfoLike[] {
  if (Array.isArray(raw)) return raw as NodeInfoLike[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { nodes?: unknown }).nodes)) {
    return (raw as { nodes: NodeInfoLike[] }).nodes;
  }
  return [];
}

/**
 * 한 왕복에 담는 nodeIds 상한.
 *
 * ⛔ 이 상한이 없으면 **플러그인이 죽는다.** 페이지 전 노드를 한 번에 요청하면 응답이
 * ~18MB 부근에서 Figma 플러그인을 무너뜨리고, 재연결하면서 pluginId 가 바뀌어
 * 같은 파일에서 작업 중인 다른 에이전트의 바인딩까지 끊긴다.
 *
 * 4,000 = 실측 2.5MB/2.5s — 절벽(~18.4MB)의 1/7 지점이라 여유가 크다.
 * **올리거나 없애지 말 것.** 타임아웃을 늘리는 것으로 대체되지도 않는다(시간 문제가 아니다).
 *
 * 배경: docs/history/012-nodes-info-asked-for-a-whole-page-and-killed-the-plugin.md
 */
const NODES_INFO_BATCH = 4000;

/**
 * GET_NODES_INFO 를 배치로 나눠 부른다.
 *
 * **순차 실행이다 — 병렬(`Promise.all`)로 바꾸지 말 것.** 왕복 수는 같지만 플러그인이 동시에
 * 여러 응답을 만들어 합산 크기가 위 절벽을 넘는다. 느려서 for 루프인 게 아니라 일부러다.
 *
 * 배경: docs/history/012-nodes-info-asked-for-a-whole-page-and-killed-the-plugin.md
 */
export async function fetchNodesInfoBatched(
  nodeIds: string[],
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
): Promise<NodeInfoLike[]> {
  const out: NodeInfoLike[] = [];
  for (let i = 0; i < nodeIds.length; i += NODES_INFO_BATCH) {
    const batch = nodeIds.slice(i, i + NODES_INFO_BATCH);
    const raw = await wsServer.command('GET_NODES_INFO', { nodeIds: batch }, {
      pluginId,
      timeoutMs: 60000,
      logSuffix: ` (${batch.length} nodes, ${i / NODES_INFO_BATCH + 1}/${Math.ceil(nodeIds.length / NODES_INFO_BATCH)})`,
    });
    out.push(...extractNodesInfo(raw));
  }
  return out;
}

/**
 * `get_tree` 의 `rootNode` 는 **자식이 없는 껍데기**다(id/name/type/boundingBox 뿐 — 자식은
 * 형제 필드 `children` 으로 따로 온다). 그래서 검사 대상을 `[scopeRoot]` 로 바꾸면 시작 노드는
 * 얻지만 **서브트리를 통째로 잃는다** — 실측으로, 커스텀 규칙이 SECTION 하나만 보고 그 안의
 * 마커·범례를 못 봐 짝 검사가 계속 0건이었고 `annotation_layer` 는 "레이어 없음" 오탐을 냈다.
 *
 * roots(= scopeRoot 의 자식)를 도로 붙여 **시작 노드 + 서브트리 전부**를 만든다.
 * 배경: docs/history/017-scope-root-was-never-linted.md
 */
export function scopeRootWithChildren(scopeRoot: TreeNode | undefined, roots: TreeNode[]): TreeNode[] {
  if (!scopeRoot) return roots;
  return [{ ...scopeRoot, childCount: roots.length, children: roots }];
}

/**
 * 상세 조회(GET_NODES_INFO) 왕복은 **그것을 요구하는 규칙이 켜졌을 때만** 한다.
 * 켜진 게 하나도 없으면 null 을 돌려주고 호출부는 TreeNode 만으로 진행한다(왕복 0).
 */
export async function enrichIfNeeded(
  config: LintConfig,
  roots: TreeNode[],
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
  annotationLayerIds?: Iterable<string>,
  /** nodeId/path 스코프의 시작 노드 자신. 주면 이 노드도 검사 대상에 넣는다.
   *  배경: docs/history/017-scope-root-was-never-linted.md */
  scopeRoot?: TreeNode,
): Promise<BuildLintNodesResult | null> {
  const needsCustom = (config.custom || []).length > 0;
  const needsOcclusion = isEnabled(config.builtins || {}, 'fully_occluded_sibling');
  // instance_resized_from_spec 은 opt-in — 켰을 때만 상세 조회(마스터 크기·스펙 alias)를 태운다.
  const needsSpecSize = config.builtins?.instance_resized_from_spec?.enabled === true;
  const needsMarkerPair = config.builtins?.annotation_marker_pair?.enabled === true;
  const needsFont = config.builtins?.font_not_default?.enabled === true;
  const needsMarkerGap = config.builtins?.annotation_marker_gap?.enabled === true;
  if (!needsCustom && !needsOcclusion && !needsSpecSize && !needsMarkerPair && !needsFont && !needsMarkerGap) return null;

  // ⚠️ 스코프 루트 자신을 빼면 그 노드를 대상으로 하는 규칙이 **조용히 0건**이 된다.
  // 실측: 섹션을 nodeId 로 검사할 때 `n.type==='SECTION'` 인 커스텀 규칙(anno-pair-orphan)이
  // 대상 0개라 짝이 어긋나도 아무 말이 없었다 — 같은 섹션을 page 스코프로 재면 1건 나온다.
  // 배경: docs/history/017-scope-root-was-never-linted.md
  const base = scopeRootWithChildren(scopeRoot, roots);
  const nodeIds = collectNodeIds(base);
  return buildLintNodes(base, await fetchNodesInfoBatched(nodeIds, wsServer, pluginId), annotationLayerIds);
}
