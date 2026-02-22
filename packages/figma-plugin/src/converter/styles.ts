import type { RGBA, ComputedStyles } from '@sigma/shared';
import { parseColor } from '@sigma/shared';
import { createSolidPaint } from '../utils';

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
 * 색상 비교 헬퍼 (null-safe)
 */
function colorsEqual(a: RGBA | null | undefined, b: RGBA | null | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a.r - b.r) < 0.01 && Math.abs(a.g - b.g) < 0.01
      && Math.abs(a.b - b.b) < 0.01 && Math.abs(a.a - b.a) < 0.01;
}

/**
 * 다수결 색상 찾기 (가장 많이 사용된 색상)
 */
function findMajorityColor(sides: Array<{ side: string; width: number; color: RGBA | null | undefined }>): RGBA | null {
  if (sides.length === 0) return null;

  // 색상별 카운트 (색상을 문자열로 변환하여 비교)
  const colorCount = new Map<string, { color: RGBA; count: number }>();

  for (const s of sides) {
    if (!s.color) continue;
    const key = `${s.color.r.toFixed(2)},${s.color.g.toFixed(2)},${s.color.b.toFixed(2)},${s.color.a.toFixed(2)}`;
    const existing = colorCount.get(key);
    if (existing) {
      existing.count++;
    } else {
      colorCount.set(key, { color: s.color, count: 1 });
    }
  }

  // 가장 많이 사용된 색상 찾기
  let majorityColor: RGBA | null = null;
  let maxCount = 0;
  for (const entry of colorCount.values()) {
    if (entry.count > maxCount) {
      maxCount = entry.count;
      majorityColor = entry.color;
    }
  }

  return majorityColor;
}

/**
 * 테두리 적용 (다수결 색상 기준)
 */
export function applyBorder(frame: FrameNode, styles: ComputedStyles) {
  const top = styles.borderTopWidth || 0;
  const right = styles.borderRightWidth || 0;
  const bottom = styles.borderBottomWidth || 0;
  const left = styles.borderLeftWidth || 0;

  const maxWidth = Math.max(top, right, bottom, left);
  if (maxWidth <= 0) return;

  // 면별 데이터 수집
  const sides = [
    { side: 'top', width: top, color: styles.borderTopColor },
    { side: 'right', width: right, color: styles.borderRightColor },
    { side: 'bottom', width: bottom, color: styles.borderBottomColor },
    { side: 'left', width: left, color: styles.borderLeftColor },
  ].filter(s => s.width > 0 && s.color);

  // 다수결 색상 찾기
  const borderColor = findMajorityColor(sides);
  if (!borderColor) return;

  frame.strokes = [createSolidPaint(borderColor)];

  // NOTE: strokesIncludedInLayout은 layoutMode가 HORIZONTAL/VERTICAL일 때만 설정 가능
  // → createFigmaNode에서 layoutMode 설정 후에 적용 (node-creator.ts)

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
 * 면별로 다른 border 색상을 Rectangle overlay로 표현
 */
export function applyBorderOverlays(frame: FrameNode, styles: ComputedStyles): void {
  // 1. 면별 width/color 수집
  const sides = [
    { side: 'top', width: styles.borderTopWidth || 0, color: styles.borderTopColor },
    { side: 'right', width: styles.borderRightWidth || 0, color: styles.borderRightColor },
    { side: 'bottom', width: styles.borderBottomWidth || 0, color: styles.borderBottomColor },
    { side: 'left', width: styles.borderLeftWidth || 0, color: styles.borderLeftColor },
  ].filter(s => s.width > 0 && s.color);

  // 2. 색상이 모두 동일하면 overlay 불필요 (기존 strokes로 충분)
  if (sides.length <= 1) return;
  const allSameColor = sides.every(s => colorsEqual(s.color, sides[0].color));
  if (allSameColor) return;

  // 3. 다수결 색상 찾기 (이미 frame.strokes에 적용됨)
  const majorityColor = findMajorityColor(sides);
  if (!majorityColor) return;

  // 4. 다수결과 다른 면에만 overlay 추가
  const frameWidth = frame.width;
  const frameHeight = frame.height;

  for (const s of sides) {
    if (colorsEqual(s.color, majorityColor)) continue;

    const rect = figma.createRectangle();
    rect.fills = [createSolidPaint(s.color !== undefined && s.color !== null ? s.color : { r: 0, g: 0, b: 0, a: 1 })];
    rect.strokes = [];

    // pluginData로 border overlay 마킹 (나중에 역변환용)
    rect.setPluginData('sigma:type', 'border_overlay');
    rect.setPluginData('sigma:border', JSON.stringify({
      side: s.side,
      color: s.color,
      width: s.width,
    }));

    let targetX = 0;
    let targetY = 0;

    switch (s.side) {
      case 'top':
        rect.resize(frameWidth, s.width);
        rect.name = '__sigma_border_top';
        targetX = 0;
        targetY = 0;
        break;
      case 'right':
        rect.resize(s.width, frameHeight);
        rect.name = '__sigma_border_right';
        targetX = frameWidth - s.width;
        targetY = 0;
        break;
      case 'bottom':
        rect.resize(frameWidth, s.width);
        rect.name = '__sigma_border_bottom';
        targetX = 0;
        targetY = frameHeight - s.width;
        break;
      case 'left':
        rect.resize(s.width, frameHeight);
        rect.name = '__sigma_border_left';
        targetX = 0;
        targetY = 0;
        break;
    }

    frame.appendChild(rect);

    // Auto Layout 간섭 방지: absolute 포지셔닝 → 그 후 좌표 설정
    rect.layoutPositioning = 'ABSOLUTE';
    rect.x = targetX;
    rect.y = targetY;

    // 부모 프레임 리사이즈 시 overlay가 함께 조정되도록 constraints 설정
    // (table-cell 등에서 layoutGrow로 인한 리사이즈에 대응)
    switch (s.side) {
      case 'top':
        rect.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
        break;
      case 'bottom':
        rect.constraints = { horizontal: 'STRETCH', vertical: 'MAX' };
        break;
      case 'left':
        rect.constraints = { horizontal: 'MIN', vertical: 'STRETCH' };
        break;
      case 'right':
        rect.constraints = { horizontal: 'MAX', vertical: 'STRETCH' };
        break;
    }
  }

  // 5. overlay로 대체한 면의 stroke weight를 0으로
  for (const s of sides) {
    if (!colorsEqual(s.color, majorityColor)) {
      switch (s.side) {
        case 'top': frame.strokeTopWeight = 0; break;
        case 'right': frame.strokeRightWeight = 0; break;
        case 'bottom': frame.strokeBottomWeight = 0; break;
        case 'left': frame.strokeLeftWeight = 0; break;
      }
    }
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
  const color = parseColor(colorStr);
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
