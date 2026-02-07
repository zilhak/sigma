import type { TreeNode, TreeFilter } from '@sigma/shared';

/**
 * 노드의 전체 경로를 구함 (루트부터)
 */
export function getNodeFullPath(node: SceneNode): string {
  const parts: string[] = [node.name];
  let current: BaseNode | null = node.parent;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    parts.unshift(current.name);
    current = current.parent;
  }

  return parts.join('/');
}

/**
 * 경로로 노드 찾기
 * @param path "A/B/C" 또는 ["A", "B", "C"]
 * @param startNode 시작점 (null이면 현재 페이지 루트)
 * @returns 매칭되는 노드들 (이름 중복 가능)
 */
export function findNodesByPath(path: string | string[], startNode: BaseNode | null): SceneNode[] {
  const pathParts = typeof path === 'string' ? path.split('/') : path;
  if (pathParts.length === 0) return [];

  // 시작 노드의 자식들
  const startChildren: readonly SceneNode[] = startNode && 'children' in startNode
    ? (startNode as FrameNode | PageNode).children
    : figma.currentPage.children;

  // 첫 번째 경로 요소와 매칭되는 노드들 찾기
  let currentMatches: SceneNode[] = startChildren.filter(child => child.name === pathParts[0]);

  // 나머지 경로 요소들을 순회
  for (let i = 1; i < pathParts.length; i++) {
    const nextMatches: SceneNode[] = [];
    const targetName = pathParts[i];

    for (const match of currentMatches) {
      if ('children' in match) {
        const frame = match as FrameNode;
        for (const child of frame.children) {
          if (child.name === targetName) {
            nextMatches.push(child);
          }
        }
      }
    }

    currentMatches = nextMatches;
    if (currentMatches.length === 0) break;
  }

  return currentMatches;
}

/**
 * 직렬화 컨텍스트
 */
export interface SerializeContext {
  currentDepth: number;
  maxDepth: number;  // -1 means infinite
  filter?: TreeFilter;
  limit?: number;
  nodeCount: { value: number };  // mutable counter
  parentPath: string;
}

/**
 * SceneNode를 TreeNode로 직렬화
 */
export function serializeTreeNode(node: SceneNode, ctx: SerializeContext): TreeNode | null {
  // limit 체크
  if (ctx.limit !== undefined && ctx.nodeCount.value >= ctx.limit) {
    return null;
  }

  // 타입 필터 적용
  if (ctx.filter?.types && ctx.filter.types.length > 0) {
    if (!ctx.filter.types.includes(node.type)) {
      return null;
    }
  }

  // 이름 필터 적용 (정규식)
  if (ctx.filter?.namePattern) {
    try {
      const regex = new RegExp(ctx.filter.namePattern);
      if (!regex.test(node.name)) {
        return null;
      }
    } catch {
      // 정규식 오류 시 무시
    }
  }

  // 노드 카운트 증가
  ctx.nodeCount.value++;

  // 전체 경로 계산
  const fullPath = ctx.parentPath
    ? ctx.parentPath + '/' + node.name
    : node.name;

  // boundingBox 계산
  const boundingBox = {
    x: 'x' in node ? node.x : 0,
    y: 'y' in node ? node.y : 0,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
  };

  // childCount 계산
  const hasChildren = 'children' in node;
  const childCount = hasChildren ? (node as FrameNode).children.length : 0;

  // meta 정보 구성
  const meta: TreeNode['meta'] = {
    visible: node.visible,
    locked: node.locked,
  };

  // FRAME/COMPONENT의 layoutMode
  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const frameNode = node as FrameNode;
    meta.layoutMode = frameNode.layoutMode;
  }

  // TEXT의 characters
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    const chars = textNode.characters;
    meta.characters = chars.length > 100 ? chars.slice(0, 100) + '...' : chars;
  }

  // TreeNode 구성
  const treeNode: TreeNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    boundingBox,
    childCount,
    fullPath,
    meta,
  };

  // 자식 노드 처리 (depth가 허용하면)
  const shouldTraverseChildren = ctx.maxDepth === -1 || ctx.currentDepth < ctx.maxDepth;
  if (hasChildren && shouldTraverseChildren) {
    const children: TreeNode[] = [];
    const frameNode = node as FrameNode;

    for (const child of frameNode.children) {
      if (ctx.limit !== undefined && ctx.nodeCount.value >= ctx.limit) {
        break;
      }

      const serializedChild = serializeTreeNode(child, {
        ...ctx,
        currentDepth: ctx.currentDepth + 1,
        parentPath: fullPath,
      });

      if (serializedChild) {
        children.push(serializedChild);
      }
    }

    if (children.length > 0) {
      treeNode.children = children;
    }
  }

  return treeNode;
}
