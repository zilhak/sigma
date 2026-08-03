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
