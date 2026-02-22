/**
 * 노드 타입별 지원 메서드 매트릭스
 * 각 메서드가 어떤 노드 타입에서 지원되는지 정의
 */
const METHOD_SUPPORT_MATRIX: Record<string, Set<string>> = {
  // FRAME: 모든 메서드 지원
  FRAME: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
    'setLayoutMode', 'setPadding', 'setItemSpacing', 'setClipsContent', 'setPrimaryAxisSizingMode', 'setCounterAxisSizingMode', 'setPrimaryAxisAlignItems', 'setCounterAxisAlignItems',
    'setLayoutWrap', 'setCounterAxisSpacing', 'setLayoutSizing',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setMinWidth', 'setMaxWidth', 'setMinHeight', 'setMaxHeight',
    'setCornerSmoothing', 'setDashPattern', 'setMask',
  ]),
  // COMPONENT: FRAME과 동일
  COMPONENT: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
    'setLayoutMode', 'setPadding', 'setItemSpacing', 'setClipsContent', 'setPrimaryAxisSizingMode', 'setCounterAxisSizingMode', 'setPrimaryAxisAlignItems', 'setCounterAxisAlignItems',
    'setLayoutWrap', 'setCounterAxisSpacing', 'setLayoutSizing',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setMinWidth', 'setMaxWidth', 'setMinHeight', 'setMaxHeight',
    'setCornerSmoothing', 'setDashPattern', 'setMask',
  ]),
  // SECTION: 제한적 (Auto Layout 미지원, stroke/cornerRadius 미지원)
  SECTION: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setEffects',
  ]),
  // GROUP: 가장 제한적 (크기는 자식에 의해 결정, fills 미지원)
  GROUP: new Set([
    'rename', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning', 'setMask',
  ]),
  // TEXT: 텍스트 관련 메서드 + 기본 스타일
  TEXT: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setEffects', 'setBlendMode',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal', 'setTextAlignVertical', 'setFontFamily', 'setFontWeight',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setMask',
    'setTextAutoResize', 'setLineHeight', 'setLetterSpacing',
    'setRangeFontSize', 'setRangeFontName', 'setRangeFills', 'setRangeTextDecoration', 'setRangeLineHeight', 'setRangeLetterSpacing',
  ]),
  // INSTANCE: 제한적 (컴포넌트 인스턴스)
  INSTANCE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setEffects', 'setBlendMode',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setMinWidth', 'setMaxWidth', 'setMinHeight', 'setMaxHeight', 'setMask',
  ]),
  // RECTANGLE, ELLIPSE 등 Shape 노드
  RECTANGLE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setCornerSmoothing', 'setDashPattern', 'setMask',
  ]),
  ELLIPSE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setDashPattern', 'setMask',
  ]),
  VECTOR: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setDashPattern', 'setMask',
  ]),
  LINE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
    'setRotation', 'setLayoutAlign', 'setLayoutGrow', 'setLayoutPositioning',
    'setConstraints', 'setDashPattern', 'setMask',
  ]),
  // DEFAULT: 알 수 없는 타입에 대한 기본값 (가장 기본적인 메서드만)
  DEFAULT: new Set([
    'rename', 'setOpacity', 'setVisible', 'setLocked', 'remove',
  ]),
};

/**
 * 특정 노드 타입이 특정 메서드를 지원하는지 확인
 */
export function isMethodSupportedForType(nodeType: string, method: string): boolean {
  const supported = METHOD_SUPPORT_MATRIX[nodeType] || METHOD_SUPPORT_MATRIX['DEFAULT'];
  return supported.has(method);
}

/**
 * 특정 노드 타입이 지원하는 메서드 목록 반환
 */
export function getSupportedMethodsForType(nodeType: string): string[] {
  const supported = METHOD_SUPPORT_MATRIX[nodeType] || METHOD_SUPPORT_MATRIX['DEFAULT'];
  return Array.from(supported);
}

/**
 * 텍스트 노드의 모든 폰트를 로드하는 헬퍼
 * Mixed font 텍스트에서 range 작업 전에 필요
 */
