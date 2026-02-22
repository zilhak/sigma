/**
 * Style CRUD — 스타일 생성, 적용, 삭제
 */

// === Paint Style ===

export interface CreatePaintStyleOptions {
  name: string;
  paints: Array<{
    type: 'SOLID';
    color: { r: number; g: number; b: number };
    opacity?: number;
  }>;
  description?: string;
}

export interface CreatePaintStyleResult {
  styleId: string;
  key: string;
  name: string;
}

export function createPaintStyle(options: CreatePaintStyleOptions): CreatePaintStyleResult {
  const style = figma.createPaintStyle();
  style.name = options.name;
  style.paints = options.paints.map(p => ({
    type: p.type,
    color: p.color,
    opacity: p.opacity !== undefined ? p.opacity : 1,
  }));
  if (options.description) style.description = options.description;
  return { styleId: style.id, key: style.key, name: style.name };
}

// === Text Style ===

export interface CreateTextStyleOptions {
  name: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: { value: number; unit: 'PIXELS' | 'PERCENT' } | 'AUTO';
  letterSpacing?: { value: number; unit: 'PIXELS' | 'PERCENT' };
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  description?: string;
}

export interface CreateTextStyleResult {
  styleId: string;
  key: string;
  name: string;
}

export async function createTextStyle(options: CreateTextStyleOptions): Promise<CreateTextStyleResult> {
  const style = figma.createTextStyle();
  style.name = options.name;

  const family = options.fontFamily !== undefined ? options.fontFamily : 'Inter';
  const weight = options.fontWeight !== undefined ? options.fontWeight : 'Regular';
  await figma.loadFontAsync({ family, style: weight });

  style.fontName = { family, style: weight };
  if (options.fontSize !== undefined) style.fontSize = options.fontSize;
  if (options.lineHeight !== undefined) {
    if (options.lineHeight === 'AUTO') {
      style.lineHeight = { unit: 'AUTO' };
    } else {
      style.lineHeight = options.lineHeight;
    }
  }
  if (options.letterSpacing !== undefined) style.letterSpacing = options.letterSpacing;
  if (options.textCase !== undefined) style.textCase = options.textCase;
  if (options.textDecoration !== undefined) style.textDecoration = options.textDecoration;
  if (options.description) style.description = options.description;

  return { styleId: style.id, key: style.key, name: style.name };
}

// === Effect Style ===

export interface CreateEffectStyleOptions {
  name: string;
  effects: Array<{
    type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
    color?: { r: number; g: number; b: number; a: number };
    offset?: { x: number; y: number };
    radius: number;
    spread?: number;
    visible?: boolean;
  }>;
  description?: string;
}

export interface CreateEffectStyleResult {
  styleId: string;
  key: string;
  name: string;
}

export function createEffectStyle(options: CreateEffectStyleOptions): CreateEffectStyleResult {
  const style = figma.createEffectStyle();
  style.name = options.name;
  style.effects = options.effects.map(e => {
    const base: any = {
      type: e.type,
      radius: e.radius,
      visible: e.visible !== undefined ? e.visible : true,
    };
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      base.color = e.color !== undefined ? e.color : { r: 0, g: 0, b: 0, a: 0.25 };
      base.offset = e.offset !== undefined ? e.offset : { x: 0, y: 4 };
      base.spread = e.spread !== undefined ? e.spread : 0;
    }
    return base;
  });
  if (options.description) style.description = options.description;
  return { styleId: style.id, key: style.key, name: style.name };
}

// === Grid Style ===

export interface CreateGridStyleOptions {
  name: string;
  grids: Array<{
    pattern: 'COLUMNS' | 'ROWS' | 'GRID';
    sectionSize?: number;
    count?: number;
    gutterSize?: number;
    offset?: number;
    alignment?: 'MIN' | 'MAX' | 'CENTER' | 'STRETCH';
    visible?: boolean;
  }>;
  description?: string;
}

export interface CreateGridStyleResult {
  styleId: string;
  key: string;
  name: string;
}

export function createGridStyle(options: CreateGridStyleOptions): CreateGridStyleResult {
  const style = figma.createGridStyle();
  style.name = options.name;
  style.layoutGrids = options.grids.map(g => {
    if (g.pattern === 'GRID') {
      return {
        pattern: 'GRID' as const,
        sectionSize: g.sectionSize !== undefined ? g.sectionSize : 10,
        visible: g.visible !== undefined ? g.visible : true,
        color: { r: 0.06, g: 0.459, b: 1, a: 0.1 },
      };
    }
    return {
      pattern: g.pattern as 'COLUMNS' | 'ROWS',
      alignment: (g.alignment !== undefined ? g.alignment : 'STRETCH') as 'MIN' | 'MAX' | 'CENTER' | 'STRETCH',
      count: g.count !== undefined ? g.count : 12,
      sectionSize: g.sectionSize !== undefined ? g.sectionSize : 60,
      gutterSize: g.gutterSize !== undefined ? g.gutterSize : 20,
      offset: g.offset !== undefined ? g.offset : 0,
      visible: g.visible !== undefined ? g.visible : true,
      color: { r: 0.06, g: 0.459, b: 1, a: 0.1 },
    };
  });
  if (options.description) style.description = options.description;
  return { styleId: style.id, key: style.key, name: style.name };
}

// === Apply Style ===

export interface ApplyStyleOptions {
  nodeId: string;
  styleType: 'fill' | 'stroke' | 'text' | 'effect' | 'grid';
  styleId: string;
}

export interface ApplyStyleResult {
  applied: boolean;
  nodeId: string;
  styleType: string;
}

export async function applyStyle(options: ApplyStyleOptions): Promise<ApplyStyleResult> {
  const node = figma.getNodeById(options.nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${options.nodeId}`);

  switch (options.styleType) {
    case 'fill':
      if (!('setFillStyleIdAsync' in node)) throw new Error(`${node.type} 노드에는 fill 스타일을 적용할 수 없습니다`);
      await (node as GeometryMixin).setFillStyleIdAsync(options.styleId);
      break;
    case 'stroke':
      if (!('setStrokeStyleIdAsync' in node)) throw new Error(`${node.type} 노드에는 stroke 스타일을 적용할 수 없습니다`);
      await (node as GeometryMixin).setStrokeStyleIdAsync(options.styleId);
      break;
    case 'text':
      if (node.type !== 'TEXT') throw new Error(`text 스타일은 TEXT 노드에만 적용할 수 있습니다`);
      await (node as TextNode).setTextStyleIdAsync(options.styleId);
      break;
    case 'effect':
      if (!('setEffectStyleIdAsync' in node)) throw new Error(`${node.type} 노드에는 effect 스타일을 적용할 수 없습니다`);
      await (node as BlendMixin).setEffectStyleIdAsync(options.styleId);
      break;
    case 'grid':
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
        throw new Error(`grid 스타일은 FRAME/COMPONENT 노드에만 적용할 수 있습니다`);
      }
      await (node as BaseFrameMixin).setGridStyleIdAsync(options.styleId);
      break;
    default:
      throw new Error(`지원하지 않는 스타일 타입: ${options.styleType}`);
  }

  return { applied: true, nodeId: options.nodeId, styleType: options.styleType };
}

// === Delete Style ===

export interface DeleteStyleResult {
  deleted: boolean;
  name: string;
  styleId: string;
}

export function deleteStyle(styleId: string): DeleteStyleResult {
  const style = figma.getStyleById(styleId);
  if (!style) throw new Error(`스타일을 찾을 수 없습니다: ${styleId}`);
  const name = style.name;
  style.remove();
  return { deleted: true, name, styleId };
}
