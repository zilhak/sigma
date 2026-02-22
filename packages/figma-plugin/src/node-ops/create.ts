/**
 * 빈 노드 생성 (Rectangle, Text, Frame, Ellipse, Polygon, Star, Line, Vector)
 * cursor-talk-to-figma의 create_rectangle, create_text, create_frame 참고
 */

// fontWeight → Figma style name 매핑
const WEIGHT_TO_STYLE: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

function getStyleFromWeight(weight: number): string {
  return WEIGHT_TO_STYLE[weight] !== undefined ? WEIGHT_TO_STYLE[weight] : 'Regular';
}

export interface CreateRectangleOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  parentId?: string;
  fillColor?: { r: number; g: number; b: number; a?: number };
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
  cornerRadius?: number;
}

export interface CreateRectangleResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createRectangle(options: CreateRectangleOptions): CreateRectangleResult {
  const rect = figma.createRectangle();
  rect.x = options.x;
  rect.y = options.y;
  rect.resize(Math.max(options.width, 0.01), Math.max(options.height, 0.01));

  if (options.name) rect.name = options.name;

  if (options.fillColor) {
    const { r, g, b, a } = options.fillColor;
    rect.fills = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
  }

  if (options.strokeColor) {
    const { r, g, b, a } = options.strokeColor;
    rect.strokes = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
    if (options.strokeWeight !== undefined) {
      rect.strokeWeight = options.strokeWeight;
    }
  }

  if (options.cornerRadius !== undefined) {
    rect.cornerRadius = options.cornerRadius;
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(rect);
  }

  return {
    nodeId: rect.id,
    name: rect.name,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export interface CreateTextOptions {
  x: number;
  y: number;
  text: string;
  name?: string;
  parentId?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontColor?: { r: number; g: number; b: number; a?: number };
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
}

export interface CreateTextResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  characters: string;
}

export async function createText(options: CreateTextOptions): Promise<CreateTextResult> {
  const family = options.fontFamily !== undefined ? options.fontFamily : 'Inter';
  const weight = options.fontWeight !== undefined ? options.fontWeight : 400;
  const style = getStyleFromWeight(weight);

  await figma.loadFontAsync({ family, style });

  const text = figma.createText();
  text.fontName = { family, style };
  text.characters = options.text;
  text.x = options.x;
  text.y = options.y;

  if (options.name) text.name = options.name;

  const fontSize = options.fontSize !== undefined ? options.fontSize : 14;
  text.fontSize = fontSize;

  if (options.fontColor) {
    const { r, g, b, a } = options.fontColor;
    text.fills = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
  }

  if (options.textAlignHorizontal) {
    text.textAlignHorizontal = options.textAlignHorizontal;
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(text);
  }

  return {
    nodeId: text.id,
    name: text.name,
    x: text.x,
    y: text.y,
    width: text.width,
    height: text.height,
    characters: text.characters,
  };
}

export interface CreateEmptyFrameOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  parentId?: string;
  fillColor?: { r: number; g: number; b: number; a?: number };
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
  cornerRadius?: number;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  layoutWrap?: 'NO_WRAP' | 'WRAP';
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  itemSpacing?: number;
  counterAxisSpacing?: number;
}

export interface CreateEmptyFrameResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode: string;
}

export function createEmptyFrame(options: CreateEmptyFrameOptions): CreateEmptyFrameResult {
  const frame = figma.createFrame();
  frame.x = options.x;
  frame.y = options.y;
  frame.resize(Math.max(options.width, 0.01), Math.max(options.height, 0.01));

  if (options.name) frame.name = options.name;

  if (options.fillColor) {
    const { r, g, b, a } = options.fillColor;
    frame.fills = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
  }

  if (options.strokeColor) {
    const { r, g, b, a } = options.strokeColor;
    frame.strokes = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
    if (options.strokeWeight !== undefined) {
      frame.strokeWeight = options.strokeWeight;
    }
  }

  if (options.cornerRadius !== undefined) {
    frame.cornerRadius = options.cornerRadius;
  }

  // Layout
  const layoutMode = options.layoutMode !== undefined ? options.layoutMode : 'NONE';
  if (layoutMode !== 'NONE') {
    frame.layoutMode = layoutMode;

    if (options.layoutWrap) {
      frame.layoutWrap = options.layoutWrap;
    }

    if (options.paddingTop !== undefined) frame.paddingTop = options.paddingTop;
    if (options.paddingRight !== undefined) frame.paddingRight = options.paddingRight;
    if (options.paddingBottom !== undefined) frame.paddingBottom = options.paddingBottom;
    if (options.paddingLeft !== undefined) frame.paddingLeft = options.paddingLeft;

    if (options.primaryAxisAlignItems) {
      frame.primaryAxisAlignItems = options.primaryAxisAlignItems;
    }
    if (options.counterAxisAlignItems) {
      frame.counterAxisAlignItems = options.counterAxisAlignItems;
    }

    if (options.layoutSizingHorizontal) {
      frame.layoutSizingHorizontal = options.layoutSizingHorizontal;
    }
    if (options.layoutSizingVertical) {
      frame.layoutSizingVertical = options.layoutSizingVertical;
    }

    if (options.itemSpacing !== undefined) {
      frame.itemSpacing = options.itemSpacing;
    }
    if (options.counterAxisSpacing !== undefined) {
      frame.counterAxisSpacing = options.counterAxisSpacing;
    }
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(frame);
  }

  return {
    nodeId: frame.id,
    name: frame.name,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    layoutMode: frame.layoutMode,
  };
}

