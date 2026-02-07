import type { ExtractedNode } from '@sigma/shared';
import { createFigmaNode, createTextNode } from './node-creator';
import { parseHTML } from './html-parser';
import { applyBackground, applyBorder, applyCornerRadius, applyBoxShadow, applyPadding } from './styles';
import { applyLayoutMode, applySizingMode, applyAlignment } from './layout';

// 마지막 생성 위치 추적
export let lastCreatedPosition: { x: number; y: number } | null = null;
export const OFFSET_X = 20; // 다음 프레임 X 오프셋
export const OFFSET_Y = 20; // 다음 프레임 Y 오프셋

// Helper to update position (needed since exports can't be reassigned from outside)
export function setLastCreatedPosition(pos: { x: number; y: number } | null) {
  lastCreatedPosition = pos;
}

/**
 * JSON 데이터로 Figma 프레임 생성
 */
export async function createFrameFromJSON(
  node: ExtractedNode,
  name?: string,
  position?: { x: number; y: number },
  pageId?: string,
  getTargetPage?: (pageId?: string) => PageNode
) {
  try {
    // 대상 페이지 결정
    const targetPage = getTargetPage ? getTargetPage(pageId) : figma.currentPage;
    const isCurrentPage = targetPage.id === figma.currentPage.id;

    // 폰트 로드 (영문 + 한글)
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    // 노드 생성
    const frame = await createFigmaNode(node);

    if (frame) {
      // 이름 설정
      frame.name = name || node.className || node.tagName;

      // 위치 결정: 명시적 좌표 > 이전 위치 오프셋 > 뷰포트 중앙
      if (position) {
        frame.x = position.x;
        frame.y = position.y;
      } else if (lastCreatedPosition) {
        frame.x = lastCreatedPosition.x + OFFSET_X;
        frame.y = lastCreatedPosition.y + OFFSET_Y;
      } else {
        const center = figma.viewport.center;
        frame.x = center.x - frame.width / 2;
        frame.y = center.y - frame.height / 2;
      }

      // 마지막 위치 저장
      lastCreatedPosition = { x: frame.x, y: frame.y };

      // 대상 페이지에 추가
      targetPage.appendChild(frame);

      // 현재 페이지인 경우에만 선택 및 뷰포트 이동
      if (isCurrentPage) {
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
      }

      const pageInfo = isCurrentPage ? '' : ` (페이지: ${targetPage.name})`;
      figma.ui.postMessage({ type: 'success', message: `프레임이 생성되었습니다!${pageInfo}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({ type: 'error', message });
  }
}

/**
 * HTML 문자열로 Figma 프레임 생성
 */
export async function createFrameFromHTML(
  html: string,
  name?: string,
  position?: { x: number; y: number },
  pageId?: string,
  getTargetPage?: (pageId?: string) => PageNode
) {
  try {
    // 대상 페이지 결정
    const targetPage = getTargetPage ? getTargetPage(pageId) : figma.currentPage;
    const isCurrentPage = targetPage.id === figma.currentPage.id;

    // 폰트 로드
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    // HTML 파싱 → ExtractedNode 변환
    const node = parseHTML(html);
    if (!node) {
      figma.ui.postMessage({ type: 'error', message: 'HTML 파싱 실패' });
      return;
    }

    // 기존 JSON 변환 로직 재사용
    const frame = await createFigmaNode(node);

    if (frame) {
      frame.name = name || 'HTML Import';

      // 위치 결정
      if (position) {
        frame.x = position.x;
        frame.y = position.y;
      } else if (lastCreatedPosition) {
        frame.x = lastCreatedPosition.x + OFFSET_X;
        frame.y = lastCreatedPosition.y + OFFSET_Y;
      } else {
        const center = figma.viewport.center;
        frame.x = center.x - frame.width / 2;
        frame.y = center.y - frame.height / 2;
      }

      lastCreatedPosition = { x: frame.x, y: frame.y };

      // 대상 페이지에 추가
      targetPage.appendChild(frame);

      // 현재 페이지인 경우에만 선택 및 뷰포트 이동
      if (isCurrentPage) {
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
      }

      const pageInfo = isCurrentPage ? '' : ` (페이지: ${targetPage.name})`;
      figma.ui.postMessage({ type: 'success', message: `HTML에서 프레임이 생성되었습니다!${pageInfo}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({ type: 'error', message: `HTML 변환 오류: ${message}` });
  }
}

/**
 * 기존 프레임의 내용을 새 데이터로 전체 교체
 */
export async function updateExistingFrame(
  nodeId: string,
  format: 'json' | 'html',
  data: ExtractedNode | string,
  name?: string,
  pageId?: string
) {
  // 1. 노드 찾기
  const targetNode = figma.getNodeById(nodeId);
  if (!targetNode) {
    figma.ui.postMessage({
      type: 'update-result',
      success: false,
      error: `노드를 찾을 수 없습니다: ${nodeId}`,
    });
    return;
  }

  // 2. 유효한 컨테이너 타입인지 확인
  if (targetNode.type !== 'FRAME' && targetNode.type !== 'SECTION' && targetNode.type !== 'COMPONENT') {
    figma.ui.postMessage({
      type: 'update-result',
      success: false,
      error: `노드 타입이 FRAME, SECTION, COMPONENT 중 하나여야 합니다. 현재: ${targetNode.type}`,
    });
    return;
  }

  const frame = targetNode as FrameNode;

  // 3. 폰트 로드
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // 4. 소스 데이터 결정
  let sourceNode: ExtractedNode;
  if (format === 'html') {
    const parsed = parseHTML(data as string);
    if (!parsed) {
      figma.ui.postMessage({
        type: 'update-result',
        success: false,
        error: 'HTML 파싱 실패',
      });
      return;
    }
    sourceNode = parsed;
  } else {
    sourceNode = data as ExtractedNode;
  }

  // 5. 기존 자식 모두 제거 (역순으로 제거하여 인덱스 안정성 보장)
  const childCount = frame.children.length;
  for (let i = childCount - 1; i >= 0; i--) {
    frame.children[i].remove();
  }

  // 6. 루트 레벨 스타일을 기존 프레임에 적용
  applyRootStylesToExistingFrame(frame, sourceNode);

  // 7. 새 자식 노드 재귀 생성 후 추가
  const sourceChildren = sourceNode.children || [];
  // 부모의 텍스트 콘텐츠 먼저 추가
  if (sourceNode.textContent) {
    const textNode = createTextNode(sourceNode.textContent, sourceNode.styles);
    if (textNode) {
      frame.appendChild(textNode);
    }
  }
  for (const child of sourceChildren) {
    const childNode = await createFigmaNode(child, false);
    if (childNode) {
      frame.appendChild(childNode);
    }
  }

  // 8. 이름 업데이트 (옵션)
  if (name) {
    frame.name = name;
  }

  // 9. 성공 응답
  figma.ui.postMessage({
    type: 'update-result',
    success: true,
    result: {
      nodeId: frame.id,
      name: frame.name,
      childCount: frame.children.length,
    },
  });
}

/**
 * 루트 레벨 스타일을 기존 프레임에 적용
 */
export function applyRootStylesToExistingFrame(frame: FrameNode, sourceNode: ExtractedNode) {
  const { styles, boundingRect, children } = sourceNode;

  // 크기 설정
  const width = typeof styles.width === 'number' ? styles.width : boundingRect.width;
  const height = typeof styles.height === 'number' ? styles.height : boundingRect.height;
  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // 레이아웃 모드 설정
  applyLayoutMode(frame, styles, children);

  // Auto Layout 크기 모드 설정
  if (frame.layoutMode !== 'NONE') {
    applySizingMode(frame, styles, true);
  }

  // 정렬 설정 (children 전달하여 space-between 보정)
  applyAlignment(frame, styles, children);

  // 패딩 설정
  applyPadding(frame, styles);

  // 배경색 설정 (루트)
  applyBackground(frame, styles, true);

  // 테두리 설정
  applyBorder(frame, styles);

  // 모서리 라운드 설정
  applyCornerRadius(frame, styles);

  // 그림자 설정
  applyBoxShadow(frame, styles);

  // 불투명도 설정
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  } else {
    frame.opacity = 1;
  }
}
