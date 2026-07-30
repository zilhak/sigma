import type { ExtractedNode } from '@sigma/shared';
import { createFigmaNode, createTextNode } from './node-creator';
import { parseHTML } from './html-parser';
import { applyBackground, applyBorder, applyCornerRadius, applyBoxShadow, applyPadding } from './styles';
import { applyLayoutMode, applySizingMode, applyAlignment } from './layout';

/**
 * position 미지정 시 자동 배치 위치 계산 — 대상 페이지의 현재 내용만 보고 정한다.
 *
 * 과거에는 "마지막으로 생성한 프레임" 전역(lastCreatedFrame)을 기억해 그 오른쪽에
 * 배치했다. 그 전역은 (1) 페이지를 구분하지 않아 A 페이지에 만든 좌표가 B 페이지의
 * 배치 기준이 됐고, (2) 여러 에이전트가 동시에 생성하면 서로의 기준을 덮어써
 * 프레임이 겹쳤다. 페이지 스캔 방식은 계산~appendChild 사이에 await 가 없어
 * (단일 이벤트 루프에서 원자적) 동시 호출에도 안전하다.
 */
function getAutoPosition(frame: SceneNode, targetPage: PageNode): { x: number; y: number } {
  // 페이지에 기존 프레임이 있으면 bounding box 아래에 배치
  const existingFrames = targetPage.children;
  if (existingFrames.length > 0) {
    let maxY = -Infinity;
    for (const child of existingFrames) {
      const bottom = child.y + child.height;
      if (bottom > maxY) {
        maxY = bottom;
      }
    }
    return { x: 0, y: maxY + 200 };
  }

  // 빈 페이지면 (0, 0)
  return { x: 0, y: 0 };
}

/**
 * JSON 데이터로 Figma 프레임 생성
 */
export async function createFrameFromJSON(
  node: ExtractedNode,
  name?: string,
  position?: { x: number; y: number },
  pageId?: string,
  getTargetPage?: (pageId?: string) => PageNode,
  forceAbsolute?: boolean,
  focusView?: boolean
): Promise<{ nodeId: string; name: string; childCount: number; pageName: string }> {
  // 대상 페이지 결정
  const targetPage = getTargetPage ? getTargetPage(pageId) : figma.currentPage;
  const isCurrentPage = targetPage.id === figma.currentPage.id;

  // 폰트 로드 (영문 + 한글)
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // 노드 생성
  const frame = await createFigmaNode(node, true, forceAbsolute || false);

  if (!frame) {
    throw new Error('프레임 생성 실패');
  }

  // 이름 설정
  frame.name = name || node.className || node.tagName;

  // 위치 결정: 명시적 좌표 > 자동 배치 (대상 페이지 하단)
  if (position) {
    frame.x = position.x;
    frame.y = position.y;
  } else {
    const autoPos = getAutoPosition(frame, targetPage);
    frame.x = autoPos.x;
    frame.y = autoPos.y;
  }

  // 대상 페이지에 추가
  targetPage.appendChild(frame);

  // 뷰 포커스는 "동작"과 분리된 별개 단계다 — 사람이 플러그인 UI 에서 직접
  // 붙여넣은 경우(focusView)에만 선택 + 뷰포트를 옮긴다. MCP 경로에서는 에이전트가
  // 화면을 볼 일이 없고, 사용자가 보던 뷰/선택을 말없이 덮는 부작용만 남는다.
  if (focusView && isCurrentPage) {
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
  }

  return {
    nodeId: frame.id,
    name: frame.name,
    childCount: 'children' in frame ? frame.children.length : 0,
    pageName: targetPage.name
  };
}

/**
 * HTML 문자열로 Figma 프레임 생성
 */
export async function createFrameFromHTML(
  html: string,
  name?: string,
  position?: { x: number; y: number },
  pageId?: string,
  getTargetPage?: (pageId?: string) => PageNode,
  forceAbsolute?: boolean,
  focusView?: boolean
): Promise<{ nodeId: string; name: string; childCount: number; pageName: string }> {
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
    throw new Error('HTML 파싱 실패');
  }

  // 기존 JSON 변환 로직 재사용
  const frame = await createFigmaNode(node, true, forceAbsolute || false);

  if (!frame) {
    throw new Error('프레임 생성 실패');
  }

  frame.name = name || 'HTML Import';

  // 위치 결정: 명시적 좌표 > 자동 배치 (대상 페이지 하단)
  if (position) {
    frame.x = position.x;
    frame.y = position.y;
  } else {
    const autoPos = getAutoPosition(frame, targetPage);
    frame.x = autoPos.x;
    frame.y = autoPos.y;
  }

  // 대상 페이지에 추가
  targetPage.appendChild(frame);

  // 뷰 포커스는 "동작"과 분리된 별개 단계다 — 사람이 플러그인 UI 에서 직접
  // 붙여넣은 경우(focusView)에만 선택 + 뷰포트를 옮긴다. MCP 경로에서는 에이전트가
  // 화면을 볼 일이 없고, 사용자가 보던 뷰/선택을 말없이 덮는 부작용만 남는다.
  if (focusView && isCurrentPage) {
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
  }

  return {
    nodeId: frame.id,
    name: frame.name,
    childCount: 'children' in frame ? frame.children.length : 0,
    pageName: targetPage.name
  };
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
): Promise<{ nodeId: string; name: string; childCount: number }> {
  // 1. 노드 찾기
  const targetNode = figma.getNodeById(nodeId);
  if (!targetNode) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  // 2. 유효한 컨테이너 타입인지 확인
  if (targetNode.type !== 'FRAME' && targetNode.type !== 'SECTION' && targetNode.type !== 'COMPONENT') {
    throw new Error(`노드 타입이 FRAME, SECTION, COMPONENT 중 하나여야 합니다. 현재: ${targetNode.type}`);
  }

  const frame = targetNode as FrameNode;

  // 3. 소스 데이터 결정
  let sourceNode: ExtractedNode;
  if (format === 'html') {
    const parsed = parseHTML(data as string);
    if (!parsed) {
      throw new Error('HTML 파싱 실패');
    }
    sourceNode = parsed;
  } else {
    sourceNode = data as ExtractedNode;
  }

  // 4. 폰트 로드
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

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

  // 9. 결과 반환
  return {
    nodeId: frame.id,
    name: frame.name,
    childCount: frame.children.length,
  };
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