// === Ellipse ===

export interface CreateEllipseOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  parentId?: string;
  fillColor?: { r: number; g: number; b: number; a?: number };
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
  arcData?: {
    startingAngle: number;
    endingAngle: number;
    innerRadius: number;
  };
}

export interface CreateEllipseResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createEllipse(options: CreateEllipseOptions): CreateEllipseResult {
  const ellipse = figma.createEllipse();
  ellipse.x = options.x;
  ellipse.y = options.y;
  ellipse.resize(Math.max(options.width, 0.01), Math.max(options.height, 0.01));

  if (options.name) ellipse.name = options.name;

  if (options.fillColor) {
    const { r, g, b, a } = options.fillColor;
    ellipse.fills = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
  }

  if (options.strokeColor) {
    const { r, g, b, a } = options.strokeColor;
    ellipse.strokes = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
    if (options.strokeWeight !== undefined) {
      ellipse.strokeWeight = options.strokeWeight;
    }
  }

  if (options.arcData) {
    ellipse.arcData = {
      startingAngle: options.arcData.startingAngle,
      endingAngle: options.arcData.endingAngle,
      innerRadius: options.arcData.innerRadius,
    };
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(ellipse);
  }

  return {
    nodeId: ellipse.id,
    name: ellipse.name,
    x: ellipse.x,
    y: ellipse.y,
    width: ellipse.width,
    height: ellipse.height,
  };
}

// === Polygon ===

export interface CreatePolygonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  parentId?: string;
  fillColor?: { r: number; g: number; b: number; a?: number };
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
  pointCount?: number;
}

export interface CreatePolygonResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pointCount: number;
}

export function createPolygon(options: CreatePolygonOptions): CreatePolygonResult {
  const polygon = figma.createPolygon();
  polygon.x = options.x;
  polygon.y = options.y;
  polygon.resize(Math.max(options.width, 0.01), Math.max(options.height, 0.01));

  if (options.name) polygon.name = options.name;

  if (options.pointCount !== undefined) {
    polygon.pointCount = options.pointCount;
  }

  if (options.fillColor) {
    const { r, g, b, a } = options.fillColor;
    polygon.fills = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
  }

  if (options.strokeColor) {
    const { r, g, b, a } = options.strokeColor;
    polygon.strokes = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
    if (options.strokeWeight !== undefined) {
      polygon.strokeWeight = options.strokeWeight;
    }
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(polygon);
  }

  return {
    nodeId: polygon.id,
    name: polygon.name,
    x: polygon.x,
    y: polygon.y,
    width: polygon.width,
    height: polygon.height,
    pointCount: polygon.pointCount,
  };
}

// === Star ===

export interface CreateStarOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  parentId?: string;
  fillColor?: { r: number; g: number; b: number; a?: number };
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
  pointCount?: number;
  innerRadius?: number;
}

export interface CreateStarResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pointCount: number;
  innerRadius: number;
}

export function createStar(options: CreateStarOptions): CreateStarResult {
  const star = figma.createStar();
  star.x = options.x;
  star.y = options.y;
  star.resize(Math.max(options.width, 0.01), Math.max(options.height, 0.01));

  if (options.name) star.name = options.name;

  if (options.pointCount !== undefined) {
    star.pointCount = options.pointCount;
  }

  if (options.innerRadius !== undefined) {
    star.innerRadius = options.innerRadius;
  }

  if (options.fillColor) {
    const { r, g, b, a } = options.fillColor;
    star.fills = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
  }

  if (options.strokeColor) {
    const { r, g, b, a } = options.strokeColor;
    star.strokes = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
    if (options.strokeWeight !== undefined) {
      star.strokeWeight = options.strokeWeight;
    }
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(star);
  }

  return {
    nodeId: star.id,
    name: star.name,
    x: star.x,
    y: star.y,
    width: star.width,
    height: star.height,
    pointCount: star.pointCount,
    innerRadius: star.innerRadius,
  };
}

