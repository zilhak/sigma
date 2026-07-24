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
 * reparent 로 절대 위치가 튀었을 때의 좌표 보정 안내 (좌표계 함정).
 *
 * Figma 에서 노드의 x/y 는 "직속 부모 원점 기준" 로컬 좌표다(SECTION/FRAME/COMPONENT/GROUP
 * 모두 자식 원점을 자기 좌상단으로 잡는다 — 섹션도 예외 아님). appendChild 는 노드의 숫자 x/y 를
 * 그대로 보존하므로, 원점 위치가 다른 부모로 옮기면 같은 숫자가 새 원점 기준으로 재해석되어
 * 절대(페이지) 위치가 그 원점 차이만큼 이동한다.
 */
export interface MoveCoordinateShift {
  shifted: true;
  reason: string;
  beforeAbsolute: { x: number; y: number };
  afterAbsolute: { x: number; y: number };
  currentLocal: { x: number; y: number };
  /** 원래 절대 위치를 유지하려면 이 로컬 좌표로 보정해야 함 */
  restoreLocal: { x: number; y: number };
  hint: string;
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
  /** reparent 로 절대 위치가 튄 경우에만 존재 — 좌표 보정 안내 */
  coordinateShift?: MoveCoordinateShift;
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

  // reparent 로 절대 위치가 튀는지 감지하기 위해 이동 전 절대좌표를 기록.
  // absoluteTransform[*][2] = 노드 원점(로컬 0,0)의 절대 위치.
  const hasTransform = 'absoluteTransform' in node;
  const beforeAbsX = hasTransform ? (node as SceneNode).absoluteTransform[0][2] : 0;
  const beforeAbsY = hasTransform ? (node as SceneNode).absoluteTransform[1][2] : 0;

  if (index !== undefined) {
    (targetParent as ChildrenMixin).insertChild(index, node as SceneNode);
  } else {
    (targetParent as ChildrenMixin).appendChild(node as SceneNode);
  }

  // appendChild 는 로컬 x/y 숫자를 보존 → 새 부모 원점 성격이 다르면 절대 위치가 이동한다.
  let coordinateShift: MoveCoordinateShift | undefined;
  if (hasTransform) {
    const scene = node as SceneNode;
    const afterAbsX = scene.absoluteTransform[0][2];
    const afterAbsY = scene.absoluteTransform[1][2];
    const dx = afterAbsX - beforeAbsX;
    const dy = afterAbsY - beforeAbsY;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      const r = (n: number) => Math.round(n * 100) / 100;
      coordinateShift = {
        shifted: true,
        reason:
          'reparent 시 로컬 x/y 숫자는 보존되지만 새 부모의 원점 기준으로 재해석됩니다. ' +
          '노드 x/y 는 직속 부모(SECTION/FRAME/COMPONENT/GROUP 모두 로컬 원점) 좌상단 기준이라, ' +
          '원점 위치가 다른 부모로 옮기면 그 차이만큼 절대 위치가 이동합니다.',
        beforeAbsolute: { x: r(beforeAbsX), y: r(beforeAbsY) },
        afterAbsolute: { x: r(afterAbsX), y: r(afterAbsY) },
        currentLocal: { x: r(scene.x), y: r(scene.y) },
        restoreLocal: { x: r(scene.x - dx), y: r(scene.y - dy) },
        hint:
          '원래 절대 위치를 유지하려면 sigma_modify_node(method:"move") 로 restoreLocal 좌표로 보정하세요. ' +
          '배치 의도가 새 부모 로컬 기준이면 무시해도 됩니다. 이후 sigma_lint 로 회귀 검사 권장.',
      };
    }
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
    ...(coordinateShift ? { coordinateShift } : {}),
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
