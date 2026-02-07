import type { ExtractedNode, ComputedStyles, RGBA } from '@sigma/shared';
import { createDefaultStyles } from '../utils';

/**
 * Figma 노드를 ExtractedNode JSON으로 추출
 */
export function extractNodeToJSON(node: SceneNode): ExtractedNode | null {
  if (!('visible' in node) || !node.visible) {
    return null;
  }

  // 기본 구조
  const extracted: ExtractedNode = {
    id: node.id,
    tagName: getTagNameFromNode(node),
    className: node.name,
    textContent: '',
    attributes: {},
    styles: createDefaultStyles(),
    boundingRect: {
      x: 'x' in node ? node.x : 0,
      y: 'y' in node ? node.y : 0,
      width: 'width' in node ? node.width : 0,
      height: 'height' in node ? node.height : 0,
    },
    children: [],
  };

  // 텍스트 노드
  if (node.type === 'TEXT') {
    extracted.tagName = 'span';
    extracted.textContent = node.characters;
    extractTextStyles(node, extracted.styles);
    return extracted;
  }

  // 프레임/그룹/컴포넌트
  if (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    extracted.tagName = 'div';

    // 레이아웃 스타일 추출
    if ('layoutMode' in node) {
      extractLayoutStyles(node as FrameNode, extracted.styles);
    }

    // 배경/테두리/효과 추출
    if ('fills' in node) {
      extractFillStyles(node as FrameNode, extracted.styles);
    }
    if ('strokes' in node) {
      extractStrokeStyles(node as FrameNode, extracted.styles);
    }
    if ('cornerRadius' in node) {
      extractCornerStyles(node as FrameNode, extracted.styles);
    }
    if ('effects' in node) {
      extractEffectStyles(node as FrameNode, extracted.styles);
    }
    if ('opacity' in node) {
      extracted.styles.opacity = node.opacity;
    }

    // 크기 설정
    extracted.styles.width = node.width;
    extracted.styles.height = node.height;

    // 자식 노드 추출
    if ('children' in node) {
      for (const child of node.children) {
        const childExtracted = extractNodeToJSON(child);
        if (childExtracted) {
          extracted.children = extracted.children || [];
          extracted.children.push(childExtracted);
        }
      }
    }

    return extracted;
  }

  // 벡터/도형
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'LINE') {
    extracted.tagName = 'div';

    if ('fills' in node) {
      extractFillStyles(node as GeometryMixin & MinimalFillsMixin, extracted.styles);
    }
    if ('strokes' in node) {
      extractStrokeStyles(node as GeometryMixin & MinimalStrokesMixin, extracted.styles);
    }
    if ('cornerRadius' in node && node.type === 'RECTANGLE') {
      extractCornerStyles(node as RectangleNode, extracted.styles);
    }
    if ('opacity' in node) {
      extracted.styles.opacity = node.opacity;
    }

    extracted.styles.width = node.width;
    extracted.styles.height = node.height;

    return extracted;
  }

  // 벡터 노드 (SVG로 내보낼 수 있는 경우)
  if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') {
    extracted.tagName = 'svg';
    // SVG 문자열은 exportAsync로 추출해야 하지만, 동기 버전에서는 생략
    extracted.styles.width = node.width;
    extracted.styles.height = node.height;
    return extracted;
  }

  return extracted;
}

/**
 * 노드 타입에서 HTML 태그명 추론
 */
export function getTagNameFromNode(node: SceneNode): string {
  switch (node.type) {
    case 'TEXT':
      return 'span';
    case 'FRAME':
    case 'GROUP':
    case 'COMPONENT':
    case 'INSTANCE':
    case 'RECTANGLE':
      return 'div';
    case 'VECTOR':
    case 'BOOLEAN_OPERATION':
      return 'svg';
    default:
      return 'div';
  }
}

/**
 * 텍스트 스타일 추출
 */
export function extractTextStyles(node: TextNode, styles: ComputedStyles) {
  // 폰트 크기
  if (typeof node.fontSize === 'number') {
    styles.fontSize = node.fontSize;
  }

  // 폰트 두께
  if (typeof node.fontName === 'object' && 'family' in node.fontName) {
    const fontStyle = node.fontName.style.toLowerCase();
    if (fontStyle.includes('bold')) {
      styles.fontWeight = '700';
    } else if (fontStyle.includes('semi')) {
      styles.fontWeight = '600';
    } else if (fontStyle.includes('medium')) {
      styles.fontWeight = '500';
    } else {
      styles.fontWeight = '400';
    }
    styles.fontFamily = node.fontName.family;
  }

  // 텍스트 색상
  const fills = node.fills;
  if (Array.isArray(fills) && fills.length > 0) {
    const fill = fills[0];
    if (fill.type === 'SOLID') {
      styles.color = {
        r: fill.color.r,
        g: fill.color.g,
        b: fill.color.b,
        a: fill.opacity !== undefined ? fill.opacity : 1,
      };
    }
  }

  // 줄 높이
  if (node.lineHeight !== figma.mixed && typeof node.lineHeight === 'object') {
    if (node.lineHeight.unit === 'PIXELS') {
      styles.lineHeight = node.lineHeight.value;
    }
  }

  // 자간
  if (node.letterSpacing !== figma.mixed && typeof node.letterSpacing === 'object') {
    if (node.letterSpacing.unit === 'PIXELS') {
      styles.letterSpacing = node.letterSpacing.value;
    }
  }

  // 텍스트 정렬
  if (node.textAlignHorizontal !== undefined) {
    switch (node.textAlignHorizontal) {
      case 'CENTER':
        styles.textAlign = 'center';
        break;
      case 'RIGHT':
        styles.textAlign = 'right';
        break;
      case 'JUSTIFIED':
        styles.textAlign = 'justify';
        break;
      default:
        styles.textAlign = 'left';
    }
  }
}

