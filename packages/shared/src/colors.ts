import type { RGBA } from './types';

/**
 * Named CSS 색상
 */
const NAMED_COLORS: Record<string, RGBA> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 0.502, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 },
  yellow: { r: 1, g: 1, b: 0, a: 1 },
  cyan: { r: 0, g: 1, b: 1, a: 1 },
  magenta: { r: 1, g: 0, b: 1, a: 1 },
  gray: { r: 0.502, g: 0.502, b: 0.502, a: 1 },
  grey: { r: 0.502, g: 0.502, b: 0.502, a: 1 },
};

/**
 * CSS 색상 문자열을 RGBA로 변환 (0-1 범위)
 */
export function parseColor(colorStr: string): RGBA | null {
  if (!colorStr || colorStr === 'none' || colorStr === 'initial' || colorStr === 'inherit') {
    return null;
  }

  const trimmed = colorStr.trim().toLowerCase();

  // Named colors
  if (NAMED_COLORS[trimmed]) {
    return { ...NAMED_COLORS[trimmed] };
  }

  // HEX: #fff, #ffffff, #ffffffff
  if (trimmed.startsWith('#')) {
    return parseHex(trimmed);
  }

  // RGBA: rgba(255, 128, 0, 0.5)
  const rgbaMatch = trimmed.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/
  );
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  return null;
}

/**
 * HEX 색상 파싱
 */
function parseHex(hex: string): RGBA | null {
  const cleaned = hex.replace('#', '');

  let r: number, g: number, b: number, a = 1;

  if (cleaned.length === 3) {
    // #fff
    r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
    g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
    b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
  } else if (cleaned.length === 4) {
    // #ffff (with alpha)
    r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
    g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
    b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
    a = parseInt(cleaned[3] + cleaned[3], 16) / 255;
  } else if (cleaned.length === 6) {
    // #ffffff
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
  } else if (cleaned.length === 8) {
    // #ffffffff (with alpha)
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
    a = parseInt(cleaned.slice(6, 8), 16) / 255;
  } else {
    return null;
  }

  return { r, g, b, a };
}

/**
 * RGBA를 CSS 문자열로 변환
 */
export function rgbaToString(color: RGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  if (color.a === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}
