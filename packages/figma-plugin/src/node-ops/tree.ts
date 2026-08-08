import type { TreeNode, TreeFilter, TreeFields, FindNodeResult, GetTreeResult } from '@sigma/shared';
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
  /** 매칭 노드를 **서브트리째 제외**(블랙리스트 prune). SVG 산물 VECTOR 빼기 등 */
  omit?: TreeFilter;
  /** 매칭 노드를 남기고 조상은 뼈대만 유지. 매칭 없는 가지는 제거 */
  keep?: TreeFilter;
  limit?: number;
  nodeCount: { value: number };  // mutable counter
  /**
   * keep 모드에서 "매칭은 아니지만 경로 유지를 위해 남긴" 뼈대 노드 수.
   * ⚠️ 뼈대를 nodeCount 에 같이 세면 뼈대가 limit 을 먹고 truncated 가 거짓말을 한다 —
   * limit/truncated 는 **매칭 노드 기준**이어야 의미가 있다.
   */
  skeletonCount?: { value: number };
  parentPath: string;
  /** 'geometry' 면 좌표에 필요한 것만 싣는다(fullPath·meta 생략, absolute 추가). 기본 'all' */
  fields?: TreeFields;
  /**
   * 'all' 모드에서도 absolute(절대좌표)를 함께 싣는다.
   *
   * boundingBox 는 **직속 부모 로컬좌표**라, 서로 다른 컨테이너에 있는 노드끼리는 비교가 안 된다
   * (예: 기획 레이어 안의 마커와 상태 프레임 깊숙한 곳의 버튼 사이 거리). 그렇다고 'all' 에
   * 항상 실으면 큰 페이지에서 payload 만 커지므로, **필요한 호출만** 켜서 값을 치른다.
   */
  includeAbsolute?: boolean;
}

/**
 * SceneNode를 TreeNode로 직렬화
 */
export function serializeTreeNode(node: SceneNode, ctx: SerializeContext): TreeNode | null {
  // limit 체크
  if (ctx.limit !== undefined && ctx.nodeCount.value >= ctx.limit) {
    return null;
  }

  // omit: 매칭하면 서브트리째 제외 (블랙리스트 prune)
  if (ctx.omit && matchesSelector(node, ctx.omit)) return null;

  // filter(레거시): 매칭하지 **않으면** 서브트리째 제외 (화이트리스트 prune)
  if (ctx.filter && !matchesSelector(node, ctx.filter)) return null;

  // keep: 매칭 노드만 결과에 센다. 비매칭 노드는 자식이 살아남을 때만 뼈대로 남는다(아래 후처리).
  const keepMatched = ctx.keep ? matchesSelector(node, ctx.keep) : true;

  // 노드 카운트 증가 — 뼈대는 세지 않는다(limit/truncated 는 매칭 노드 기준)
  if (keepMatched) ctx.nodeCount.value++;

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

  // geometry 모드: 좌표 작업에 필요한 것만 싣는다(meta 구성을 건너뛰고 fullPath 는 출력에서 뺀다).
  // absolute 는 절대좌표 — boundingBox(부모 로컬)만으로는 다른 섹션에 속한 노드끼리 비교가 안 된다.
  if (ctx.fields === 'geometry') {
    const abs = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
    const geoNode: TreeNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      boundingBox,
      childCount,
    };
    if (abs) geoNode.absolute = { x: abs.x, y: abs.y };
    attachChildren(node, geoNode, ctx, fullPath, hasChildren);
    return finalizeKeep(geoNode, keepMatched, ctx);
  }

  // meta 정보 구성
  const meta: TreeNode['meta'] = {
    visible: node.visible,
    locked: node.locked,
  };

  // 오토레이아웃 가능한 모든 타입(FRAME/COMPONENT/COMPONENT_SET/INSTANCE — BaseFrameMixin 상속)의 layoutMode.
  // INSTANCE 누락 시 인스턴스 내부의 정상 FILL 자식이 fill_sizing_orphan 오탐으로 잡힘(실측 발견).
  if ('layoutMode' in node) {
    const frameNode = node as FrameNode;
    meta.layoutMode = frameNode.layoutMode;
  }

  // TEXT의 characters
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    const chars = textNode.characters;
    meta.characters = chars.length > 100 ? chars.slice(0, 100) + '...' : chars;
  }

  // 오토레이아웃 자식으로 참여 가능한 모든 타입(FRAME/TEXT/RECTANGLE 등 — LayoutMixin 상속)
  if ('layoutSizingHorizontal' in node) {
    const layoutNode = node as FrameNode;
    meta.layoutSizingHorizontal = layoutNode.layoutSizingHorizontal;
    meta.layoutSizingVertical = layoutNode.layoutSizingVertical;
  }

  // COMPONENT/COMPONENT_SET의 description
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    meta.description = (node as ComponentNode).description;
  }

  // 자식이 없어도 fill 로 무언가를 그리는 컨테이너가 있다(이미지 프레임이 대표적) —
  // empty_container 가 "비어있음"을 자식 수만으로 판정하면 이런 노드를 오탐한다.
  if ('fills' in node) {
    const fills = (node as GeometryMixin).fills;
    if (fills !== figma.mixed && Array.isArray(fills)) {
      meta.hasVisibleFill = fills.some((f) => f.visible !== false && (f.opacity ?? 1) > 0);
    }
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

  // 요청한 경우에만 절대좌표를 함께 싣는다(컨테이너를 넘나드는 거리 계산용).
  if (ctx.includeAbsolute) {
    const abs = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
    if (abs) treeNode.absolute = { x: abs.x, y: abs.y };
  }

  attachChildren(node, treeNode, ctx, fullPath, hasChildren);

  return finalizeKeep(treeNode, keepMatched, ctx);
}

