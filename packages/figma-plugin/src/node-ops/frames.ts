import { getTargetPage } from './page';

/**
 * 프레임 정보 타입
 */
export interface FrameInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 지정된 페이지 또는 현재 페이지의 모든 최상위 프레임 정보 반환
 */
export function getFrames(pageId?: string): { frames: FrameInfo[]; pageId: string; pageName: string } {
  const targetPage = getTargetPage(pageId);
  const frames = targetPage.children
    .filter((node): node is FrameNode => node.type === 'FRAME')
    .map((frame) => ({
      id: frame.id,
      name: frame.name,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    }));
  return {
    frames,
    pageId: targetPage.id,
    pageName: targetPage.name,
  };
}

/**
 * 노드 삭제
 * @returns 삭제된 노드 이름
 */
export function deleteFrame(nodeId: string): { nodeId: string; name: string } {
  if (!nodeId) {
    throw new Error('nodeId가 필요합니다');
  }

  const nodeToDelete = figma.getNodeById(nodeId);
  if (!nodeToDelete) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  const deletedName = nodeToDelete.name;
  nodeToDelete.remove();
  return { nodeId, name: deletedName };
}
