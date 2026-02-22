/**
 * FigJam 전용 노드 생성 — Sticky, Connector
 * FigJam 환경에서만 사용 가능
 */

function ensureFigJam(): void {
  if (figma.editorType !== 'figjam') {
    throw new Error('이 기능은 FigJam 환경에서만 사용 가능합니다 (현재: ' + figma.editorType + ')');
  }
}

export interface CreateStickyOptions {
  text?: string;
  x?: number;
  y?: number;
  parentId?: string;
}

export interface CreateStickyResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function createSticky(options: CreateStickyOptions): Promise<CreateStickyResult> {
  ensureFigJam();
  const sticky = figma.createSticky();
  if (options.x !== undefined) sticky.x = options.x;
  if (options.y !== undefined) sticky.y = options.y;
  if (options.text) {
    await figma.loadFontAsync(sticky.text.fontName as FontName);
    sticky.text.characters = options.text;
  }
  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (parent && 'appendChild' in parent) {
      (parent as ChildrenMixin).appendChild(sticky);
    }
  }
  return {
    nodeId: sticky.id,
    name: sticky.name,
    x: sticky.x,
    y: sticky.y,
    width: sticky.width,
    height: sticky.height,
  };
}

export interface CreateConnectorOptions {
  startNodeId: string;
  endNodeId: string;
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
}

export interface CreateConnectorResult {
  nodeId: string;
  name: string;
}

export function createConnector(options: CreateConnectorOptions): CreateConnectorResult {
  ensureFigJam();
  if (!options.startNodeId) throw new Error('startNodeId가 필요합니다');
  if (!options.endNodeId) throw new Error('endNodeId가 필요합니다');
  const startNode = figma.getNodeById(options.startNodeId);
  const endNode = figma.getNodeById(options.endNodeId);
  if (!startNode) throw new Error('시작 노드를 찾을 수 없습니다: ' + options.startNodeId);
  if (!endNode) throw new Error('끝 노드를 찾을 수 없습니다: ' + options.endNodeId);

  const connector = figma.createConnector();
  connector.connectorStart = { endpointNodeId: options.startNodeId, magnet: 'AUTO' };
  connector.connectorEnd = { endpointNodeId: options.endNodeId, magnet: 'AUTO' };

  if (options.strokeColor) {
    const c = options.strokeColor;
    connector.strokes = [{
      type: 'SOLID',
      color: { r: c.r, g: c.g, b: c.b },
      opacity: c.a !== undefined ? c.a : 1,
    }];
  }
  if (options.strokeWeight !== undefined) {
    connector.strokeWeight = options.strokeWeight;
  }

  return { nodeId: connector.id, name: connector.name };
}