async function loadAllFonts(textNode: TextNode): Promise<void> {
  const fontName = textNode.fontName;
  if (fontName !== figma.mixed) {
    await figma.loadFontAsync(fontName as FontName);
    return;
  }
  const len = textNode.characters.length;
  const loaded = new Set<string>();
  for (let i = 0; i < len; i++) {
    const font = textNode.getRangeFontName(i, i + 1) as FontName;
    const key = `${font.family}|${font.style}`;
    if (!loaded.has(key)) {
      loaded.add(key);
      await figma.loadFontAsync(font);
    }
  }
}

/**
 * 허용된 노드 조작 메서드 맵
 */
interface AllowedMethod {
  description: string;
  handler: (node: SceneNode, args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export const ALLOWED_METHODS: Record<string, AllowedMethod> = {
  // === Basic ===
  rename: {
    description: '노드 이름 변경. args: { name: string }',
    handler: (node, args) => {
      const name = args.name as string;
      if (!name) throw new Error('name이 필요합니다');
      node.name = name;
      return { name: node.name };
    },
  },
  resize: {
    description: '노드 크기 변경. args: { width: number, height: number }',
    handler: (node, args) => {
      const w = args.width as number;
      const h = args.height as number;
      if (w === undefined || h === undefined) throw new Error('width, height가 필요합니다');
      const safeW = Math.max(w, 0.01);
      const safeH = Math.max(h, 0.01);
      // SectionNode는 resize() 메서드가 없고 width/height 직접 설정
      if (node.type === 'SECTION') {
        const section = node as SectionNode;
        section.resizeWithoutConstraints(safeW, safeH);
      } else if ('resize' in node) {
        (node as FrameNode).resize(safeW, safeH);
      } else {
        throw new Error('이 노드는 resize를 지원하지 않습니다');
      }
      return { width: (node as any).width, height: (node as any).height };
    },
  },
  move: {
    description: '노드 위치 변경. args: { x: number, y: number }',
    handler: (node, args) => {
      const x = args.x as number;
      const y = args.y as number;
      if (x !== undefined) node.x = x;
      if (y !== undefined) node.y = y;
      return { x: node.x, y: node.y };
    },
  },
  setOpacity: {
    description: '불투명도 설정 (0~1). args: { opacity: number }',
    handler: (node, args) => {
      const opacity = args.opacity as number;
      if (opacity === undefined) throw new Error('opacity가 필요합니다');
      node.opacity = Math.max(0, Math.min(1, opacity));
      return { opacity: node.opacity };
    },
  },
  setVisible: {
    description: '가시성 설정. args: { visible: boolean }',
    handler: (node, args) => {
      const visible = args.visible;
      if (visible === undefined) throw new Error('visible이 필요합니다');
      node.visible = !!visible;
      return { visible: node.visible };
    },
  },
  setLocked: {
    description: '잠금 설정. args: { locked: boolean }',
    handler: (node, args) => {
      const locked = args.locked;
      if (locked === undefined) throw new Error('locked가 필요합니다');
      node.locked = !!locked;
      return { locked: node.locked };
    },
  },
  remove: {
    description: '노드 삭제. args: 없음',
    handler: (node) => {
      const name = node.name;
      const id = node.id;
      node.remove();
      return { removed: true, name, id };
    },
  },

  // === Visual ===
  setFills: {
    description: '채우기 설정. args: { fills: Paint[] } (Figma Paint 배열)',
    handler: (node, args) => {
      if (!('fills' in node)) throw new Error('이 노드는 fills를 지원하지 않습니다');
      const fills = args.fills;
      if (!Array.isArray(fills)) throw new Error('fills 배열이 필요합니다');
      (node as GeometryMixin & SceneNode).fills = fills as Paint[];
      return { fills: (node as GeometryMixin & SceneNode).fills };
    },
  },
  setSolidFill: {
    description: '단색 채우기 설정 (편의 메서드). args: { r: 0~1, g: 0~1, b: 0~1, opacity?: 0~1 }',
    handler: (node, args) => {
      if (!('fills' in node)) throw new Error('이 노드는 fills를 지원하지 않습니다');
      const r = args.r as number;
      const g = args.g as number;
      const b = args.b as number;
      if (r === undefined || g === undefined || b === undefined) throw new Error('r, g, b가 필요합니다');
      const opacity = args.opacity !== undefined ? args.opacity as number : 1;
      (node as GeometryMixin & SceneNode).fills = [{
        type: 'SOLID',
        color: { r, g, b },
        opacity,
      }];
      return { fills: (node as GeometryMixin & SceneNode).fills };
    },
  },
  setStrokes: {
    description: '테두리(stroke) 설정. args: { strokes: Paint[] }',
    handler: (node, args) => {
      if (!('strokes' in node)) throw new Error('이 노드는 strokes를 지원하지 않습니다');
      const strokes = args.strokes;
      if (!Array.isArray(strokes)) throw new Error('strokes 배열이 필요합니다');
      (node as GeometryMixin & SceneNode).strokes = strokes as Paint[];
      return { strokes: (node as GeometryMixin & SceneNode).strokes };
    },
  },
  setStrokeWeight: {
    description: '테두리 두께 설정. args: { weight: number }',
    handler: (node, args) => {
      if (!('strokeWeight' in node)) throw new Error('이 노드는 strokeWeight를 지원하지 않습니다');
      const weight = args.weight as number;
      if (weight === undefined) throw new Error('weight가 필요합니다');
      (node as GeometryMixin & SceneNode).strokeWeight = weight;
      return { strokeWeight: (node as GeometryMixin & SceneNode).strokeWeight };
    },
  },
  setCornerRadius: {
    description: '모서리 라운드 설정 (균일). args: { radius: number }',
    handler: (node, args) => {
      if (!('cornerRadius' in node)) throw new Error('이 노드는 cornerRadius를 지원하지 않습니다');
      const radius = args.radius as number;
      if (radius === undefined) throw new Error('radius가 필요합니다');
      (node as FrameNode).cornerRadius = radius;
      return { cornerRadius: (node as FrameNode).cornerRadius };
    },
  },
  setCornerRadii: {
    description: '모서리 라운드 개별 설정. args: { topLeft?: number, topRight?: number, bottomRight?: number, bottomLeft?: number }',
    handler: (node, args) => {
      if (!('topLeftRadius' in node)) throw new Error('이 노드는 개별 cornerRadius를 지원하지 않습니다');
      const f = node as FrameNode;
      if (args.topLeft !== undefined) f.topLeftRadius = args.topLeft as number;
      if (args.topRight !== undefined) f.topRightRadius = args.topRight as number;
      if (args.bottomRight !== undefined) f.bottomRightRadius = args.bottomRight as number;
      if (args.bottomLeft !== undefined) f.bottomLeftRadius = args.bottomLeft as number;
      return {
        topLeftRadius: f.topLeftRadius,
        topRightRadius: f.topRightRadius,
        bottomRightRadius: f.bottomRightRadius,
        bottomLeftRadius: f.bottomLeftRadius,
      };
    },
  },
  setEffects: {
    description: '이펙트(그림자 등) 설정. args: { effects: Effect[] }',
    handler: (node, args) => {
      if (!('effects' in node)) throw new Error('이 노드는 effects를 지원하지 않습니다');
      const effects = args.effects;
      if (!Array.isArray(effects)) throw new Error('effects 배열이 필요합니다');
      (node as FrameNode).effects = effects as Effect[];
      return { effects: (node as FrameNode).effects };
    },
  },
  setBlendMode: {
    description: '블렌드 모드 설정. args: { blendMode: string } (NORMAL, MULTIPLY, SCREEN 등)',
    handler: (node, args) => {
      if (!('blendMode' in node)) throw new Error('이 노드는 blendMode를 지원하지 않습니다');
      const blendMode = args.blendMode as string;
      if (!blendMode) throw new Error('blendMode가 필요합니다');
      (node as FrameNode).blendMode = blendMode as BlendMode;
      return { blendMode: (node as FrameNode).blendMode };
    },
  },

  // === Layout (Auto Layout) ===
  setLayoutMode: {
    description: 'Auto Layout 모드 설정. args: { layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const mode = args.layoutMode as string;
      if (!mode) throw new Error('layoutMode가 필요합니다');
      (node as FrameNode).layoutMode = mode as 'NONE' | 'HORIZONTAL' | 'VERTICAL';
      return { layoutMode: (node as FrameNode).layoutMode };
    },
  },
  setPadding: {
    description: '패딩 설정. args: { top?: number, right?: number, bottom?: number, left?: number }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const f = node as FrameNode;
      if (args.top !== undefined) f.paddingTop = args.top as number;
      if (args.right !== undefined) f.paddingRight = args.right as number;
      if (args.bottom !== undefined) f.paddingBottom = args.bottom as number;
      if (args.left !== undefined) f.paddingLeft = args.left as number;
      return {
        paddingTop: f.paddingTop,
        paddingRight: f.paddingRight,
        paddingBottom: f.paddingBottom,
        paddingLeft: f.paddingLeft,
      };
    },
  },
  setItemSpacing: {
    description: 'Auto Layout 아이템 간격 설정. args: { spacing: number }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const spacing = args.spacing as number;
      if (spacing === undefined) throw new Error('spacing이 필요합니다');
      (node as FrameNode).itemSpacing = spacing;
      return { itemSpacing: (node as FrameNode).itemSpacing };
    },
  },
  setClipsContent: {
    description: '콘텐츠 클리핑(Clip content) 설정. args: { clips: boolean }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const clips = args.clips;
      if (clips === undefined) throw new Error('clips가 필요합니다');
      (node as FrameNode).clipsContent = !!clips;
      return { clipsContent: (node as FrameNode).clipsContent };
    },
  },
  setPrimaryAxisSizingMode: {
    description: '주축 크기 모드 설정. args: { mode: "FIXED" | "AUTO" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const mode = args.mode as string;
      if (!mode) throw new Error('mode가 필요합니다');
      (node as FrameNode).primaryAxisSizingMode = mode as 'FIXED' | 'AUTO';
      return { primaryAxisSizingMode: (node as FrameNode).primaryAxisSizingMode };
    },
  },
  setCounterAxisSizingMode: {
    description: '교차축 크기 모드 설정. args: { mode: "FIXED" | "AUTO" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const mode = args.mode as string;
      if (!mode) throw new Error('mode가 필요합니다');
      (node as FrameNode).counterAxisSizingMode = mode as 'FIXED' | 'AUTO';
      return { counterAxisSizingMode: (node as FrameNode).counterAxisSizingMode };
    },
  },
  setPrimaryAxisAlignItems: {
    description: '주축 정렬 설정. args: { align: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      (node as FrameNode).primaryAxisAlignItems = align as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
      return { primaryAxisAlignItems: (node as FrameNode).primaryAxisAlignItems };
    },
  },
  setCounterAxisAlignItems: {
    description: '교차축 정렬 설정. args: { align: "MIN" | "CENTER" | "MAX" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      (node as FrameNode).counterAxisAlignItems = align as 'MIN' | 'CENTER' | 'MAX';
      return { counterAxisAlignItems: (node as FrameNode).counterAxisAlignItems };
    },
  },

  setLayoutWrap: {
    description: 'Auto Layout 줄바꿈 모드 설정. args: { wrap: "NO_WRAP" | "WRAP" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const wrap = args.wrap as string;
      if (!wrap) throw new Error('wrap이 필요합니다');
      (node as FrameNode).layoutWrap = wrap as 'NO_WRAP' | 'WRAP';
      return { layoutWrap: (node as FrameNode).layoutWrap };
    },
  },
  setCounterAxisSpacing: {
    description: '줄바꿈 시 행/열 간격 설정. args: { spacing: number }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const spacing = args.spacing as number;
      if (spacing === undefined) throw new Error('spacing이 필요합니다');
      (node as FrameNode).counterAxisSpacing = spacing;
      return { counterAxisSpacing: (node as FrameNode).counterAxisSpacing };
    },
  },
  setLayoutSizing: {
    description: '레이아웃 크기 모드 설정. args: { horizontal?: "FIXED" | "HUG" | "FILL", vertical?: "FIXED" | "HUG" | "FILL" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const f = node as FrameNode;
      if (args.horizontal) f.layoutSizingHorizontal = args.horizontal as 'FIXED' | 'HUG' | 'FILL';
      if (args.vertical) f.layoutSizingVertical = args.vertical as 'FIXED' | 'HUG' | 'FILL';
      return {
        layoutSizingHorizontal: f.layoutSizingHorizontal,
        layoutSizingVertical: f.layoutSizingVertical,
      };
    },
  },

  // === Text ===
  setCharacters: {
    description: '텍스트 내용 변경. args: { characters: string }. 노드가 TextNode여야 합니다.',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const characters = args.characters as string;
      if (characters === undefined) throw new Error('characters가 필요합니다');
      await figma.loadFontAsync((node as TextNode).fontName as FontName);
      (node as TextNode).characters = characters;
      return { characters: (node as TextNode).characters };
    },
  },
  setFontSize: {
    description: '폰트 크기 변경. args: { size: number }. 노드가 TextNode여야 합니다.',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const size = args.size as number;
      if (size === undefined) throw new Error('size가 필요합니다');
      await figma.loadFontAsync((node as TextNode).fontName as FontName);
      (node as TextNode).fontSize = size;
      return { fontSize: (node as TextNode).fontSize };
    },
  },
  setTextAlignHorizontal: {
    description: '텍스트 수평 정렬. args: { align: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      await figma.loadFontAsync((node as TextNode).fontName as FontName);
      (node as TextNode).textAlignHorizontal = align as 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
      return { textAlignHorizontal: (node as TextNode).textAlignHorizontal };
    },
  },
  setTextAlignVertical: {
    description: '텍스트 수직 정렬. args: { align: "TOP" | "CENTER" | "BOTTOM" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      await figma.loadFontAsync((node as TextNode).fontName as FontName);
      (node as TextNode).textAlignVertical = align as 'TOP' | 'CENTER' | 'BOTTOM';
      return { textAlignVertical: (node as TextNode).textAlignVertical };
    },
  },
  setFontFamily: {
    description: '폰트 패밀리 변경. args: { family: string, style?: string }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const family = args.family as string;
      if (!family) throw new Error('family가 필요합니다');
      const style = (args.style as string) !== undefined ? (args.style as string) : 'Regular';
      await figma.loadFontAsync({ family, style });
      (node as TextNode).fontName = { family, style };
      return { fontName: (node as TextNode).fontName };
    },
  },
  setFontWeight: {
    description: '폰트 굵기 변경. args: { weight: number } (100~900). 현재 폰트 패밀리에서 해당 weight의 style을 적용합니다.',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const weight = args.weight as number;
      if (weight === undefined) throw new Error('weight가 필요합니다');
      const textNode = node as TextNode;
      const currentFont = textNode.fontName as FontName;
      const weightMap: Record<number, string> = {
        100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular',
        500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
      };
      const style = weightMap[weight] !== undefined ? weightMap[weight] : 'Regular';
      await figma.loadFontAsync({ family: currentFont.family, style });
      textNode.fontName = { family: currentFont.family, style };
      return { fontName: textNode.fontName };
    },
  },

  // === Transform ===
  setRotation: {
    description: '회전 각도 설정 (degree). args: { rotation: number }',
    handler: (node, args) => {
      const rotation = args.rotation as number;
      if (rotation === undefined) throw new Error('rotation이 필요합니다');
      node.rotation = rotation;
      return { rotation: node.rotation };
    },
  },

  // === Layout Child Properties ===
  setLayoutAlign: {
    description: 'Auto Layout 자식의 교차축 정렬. args: { align: "INHERIT" | "STRETCH" }',
    handler: (node, args) => {
      if (!('layoutAlign' in node)) throw new Error('이 노드는 layoutAlign을 지원하지 않습니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      (node as any).layoutAlign = align;
      return { layoutAlign: (node as any).layoutAlign };
    },
  },
  setLayoutGrow: {
    description: 'Auto Layout 자식의 주축 확장. args: { grow: number } (0=고정, 1=채우기)',
    handler: (node, args) => {
      if (!('layoutGrow' in node)) throw new Error('이 노드는 layoutGrow를 지원하지 않습니다');
      const grow = args.grow as number;
      if (grow === undefined) throw new Error('grow가 필요합니다');
      (node as any).layoutGrow = grow;
      return { layoutGrow: (node as any).layoutGrow };
    },
  },
  setLayoutPositioning: {
    description: 'Auto Layout 자식의 위치 모드. args: { positioning: "AUTO" | "ABSOLUTE" }',
    handler: (node, args) => {
      if (!('layoutPositioning' in node)) throw new Error('이 노드는 layoutPositioning을 지원하지 않습니다');
      const positioning = args.positioning as string;
      if (!positioning) throw new Error('positioning이 필요합니다');
      (node as any).layoutPositioning = positioning;
      return { layoutPositioning: (node as any).layoutPositioning };
    },
  },

  // === Constraints ===
  setConstraints: {
    description: '제약조건 설정. args: { horizontal?: "MIN"|"CENTER"|"MAX"|"STRETCH"|"SCALE", vertical?: "MIN"|"CENTER"|"MAX"|"STRETCH"|"SCALE" }',
    handler: (node, args) => {
      if (!('constraints' in node)) throw new Error('이 노드는 constraints를 지원하지 않습니다');
      const h = args.horizontal as string;
      const v = args.vertical as string;
      if (!h && !v) throw new Error('horizontal 또는 vertical이 필요합니다');
      const cn = node as ConstraintMixin & SceneNode;
      const current = cn.constraints;
      cn.constraints = {
        horizontal: (h ? h : current.horizontal) as ConstraintType,
        vertical: (v ? v : current.vertical) as ConstraintType,
      };
      return { constraints: cn.constraints };
    },
  },

  // === Min/Max Size ===
  setMinWidth: {
    description: '최소 너비 설정. args: { value: number | null } (null=제한 없음)',
    handler: (node, args) => {
      if (!('minWidth' in node)) throw new Error('이 노드는 minWidth를 지원하지 않습니다');
      (node as any).minWidth = args.value !== undefined ? args.value : null;
      return { minWidth: (node as any).minWidth };
    },
  },
  setMaxWidth: {
    description: '최대 너비 설정. args: { value: number | null }',
    handler: (node, args) => {
      if (!('maxWidth' in node)) throw new Error('이 노드는 maxWidth를 지원하지 않습니다');
      (node as any).maxWidth = args.value !== undefined ? args.value : null;
      return { maxWidth: (node as any).maxWidth };
    },
  },
  setMinHeight: {
    description: '최소 높이 설정. args: { value: number | null }',
    handler: (node, args) => {
      if (!('minHeight' in node)) throw new Error('이 노드는 minHeight를 지원하지 않습니다');
      (node as any).minHeight = args.value !== undefined ? args.value : null;
      return { minHeight: (node as any).minHeight };
    },
  },
  setMaxHeight: {
    description: '최대 높이 설정. args: { value: number | null }',
    handler: (node, args) => {
      if (!('maxHeight' in node)) throw new Error('이 노드는 maxHeight를 지원하지 않습니다');
      (node as any).maxHeight = args.value !== undefined ? args.value : null;
      return { maxHeight: (node as any).maxHeight };
    },
  },

  // === Visual Extended ===
  setCornerSmoothing: {
    description: '코너 스무딩 (iOS 스타일 둥근 모서리). args: { smoothing: number } (0~1)',
    handler: (node, args) => {
      if (!('cornerSmoothing' in node)) throw new Error('이 노드는 cornerSmoothing을 지원하지 않습니다');
      const smoothing = args.smoothing as number;
      if (smoothing === undefined) throw new Error('smoothing이 필요합니다');
      (node as any).cornerSmoothing = Math.max(0, Math.min(1, smoothing));
      return { cornerSmoothing: (node as any).cornerSmoothing };
    },
  },
  setDashPattern: {
    description: '점선 패턴 설정. args: { pattern: number[] } (예: [5, 3] = 5px 선, 3px 간격)',
    handler: (node, args) => {
      if (!('dashPattern' in node)) throw new Error('이 노드는 dashPattern을 지원하지 않습니다');
      const pattern = args.pattern;
      if (!Array.isArray(pattern)) throw new Error('pattern 배열이 필요합니다');
      (node as any).dashPattern = pattern;
      return { dashPattern: (node as any).dashPattern };
    },
  },
  setMask: {
    description: '마스크 설정/해제. args: { isMask: boolean }',
    handler: (node, args) => {
      if (!('isMask' in node)) throw new Error('이 노드는 mask를 지원하지 않습니다');
      const isMask = args.isMask;
      if (isMask === undefined) throw new Error('isMask가 필요합니다');
      (node as any).isMask = !!isMask;
      return { isMask: (node as any).isMask };
    },
  },

  // === Text Extended ===
  setTextAutoResize: {
    description: '텍스트 자동 크기 조정. args: { mode: "NONE"|"WIDTH_AND_HEIGHT"|"HEIGHT"|"TRUNCATE" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const mode = args.mode as string;
      if (!mode) throw new Error('mode가 필요합니다');
      await loadAllFonts(node as TextNode);
      (node as TextNode).textAutoResize = mode as 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
      return { textAutoResize: (node as TextNode).textAutoResize };
    },
  },
  setLineHeight: {
    description: '행간 설정. args: { value: number, unit?: "PIXELS"|"PERCENT"|"AUTO" }. AUTO이면 value 무시.',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      await loadAllFonts(node as TextNode);
      const unit = (args.unit as string) || 'PIXELS';
      if (unit === 'AUTO') {
        (node as TextNode).lineHeight = { unit: 'AUTO' };
      } else {
        const value = args.value as number;
        if (value === undefined) throw new Error('value가 필요합니다');
        (node as TextNode).lineHeight = { value, unit: unit as 'PIXELS' | 'PERCENT' };
      }
      return { lineHeight: (node as TextNode).lineHeight };
    },
  },
  setLetterSpacing: {
    description: '자간 설정. args: { value: number, unit?: "PIXELS"|"PERCENT" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const value = args.value as number;
      if (value === undefined) throw new Error('value가 필요합니다');
      await loadAllFonts(node as TextNode);
      const unit = (args.unit as string) || 'PIXELS';
      (node as TextNode).letterSpacing = { value, unit: unit as 'PIXELS' | 'PERCENT' };
      return { letterSpacing: (node as TextNode).letterSpacing };
    },
  },

  // === Rich Text (Range) ===
  setRangeFontSize: {
    description: '텍스트 일부의 폰트 크기 변경. args: { start: number, end: number, size: number }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const start = args.start as number;
      const end = args.end as number;
      const size = args.size as number;
      if (start === undefined || end === undefined || size === undefined) throw new Error('start, end, size가 필요합니다');
      await loadAllFonts(node as TextNode);
      (node as TextNode).setRangeFontSize(start, end, size);
      return { start, end, fontSize: size };
    },
  },
  setRangeFontName: {
    description: '텍스트 일부의 폰트 변경. args: { start: number, end: number, family: string, style?: string }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const start = args.start as number;
      const end = args.end as number;
      const family = args.family as string;
      if (start === undefined || end === undefined || !family) throw new Error('start, end, family가 필요합니다');
      const style = (args.style as string) !== undefined ? (args.style as string) : 'Regular';
      await loadAllFonts(node as TextNode);
      await figma.loadFontAsync({ family, style });
      (node as TextNode).setRangeFontName(start, end, { family, style });
      return { start, end, fontName: { family, style } };
    },
  },
  setRangeFills: {
    description: '텍스트 일부의 색상 변경. args: { start: number, end: number, r: 0~1, g: 0~1, b: 0~1, opacity?: 0~1 }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const start = args.start as number;
      const end = args.end as number;
      const r = args.r as number;
      const g = args.g as number;
      const b = args.b as number;
      if (start === undefined || end === undefined || r === undefined || g === undefined || b === undefined) {
        throw new Error('start, end, r, g, b가 필요합니다');
      }
      const opacity = args.opacity !== undefined ? args.opacity as number : 1;
      await loadAllFonts(node as TextNode);
      (node as TextNode).setRangeFills(start, end, [{ type: 'SOLID', color: { r, g, b }, opacity }]);
      return { start, end, fills: { r, g, b, opacity } };
    },
  },
  setRangeTextDecoration: {
    description: '텍스트 일부의 장식. args: { start: number, end: number, decoration: "NONE"|"UNDERLINE"|"STRIKETHROUGH" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const start = args.start as number;
      const end = args.end as number;
      const decoration = args.decoration as string;
      if (start === undefined || end === undefined || !decoration) throw new Error('start, end, decoration이 필요합니다');
      await loadAllFonts(node as TextNode);
      (node as TextNode).setRangeTextDecoration(start, end, decoration as TextDecoration);
      return { start, end, textDecoration: decoration };
    },
  },
  setRangeLineHeight: {
    description: '텍스트 일부의 행간 변경. args: { start: number, end: number, value: number, unit?: "PIXELS"|"PERCENT"|"AUTO" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const start = args.start as number;
      const end = args.end as number;
      if (start === undefined || end === undefined) throw new Error('start, end가 필요합니다');
      await loadAllFonts(node as TextNode);
      const unit = (args.unit as string) || 'PIXELS';
      if (unit === 'AUTO') {
        (node as TextNode).setRangeLineHeight(start, end, { unit: 'AUTO' });
      } else {
        const value = args.value as number;
        if (value === undefined) throw new Error('value가 필요합니다');
        (node as TextNode).setRangeLineHeight(start, end, { value, unit: unit as 'PIXELS' | 'PERCENT' });
      }
      return { start, end, lineHeight: unit === 'AUTO' ? { unit: 'AUTO' } : { value: args.value, unit } };
    },
  },
  setRangeLetterSpacing: {
    description: '텍스트 일부의 자간 변경. args: { start: number, end: number, value: number, unit?: "PIXELS"|"PERCENT" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const start = args.start as number;
      const end = args.end as number;
      const value = args.value as number;
      if (start === undefined || end === undefined || value === undefined) throw new Error('start, end, value가 필요합니다');
      await loadAllFonts(node as TextNode);
      const unit = (args.unit as string) || 'PIXELS';
      (node as TextNode).setRangeLetterSpacing(start, end, { value, unit: unit as 'PIXELS' | 'PERCENT' });
      return { start, end, letterSpacing: { value, unit } };
    },
  },
};

