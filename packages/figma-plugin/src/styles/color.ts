/**
 * 색상 파싱 및 변환 유틸리티
 */
import type { RGBA } from '@sigma/shared';

/**
 * CSS 색상 문자열 파싱 (rgb, rgba)
 */
export function parseColorFromCSS(colorStr: string): RGBA | null {
  const rgbaMatch = colorStr.match(
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
 * RGBA → Figma SolidPaint 변환
 */
export function createSolidPaint(color: RGBA): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a,
  };
}
