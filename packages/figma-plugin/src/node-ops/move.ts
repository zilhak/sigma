import { getTextHyperlinks } from './query';

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
  /**
   * 원본 자식 id → 복제 자식 id. Figma 의 clone() 은 자식 전부에 새 id 를 부여하는데
   * 그 대응을 API 가 주지 않아, 호출자는 복제본을 손보려고 서브트리 전체를 get_tree 로
   * 다시 받아야 했다(실측: 응답 6.7만~20.3만 자로 MCP 한도 초과).
   * 배경: docs/history/006-clone-node-hid-its-child-ids.md
   */
  childIdMap?: Record<string, string | { id: string; name: string; type: string }>;
  /** 복제된 자식 수(매핑이 잘렸는지와 무관한 실제 개수) */
  clonedChildCount?: number;
  /** 상한을 넘겨 매핑이 잘림 — 조용히 자르지 않는다 */
  childIdMapTruncated?: boolean;
  /** 복제본 안 TEXT 의 NODE 하이퍼링크 상태. 육안으로는 절대 안 보이는 문제라 항상 알린다 */
  hyperlinks?: {
    /** 복제 범위 안을 가리키던 링크가 여전히 **원본**을 가리키는 건수 */
    internalPointingToSource: number;
    /** rewireInternalLinks:true 로 복제본 내부로 다시 연결한 건수 */
    rewired?: number;
  };
}

export interface CloneNodeOptions {
  parentId?: string;
  position?: { x: number; y: number };
  name?: string;
  /** 자식 id 매핑 포함 (기본 true) */
  includeChildIdMap?: boolean;
  /** 매핑 값에 이름·타입까지 (기본 false — id 만) */
  includeNames?: boolean;
  /** 매핑 상한 (기본 2000). 넘으면 childIdMapTruncated */
  childIdMapLimit?: number;
  /**
   * 복제본 안에서 **원본을 가리키게 된** 내부 하이퍼링크를 복제본 내부로 다시 연결 (기본 false).
   * 기본을 끄는 이유: "원본을 참조하는 복제본" 이 의도인 경우가 있고, 되돌리기 어렵다.
   * 다만 끈 상태에서도 건수는 반드시 알린다 — 지금까지는 침묵이라 아무도 몰랐다.
   */
  rewireInternalLinks?: boolean;
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
  name?: string,
  options: CloneNodeOptions = {}
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

  const sourceParent = sourceNode.parent;
  const cloned = (sourceNode as SceneNode).clone();

  // ⚠️ Figma 의 clone() 은 최상위 노드를 **figma.currentPage**(=Figma 앱에서 열려 있는 페이지)
  // 아래에 붙인다. Sigma 는 "열린 페이지가 아니라 바인딩된 페이지" 가 원칙이므로, parentId 를
  // 따로 주지 않았으면 원본과 같은 부모로 되돌린다. 그러지 않으면 복제본이 엉뚱한 페이지에
  // 생기고(응답은 성공) 나중에 그 페이지에서 발견하게 된다.
  if (!parentId && sourceParent && cloned.parent !== sourceParent && 'appendChild' in sourceParent) {
    const keep = { x: cloned.x, y: cloned.y };
    (sourceParent as ChildrenMixin).appendChild(cloned);
    cloned.x = keep.x;
    cloned.y = keep.y;
  }

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

  // 매핑은 **여기서** 만든다 — 원본과 복제본을 둘 다 손에 쥔 지금이 유일하게 공짜인 시점이고,
  // 내부에서 get_tree 를 부르는 것은 같은 비용을 숨기는 것일 뿐이다.
  const pairs = options.includeChildIdMap === false ? [] : collectClonePairs(sourceNode as SceneNode, cloned);
  const limit = typeof options.childIdMapLimit === 'number' && options.childIdMapLimit > 0
    ? options.childIdMapLimit : DEFAULT_CHILD_ID_MAP_LIMIT;
  const kept = pairs.slice(0, limit);

  const childIdMap: Record<string, string | { id: string; name: string; type: string }> = {};
  for (const p of kept) {
    childIdMap[p.sourceId] = options.includeNames
      ? { id: p.clone.id, name: p.clone.name, type: p.clone.type }
      : p.clone.id;
  }

  const links = retargetInternalHyperlinks(pairs, options.rewireInternalLinks === true);

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
    ...(options.includeChildIdMap === false ? {} : {
      childIdMap,
      clonedChildCount: pairs.length,
      ...(pairs.length > kept.length ? { childIdMapTruncated: true } : {}),
    }),
    ...(links ? { hyperlinks: links } : {}),
  };
}

const DEFAULT_CHILD_ID_MAP_LIMIT = 2000;

interface ClonePair { sourceId: string; clone: SceneNode }

/**
 * 원본/복제본을 **같은 순서로 동시 순회**해 자식 대응을 만든다.
 * clone() 이 자식 순서를 보존한다는 성질에 의존한다 — Figma API 가 대응을 주지 않아 이 방법뿐이다.
 * 길이가 어긋나면(있어선 안 되는 일) 그 가지에서 멈춘다. 밀린 매핑은 "그럴듯하게 틀리므로"
 * 개수만 맞추고 넘기지 않는다.
 */
function collectClonePairs(source: SceneNode, clone: SceneNode): ClonePair[] {
  const out: ClonePair[] = [];
  const walk = (s: SceneNode, c: SceneNode) => {
    const sk = 'children' in s ? (s as ChildrenMixin).children : [];
    const ck = 'children' in c ? (c as ChildrenMixin).children : [];
    const n = Math.min(sk.length, ck.length);
    for (let i = 0; i < n; i++) {
      out.push({ sourceId: sk[i].id, clone: ck[i] });
      walk(sk[i], ck[i]);
    }
  };
  walk(source, clone);
  return out;
}

/**
 * 복제본 안 TEXT 의 `type:'NODE'` 하이퍼링크 중 **복제 범위 안을 가리키던 것**을 찾는다.
 * 클론은 링크를 그대로 복사하므로 복제본의 마커를 눌러도 **원본으로 튄다** — 렌더 결과가
 * 같아서 육안으로는 절대 발견되지 않는다. 그래서 기본은 경고, 재배선은 opt-in 이다.
 * 복제 범위 **밖**을 가리키는 링크는 정상이므로 건드리지 않는다.
 */
function retargetInternalHyperlinks(
  pairs: ClonePair[],
  rewire: boolean
): { internalPointingToSource: number; rewired?: number } | null {
  if (pairs.length === 0) return null;
  const sourceToClone = new Map<string, string>();
  for (const p of pairs) sourceToClone.set(p.sourceId, p.clone.id);

  let found = 0;
  let rewired = 0;
  for (const p of pairs) {
    if (p.clone.type !== 'TEXT') continue;
    const text = p.clone as TextNode;
    for (const link of getTextHyperlinks(text)) {
      if (link.type !== 'NODE') continue;
      const target = sourceToClone.get(link.value);
      if (!target) continue; // 복제 범위 밖 → 정상
      found++;
      if (rewire) {
        text.setRangeHyperlink(link.start, link.end, { type: 'NODE', value: target });
        rewired++;
      }
    }
  }
  if (found === 0) return null;
  return { internalPointingToSource: rewire ? 0 : found, ...(rewire ? { rewired } : {}) };
}
