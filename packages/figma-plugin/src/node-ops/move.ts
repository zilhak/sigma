/**
 * Group 결과
 */
export interface GroupNodesResult {
  groupId: string;
  name: string;
  childCount: number;
  children: Array<{ id: string; name: string; type: string }>;
}

/**
 * Ungroup 결과
 */
export interface UngroupResult {
  parentId: string;
  parentName: string;
  releasedChildren: Array<{ id: string; name: string; type: string }>;
}

/**
 * Flatten 결과
 */
export interface FlattenResult {
  vectorId: string;
  name: string;
  width: number;
  height: number;
}

/**
 * 여러 노드를 Group으로 묶기
 */
export function groupNodes(
  nodeIds: string[],
  name?: string
): GroupNodesResult {
  if (!nodeIds || nodeIds.length < 1) {
    throw new Error('그룹화할 노드 ID가 최소 1개 필요합니다');
  }

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) {
      throw new Error(`노드를 찾을 수 없습니다: ${id}`);
    }
    if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
      throw new Error(`Document 또는 Page는 그룹화할 수 없습니다: ${id}`);
    }
    nodes.push(node as SceneNode);
  }

  const parent = nodes[0].parent as BaseNode & ChildrenMixin;
  if (!parent) {
    throw new Error('노드의 부모를 찾을 수 없습니다');
  }

  const group = figma.group(nodes, parent);
  if (name) group.name = name;

  return {
    groupId: group.id,
    name: group.name,
    childCount: group.children.length,
    children: group.children.map(c => ({ id: c.id, name: c.name, type: c.type })),
  };
}

/**
 * Group 해제 (자식을 부모로 이동)
 */
export function ungroupNodes(nodeId: string): UngroupResult {
  if (!nodeId) {
    throw new Error('nodeId가 필요합니다');
  }

  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }
  if (node.type !== 'GROUP') {
    throw new Error(`Group 노드가 아닙니다: ${nodeId} (${node.type})`);
  }

  const parent = node.parent;
  if (!parent) {
    throw new Error('Group의 부모를 찾을 수 없습니다');
  }

  const childrenInfo = (node as GroupNode).children.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
  }));

  figma.ungroup(node as GroupNode);

  return {
    parentId: parent.id,
    parentName: parent.name,
    releasedChildren: childrenInfo,
  };
}

/**
 * 여러 노드를 하나의 Vector로 병합
 */
export function flattenNodes(
  nodeIds: string[],
  name?: string
): FlattenResult {
  if (!nodeIds || nodeIds.length < 1) {
    throw new Error('Flatten할 노드 ID가 최소 1개 필요합니다');
  }

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) {
      throw new Error(`노드를 찾을 수 없습니다: ${id}`);
    }
    if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
      throw new Error(`Document 또는 Page는 Flatten할 수 없습니다: ${id}`);
    }
    nodes.push(node as SceneNode);
  }

  const vector = figma.flatten(nodes);
  if (name) vector.name = name;

  return {
    vectorId: vector.id,
    name: vector.name,
    width: Math.round(vector.width),
    height: Math.round(vector.height),
  };
}

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
