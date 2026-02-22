/**
 * 노드/문서/스타일 정보 조회
 * cursor-talk-to-figma의 get_node_info, get_document_info, get_styles 참고
 */

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
    opacity: scene.opacity,
  };

  // Fills & Strokes
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
  }

  // Layout (Frame/Component)
  if (scene.type === 'FRAME' || scene.type === 'COMPONENT' || scene.type === 'COMPONENT_SET') {
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
    info.layoutSizingHorizontal = frame.layoutSizingHorizontal;
    info.layoutSizingVertical = frame.layoutSizingVertical;
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

  return info;
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
