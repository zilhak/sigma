/**
 * 빈 노드 생성 (Rectangle, Text, Frame, Ellipse, Polygon, Star, Line, Vector)
 * cursor-talk-to-figma의 create_rectangle, create_text, create_frame 참고
 */

import { loadFontForWeight, getDefaultFontFamily } from '../converter/font-loader';

/**
 * 생성된 노드를 최종 컨테이너에 배치한다.
 * - parentId 지정: 그 부모의 자식으로
 * - 미지정: targetPage(바인딩 페이지)의 직속으로
 *
 * figma.createX()는 노드를 호출 시점의 figma.currentPage에 자동으로 append한다.
 * 그 상태로 방치하면 "활성 page를 미리 바인딩 page로 바꿔놔야" 올바른 곳에 생기므로
 * 사용자가 보던 화면이 강제 전환됐다. targetPage로 직접 append하면 currentPage를
 * 건드릴 필요가 없어, MCP 작업이 사용자의 페이지/뷰 포커스를 흔들지 않는다.
 * (await를 끼고 생성하는 함수에서도 currentPage 드리프트와 무관해져 race도 사라진다.)
 */
export function placeNode(
  node: SceneNode,
  parentId: string | undefined,
  targetPage: PageNode | undefined
): void {
  if (parentId) {
    const parent = figma.getNodeById(parentId);
    if (!parent) throw new Error(`부모 노드를 찾을 수 없습니다: ${parentId}`);
    if (!('appendChild' in parent)) throw new Error(`대상 노드(${parent.type})는 자식을 가질 수 없습니다`);
    (parent as ChildrenMixin).appendChild(node);
    return;
  }
  if (targetPage && node.parent?.id !== targetPage.id) {
    targetPage.appendChild(node);
  }
}

export interface CreateRectangleOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  parentId?: string;
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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

  placeNode(rect, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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
  const family = options.fontFamily !== undefined ? options.fontFamily : getDefaultFontFamily();
  const weight = options.fontWeight !== undefined ? options.fontWeight : 400;
  const fontName = await loadFontForWeight(family, weight);

  // createText()는 노드를 현재 activePage 에 붙이지만, 아래 placeNode 가 targetPage/
  // parentId 로 다시 배치하므로 await 중 currentPage 가 드리프트해도 무관하다.
  const text = figma.createText();
  text.fontName = fontName;
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

  placeNode(text, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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
  /** 오토레이아웃일 때의 실효 sizing. layoutMode 가 NONE 이면 undefined */
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  /**
   * HUG 축이 있을 때만 채워진다.
   * width/height 인자는 자식이 붙는 순간 무효가 되므로, 응답의 width/height 만 보고
   * "지정한 크기로 만들어졌다"고 판단하면 안 된다는 것을 호출자에게 알린다.
   */
  sizingWarning?: string;
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

  placeNode(frame, options.parentId, options.targetPage);

  // 오토레이아웃을 켜면 Figma 가 sizing 을 AUTO(=HUG)로 되돌린다.
  // 그 상태에서는 위 resize() 로 넣은 width/height 가 "자식이 붙는 순간" 무효가 되어
  // 프레임이 자식 크기로 줄고, 넓은 자식은 클리핑되어 보이지 않는다.
  // 반환 시점엔 자식이 없어 width/height 가 아직 요청값 그대로라 호출자가 눈치챌 수 없으므로,
  // 실효 sizing 과 경고를 함께 실어 보낸다.
  const isAutoLayout = frame.layoutMode !== 'NONE';
  const hugAxes: string[] = [];
  if (isAutoLayout) {
    if (frame.layoutSizingHorizontal === 'HUG') hugAxes.push('width');
    if (frame.layoutSizingVertical === 'HUG') hugAxes.push('height');
  }

  return {
    nodeId: frame.id,
    name: frame.name,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    layoutMode: frame.layoutMode,
    layoutSizingHorizontal: isAutoLayout ? frame.layoutSizingHorizontal : undefined,
    layoutSizingVertical: isAutoLayout ? frame.layoutSizingVertical : undefined,
    sizingWarning: hugAxes.length > 0
      ? `${hugAxes.join('/')} 축이 HUG 입니다 — 자식을 넣는 순간 지정한 ${hugAxes.join('/')} 값이 무효가 되고 프레임이 자식 크기로 줄어듭니다(넓은 자식은 클리핑되어 화면에서 사라집니다). 크기를 고정하려면 layoutSizingHorizontal/layoutSizingVertical 을 "FIXED" 로 지정하세요.`
      : undefined,
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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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

  placeNode(ellipse, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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

  placeNode(polygon, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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

  placeNode(star, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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

  placeNode(line, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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

  placeNode(vector, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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

  placeNode(rect, options.parentId, options.targetPage);

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
  /** parentId 미지정 시 노드를 붙일 페이지(바인딩 페이지). currentPage 전환을 없애기 위함 */
  targetPage?: PageNode;
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
  placeNode(node, options.parentId, options.targetPage);
  return {
    nodeId: node.id, name: node.name, x: node.x, y: node.y,
    width: node.width, height: node.height, childCount: node.children.length,
  };
}