/** types(OR) + namePattern(AND) 매칭. 정규식 오류는 무시한다(종전 동작 유지). */
function matchesSelector(node: SceneNode, sel: TreeFilter): boolean {
  if (sel.types && sel.types.length > 0 && !sel.types.includes(node.type)) return false;
  if (sel.namePattern) {
    try {
      if (!new RegExp(sel.namePattern).test(node.name)) return false;
    } catch {
      // 정규식 오류 시 이름 조건은 없는 것으로 본다
    }
  }
  return true;
}

/**
 * keep 모드 후처리 — **post-order**. 자식을 먼저 직렬화한 뒤,
 * 자신이 매칭이거나 살아남은 자식이 있으면 유지하고 아니면 버린다.
 * 매칭이 아닌데 남은 노드가 "뼈대" 다(경로를 보여주기 위한 것).
 */
function finalizeKeep(treeNode: TreeNode, keepMatched: boolean, ctx: SerializeContext): TreeNode | null {
  if (!ctx.keep || keepMatched) return treeNode;
  if (!treeNode.children || treeNode.children.length === 0) return null;
  if (ctx.skeletonCount) ctx.skeletonCount.value++;
  return treeNode;
}

/** depth 가 허용하면 자식을 직렬화해 treeNode.children 에 붙인다(limit 공유). */
function attachChildren(
  node: SceneNode,
  treeNode: TreeNode,
  ctx: SerializeContext,
  fullPath: string,
  hasChildren: boolean,
): void {
  const shouldTraverseChildren = ctx.maxDepth === -1 || ctx.currentDepth < ctx.maxDepth;
  if (!hasChildren || !shouldTraverseChildren) return;

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

/**
 * 여러 경로를 **한 왕복에** nodeId 로 해석한다. 부분 실패 허용.
 *
 * 호출자가 nodeId 를 스크립트에 손으로 옮겨 적게 만드는 구조를 없애기 위한 것 —
 * 캐시가 아니라 "싸게 다시 묻는" 경로다(캐시는 문서가 밖에서 바뀌면 조용히 엉뚱한 노드를 고친다).
 * 응답은 id 해석에 필요한 것만 싣는다(노드 상세를 다 실으면 배치의 의미가 없다).
 * 배경: docs/history/009-node-ids-were-copied-by-hand.md
 */
export function resolvePaths(
  paths: Array<string | string[]>,
  typeFilter?: string,
  pageId?: string,
): { results: Array<{ path: string; nodeId?: string; name?: string; type?: string; matches?: number; error?: string }> } {
  const page = pageId ? getPageById(pageId) : undefined;
  const results = paths.map((p) => {
    const label = Array.isArray(p) ? p.join('/') : p;
    try {
      const found = findNodesByPath(p, null, page || undefined);
      const filtered = typeFilter ? found.filter((n) => n.type === typeFilter) : found;
      if (filtered.length === 0) return { path: label, error: '해당 경로의 노드를 찾을 수 없습니다' };
      // 다중 매칭을 조용히 첫 번째로 고르지 않는다 — 어느 것을 골랐는지 모른 채 쓰면
      // "그럴듯하게 틀린 대상" 에 작업하게 된다. 개수를 함께 돌려 호출자가 판단하게 한다.
      return {
        path: label,
        nodeId: filtered[0].id,
        name: filtered[0].name,
        type: filtered[0].type,
        ...(filtered.length > 1 ? { matches: filtered.length } : {}),
      };
    } catch (error) {
      return { path: label, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return { results };
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
    // 문자열 path는 '/'를 계층 구분자로 쪼개므로, 이름 자체에 '/'가 든 노드는
    // 배열 형태로만 찾을 수 있다 — 실패 메시지에서 자가 교정을 유도한다.
    const slashHint = typeof path === 'string' && path.includes('/')
      ? ' (문자열 path는 "/"를 계층 구분자로 해석합니다 — 이름에 "/"가 포함된 노드라면 배열 형태로 전달하세요: path: ["' + path + '"])'
      : '';
    throw new Error(`경로 "${pathStr}"에 해당하는 노드를 찾을 수 없습니다${slashHint}`);
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
  omit?: TreeFilter;
  keep?: TreeFilter;
  limit?: number;
  pageId?: string;
  fields?: TreeFields;
  /** 'all' 모드에서도 절대좌표를 싣는다(컨테이너를 넘나드는 거리 계산용). */
  includeAbsolute?: boolean;
}): GetTreeResult {
  // filter(레거시 화이트리스트 prune)와 omit/keep 은 의미가 겹쳐 섞으면 결과를 예측할 수 없다.
  // 조용히 한쪽을 무시하면 "인자를 줬는데 아무 일도 안 일어남" 계열이 되므로 거부한다.
  if (options.filter && (options.omit || options.keep)) {
    throw new Error('filter 는 omit/keep 과 함께 쓸 수 없습니다 — filter 는 "매칭하지 않는 노드를 서브트리째 제외"(화이트리스트 prune)라 의미가 겹칩니다. 자르려면 omit, 깊은 곳의 특정 노드만 보려면 keep 을 쓰세요');
  }
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
  const skeletonCount = { value: 0 };
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
      omit: options.omit,
      keep: options.keep,
      limit: effectiveLimit,
      nodeCount,
      skeletonCount,
      parentPath: rootPath || '',
      fields: options.fields,
      includeAbsolute: options.includeAbsolute,
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
    // 스코프 노드 자신의 기하 정보 — lint 가 "자식이 이 컨테이너 안에 있는가"를 판정하는 데 쓴다.
    rootNode: startNode
      ? {
          id: startNode.id,
          name: startNode.name,
          type: startNode.type,
          boundingBox: {
            x: 'x' in startNode ? startNode.x : 0,
            y: 'y' in startNode ? startNode.y : 0,
            width: 'width' in startNode ? startNode.width : 0,
            height: 'height' in startNode ? startNode.height : 0,
          },
        }
      : undefined,
    children,
    truncated: nodeCount.value >= effectiveLimit,
    totalCount: nodeCount.value,
    // keep 을 쓴 호출만 — 매칭 노드(totalCount)와 경로 유지용 뼈대를 구분해 준다.
    ...(options.keep ? { skeletonCount: skeletonCount.value } : {}),
  };
}
