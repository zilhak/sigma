import type { TreeNode, TreeFilter, TreeFields, FindNodeResult, GetTreeResult, ComponentSpecStamp } from '@sigma/shared';
import { getPageById } from './page';
import { SPEC_STAMP_KEY } from './component-spec';

/** COMPONENT(자신) 또는 INSTANCE(mainComponent)의 sigma-spec 스탬프에서 alias를 읽는다.
 *  스탬프 없음/파싱 실패 시 undefined(예외를 던지지 않음 — lint 트리 순회 중 흔한 케이스). */
function readSpecAlias(node: SceneNode): string | undefined {
  const stampSource = node.type === 'INSTANCE' ? (node as InstanceNode).mainComponent
    : node.type === 'COMPONENT' ? (node as ComponentNode)
    : null;
  if (!stampSource) return undefined;
  const raw = stampSource.getPluginData(SPEC_STAMP_KEY);
  if (!raw) return undefined;
  try {
    return (JSON.parse(raw) as ComponentSpecStamp).alias;
  } catch {
    return undefined;
  }
}

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
  /**
   * 순회 예산. 큰 페이지의 전수 순회가 **Figma 메인 스레드를 오래 점유**하면 Figma 가
   * 플러그인을 죽이고 재시작한다 — 실측으로 그 뒤 pluginId 가 1분 간격으로 계속 바뀌며
   * 같은 파일에서 작업하던 다른 에이전트까지 함께 끊겼다. 그래서 주기적으로 스레드를
   * 양보하고(`yieldControl`), 예산을 넘기면 **죽는 대신 부분 결과를 돌려준다.**
   * 배경: docs/history/015-big-page-lint-killed-the-plugin.md
   */
  budget?: TraversalBudget;
}

/** 예산 추적 — 방문 수로 양보 시점을, 시각으로 중단 시점을 정한다. */
export interface TraversalBudget {
  /** 이 시각(Date.now 기준)을 넘기면 순회를 멈춘다. undefined 면 무제한 */
  deadline?: number;
  /** 마지막 양보 이후 방문한 노드 수 */
  sinceYield: number;
  /** 예산 초과로 중단됐는가 */
  timedOut: boolean;
}

/** 이 수만큼 방문할 때마다 메인 스레드를 놓아준다. */
const YIELD_EVERY = 2000;

export function createBudget(budgetMs?: number): TraversalBudget {
  return {
    deadline: typeof budgetMs === 'number' && budgetMs > 0 ? Date.now() + budgetMs : undefined,
    sinceYield: 0,
    timedOut: false,
  };
}

/**
 * 방문 1건을 기록하고, 필요하면 메인 스레드를 양보한다.
 * 반환값 false = 예산 소진, 호출자는 즉시 멈춰야 한다.
 */
async function tick(budget: TraversalBudget | undefined): Promise<boolean> {
  if (!budget) return true;
  if (budget.timedOut) return false;
  budget.sinceYield++;
  if (budget.sinceYield < YIELD_EVERY) return true;
  budget.sinceYield = 0;
  // setTimeout(0) 은 Figma 플러그인 런타임에서 제공된다. 이 한 줄이 "플러그인이 죽는다"와
  // "느리지만 끝난다"를 가른다 — 매크로태스크로 넘겨야 호스트가 하트비트를 처리할 수 있다.
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  if (budget.deadline !== undefined && Date.now() > budget.deadline) {
    budget.timedOut = true;
    return false;
  }
  return true;
}

/**
 * 노드의 meta 정보를 만든다.
 *
 * ⚠️ 자식뿐 아니라 **스코프 루트(rootNode)에도 같은 것을 실어야 한다.** meta 가 없으면 그 노드를
 * 보는 규칙이 값을 `undefined` 로 읽고, `component_description_empty` 는 "description 비어있음"
 * 오탐을, `hidden_leaf` 는 침묵을 낸다. 그래서 인라인이 아니라 함수로 뺐다.
 * 배경: docs/history/019-scope-root-skipped-by-name-rules.md
 */
function buildNodeMeta(node: SceneNode): TreeNode['meta'] {
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

  return meta;
}

