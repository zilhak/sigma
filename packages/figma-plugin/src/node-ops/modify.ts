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
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
  ]),
  // COMPONENT: FRAME과 동일
  COMPONENT: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
    'setLayoutMode', 'setPadding', 'setItemSpacing', 'setClipsContent', 'setPrimaryAxisSizingMode', 'setCounterAxisSizingMode', 'setPrimaryAxisAlignItems', 'setCounterAxisAlignItems',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
  ]),
  // SECTION: 제한적 (Auto Layout 미지원, stroke/cornerRadius 미지원)
  SECTION: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setEffects',
  ]),
  // GROUP: 가장 제한적 (크기는 자식에 의해 결정, fills 미지원)
  GROUP: new Set([
    'rename', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    // resize 미지원 - Group의 크기는 자식에 의해 자동 결정됨
    // fills 미지원 - Group은 fills를 지원하지 않음
  ]),
  // TEXT: 텍스트 관련 메서드 + 기본 스타일
  TEXT: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setEffects', 'setBlendMode',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
  ]),
  // INSTANCE: 제한적 (컴포넌트 인스턴스)
  INSTANCE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setEffects', 'setBlendMode',
  ]),
  // RECTANGLE, ELLIPSE 등 Shape 노드
  RECTANGLE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
  ]),
  ELLIPSE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
  ]),
  VECTOR: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
  ]),
  LINE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
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
