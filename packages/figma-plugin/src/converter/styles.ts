import type { RGBA, ComputedStyles, ExtractedNode } from '@sigma/shared';
import { createSolidPaint, parseColorFromCSS } from '../utils';

/**
 * 패딩 적용
 */
export function applyPadding(frame: FrameNode, styles: ComputedStyles) {
  frame.paddingTop = styles.paddingTop || 0;
  frame.paddingRight = styles.paddingRight || 0;
  frame.paddingBottom = styles.paddingBottom || 0;
  frame.paddingLeft = styles.paddingLeft || 0;
}

/**
 * 배경색 적용
 * @param frame - Figma 프레임 노드
 * @param styles - 계산된 스타일
 * @param isRoot - 루트(최상위) 프레임 여부
 */
export function applyBackground(frame: FrameNode, styles: ComputedStyles, isRoot: boolean = false) {
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    // 불투명한 배경색이 있으면 그대로 적용
    frame.fills = [createSolidPaint(styles.backgroundColor)];
  } else if (isRoot) {
    // 루트 프레임의 투명 배경 → 흰색 배경으로 대체
    // (Figma에서 빈 fills는 캔버스 배경(검은색/회색)이 노출됨)
    frame.fills = [createSolidPaint({ r: 1, g: 1, b: 1, a: 1 })];
  } else {
    // 자식 프레임의 투명 배경 → 빈 fills (부모 배경 비침)
    frame.fills = [];
  }
}

/**
 * 자식 요소의 CSS margin을 부모 Auto Layout의 itemSpacing/padding으로 변환
 * CSS margin collapsing: 인접 마진 중 큰 값 사용
 */
export function applyChildMargins(frame: FrameNode, children: ExtractedNode[]) {
  if (frame.layoutMode === 'NONE' || children.length === 0) return;

  const isVertical = frame.layoutMode === 'VERTICAL';
  const leadingProp = isVertical ? 'marginTop' : 'marginLeft';
  const trailingProp = isVertical ? 'marginBottom' : 'marginRight';

  // 첫 자식의 leading margin → 부모 padding 시작 방향에 추가
  const firstStyles = children[0].styles;
  if (firstStyles) {
    const firstLeading = (firstStyles as any)[leadingProp] || 0;
    if (firstLeading > 0) {
      if (isVertical) {
        frame.paddingTop = (frame.paddingTop || 0) + firstLeading;
      } else {
        frame.paddingLeft = (frame.paddingLeft || 0) + firstLeading;
      }
    }
  }

  // 마지막 자식의 trailing margin → 부모 padding 끝 방향에 추가
  const lastStyles = children[children.length - 1].styles;
  if (lastStyles) {
    const lastTrailing = (lastStyles as any)[trailingProp] || 0;
    if (lastTrailing > 0) {
      if (isVertical) {
        frame.paddingBottom = (frame.paddingBottom || 0) + lastTrailing;
      } else {
        frame.paddingRight = (frame.paddingRight || 0) + lastTrailing;
      }
    }
  }

  // 인접 자식 간 margin → itemSpacing (gap이 이미 설정되지 않은 경우만)
  if (children.length > 1 && (frame.itemSpacing === 0 || frame.itemSpacing === undefined)) {
    let maxSpacing = 0;
    for (let i = 0; i < children.length - 1; i++) {
      const currentStyles = children[i].styles;
      const nextStyles = children[i + 1].styles;
      const currentTrailing = currentStyles ? ((currentStyles as any)[trailingProp] || 0) : 0;
      const nextLeading = nextStyles ? ((nextStyles as any)[leadingProp] || 0) : 0;
      // CSS margin collapsing: 인접 마진 중 큰 값
      const collapsed = Math.max(currentTrailing, nextLeading);
      if (collapsed > maxSpacing) {
        maxSpacing = collapsed;
      }
    }
    if (maxSpacing > 0) {
      frame.itemSpacing = maxSpacing;
    }
  }
}

/**
 * 테두리 적용
 */
