/**
 * 이미지 요소 처리
 */
import type { ExtractedNode } from '@sigma/shared';
import { applyCornerRadius } from '../styles/effects';

/**
 * 이미지 요소(<img>) 처리
 * Figma에서는 실제 이미지를 로드할 수 없으므로 플레이스홀더 생성
 */
export function createImagePlaceholder(node: ExtractedNode): FrameNode {
  const { styles, boundingRect, attributes } = node;

  const frame = figma.createFrame();

  // 크기 설정 (styles > boundingRect > 기본값)
  const width = typeof styles.width === 'number' && styles.width > 0
    ? styles.width
    : boundingRect.width > 0 ? boundingRect.width : 100;
  const height = typeof styles.height === 'number' && styles.height > 0
    ? styles.height
    : boundingRect.height > 0 ? boundingRect.height : 100;

  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // 이미지 플레이스홀더 스타일 (연한 회색 배경)
  frame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }];

  // 테두리 (이미지 영역 표시)
  frame.strokes = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 1 }];
  frame.strokeWeight = 1;

  // 이름 설정 (alt 또는 src에서 추출)
  const alt = attributes && attributes.alt ? attributes.alt : '';
  const src = attributes && attributes.src ? attributes.src : '';
  const imageName = alt || (src ? src.split('/').pop() || 'image' : 'image');
  frame.name = `[IMG] ${imageName}`;

  // 모서리 라운드 적용 (이미지에도 border-radius가 있을 수 있음)
  applyCornerRadius(frame, styles);

  // 불투명도
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  return frame;
}
