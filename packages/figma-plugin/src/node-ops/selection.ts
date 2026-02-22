/**
 * 선택 & 뷰포트 제어
 * cursor-talk-to-figma의 get_selection, set_focus, set_selections 참고
 */

export interface SelectionNodeInfo {
  nodeId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GetSelectionResult {
  count: number;
  nodes: SelectionNodeInfo[];
}

export function getSelection(): GetSelectionResult {
  const selection = figma.currentPage.selection;
  return {
    count: selection.length,
    nodes: selection.map(node => ({
      nodeId: node.id,
      name: node.name,
      type: node.type,
      x: node.x,
      y: node.y,
      width: 'width' in node ? (node as any).width : 0,
      height: 'height' in node ? (node as any).height : 0,
    })),
  };
}

export interface SetSelectionResult {
  selected: number;
  nodes: SelectionNodeInfo[];
}

export function setSelection(nodeIds: string[], zoomToFit?: boolean): SetSelectionResult {
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
      nodes.push(node as SceneNode);
    }
  }

  figma.currentPage.selection = nodes;

  if (zoomToFit !== false && nodes.length > 0) {
    figma.viewport.scrollAndZoomIntoView(nodes);
  }

  return {
    selected: nodes.length,
    nodes: nodes.map(node => ({
      nodeId: node.id,
      name: node.name,
      type: node.type,
      x: node.x,
      y: node.y,
      width: 'width' in node ? (node as any).width : 0,
      height: 'height' in node ? (node as any).height : 0,
    })),
  };
}

// === Viewport ===

export interface ViewportInfo {
  center: { x: number; y: number };
  zoom: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export function getViewport(): ViewportInfo {
  const bounds = figma.viewport.bounds;
  return {
    center: { x: figma.viewport.center.x, y: figma.viewport.center.y },
    zoom: figma.viewport.zoom,
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
  };
}

export interface SetViewportOptions {
  center?: { x: number; y: number };
  zoom?: number;
  nodeIds?: string[];
}

export function setViewport(options: SetViewportOptions): ViewportInfo {
  if (options.nodeIds && options.nodeIds.length > 0) {
    const nodes: SceneNode[] = [];
    for (const id of options.nodeIds) {
      const node = figma.getNodeById(id);
      if (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
        nodes.push(node as SceneNode);
      }
    }
    if (nodes.length > 0) {
      figma.viewport.scrollAndZoomIntoView(nodes);
    }
  } else {
    if (options.center) {
      figma.viewport.center = options.center;
    }
    if (options.zoom !== undefined) {
      figma.viewport.zoom = options.zoom;
    }
  }

  return getViewport();
}
