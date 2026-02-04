/**
 * SVG 노드 생성
 */
import type { ExtractedNode } from '@sigma/shared';

/**
 * SVG 문자열에서 CSS 변수를 fallback 값으로 치환
 * Figma의 createNodeFromSvg()는 CSS 변수를 처리하지 못하므로
 * var(--name, fallback) → fallback 으로 변환
 */
export function resolveCssVariablesInSvg(svgString: string): string {
  // var(--variable-name, fallback-value) 패턴 매칭
  // fallback 값에 괄호가 포함될 수 있으므로 (예: rgb()), 재귀적으로 처리
  let result = svgString;
  let prevResult = '';

  // 변경이 없을 때까지 반복 (중첩 var() 처리)
  while (result !== prevResult) {
    prevResult = result;
    // var( 뒤에 변수명, 그리고 fallback 값 추출
    result = result.replace(/var\(\s*--[^,)]+\s*,\s*([^)]+)\)/g, (_match, fallback) => {
      // fallback 값이 또 다른 var()일 경우 재귀 처리됨
      return fallback.trim();
    });
  }

  return result;
}

/**
 * SVG 노드 생성
 * createNodeFromSvg는 SVG 문자열을 직접 Figma FrameNode로 변환
 */
export function createSvgNode(node: ExtractedNode): FrameNode | null {
  if (!node.svgString) return null;

  try {
    // CSS 변수를 fallback 값으로 치환
    const processedSvg = resolveCssVariablesInSvg(node.svgString);

    // Figma API로 SVG 문자열을 노드로 변환
    const svgFrame = figma.createNodeFromSvg(processedSvg);

    // 위치 및 크기는 SVG 자체에서 결정됨
    // 필요시 boundingRect로 크기 조정
    if (node.boundingRect.width > 0 && node.boundingRect.height > 0) {
      const currentWidth = svgFrame.width;
      const currentHeight = svgFrame.height;
      const targetWidth = node.boundingRect.width;
      const targetHeight = node.boundingRect.height;

      // SVG 크기가 추출된 크기와 다르면 스케일 조정
      if (Math.abs(currentWidth - targetWidth) > 1 || Math.abs(currentHeight - targetHeight) > 1) {
        svgFrame.resize(targetWidth, targetHeight);
      }
    }

    return svgFrame;
  } catch (error) {
    console.error('SVG 변환 실패:', error);
    // SVG 변환 실패 시 빈 프레임 반환
    const fallbackFrame = figma.createFrame();
    fallbackFrame.resize(
      node.boundingRect.width || 24,
      node.boundingRect.height || 24
    );
    fallbackFrame.name = 'SVG (변환 실패)';
    return fallbackFrame;
  }
}
