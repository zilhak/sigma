import type { TreeNode, TreeFilter, FindNodeResult, GetTreeResult } from '@sigma/shared';
import { getPageById } from './page';

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
export function findNodesByPath(path: string | string[], startNode: BaseNode | null, page?: PageNode): SceneNode[] {
  const pathParts = typeof path === 'string' ? path.split('/') : path;
  if (pathParts.length === 0) return [];

  // 시작 노드의 자식들
  const targetPage = page || figma.currentPage;
  const startChildren: readonly SceneNode[] = startNode && 'children' in startNode
    ? (startNode as FrameNode | PageNode).children
    : targetPage.children;

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

/**
 * 경로 또는 타입 필터로 노드를 찾아 직렬화된 결과 반환
 */
export function findNodeWithDetails(
  path: string | string[],
  typeFilter?: string,
  pageId?: string
): FindNodeResult {
  const page = pageId ? getPageById(pageId) : undefined;
  const foundNodes = findNodesByPath(path, null, page || undefined);

  // 타입 필터 적용
  const filteredNodes = typeFilter
    ? foundNodes.filter(n => n.type === typeFilter)
    : foundNodes;

  if (filteredNodes.length === 0) {
    const pathStr = Array.isArray(path) ? path.join('/') : path;
    throw new Error(`경로 "${pathStr}"에 해당하는 노드를 찾을 수 없습니다`);
  }

  // 찾은 노드들을 직렬화 (자식은 포함하지 않음, depth=0)
  const serializedNodes: TreeNode[] = [];
  for (const node of filteredNodes) {
    const serialized = serializeTreeNode(node, {
      currentDepth: 0,
      maxDepth: 0,
      nodeCount: { value: 0 },
      parentPath: '',
    });
    if (serialized) {
      // 전체 경로 재계산 (루트부터)
      serialized.fullPath = getNodeFullPath(node);
      serializedNodes.push(serialized);
    }
  }

  if (serializedNodes.length === 1) {
    return { node: serializedNodes[0] };
  } else {
    return {
      matches: serializedNodes,
      warning: `${serializedNodes.length}개의 노드가 발견되었습니다. 더 구체적인 경로를 사용하세요.`,
    };
  }
}

/**
 * 트리 구조를 필터와 함께 조회
 */
export function getTreeWithFilter(options: {
  nodeId?: string;
  path?: string | string[];
  depth?: number | string;
  filter?: TreeFilter;
  limit?: number;
  pageId?: string;
}): GetTreeResult {
  // maxDepth 결정 (-1 또는 "full"은 무한, 기본값 1)
  let maxDepth = 1;
  if (options.depth === 'full' || options.depth === -1) {
    maxDepth = -1;
  } else if (typeof options.depth === 'number') {
    maxDepth = Math.min(options.depth, 50);  // 최대 50으로 제한
  }

  // 대상 페이지 결정
  const targetPage = options.pageId ? getPageById(options.pageId) : figma.currentPage;
  if (!targetPage) {
    throw new Error(`페이지를 찾을 수 없습니다: ${options.pageId}`);
  }

  // 시작 노드 결정
  let startNode: SceneNode | null = null;
  let rootPath: string | undefined = undefined;

  if (options.nodeId) {
    const nodeById = figma.getNodeById(options.nodeId);
    if (!nodeById || nodeById.type === 'DOCUMENT' || nodeById.type === 'PAGE') {
      throw new Error(`노드를 찾을 수 없습니다: ${options.nodeId}`);
    }
    startNode = nodeById as SceneNode;
    rootPath = getNodeFullPath(startNode);
  } else if (options.path) {
    const found = findNodesByPath(options.path, null, targetPage);
    if (found.length === 0) {
      const pathStr = Array.isArray(options.path) ? options.path.join('/') : options.path;
      throw new Error(`경로에 해당하는 노드를 찾을 수 없습니다: ${pathStr}`);
    }
    startNode = found[0];  // 첫 번째 매칭 사용
    rootPath = Array.isArray(options.path) ? options.path.join('/') : options.path;
    if (found.length > 1) {
      console.warn(`[get-tree] 다중 매칭: ${found.length}개 중 첫 번째 사용`);
    }
  }

  // 탐색 및 직렬화
  const nodeCount = { value: 0 };
  const children: TreeNode[] = [];
  const effectiveLimit = options.limit !== undefined ? options.limit : 1000;  // 기본 limit 1000

  // 탐색 대상 결정
  const targetChildren: readonly SceneNode[] = startNode && 'children' in startNode
    ? (startNode as FrameNode).children
    : targetPage.children;

  for (const child of targetChildren) {
    if (nodeCount.value >= effectiveLimit) break;

    const serialized = serializeTreeNode(child, {
      currentDepth: 0,
      maxDepth,
      filter: options.filter,
      limit: effectiveLimit,
      nodeCount,
      parentPath: rootPath || '',
    });

    if (serialized) {
      children.push(serialized);
    }
  }

  return {
    pageId: targetPage.id,
    pageName: targetPage.name,
    rootNodeId: startNode ? startNode.id : null,
    rootNodePath: rootPath,
    children,
    truncated: nodeCount.value >= effectiveLimit,
    totalCount: nodeCount.value,
  };
}