/**
 * 레이아웃 스타일 추출
 */
export function extractLayoutStyles(node: FrameNode, styles: ComputedStyles) {
  // 레이아웃 모드
  if (node.layoutMode === 'HORIZONTAL') {
    styles.display = 'flex';
    styles.flexDirection = 'row';
  } else if (node.layoutMode === 'VERTICAL') {
    styles.display = 'flex';
    styles.flexDirection = 'column';
  } else {
    styles.display = 'block';
  }

  // 갭
  if (node.itemSpacing !== undefined) {
    styles.gap = node.itemSpacing;
  }

  // 패딩
  styles.paddingTop = node.paddingTop || 0;
  styles.paddingRight = node.paddingRight || 0;
  styles.paddingBottom = node.paddingBottom || 0;
  styles.paddingLeft = node.paddingLeft || 0;

  // 주축 정렬
  if (node.primaryAxisAlignItems !== undefined) {
    switch (node.primaryAxisAlignItems) {
      case 'CENTER':
        styles.justifyContent = 'center';
        break;
      case 'MAX':
        styles.justifyContent = 'flex-end';
        break;
      case 'SPACE_BETWEEN':
        styles.justifyContent = 'space-between';
        break;
      default:
        styles.justifyContent = 'flex-start';
    }
  }

  // 교차축 정렬
  if (node.counterAxisAlignItems !== undefined) {
    switch (node.counterAxisAlignItems) {
      case 'CENTER':
        styles.alignItems = 'center';
        break;
      case 'MAX':
        styles.alignItems = 'flex-end';
        break;
      default:
        styles.alignItems = 'flex-start';
    }
  }
}

/**
 * 배경색 추출
 */
export function extractFillStyles(node: MinimalFillsMixin, styles: ComputedStyles) {
  const fills = node.fills;
  if (!Array.isArray(fills) || fills.length === 0) {
    styles.backgroundColor = { r: 0, g: 0, b: 0, a: 0 };
    return;
  }

  const fill = fills[0];
  if (fill.type === 'SOLID') {
    styles.backgroundColor = {
      r: fill.color.r,
      g: fill.color.g,
      b: fill.color.b,
      a: fill.opacity !== undefined ? fill.opacity : 1,
    };
  }
}

/**
 * 테두리 스타일 추출
 */
export function extractStrokeStyles(node: MinimalStrokesMixin, styles: ComputedStyles) {
  const strokes = node.strokes;
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return;
  }

  const stroke = strokes[0];
  if (stroke.type === 'SOLID') {
    const strokeColor: RGBA = {
      r: stroke.color.r,
      g: stroke.color.g,
      b: stroke.color.b,
      a: stroke.opacity !== undefined ? stroke.opacity : 1,
    };

    styles.borderTopColor = strokeColor;
    styles.borderRightColor = strokeColor;
    styles.borderBottomColor = strokeColor;
    styles.borderLeftColor = strokeColor;
  }

  // 스트로크 두께
  if ('strokeWeight' in node && typeof node.strokeWeight === 'number') {
    styles.borderTopWidth = node.strokeWeight;
    styles.borderRightWidth = node.strokeWeight;
    styles.borderBottomWidth = node.strokeWeight;
    styles.borderLeftWidth = node.strokeWeight;
  }
}

/**
 * 모서리 라운드 추출
 */
export function extractCornerStyles(node: CornerMixin & RectangleCornerMixin, styles: ComputedStyles) {
  if (typeof node.cornerRadius === 'number') {
    styles.borderTopLeftRadius = node.cornerRadius;
    styles.borderTopRightRadius = node.cornerRadius;
    styles.borderBottomRightRadius = node.cornerRadius;
    styles.borderBottomLeftRadius = node.cornerRadius;
  } else {
    // 개별 모서리
    styles.borderTopLeftRadius = node.topLeftRadius || 0;
    styles.borderTopRightRadius = node.topRightRadius || 0;
    styles.borderBottomRightRadius = node.bottomRightRadius || 0;
    styles.borderBottomLeftRadius = node.bottomLeftRadius || 0;
  }
}

/**
 * 효과(그림자 등) 추출
 */
export function extractEffectStyles(node: BlendMixin, styles: ComputedStyles) {
  const effects = node.effects;
  if (!Array.isArray(effects) || effects.length === 0) {
    styles.boxShadow = 'none';
    return;
  }

  const shadowParts: string[] = [];

  for (const effect of effects) {
    if (effect.type === 'DROP_SHADOW' && effect.visible) {
      const { offset, radius, spread, color } = effect;
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const a = color.a;
      shadowParts.push(`rgba(${r}, ${g}, ${b}, ${a}) ${offset.x}px ${offset.y}px ${radius}px ${spread || 0}px`);
    }
  }

  styles.boxShadow = shadowParts.length > 0 ? shadowParts.join(', ') : 'none';
}
