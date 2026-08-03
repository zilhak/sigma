/**
 * 노드/문서/스타일 정보 조회
 * cursor-talk-to-figma의 get_node_info, get_document_info, get_styles 참고
 */

/**
 * Figma는 혼합값(cornerRadius/fontSize/fontName 등 다수 필드)을 `figma.mixed` 심볼로 반환한다.
 * 심볼은 postMessage(구조화 복제)로 직렬화가 안 돼 "Cannot unwrap symbol" 에러로 통신 자체가
 * 끊긴다 — 배치 조회(getNodesInfo)에서 실사용 중 발견. 처음엔 알려진 필드(cornerRadius/fontSize/
 * fontName → 이후 fills/strokes/strokeWeight)만 개별 sanitize했는데, 신규 필드(layoutSizing 등)를
 * 추가할 때마다 또 빠뜨려 같은 에러가 재발했다. 그래서 필드별 처리 대신 반환 객체 전체를 재귀
 * 순회해 `figma.mixed`를 문자열 'mixed'로 치환한다 — 어떤 필드가 미래에 mixed를 반환하게 되든
 * (Figma API 자체가 어떤 속성을 mixed-able로 문서화하는지 100% 신뢰할 수 없어 방어적으로 접근) 이
 * 함수 하나로 항상 막힌다.
 */
function deepSanitizeMixed(value: unknown): unknown {
  if (value === figma.mixed) return 'mixed';
  if (Array.isArray(value)) return value.map(deepSanitizeMixed);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const obj = value as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        out[key] = deepSanitizeMixed(obj[key]);
      }
    }
    return out;
  }
  return value;
}

/**
 * 텍스트에 걸린 하이퍼링크를 range 단위로 읽는다.
 *
 * `textNode.hyperlink` 단일 속성은 문자마다 링크가 다르면 `figma.mixed`가 되어 어느 구간에
 * 무엇이 걸렸는지 알 수 없다. 링크는 range 속성이므로 `getStyledTextSegments(['hyperlink'])`로
 * 구간을 쪼개 읽어야 실제 배선 상태를 확인할 수 있다 — `sigma_set_hyperlink`로 건 링크가
 * 제대로 걸렸는지 검증할 유일한 수단이라 조회에 노출한다.
 */
export function getTextHyperlinks(
  textNode: TextNode
): Array<{ start: number; end: number; type: string; value: string }> {
  if (textNode.characters.length === 0) return [];
  const links: Array<{ start: number; end: number; type: string; value: string }> = [];
  const segments = textNode.getStyledTextSegments(['hyperlink']);
  for (const segment of segments) {
    const link = segment.hyperlink;
    if (!link) continue;
    links.push({ start: segment.start, end: segment.end, type: link.type, value: link.value });
  }
  return links;
}

export interface NodeDetailInfo {
  nodeId: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  // 타입별 추가 정보
  fills?: unknown;
  strokes?: unknown;
  strokeWeight?: number;
  cornerRadius?: unknown;
  characters?: string;
  fontSize?: unknown;
  fontName?: unknown;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  hyperlinks?: Array<{ start: number; end: number; type: string; value: string }>;
  layoutMode?: string;
  layoutWrap?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  childCount?: number;
  componentName?: string;
  description?: string;
}

export function getNodeInfo(nodeId: string): NodeDetailInfo {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);

  if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
    return {
      nodeId: node.id,
      name: node.name,
      type: node.type,
      visible: true,
      locked: false,
      x: 0, y: 0, width: 0, height: 0,
      opacity: 1,
      childCount: 'children' in node ? (node as ChildrenMixin).children.length : 0,
    };
  }

  const scene = node as SceneNode;
  const info: NodeDetailInfo = {
    nodeId: scene.id,
    name: scene.name,
    type: scene.type,
    visible: scene.visible,
    locked: scene.locked,
    x: scene.x,
    y: scene.y,
    width: 'width' in scene ? (scene as any).width : 0,
    height: 'height' in scene ? (scene as any).height : 0,
    opacity: 'opacity' in scene ? (scene as any).opacity : 1,
  };

  // Fills & Strokes (TEXT는 문자 range별로 달라 mixed 심볼일 수 있음 — 아래 return 시 일괄 sanitize)
  if ('fills' in scene) {
    info.fills = (scene as GeometryMixin & SceneNode).fills;
  }
  if ('strokes' in scene) {
    info.strokes = (scene as GeometryMixin & SceneNode).strokes;
    info.strokeWeight = (scene as GeometryMixin & SceneNode).strokeWeight as number;
  }

  // Corner radius
  if ('cornerRadius' in scene) {
    info.cornerRadius = (scene as FrameNode).cornerRadius;
  }

  // Text
  if (scene.type === 'TEXT') {
    const textNode = scene as TextNode;
    info.characters = textNode.characters;
    info.fontSize = textNode.fontSize;
    info.fontName = textNode.fontName;
    info.textAlignHorizontal = textNode.textAlignHorizontal;
    info.textAlignVertical = textNode.textAlignVertical;
    const links = getTextHyperlinks(textNode);
    if (links.length > 0) info.hyperlinks = links;
  }

  // Layout — 오토레이아웃 가능한 모든 타입(FRAME/COMPONENT/COMPONENT_SET/INSTANCE — BaseFrameMixin 상속)
  if ('layoutMode' in scene) {
    const frame = scene as FrameNode;
    info.layoutMode = frame.layoutMode;
    info.layoutWrap = frame.layoutWrap;
    info.paddingTop = frame.paddingTop;
    info.paddingRight = frame.paddingRight;
    info.paddingBottom = frame.paddingBottom;
    info.paddingLeft = frame.paddingLeft;
    info.itemSpacing = frame.itemSpacing;
    info.primaryAxisAlignItems = frame.primaryAxisAlignItems;
    info.counterAxisAlignItems = frame.counterAxisAlignItems;
  }

  // layoutSizing은 오토레이아웃 자식으로 참여 가능한 모든 타입(FRAME/TEXT/RECTANGLE 등)에 존재 —
  // 위 FRAME/COMPONENT 전용 블록에 있으면 일반 자식 노드에서 누락되는 버그였음
  if ('layoutSizingHorizontal' in scene) {
    const layoutNode = scene as FrameNode;
    info.layoutSizingHorizontal = layoutNode.layoutSizingHorizontal;
    info.layoutSizingVertical = layoutNode.layoutSizingVertical;
  }

  // Component description
  if (scene.type === 'COMPONENT' || scene.type === 'COMPONENT_SET') {
    info.description = (scene as ComponentNode).description;
  }

  // Children
  if ('children' in scene) {
    info.childCount = (scene as ChildrenMixin).children.length;
  }

  // Instance
  if (scene.type === 'INSTANCE') {
    const instance = scene as InstanceNode;
    info.componentName = instance.mainComponent ? instance.mainComponent.name : undefined;
  }

  return deepSanitizeMixed(info) as NodeDetailInfo;
}

