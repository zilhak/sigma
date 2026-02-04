/**
 * 효과 스타일 적용 (모서리, 그림자)
 */
import type { ComputedStyles } from '@sigma/shared';
import { parseColorFromCSS } from './color';

/**
 * 모서리 라운드 적용
 */
export function applyCornerRadius(frame: FrameNode, styles: ComputedStyles): void {
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
export function applyBoxShadow(frame: FrameNode, styles: ComputedStyles): void {
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
function splitShadows(shadowStr: string): string[] {
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
function parseSingleShadow(shadowStr: string): DropShadowEffect | null {
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
