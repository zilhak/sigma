/**
 * 빈 노드 생성 (Rectangle, Text, Frame)
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
