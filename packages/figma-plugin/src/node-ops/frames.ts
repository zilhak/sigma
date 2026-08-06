import { removeAndVerify } from './removal';

/**
 * 노드 삭제
 * @returns 삭제된 노드 이름 + **되읽기 검증 결과**(응답이 사실과 달라지면 안 된다)
 */
export function deleteFrame(nodeId: string): { nodeId: string; name: string; removed: boolean; stillResolvable: boolean; note?: string } {
  if (!nodeId) {
    throw new Error('nodeId가 필요합니다');
  }

  const nodeToDelete = figma.getNodeById(nodeId);
  if (!nodeToDelete) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  const deletedName = nodeToDelete.name;
  const outcome = removeAndVerify(nodeToDelete);
  if (!outcome.removed) {
    throw new Error(`노드를 지우지 못했다: ${nodeId} (${deletedName}) — ${outcome.note}`);
  }
  return { nodeId, name: deletedName, ...outcome };
}