/**
 * 노드 조작 메서드 실행
 */
export async function executeModifyNode(
  nodeId: string,
  method: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
    throw new Error(`Document 또는 Page 노드는 수정할 수 없습니다`);
  }

  // 1. 먼저 메서드가 ALLOWED_METHODS에 존재하는지 확인
  const allowed = ALLOWED_METHODS[method];
  if (!allowed) {
    const availableMethods: Record<string, string> = {};
    for (const [key, val] of Object.entries(ALLOWED_METHODS)) {
      availableMethods[key] = val.description;
    }
    throw new Error(JSON.stringify({
      error: `허용되지 않은 메서드입니다: ${method}`,
      availableMethods,
    }));
  }

  // 2. 해당 노드 타입이 이 메서드를 지원하는지 확인
  if (!isMethodSupportedForType(node.type, method)) {
    const supportedForThisType = getSupportedMethodsForType(node.type);
    const supportedWithDescriptions: Record<string, string> = {};
    for (const m of supportedForThisType) {
      if (ALLOWED_METHODS[m]) {
        supportedWithDescriptions[m] = ALLOWED_METHODS[m].description;
      }
    }
    throw new Error(JSON.stringify({
      error: `'${method}' 메서드는 '${node.type}' 타입에서 지원되지 않습니다`,
      nodeType: node.type,
      supportedMethods: supportedWithDescriptions,
    }));
  }

  const result = await allowed.handler(node as SceneNode, args || {});
  return result;
}