// === Line ===

export interface CreateLineOptions {
  x: number;
  y: number;
  length: number;
  name?: string;
  parentId?: string;
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
  rotation?: number;
  dashPattern?: number[];
}

export interface CreateLineResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  length: number;
}

export function createLine(options: CreateLineOptions): CreateLineResult {
  const line = figma.createLine();
  line.x = options.x;
  line.y = options.y;
  line.resize(Math.max(options.length, 0.01), 0);

  if (options.name) line.name = options.name;

  // Line은 기본적으로 stroke가 필요
  const strokeColor = options.strokeColor !== undefined
    ? options.strokeColor
    : { r: 0, g: 0, b: 0 };
  const { r, g, b, a } = strokeColor;
  line.strokes = [{
    type: 'SOLID',
    color: { r, g, b },
    opacity: a !== undefined ? a : 1,
  }];

  const strokeWeight = options.strokeWeight !== undefined ? options.strokeWeight : 1;
  line.strokeWeight = strokeWeight;

  if (options.rotation !== undefined) {
    line.rotation = options.rotation;
  }

  if (options.dashPattern) {
    line.dashPattern = options.dashPattern;
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(line);
  }

  return {
    nodeId: line.id,
    name: line.name,
    x: line.x,
    y: line.y,
    length: line.width,
  };
}

// === Vector ===

export interface CreateVectorOptions {
  x: number;
  y: number;
  name?: string;
  parentId?: string;
  fillColor?: { r: number; g: number; b: number; a?: number };
  strokeColor?: { r: number; g: number; b: number; a?: number };
  strokeWeight?: number;
  vectorPaths?: Array<{
    windingRule: 'NONZERO' | 'EVENODD';
    data: string;
  }>;
}

export interface CreateVectorResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createVector(options: CreateVectorOptions): CreateVectorResult {
  const vector = figma.createVector();
  vector.x = options.x;
  vector.y = options.y;

  if (options.name) vector.name = options.name;

  if (options.vectorPaths) {
    vector.vectorPaths = options.vectorPaths;
  }

  if (options.fillColor) {
    const { r, g, b, a } = options.fillColor;
    vector.fills = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
  }

  if (options.strokeColor) {
    const { r, g, b, a } = options.strokeColor;
    vector.strokes = [{
      type: 'SOLID',
      color: { r, g, b },
      opacity: a !== undefined ? a : 1,
    }];
    if (options.strokeWeight !== undefined) {
      vector.strokeWeight = options.strokeWeight;
    }
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(vector);
  }

  return {
    nodeId: vector.id,
    name: vector.name,
    x: vector.x,
    y: vector.y,
    width: vector.width,
    height: vector.height,
  };
}

// ============================================
// Image Node
// ============================================

export interface CreateImageNodeOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  imageData: string;  // base64 encoded image
  name?: string;
  parentId?: string;
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
  cornerRadius?: number;
}

export interface CreateImageNodeResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageHash: string;
}

export function createImageNode(options: CreateImageNodeOptions): CreateImageNodeResult {
  // base64 → Uint8Array
  const binaryString = figma.base64Decode(options.imageData);

  // Figma Image 생성
  const image = figma.createImage(binaryString);

  // Rectangle에 이미지 적용
  const rect = figma.createRectangle();
  rect.x = options.x;
  rect.y = options.y;
  rect.resize(options.width, options.height);
  if (options.name) rect.name = options.name;
  if (options.cornerRadius !== undefined) rect.cornerRadius = options.cornerRadius;

  const scaleMode = options.scaleMode !== undefined ? options.scaleMode : 'FILL';
  rect.fills = [{
    type: 'IMAGE',
    imageHash: image.hash,
    scaleMode: scaleMode,
  }];

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(rect);
  }

  return {
    nodeId: rect.id,
    name: rect.name,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    imageHash: image.hash,
  };
}

// === SVG → Figma Node ===

export interface CreateNodeFromSvgOptions {
  svgString: string;
  x?: number;
  y?: number;
  name?: string;
  parentId?: string;
}

export interface CreateNodeFromSvgResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childCount: number;
}

export function createNodeFromSvg(options: CreateNodeFromSvgOptions): CreateNodeFromSvgResult {
  if (!options.svgString) throw new Error('svgString이 필요합니다');
  const node = figma.createNodeFromSvg(options.svgString);
  if (options.x !== undefined) node.x = options.x;
  if (options.y !== undefined) node.y = options.y;
  if (options.name) node.name = options.name;
  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (parent && 'appendChild' in parent) {
      (parent as ChildrenMixin).appendChild(node);
    }
  }
  return {
    nodeId: node.id, name: node.name, x: node.x, y: node.y,
    width: node.width, height: node.height, childCount: node.children.length,
  };
}
