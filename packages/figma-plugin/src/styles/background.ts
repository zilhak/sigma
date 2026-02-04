/**
 * 배경 및 테두리 스타일 적용
 */
import type { ComputedStyles, RGBA } from '@sigma/shared';
import { createSolidPaint } from './color';

/**
 * 배경색 적용
 */
export function applyBackground(frame: FrameNode, styles: ComputedStyles, isRoot: boolean = false): void {
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
 * 테두리 적용
 */
export function applyBorder(frame: FrameNode, styles: ComputedStyles): void {
  const borderWidth = Math.max(
    styles.borderTopWidth || 0,
    styles.borderRightWidth || 0,
    styles.borderBottomWidth || 0,
    styles.borderLeftWidth || 0
  );

  if (borderWidth > 0) {
    // 개별 border 색상들을 수집
    const borderColors = [
      styles.borderTopColor,
      styles.borderRightColor,
      styles.borderBottomColor,
      styles.borderLeftColor
    ].filter(Boolean) as RGBA[];

    // 가장 불투명한 색상 선택 (스피너 등에서 주요 색상 표시)
    // Figma는 면별 stroke 색상을 지원하지 않으므로 가장 의미있는 색상 선택
    let borderColor = borderColors[0];
    if (borderColors.length > 1) {
      // 불투명도가 가장 높은 색상 선택
      borderColor = borderColors.reduce((best, current) => {
        const bestAlpha = best && best.a !== undefined ? best.a : 0;
        const currentAlpha = current && current.a !== undefined ? current.a : 0;
        return currentAlpha > bestAlpha ? current : best;
      }, borderColors[0]);
    }

    if (borderColor) {
      frame.strokes = [createSolidPaint(borderColor)];
      frame.strokeWeight = borderWidth;
    }
  }
}