// --- Get Nodes Info (batch) ---

export interface GetNodesInfoResult {
  total: number;
  succeeded: number;
  nodes: Array<NodeDetailInfo | { nodeId: string; error: string }>;
}

export function getNodesInfo(nodeIds: string[]): GetNodesInfoResult {
  const nodes: GetNodesInfoResult['nodes'] = [];

  for (const nodeId of nodeIds) {
    try {
      const info = getNodeInfo(nodeId);
      nodes.push(info);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      nodes.push({ nodeId, error: errMsg });
    }
  }

  const succeeded = nodes.filter(n => !('error' in n)).length;
  return { total: nodeIds.length, succeeded, nodes };
}

// --- Read My Design (selection detail) ---

export interface ReadMyDesignResult {
  count: number;
  nodes: NodeDetailInfo[];
}

export function readMyDesign(): ReadMyDesignResult {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return { count: 0, nodes: [] };
  }

  const nodes: NodeDetailInfo[] = [];
  for (const sceneNode of selection) {
    try {
      const info = getNodeInfo(sceneNode.id);
      nodes.push(info);
    } catch {
      // 조회 실패한 노드는 스킵
    }
  }

  return { count: nodes.length, nodes };
}

export interface DocumentInfo {
  name: string;
  currentPage: { id: string; name: string };
  pages: Array<{ id: string; name: string }>;
}

export function getDocumentInfo(): DocumentInfo {
  return {
    name: figma.root.name,
    currentPage: {
      id: figma.currentPage.id,
      name: figma.currentPage.name,
    },
    pages: figma.root.children.map(page => ({
      id: page.id,
      name: page.name,
    })),
  };
}

export interface StylesInfo {
  paintStyles: Array<{ id: string; name: string; key: string }>;
  textStyles: Array<{ id: string; name: string; key: string }>;
  effectStyles: Array<{ id: string; name: string; key: string }>;
  gridStyles: Array<{ id: string; name: string; key: string }>;
}

export async function getStyles(): Promise<StylesInfo> {
  const [paints, texts, effects, grids] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);

  return {
    paintStyles: paints.map(s => ({ id: s.id, name: s.name, key: s.key })),
    textStyles: texts.map(s => ({ id: s.id, name: s.name, key: s.key })),
    effectStyles: effects.map(s => ({ id: s.id, name: s.name, key: s.key })),
    gridStyles: grids.map(s => ({ id: s.id, name: s.name, key: s.key })),
  };
}

// === Font List ===

export interface ListFontsResult {
  fonts: Array<{ family: string; style: string }>;
  count: number;
}

export async function listAvailableFonts(): Promise<ListFontsResult> {
  const fonts = await figma.listAvailableFontsAsync();
  return {
    fonts: fonts.map(f => ({ family: f.fontName.family, style: f.fontName.style })),
    count: fonts.length,
  };
}

// === CSS Export ===

export interface GetCSSResult {
  nodeId: string;
  css: Record<string, string>;
}

export async function getNodeCSS(nodeId: string): Promise<GetCSSResult> {
  if (!nodeId) throw new Error('nodeId가 필요합니다');
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);
  if (node.type === 'DOCUMENT' || node.type === 'PAGE') throw new Error('DOCUMENT/PAGE 노드는 CSS를 지원하지 않습니다');
  const sceneNode = node as SceneNode;
  if (!('getCSSAsync' in sceneNode)) throw new Error('이 노드는 CSS 추출을 지원하지 않습니다');
  const css = await (sceneNode as any).getCSSAsync();
  return { nodeId, css };
}