/**
 * 이 노드가 INSTANCE **안쪽**에 있는가(자기 자신은 제외).
 *
 * ⚠️ lint 는 스코프 시작 노드의 **조상을 볼 수 없다**(트리에 자식만 담겨 온다). 그래서 인스턴스
 * 내부를 면제하는 규칙(default_name·stray_pixel·empty_container)이 스코프 루트에 대해서만
 * 면제를 못 걸고, 스펙이 만든 "Frame" 래퍼를 위반으로 올린다. 조상을 아는 것은 플러그인뿐이라
 * 여기서 판정해 실어 보낸다. 배경: docs/history/019-scope-root-skipped-by-name-rules.md
 */
function isInsideInstance(node: SceneNode): boolean {
  let current: BaseNode | null = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (current.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}

/**
 * SceneNode를 TreeNode로 직렬화
 */
export async function serializeTreeNode(node: SceneNode, ctx: SerializeContext): Promise<TreeNode | null> {
  // limit 체크
  if (ctx.limit !== undefined && ctx.nodeCount.value >= ctx.limit) {
    return null;
  }
  if (!(await tick(ctx.budget))) return null;

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
    await attachChildren(node, geoNode, ctx, fullPath, hasChildren);
    return finalizeKeep(geoNode, keepMatched, ctx);
  }

  const meta = buildNodeMeta(node);

  // 컴포넌트 스펙 스탬프의 alias(COMPONENT 자신 또는 INSTANCE의 mainComponent) — 이름과 무관하게
  // "이 노드가 어떤 스펙에서 왔는지" 식별 가능. content_above_annotation 규칙(anno/wire 판별)에 사용.
  if (node.type === 'INSTANCE' || node.type === 'COMPONENT') {
    const specAlias = readSpecAlias(node);
    if (specAlias) meta.specAlias = specAlias;
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

  await attachChildren(node, treeNode, ctx, fullPath, hasChildren);

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
async function attachChildren(
  node: SceneNode,
  treeNode: TreeNode,
  ctx: SerializeContext,
  fullPath: string,
  hasChildren: boolean,
): Promise<void> {
  const shouldTraverseChildren = ctx.maxDepth === -1 || ctx.currentDepth < ctx.maxDepth;
  if (!hasChildren || !shouldTraverseChildren) return;

  const children: TreeNode[] = [];
  const frameNode = node as FrameNode;

  for (const child of frameNode.children) {
    if (ctx.limit !== undefined && ctx.nodeCount.value >= ctx.limit) {
      break;
    }

    if (ctx.budget && ctx.budget.timedOut) break;
    const serializedChild = await serializeTreeNode(child, {
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
export async function findNodeWithDetails(
  path: string | string[],
  typeFilter?: string,
  pageId?: string
): Promise<FindNodeResult> {
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
    const serialized = await serializeTreeNode(node, {
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
export async function getTreeWithFilter(options: {
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
  /** 순회 예산(ms). 넘기면 죽는 대신 부분 결과 + timedOut 을 돌려준다. */
  budgetMs?: number;
}): Promise<GetTreeResult> {
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
  const budget = createBudget(options.budgetMs);

  // 탐색 대상 결정
  const targetChildren: readonly SceneNode[] = startNode && 'children' in startNode
    ? (startNode as FrameNode).children
    : targetPage.children;

  for (const child of targetChildren) {
    if (nodeCount.value >= effectiveLimit) break;

    if (budget.timedOut) break;
    const serialized = await serializeTreeNode(child, {
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
      budget,
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
    // meta 도 자식과 같은 것을 싣는다 — 이게 없으면 스코프 루트를 보는 규칙이 값을 못 읽어
    // component_description_empty 가 전건 오탐을 낸다. 배경: docs/history/019-scope-root-skipped-by-name-rules.md
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
          childCount: 'children' in startNode ? (startNode as FrameNode).children.length : 0,
          ...(options.fields === 'geometry' ? {} : { meta: buildNodeMeta(startNode) }),
        }
      : undefined,
    // 시작 노드의 **조상**은 트리에 없다 — 인스턴스 내부 면제를 스코프 루트에도 걸려면 이 판정이 필요하다.
    ...(startNode && isInsideInstance(startNode) ? { rootNodeInsideInstance: true } : {}),
    children,
    truncated: nodeCount.value >= effectiveLimit,
    totalCount: nodeCount.value,
    // 예산 소진으로 중단됐으면 결과는 부분이다 — 호출자가 "다 봤다"로 읽으면 안 된다.
    ...(budget.timedOut ? { timedOut: true } : {}),
    // keep 을 쓴 호출만 — 매칭 노드(totalCount)와 경로 유지용 뼈대를 구분해 준다.
    ...(options.keep ? { skeletonCount: skeletonCount.value } : {}),
  };
}
