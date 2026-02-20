/**
 * 노드 이동 결과
 */
export interface MoveNodeResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  oldParentId: string | null;
  oldParentName: string | null;
  newParentId: string;
  newParentName: string;
  newParentType: string;
  index: number | undefined;
}

/**
 * 노드 복제 결과
 */
export interface CloneNodeResult {
  nodeId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  parentName: string | null;
  sourceNodeId: string;
}

/**
 * 노드를 다른 부모로 이동
 */
export function moveNode(
  nodeId: string,
  parentId: string,
  index?: number
): MoveNodeResult {
  if (!nodeId) {
    throw new Error('nodeId가 필요합니다');
  }
  if (!parentId) {
    throw new Error('parentId가 필요합니다');
  }

  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  const targetParent = figma.getNodeById(parentId);
  if (!targetParent) {
    throw new Error(`대상 부모 노드를 찾을 수 없습니다: ${parentId}`);
  }

  if (!('appendChild' in targetParent)) {
    throw new Error(`대상 노드(${targetParent.type})는 자식을 가질 수 없습니다`);
  }

  const oldParentId = node.parent ? node.parent.id : null;
  const oldParentName = node.parent ? node.parent.name : null;

  if (index !== undefined) {
    (targetParent as ChildrenMixin).insertChild(index, node as SceneNode);
  } else {
    (targetParent as ChildrenMixin).appendChild(node as SceneNode);
  }

  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    oldParentId,
    oldParentName,
    newParentId: targetParent.id,
    newParentName: targetParent.name,
    newParentType: targetParent.type,
    index,
  };
}

/**
 * 노드 복제
 */
export function cloneNode(
  nodeId: string,
  parentId?: string,
  position?: { x: number; y: number },
  name?: string
): CloneNodeResult {
  if (!nodeId) {
    throw new Error('nodeId가 필요합니다');
  }

  const sourceNode = figma.getNodeById(nodeId);
  if (!sourceNode) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  if (sourceNode.type === 'DOCUMENT' || sourceNode.type === 'PAGE') {
    throw new Error(`Document 또는 Page는 복제할 수 없습니다`);
  }

  const cloned = (sourceNode as SceneNode).clone();

  // 이름 변경
  if (name) {
    cloned.name = name;
  }

  // 다른 부모로 이동
  if (parentId) {
    const newParent = figma.getNodeById(parentId);
    if (!newParent) {
      // 복제는 이미 됐으므로 제거하고 에러 반환
      cloned.remove();
      throw new Error(`대상 부모 노드를 찾을 수 없습니다: ${parentId}`);
    }
    if (!('appendChild' in newParent)) {
      cloned.remove();
      throw new Error(`대상 노드(${newParent.type})는 자식을 가질 수 없습니다`);
    }
    (newParent as ChildrenMixin).appendChild(cloned);
  }

  // 위치 설정
  if (position) {
    cloned.x = position.x;
    cloned.y = position.y;
  }

  const width = 'width' in cloned ? (cloned as any).width : 0;
  const height = 'height' in cloned ? (cloned as any).height : 0;

  return {
    nodeId: cloned.id,
    name: cloned.name,
    type: cloned.type,
    x: cloned.x,
    y: cloned.y,
    width: Math.round(width),
    height: Math.round(height),
    parentId: cloned.parent ? cloned.parent.id : null,
    parentName: cloned.parent ? cloned.parent.name : null,
    sourceNodeId: nodeId,
  };
}