export function applyBorder(frame: FrameNode, styles: ComputedStyles) {
  const top = styles.borderTopWidth || 0;
  const right = styles.borderRightWidth || 0;
  const bottom = styles.borderBottomWidth || 0;
  const left = styles.borderLeftWidth || 0;

  const maxWidth = Math.max(top, right, bottom, left);
  if (maxWidth <= 0) return;

  // 가장 두꺼운 면의 색상 사용 (border-bottom만 있으면 borderBottomColor 사용)
  let borderColor: RGBA | null = null;
  if (top >= right && top >= bottom && top >= left) {
    borderColor = styles.borderTopColor;
  } else if (bottom >= top && bottom >= right && bottom >= left) {
    borderColor = styles.borderBottomColor;
  } else if (right >= top && right >= bottom && right >= left) {
    borderColor = styles.borderRightColor;
  } else {
    borderColor = styles.borderLeftColor;
  }

  // fallback: 아무 색상이나 찾기
  if (!borderColor) {
    borderColor = styles.borderTopColor || styles.borderRightColor
      || styles.borderBottomColor || styles.borderLeftColor;
  }
  if (!borderColor) return;

  frame.strokes = [createSolidPaint(borderColor)];

  // 4면 동일하면 uniform stroke, 다르면 per-side (IndividualStrokesMixin)
  const allEqual = (top === right && right === bottom && bottom === left);
  if (allEqual) {
    frame.strokeWeight = top;
  } else {
    frame.strokeTopWeight = top;
    frame.strokeRightWeight = right;
    frame.strokeBottomWeight = bottom;
    frame.strokeLeftWeight = left;
  }
}

/**
 * 모서리 라운드 적용
 */
export function applyCornerRadius(frame: FrameNode, styles: ComputedStyles) {
  const { borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius } = styles;

  // 모두 같은 경우
  if (
    borderTopLeftRadius === borderTopRightRadius &&
    borderTopRightRadius === borderBottomRightRadius &&
    borderBottomRightRadius === borderBottomLeftRadius
  ) {
    frame.cornerRadius = borderTopLeftRadius || 0;
  } else {
    // 개별 설정
    frame.topLeftRadius = borderTopLeftRadius || 0;
    frame.topRightRadius = borderTopRightRadius || 0;
    frame.bottomRightRadius = borderBottomRightRadius || 0;
    frame.bottomLeftRadius = borderBottomLeftRadius || 0;
  }
}

/**
 * 그림자 적용 (다중 그림자 지원)
 */
export function applyBoxShadow(frame: FrameNode, styles: ComputedStyles) {
  const { boxShadow } = styles;

  if (!boxShadow || boxShadow === 'none') return;

  const shadows = parseBoxShadows(boxShadow);
  if (shadows.length > 0) {
    frame.effects = shadows;
  }
}

/**
 * 다중 box-shadow CSS 파싱
 */
export function parseBoxShadows(shadowStr: string): DropShadowEffect[] {
  const effects: DropShadowEffect[] = [];

  // 쉼표로 구분된 다중 그림자 분리 (rgba 내부의 쉼표 제외)
  const shadowParts = splitShadows(shadowStr);

  for (const part of shadowParts) {
    const shadow = parseSingleShadow(part.trim());
    if (shadow) {
      effects.push(shadow);
    }
  }

  return effects;
}

/**
 * 다중 그림자 문자열 분리 (rgba 내부 쉼표 무시)
 */
export function splitShadows(shadowStr: string): string[] {
  const results: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (const char of shadowStr) {
    if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;
    else if (char === ',' && parenDepth === 0) {
      results.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    results.push(current.trim());
  }

  return results;
}

/**
 * 단일 box-shadow 파싱
 */
export function parseSingleShadow(shadowStr: string): DropShadowEffect | null {
  // "rgba(0, 0, 0, 0.1) 0px 4px 6px 0px" 또는 "0px 4px 6px rgba(0, 0, 0, 0.1)" 형식

  // 색상 먼저 추출
  const colorMatch = shadowStr.match(/rgba?\s*\([^)]+\)/);
  if (!colorMatch) return null;

  const colorStr = colorMatch[0];
  const color = parseColorFromCSS(colorStr);
  if (!color) return null;

  // 색상 제거 후 숫자만 추출
  const numbersStr = shadowStr.replace(colorStr, '').trim();
  const numbers = numbersStr.match(/-?[\d.]+/g);

  if (!numbers || numbers.length < 2) return null;

  const offsetX = parseFloat(numbers[0]) || 0;
  const offsetY = parseFloat(numbers[1]) || 0;
  const blur = parseFloat(numbers[2]) || 0;
  const spread = parseFloat(numbers[3]) || 0;

  return {
    type: 'DROP_SHADOW',
    color: { r: color.r, g: color.g, b: color.b, a: color.a },
    offset: { x: offsetX, y: offsetY },
    radius: blur,
    spread: spread,
    visible: true,
    blendMode: 'NORMAL',
  };
}
