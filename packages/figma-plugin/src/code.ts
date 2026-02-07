import type { ExtractedNode, ComputedStyles, RGBA, TreeNode, TreeFilter, FindNodeResult, GetTreeResult } from '@sigma/shared';

// UI 표시
figma.showUI(__html__, { width: 320, height: 400 });

// 마지막 생성 위치 추적
let lastCreatedPosition: { x: number; y: number } | null = null;
const OFFSET_X = 20; // 다음 프레임 X 오프셋
const OFFSET_Y = 20; // 다음 프레임 Y 오프셋

// Plugin Data Key
const PLUGIN_DATA_KEY = 'sigma-file-key';

// 저장된 fileKey 가져오기
function getStoredFileKey(): string | null {
  const stored = figma.root.getPluginData(PLUGIN_DATA_KEY);
  return stored || null;
}

// fileKey 저장하기
function saveFileKey(fileKey: string) {
  figma.root.setPluginData(PLUGIN_DATA_KEY, fileKey);
}

// 유효한 fileKey 가져오기 (Figma API > 저장된 값)
function getEffectiveFileKey(): { fileKey: string | null; source: 'api' | 'stored' | 'none' } {
  if (figma.fileKey) {
    return { fileKey: figma.fileKey, source: 'api' };
  }
  const stored = getStoredFileKey();
  if (stored) {
    return { fileKey: stored, source: 'stored' };
  }
  return { fileKey: null, source: 'none' };
}

// 모든 페이지 목록 가져오기
function getAllPages(): Array<{ id: string; name: string }> {
  return figma.root.children.map((page) => ({
    id: page.id,
    name: page.name,
  }));
}

// 페이지 ID로 페이지 찾기
function getPageById(pageId: string): PageNode | null {
  // 현재 페이지 먼저 체크 (빠른 경로)
  if (figma.currentPage.id === pageId) {
    return figma.currentPage;
  }
  // 전체 페이지에서 검색
  for (const page of figma.root.children) {
    if (page.id === pageId) {
      return page;
    }
  }
  return null;
}

// 대상 페이지 결정 (pageId가 없으면 현재 페이지)
function getTargetPage(pageId?: string): PageNode {
  if (pageId) {
    const page = getPageById(pageId);
    if (page) {
      return page;
    }
    // pageId가 있지만 찾을 수 없으면 현재 페이지 사용
    console.warn(`Page not found: ${pageId}, using current page`);
  }
  return figma.currentPage;
}

// ===== 트리 탐색 헬퍼 함수 =====

/**
 * 노드의 전체 경로를 구함 (루트부터)
 */
function getNodeFullPath(node: SceneNode): string {
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
function findNodesByPath(path: string | string[], startNode: BaseNode | null): SceneNode[] {
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
interface SerializeContext {
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
function serializeTreeNode(node: SceneNode, ctx: SerializeContext): TreeNode | null {
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

// 파일 정보 전달 (전체 페이지 목록 포함)
function sendFileInfo() {
  const { fileKey, source } = getEffectiveFileKey();
  const pages = getAllPages();

  figma.ui.postMessage({
    type: 'file-info',
    fileKey,
    fileKeySource: source,
    storedFileKey: getStoredFileKey(),
    fileName: figma.root.name,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    pages,  // 전체 페이지 목록 추가
  });
}

// 초기 파일 정보 전달
sendFileInfo();

// 페이지 변경 시 업데이트
figma.on('currentpagechange', () => {
  sendFileInfo();
});

// 메시지 핸들러
figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
  switch (msg.type) {
    case 'create-from-json': {
      const position = msg.position as { x: number; y: number } | undefined;
      const pageId = msg.pageId as string | undefined;
      await createFrameFromJSON(msg.data as ExtractedNode, msg.name as string | undefined, position, pageId);
      break;
    }

    case 'create-from-html': {
      const htmlPosition = msg.position as { x: number; y: number } | undefined;
      const htmlPageId = msg.pageId as string | undefined;
      await createFrameFromHTML(msg.data as string, msg.name as string | undefined, htmlPosition, htmlPageId);
      break;
    }

    case 'update-frame': {
      const updateNodeId = msg.nodeId as string;
      const updateFormat = msg.format as 'json' | 'html';
      const updateName = msg.name as string | undefined;
      const updatePageId = msg.pageId as string | undefined;

      if (!updateNodeId) {
        figma.ui.postMessage({
          type: 'update-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      try {
        await updateExistingFrame(
          updateNodeId,
          updateFormat,
          updateFormat === 'html' ? msg.data as string : msg.data as ExtractedNode,
          updateName,
          updatePageId
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'update-result',
          success: false,
          error: errMsg,
        });
      }
      break;
    }

    case 'modify-node': {
      const modifyNodeId = msg.nodeId as string;
      const modifyMethod = msg.method as string;
      const modifyArgs = msg.args as Record<string, unknown>;

      if (!modifyNodeId) {
        figma.ui.postMessage({
          type: 'modify-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      if (!modifyMethod) {
        figma.ui.postMessage({
          type: 'modify-result',
          success: false,
          error: 'method가 필요합니다',
        });
        break;
      }

      try {
        const modifyResult = await executeModifyNode(modifyNodeId, modifyMethod, modifyArgs);
        figma.ui.postMessage({
          type: 'modify-result',
          success: true,
          result: modifyResult,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'modify-result',
          success: false,
          error: errMsg,
        });
      }
      break;
    }

    case 'get-pages':
      // 파일 내 모든 페이지 목록 반환
      const pages = getAllPages();
      figma.ui.postMessage({
        type: 'pages-list',
        pages,
        currentPageId: figma.currentPage.id,
      });
      break;

    case 'get-frames': {
      // 지정된 페이지 또는 현재 페이지의 모든 최상위 프레임 정보 반환
      const framesPageId = msg.pageId as string | undefined;
      const targetPage = getTargetPage(framesPageId);
      const frames = targetPage.children
        .filter((node): node is FrameNode => node.type === 'FRAME')
        .map((frame) => ({
          id: frame.id,
          name: frame.name,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
        }));
      figma.ui.postMessage({
        type: 'frames-list',
        frames,
        pageId: targetPage.id,
        pageName: targetPage.name,
      });
      break;
    }

    case 'delete-frame':
      const nodeId = msg.nodeId as string;
      if (!nodeId) {
        figma.ui.postMessage({
          type: 'delete-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      const nodeToDelete = figma.getNodeById(nodeId);
      if (!nodeToDelete) {
        figma.ui.postMessage({
          type: 'delete-result',
          success: false,
          error: `노드를 찾을 수 없습니다: ${nodeId}`,
        });
        break;
      }

      const deletedName = nodeToDelete.name;
      nodeToDelete.remove();
      figma.ui.postMessage({
        type: 'delete-result',
        success: true,
        result: { nodeId, name: deletedName },
      });
      break;

    case 'get-file-info':
      sendFileInfo();
      break;

    case 'save-file-key':
      const newFileKey = msg.fileKey as string;
      if (newFileKey && newFileKey.trim()) {
        saveFileKey(newFileKey.trim());
        figma.ui.postMessage({ type: 'success', message: 'File Key가 저장되었습니다.' });
        // 저장 후 파일 정보 다시 전달
        sendFileInfo();
      } else {
        figma.ui.postMessage({ type: 'error', message: 'File Key를 입력해주세요.' });
      }
      break;

    case 'resize':
      const { width, height } = msg.data as { width: number; height: number };
      figma.ui.resize(width, height);
      break;

    case 'reset-position':
      lastCreatedPosition = null;
      figma.ui.postMessage({ type: 'info', message: '위치가 리셋되었습니다.' });
      break;

    case 'extract-to-json': {
      // 선택된 노드를 JSON으로 추출
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'extract-result',
          format: 'json',
          success: false,
          error: '노드를 선택해주세요.',
        });
        break;
      }

      const extractedNodes: ExtractedNode[] = [];
      for (const node of selection) {
        const extracted = extractNodeToJSON(node);
        if (extracted) {
          extractedNodes.push(extracted);
        }
      }

      if (extractedNodes.length === 0) {
        figma.ui.postMessage({
          type: 'extract-result',
          format: 'json',
          success: false,
          error: '추출 가능한 노드가 없습니다.',
        });
        break;
      }

      // 단일 노드면 객체로, 여러 노드면 배열로
      const resultData = extractedNodes.length === 1 ? extractedNodes[0] : extractedNodes;
      figma.ui.postMessage({
        type: 'extract-result',
        format: 'json',
        success: true,
        data: resultData,
      });
      break;
    }

    case 'extract-to-html': {
      // 선택된 노드를 HTML로 추출
      const htmlSelection = figma.currentPage.selection;
      if (htmlSelection.length === 0) {
        figma.ui.postMessage({
          type: 'extract-result',
          format: 'html',
          success: false,
          error: '노드를 선택해주세요.',
        });
        break;
      }

      const htmlParts: string[] = [];
      for (const node of htmlSelection) {
        const extracted = extractNodeToJSON(node);
        if (extracted) {
          htmlParts.push(convertExtractedNodeToHTML(extracted));
        }
      }

      if (htmlParts.length === 0) {
        figma.ui.postMessage({
          type: 'extract-result',
          format: 'html',
          success: false,
          error: '추출 가능한 노드가 없습니다.',
        });
        break;
      }

      figma.ui.postMessage({
        type: 'extract-result',
        format: 'html',
        success: true,
        data: htmlParts.join('\n'),
      });
      break;
    }

    case 'test-roundtrip-json': {
      // JSON 라운드트립 테스트
      const jsonData = msg.data as ExtractedNode;
      const jsonName = msg.name as string | undefined;

      if (!jsonData) {
        figma.ui.postMessage({
          type: 'roundtrip-result',
          format: 'json',
          success: false,
          error: 'JSON 데이터가 필요합니다.',
        });
        break;
      }

      const jsonResult = await testRoundtripJSON(jsonData, jsonName);
      figma.ui.postMessage({
        type: 'roundtrip-result',
        format: 'json',
        ...jsonResult,
      });
      break;
    }

    case 'test-roundtrip-html': {
      // HTML 라운드트립 테스트
      const htmlData = msg.data as string;
      const htmlName = msg.name as string | undefined;

      if (!htmlData) {
        figma.ui.postMessage({
          type: 'roundtrip-result',
          format: 'html',
          success: false,
          error: 'HTML 데이터가 필요합니다.',
        });
        break;
      }

      const htmlResult = await testRoundtripHTML(htmlData, htmlName);
      figma.ui.postMessage({
        type: 'roundtrip-result',
        format: 'html',
        ...htmlResult,
      });
      break;
    }

    case 'find-node': {
      const findPath = msg.path as string | string[];
      const findTypeFilter = msg.typeFilter as string | undefined;

      if (!findPath) {
        figma.ui.postMessage({
          type: 'find-node-result',
          success: false,
          error: 'path가 필요합니다',
        });
        break;
      }

      const foundNodes = findNodesByPath(findPath, null);

      // 타입 필터 적용
      const filteredNodes = findTypeFilter
        ? foundNodes.filter(n => n.type === findTypeFilter)
        : foundNodes;

      if (filteredNodes.length === 0) {
        const pathStr = Array.isArray(findPath) ? findPath.join('/') : findPath;
        figma.ui.postMessage({
          type: 'find-node-result',
          success: false,
          error: `경로 "${pathStr}"에 해당하는 노드를 찾을 수 없습니다`,
        });
        break;
      }

      // 찾은 노드들을 직렬화 (자식은 포함하지 않음, depth=0)
      const serializedNodes: TreeNode[] = [];
      for (const node of filteredNodes) {
        const serialized = serializeTreeNode(node, {
          currentDepth: 0,
          maxDepth: 0,  // 자식 포함 안 함
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
        const result: FindNodeResult = { node: serializedNodes[0] };
        figma.ui.postMessage({
          type: 'find-node-result',
          success: true,
          result,
        });
      } else {
        const result: FindNodeResult = {
          matches: serializedNodes,
          warning: `${serializedNodes.length}개의 노드가 발견되었습니다. 더 구체적인 경로를 사용하세요.`,
        };
        figma.ui.postMessage({
          type: 'find-node-result',
          success: true,
          result,
        });
      }
      break;
    }

    case 'get-tree': {
      const treeNodeId = msg.nodeId as string | undefined;
      const treePath = msg.path as string | string[] | undefined;
      const requestedDepth = msg.depth as number | string | undefined;
      const treeFilter = msg.filter as TreeFilter | undefined;
      const treeLimit = msg.limit as number | undefined;
      const treePageId = msg.pageId as string | undefined;

      // maxDepth 결정 (-1 또는 "full"은 무한, 기본값 1)
      let maxDepth = 1;
      if (requestedDepth === 'full' || requestedDepth === -1) {
        maxDepth = -1;
      } else if (typeof requestedDepth === 'number') {
        maxDepth = Math.min(requestedDepth, 50);  // 최대 50으로 제한
      }

      // 대상 페이지 결정
      const targetPage = treePageId ? getPageById(treePageId) : figma.currentPage;
      if (!targetPage) {
        figma.ui.postMessage({
          type: 'tree-result',
          success: false,
          error: `페이지를 찾을 수 없습니다: ${treePageId}`,
        });
        break;
      }

      // 시작 노드 결정
      let startNode: SceneNode | null = null;
      let rootPath: string | undefined = undefined;

      if (treeNodeId) {
        const nodeById = figma.getNodeById(treeNodeId);
        if (!nodeById || nodeById.type === 'DOCUMENT' || nodeById.type === 'PAGE') {
          figma.ui.postMessage({
            type: 'tree-result',
            success: false,
            error: `노드를 찾을 수 없습니다: ${treeNodeId}`,
          });
          break;
        }
        startNode = nodeById as SceneNode;
        rootPath = getNodeFullPath(startNode);
      } else if (treePath) {
        const found = findNodesByPath(treePath, null);
        if (found.length === 0) {
          const pathStr = Array.isArray(treePath) ? treePath.join('/') : treePath;
          figma.ui.postMessage({
            type: 'tree-result',
            success: false,
            error: `경로에 해당하는 노드를 찾을 수 없습니다: ${pathStr}`,
          });
          break;
        }
        startNode = found[0];  // 첫 번째 매칭 사용
        rootPath = Array.isArray(treePath) ? treePath.join('/') : treePath;
        if (found.length > 1) {
          console.warn(`[get-tree] 다중 매칭: ${found.length}개 중 첫 번째 사용`);
        }
      }

      // 탐색 및 직렬화
      const nodeCount = { value: 0 };
      const children: TreeNode[] = [];
      const effectiveLimit = treeLimit !== undefined ? treeLimit : 1000;  // 기본 limit 1000

      // 탐색 대상 결정
      const targetChildren: readonly SceneNode[] = startNode && 'children' in startNode
        ? (startNode as FrameNode).children
        : targetPage.children;

      for (const child of targetChildren) {
        if (nodeCount.value >= effectiveLimit) break;

        const serialized = serializeTreeNode(child, {
          currentDepth: 0,
          maxDepth,
          filter: treeFilter,
          limit: effectiveLimit,
          nodeCount,
          parentPath: rootPath || '',
        });

        if (serialized) {
          children.push(serialized);
        }
      }

      const treeResult: GetTreeResult = {
        pageId: targetPage.id,
        pageName: targetPage.name,
        rootNodeId: startNode ? startNode.id : null,
        rootNodePath: rootPath,
        children,
        truncated: nodeCount.value >= effectiveLimit,
        totalCount: nodeCount.value,
      };

      figma.ui.postMessage({
        type: 'tree-result',
        success: true,
        result: treeResult,
      });
      break;
    }

    case 'cancel':
      figma.closePlugin();
      break;
  }
};

/**
 * JSON 데이터로 Figma 프레임 생성
 */
async function createFrameFromJSON(node: ExtractedNode, name?: string, position?: { x: number; y: number }, pageId?: string) {
  try {
    // 대상 페이지 결정
    const targetPage = getTargetPage(pageId);
    const isCurrentPage = targetPage.id === figma.currentPage.id;

    // 폰트 로드 (영문 + 한글)
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    // 노드 생성
    const frame = await createFigmaNode(node);

    if (frame) {
      // 이름 설정
      frame.name = name || node.className || node.tagName;

      // 위치 결정: 명시적 좌표 > 이전 위치 오프셋 > 뷰포트 중앙
      if (position) {
        frame.x = position.x;
        frame.y = position.y;
      } else if (lastCreatedPosition) {
        frame.x = lastCreatedPosition.x + OFFSET_X;
        frame.y = lastCreatedPosition.y + OFFSET_Y;
      } else {
        const center = figma.viewport.center;
        frame.x = center.x - frame.width / 2;
        frame.y = center.y - frame.height / 2;
      }

      // 마지막 위치 저장
      lastCreatedPosition = { x: frame.x, y: frame.y };

      // 대상 페이지에 추가
      targetPage.appendChild(frame);

      // 현재 페이지인 경우에만 선택 및 뷰포트 이동
      if (isCurrentPage) {
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
      }

      const pageInfo = isCurrentPage ? '' : ` (페이지: ${targetPage.name})`;
      figma.ui.postMessage({ type: 'success', message: `프레임이 생성되었습니다!${pageInfo}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({ type: 'error', message });
  }
}

/**
 * ExtractedNode를 Figma 노드로 변환
 * @param node - 추출된 노드 데이터
 * @param isRoot - 루트(최상위) 노드 여부 (기본값: true)
 */
async function createFigmaNode(node: ExtractedNode, isRoot: boolean = true): Promise<FrameNode | TextNode | null> {
  const { styles, textContent, boundingRect } = node;
  const children = node.children || [];

  // SVG 요소인 경우: createNodeFromSvg 사용
  if (node.svgString && node.tagName === 'svg') {
    return createSvgNode(node);
  }

  // 이미지 요소 처리 (img, canvas)
  if (node.tagName === 'img' || node.tagName === 'canvas') {
    return createImageNode(node);
  }

  // Pseudo-element 처리 (::before, ::after)
  if (node.isPseudo || node.tagName === '::before' || node.tagName === '::after') {
    return createPseudoElementNode(node);
  }

  // 텍스트만 있는 요소 (자식 없고 텍스트만)
  if (isTextOnlyElement(node)) {
    return createTextNode(textContent, styles);
  }

  // 프레임 생성
  const frame = figma.createFrame();

  // 크기 설정
  const width = typeof styles.width === 'number' ? styles.width : boundingRect.width;
  const height = typeof styles.height === 'number' ? styles.height : boundingRect.height;
  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // Grid 컨테이너인 경우 별도 처리
  const isGridContainer = styles.display === 'grid' || styles.display === 'inline-grid';

  // overflow → clipsContent: hidden/clip/scroll/auto면 클리핑, visible이면 해제
  if (styles.overflow === 'hidden' || styles.overflow === 'clip' ||
      styles.overflow === 'scroll' || styles.overflow === 'auto') {
    frame.clipsContent = true;
  } else {
    frame.clipsContent = false;
  }

  // 배경색 설정 (루트 프레임은 투명 배경을 흰색으로 대체)
  applyBackground(frame, styles, isRoot);

  // 테두리 설정
  applyBorder(frame, styles);

  // 모서리 라운드 설정
  applyCornerRadius(frame, styles);

  // 그림자 설정
  applyBoxShadow(frame, styles);

  // 불투명도 설정
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  if (isGridContainer && children.length > 0) {
    // ── CSS Grid → 중첩 Auto Layout 변환 ──
    // 패딩은 grid 부모에도 적용
    applyPadding(frame, styles);

    // 정렬 설정
    applyAlignment(frame, styles, children);

    // Grid 레이아웃 생성 (내부에서 layoutMode 설정)
    await createGridLayout(frame, node, isRoot);

    // Auto Layout 크기 모드 설정
    if (frame.layoutMode !== 'NONE') {
      applySizingMode(frame, styles, isRoot);
    }
  } else {
    // ── 기존 Flex/Block 레이아웃 경로 ──
    // 레이아웃 모드 설정 (children 전달하여 inline-block 자식 감지)
    applyLayoutMode(frame, styles, children);

    // Auto Layout 크기 모드 설정 (FIXED가 아닌 적절한 모드 사용)
    if (frame.layoutMode !== 'NONE') {
      applySizingMode(frame, styles, isRoot);
    }

    // 정렬 설정 (children 전달하여 space-between 보정)
    applyAlignment(frame, styles, children);

    // 패딩 설정
    applyPadding(frame, styles);

    // 부모의 텍스트 콘텐츠 먼저 추가 (자식이 있어도 부모 텍스트가 있으면 추가)
    if (textContent) {
      const textNode = createTextNode(textContent, styles);
      if (textNode) {
        frame.appendChild(textNode);

        // table-cell 내부 텍스트: 셀 너비를 채워 textAlign이 시각적으로 반영되도록
        if (styles.display === 'table-cell' && frame.layoutMode !== 'NONE') {
          textNode.layoutAlign = 'STRETCH';
          textNode.textAutoResize = 'HEIGHT';
        }
      }
    }

    // 자식 노드 추가 (isRoot: false로 호출하여 투명 배경 유지)
    for (const child of children) {
      const childNode = await createFigmaNode(child, false);
      if (childNode) {
        frame.appendChild(childNode);

        // 부모의 정렬 설정에 따라 자식의 layoutAlign 설정
        // Figma에서 자식 요소가 부모의 정렬을 따르도록 명시적 설정
        if (frame.layoutMode !== 'NONE' && 'layoutAlign' in childNode) {
          const childFrame = childNode as FrameNode;

          // 부모가 center 정렬인 경우 자식도 center로 설정
          if (frame.counterAxisAlignItems === 'CENTER') {
            childFrame.layoutAlign = 'INHERIT';
          }

          // table-cell: 행 내 공간을 균등 분배 (table-row 부모 또는 anonymous table box)
          const childStyles = child.styles;
          if (childStyles && childStyles.display === 'table-cell') {
            childFrame.layoutGrow = 1;
            childFrame.layoutAlign = 'STRETCH';
          }

          // flexGrow 적용: CSS flex-grow > 0이면 Figma에서 FILL로 설정
          if (childStyles && childStyles.flexGrow > 0) {
            childFrame.layoutGrow = childStyles.flexGrow;
          }

          // alignSelf 적용: 개별 아이템의 교차축 정렬
          if (childStyles && childStyles.alignSelf) {
            switch (childStyles.alignSelf) {
              case 'center':
                childFrame.layoutAlign = 'CENTER';
                break;
              case 'flex-start':
              case 'start':
                childFrame.layoutAlign = 'MIN';
                break;
              case 'flex-end':
              case 'end':
                childFrame.layoutAlign = 'MAX';
                break;
              case 'stretch':
                childFrame.layoutAlign = 'STRETCH';
                break;
              // 'auto'나 다른 값은 부모의 alignItems를 따름 (INHERIT)
            }
          }

          // NOTE: 자동 중앙 정렬 휴리스틱 제거됨
          // 이전에 자식 위치 기반으로 CENTER를 강제 적용하는 로직이 있었으나,
          // 이는 원본 CSS 스타일을 무시하고 잘못된 정렬을 만들었음.
          // 이제는 원본 스타일의 justifyContent/alignItems만 반영함.
        }
      }
    }

    // 자식 요소의 CSS margin을 부모의 itemSpacing/padding으로 변환
    applyChildMargins(frame, children);
  }

  return frame;
}

/**
 * 텍스트 전용 요소인지 확인
 */
function isTextOnlyElement(node: ExtractedNode): boolean {
  const textTags = ['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label', 'strong', 'em', 'b', 'i'];

  if (!textTags.includes(node.tagName)) return false;
  if (node.children && node.children.length > 0) return false;
  if (!node.textContent) return false;

  // 배경색, 패딩, 테두리가 있으면 프레임으로 처리 (TextNode는 stroke 미지원)
  const { styles } = node;
  if (styles.backgroundColor && styles.backgroundColor.a > 0) return false;
  if (styles.paddingTop > 0 || styles.paddingBottom > 0) return false;
  if (styles.paddingLeft > 0 || styles.paddingRight > 0) return false;
  if (styles.borderTopWidth > 0 || styles.borderRightWidth > 0 ||
      styles.borderBottomWidth > 0 || styles.borderLeftWidth > 0) return false;

  return true;
}

/**
 * 텍스트 노드 생성
 */
function createTextNode(text: string, styles: ComputedStyles): TextNode | null {
  if (!text) return null;

  const textNode = figma.createText();
  textNode.characters = text;

  // 폰트 크기
  textNode.fontSize = styles.fontSize || 14;

  // 폰트 스타일
  const weight = parseInt(styles.fontWeight) || 400;
  let fontStyle = 'Regular';
  if (weight >= 700) fontStyle = 'Bold';
  else if (weight >= 600) fontStyle = 'Semi Bold';
  else if (weight >= 500) fontStyle = 'Medium';

  textNode.fontName = { family: 'Inter', style: fontStyle };

  // 텍스트 색상
  if (styles.color) {
    textNode.fills = [createSolidPaint(styles.color)];
  }

  // 줄 높이
  if (styles.lineHeight != null && styles.lineHeight > 0) {
    textNode.lineHeight = { value: styles.lineHeight, unit: 'PIXELS' };
  }

  // 자간
  if (styles.letterSpacing != null && styles.letterSpacing !== 0) {
    textNode.letterSpacing = { value: styles.letterSpacing, unit: 'PIXELS' };
  }

  // 텍스트 정렬
  switch (styles.textAlign) {
    case 'center':
      textNode.textAlignHorizontal = 'CENTER';
      break;
    case 'right':
      textNode.textAlignHorizontal = 'RIGHT';
      break;
    case 'justify':
      textNode.textAlignHorizontal = 'JUSTIFIED';
      break;
    default:
      textNode.textAlignHorizontal = 'LEFT';
  }

  // 텍스트 자동 리사이즈 모드 설정 (텍스트 잘림 방지)
  // WIDTH_AND_HEIGHT: 텍스트 내용에 맞게 너비와 높이 자동 조정
  textNode.textAutoResize = 'WIDTH_AND_HEIGHT';

  return textNode;
}

/**
 * Pseudo-element (::before, ::after) 노드 생성
 * CSS pseudo-elements는 주로 장식 요소나 아이콘으로 사용됨
 */
function createPseudoElementNode(node: ExtractedNode): FrameNode | TextNode | null {
  const { styles, textContent, boundingRect } = node;

  // 텍스트 콘텐츠만 있는 경우 (예: content: "•" 같은 장식 문자)
  if (textContent && !hasVisualStyles(styles)) {
    return createTextNode(textContent, styles);
  }

  // 시각적 스타일이 있는 경우 프레임으로 생성
  const frame = figma.createFrame();
  frame.name = node.tagName; // '::before' 또는 '::after'

  // 크기 설정 (pseudo-element는 주로 고정 크기)
  const width = typeof styles.width === 'number' && styles.width > 0
    ? styles.width
    : boundingRect.width > 0 ? boundingRect.width : 16;
  const height = typeof styles.height === 'number' && styles.height > 0
    ? styles.height
    : boundingRect.height > 0 ? boundingRect.height : 16;

  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // 배경색 적용
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    frame.fills = [createSolidPaint(styles.backgroundColor)];
  } else {
    frame.fills = [];
  }

  // 테두리 적용
  applyBorder(frame, styles);

  // 모서리 라운드 적용
  applyCornerRadius(frame, styles);

  // 불투명도
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  // 텍스트 콘텐츠가 있으면 내부에 추가
  if (textContent) {
    const textNode = createTextNode(textContent, styles);
    if (textNode) {
      frame.layoutMode = 'HORIZONTAL';
      // 원본 스타일의 textAlign을 반영
      switch (styles.textAlign) {
        case 'center':
          frame.primaryAxisAlignItems = 'CENTER';
          break;
        case 'right':
        case 'end':
          frame.primaryAxisAlignItems = 'MAX';
          break;
        default:
          // 'left', 'start', 기타: 좌측 정렬
          frame.primaryAxisAlignItems = 'MIN';
      }
      frame.counterAxisAlignItems = 'CENTER';
      frame.appendChild(textNode);
    }
  }

  return frame;
}

/**
 * 시각적 스타일이 있는지 확인 (배경, 테두리 등)
 */
function hasVisualStyles(styles: ComputedStyles): boolean {
  // 배경색이 있는 경우
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    return true;
  }

  // 테두리가 있는 경우
  if (styles.borderTopWidth > 0 || styles.borderRightWidth > 0 ||
      styles.borderBottomWidth > 0 || styles.borderLeftWidth > 0) {
    return true;
  }

  // 고정 크기가 있는 경우 (장식 박스일 수 있음)
  if (typeof styles.width === 'number' && styles.width > 0 &&
      typeof styles.height === 'number' && styles.height > 0) {
    return true;
  }

  return false;
}

/**
 * SVG 문자열에서 CSS 변수를 fallback 값으로 치환
 * Figma의 createNodeFromSvg()는 CSS 변수를 처리하지 못하므로
 * var(--name, fallback) → fallback 으로 변환
 */
function resolveCssVariablesInSvg(svgString: string): string {
  // var(--variable-name, fallback-value) 패턴 매칭
  // fallback 값에 괄호가 포함될 수 있으므로 (예: rgb()), 재귀적으로 처리
  let result = svgString;
  let prevResult = '';

  // 변경이 없을 때까지 반복 (중첩 var() 처리)
  while (result !== prevResult) {
    prevResult = result;
    // var( 뒤에 변수명, 그리고 fallback 값 추출
    result = result.replace(/var\(\s*--[^,)]+\s*,\s*([^)]+)\)/g, (match, fallback) => {
      // fallback 값이 또 다른 var()일 경우 재귀 처리됨
      return fallback.trim();
    });
  }

  return result;
}

/**
 * SVG 노드 생성
 * createNodeFromSvg는 SVG 문자열을 직접 Figma FrameNode로 변환
 */
function createSvgNode(node: ExtractedNode): FrameNode | null {
  if (!node.svgString) return null;

  try {
    // CSS 변수를 fallback 값으로 치환
    const processedSvg = resolveCssVariablesInSvg(node.svgString);

    // Figma API로 SVG 문자열을 노드로 변환
    const svgFrame = figma.createNodeFromSvg(processedSvg);

    // 위치 및 크기는 SVG 자체에서 결정됨
    // 필요시 boundingRect로 크기 조정
    if (node.boundingRect.width > 0 && node.boundingRect.height > 0) {
      const currentWidth = svgFrame.width;
      const currentHeight = svgFrame.height;
      const targetWidth = node.boundingRect.width;
      const targetHeight = node.boundingRect.height;

      // SVG 크기가 추출된 크기와 다르면 스케일 조정
      if (Math.abs(currentWidth - targetWidth) > 1 || Math.abs(currentHeight - targetHeight) > 1) {
        svgFrame.resize(targetWidth, targetHeight);
      }
    }

    return svgFrame;
  } catch (error) {
    console.error('SVG 변환 실패:', error);
    // SVG 변환 실패 시 빈 프레임 반환
    const fallbackFrame = figma.createFrame();
    fallbackFrame.resize(
      node.boundingRect.width || 24,
      node.boundingRect.height || 24
    );
    fallbackFrame.name = 'SVG (변환 실패)';
    return fallbackFrame;
  }
}

/**
 * 이미지/캔버스 요소 처리
 * imageDataUrl이 있으면 실제 이미지를 Figma에 렌더링, 없으면 플레이스홀더 생성
 */
function createImageNode(node: ExtractedNode): FrameNode {
  const { styles, boundingRect, attributes } = node;

  const frame = figma.createFrame();

  // 크기 설정 (styles > boundingRect > 기본값)
  const width = typeof styles.width === 'number' && styles.width > 0
    ? styles.width
    : boundingRect.width > 0 ? boundingRect.width : 100;
  const height = typeof styles.height === 'number' && styles.height > 0
    ? styles.height
    : boundingRect.height > 0 ? boundingRect.height : 100;

  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // imageDataUrl이 있으면 실제 이미지 렌더링
  if (node.imageDataUrl) {
    try {
      // data:image/png;base64,xxxxx 에서 base64 부분만 추출
      const commaIndex = node.imageDataUrl.indexOf(',');
      if (commaIndex >= 0) {
        const base64Data = node.imageDataUrl.substring(commaIndex + 1);
        const imageBytes = figma.base64Decode(base64Data);
        const image = figma.createImage(imageBytes);
        frame.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
      } else {
        // base64 prefix 없는 경우 fallback
        frame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }];
      }
    } catch (error) {
      console.error('이미지 생성 실패:', error);
      // 실패 시 플레이스홀더
      frame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }];
      frame.strokes = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 1 }];
      frame.strokeWeight = 1;
    }
  } else {
    // imageDataUrl 없으면 플레이스홀더
    frame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }];
    frame.strokes = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 1 }];
    frame.strokeWeight = 1;
  }

  // 이름 설정
  const alt = attributes && attributes.alt ? attributes.alt : '';
  const src = attributes && attributes.src ? attributes.src : '';
  const tagPrefix = node.tagName === 'canvas' ? '[CANVAS]' : '[IMG]';
  const imageName = alt || (src ? (src.split('/').pop() || 'image') : (node.tagName === 'canvas' ? 'canvas' : 'image'));
  frame.name = tagPrefix + ' ' + imageName;

  // 모서리 라운드 적용
  applyCornerRadius(frame, styles);

  // 불투명도
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  return frame;
}

/**
 * Auto Layout 크기 모드 설정
 * CSS의 width/height 값에 따라 FIXED, HUG, 또는 FILL 모드 적용
 */
function applySizingMode(frame: FrameNode, styles: ComputedStyles, isRoot: boolean) {
  const { width, height } = styles;

  // 루트 프레임은 항상 FIXED (전체 크기 유지)
  if (isRoot) {
    frame.primaryAxisSizingMode = 'FIXED';
    frame.counterAxisSizingMode = 'FIXED';
    return;
  }

  // 가로(primary/counter) 설정
  // width: auto → HUG (콘텐츠에 맞춤)
  // width: 100% → FILL (부모에 맞춤) - Figma에서는 layoutGrow로 처리
  // width: number → FIXED
  if (width === 'auto') {
    // HORIZONTAL 레이아웃이면 primaryAxis가 width
    if (frame.layoutMode === 'HORIZONTAL') {
      frame.primaryAxisSizingMode = 'AUTO'; // HUG
    } else {
      frame.counterAxisSizingMode = 'AUTO'; // HUG
    }
  } else {
    if (frame.layoutMode === 'HORIZONTAL') {
      frame.primaryAxisSizingMode = 'FIXED';
    } else {
      frame.counterAxisSizingMode = 'FIXED';
    }
  }

  // height 설정
  if (height === 'auto') {
    if (frame.layoutMode === 'VERTICAL') {
      frame.primaryAxisSizingMode = 'AUTO'; // HUG
    } else {
      frame.counterAxisSizingMode = 'AUTO'; // HUG
    }
  } else {
    if (frame.layoutMode === 'VERTICAL') {
      frame.primaryAxisSizingMode = 'FIXED';
    } else {
      frame.counterAxisSizingMode = 'FIXED';
    }
  }
}

// ============================================================
// CSS Grid → Figma Auto Layout 변환
// ============================================================

interface GridTrack {
  type: 'fr' | 'auto' | 'fixed';
  value: number;
}

interface GridCell {
  column: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  child: ExtractedNode;
}

/**
 * CSS grid-template-columns/rows 값을 파싱
 * getComputedStyle은 resolved px 값("156.469px 73.0312px")을 반환하므로
 * 원본 fr/auto 정보는 유실됨. 두 형식 모두 처리.
 */
function parseGridTemplate(template: string): GridTrack[] {
  if (!template || template === 'none') return [];

  const tracks: GridTrack[] = [];
  const parts = template.split(/\s+/).filter(function(p) { return p.length > 0; });

  for (const part of parts) {
    if (part.endsWith('fr')) {
      const val = parseFloat(part);
      tracks.push({ type: 'fr', value: isNaN(val) ? 1 : val });
    } else if (part === 'auto' || part === 'min-content' || part === 'max-content') {
      tracks.push({ type: 'auto', value: 0 });
    } else if (part.endsWith('px') || part.endsWith('%') || !isNaN(parseFloat(part))) {
      tracks.push({ type: 'fixed', value: parseFloat(part) || 0 });
    }
  }

  return tracks;
}

/**
 * CSS grid-column-start/end, grid-row-start/end 값을 파싱
 * "auto" → start=-1, "span 2" → span=2, "2" → start=2
 */
function parseGridPlacement(startStr: string, endStr: string): { start: number; span: number } {
  const startNum = parseInt(startStr, 10);
  const start = isNaN(startNum) ? -1 : startNum; // -1 means auto

  if (endStr && endStr.startsWith('span')) {
    const spanVal = parseInt(endStr.replace('span', '').trim(), 10);
    return { start: start, span: isNaN(spanVal) ? 1 : spanVal };
  }

  const endNum = parseInt(endStr, 10);
  if (!isNaN(endNum) && start > 0) {
    return { start: start, span: Math.max(1, endNum - start) };
  }

  return { start: start, span: 1 };
}

/**
 * 자식 노드들을 그리드 셀에 배치
 * CSS Grid auto-placement 알고리즘의 간소화 버전
 */
function assignChildrenToGrid(children: ExtractedNode[], colCount: number): GridCell[] {
  const cells: GridCell[] = [];
  const occupied = new Set<string>();

  // CSS Grid spec: 명시적 배치 아이템을 먼저 배치, 그 후 auto 아이템 배치
  // Phase 1: 명시적 배치 (gridColumnStart가 auto가 아닌 아이템)
  const explicitChildren: Array<{ index: number; child: ExtractedNode }> = [];
  const autoChildren: Array<{ index: number; child: ExtractedNode }> = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const styles = child.styles;
    const colStart = styles ? styles.gridColumnStart : 'auto';
    const rowStart = styles ? styles.gridRowStart : 'auto';

    if (colStart !== 'auto' && rowStart !== 'auto') {
      explicitChildren.push({ index: i, child: child });
    } else {
      autoChildren.push({ index: i, child: child });
    }
  }

  // 명시적 배치 아이템 먼저 처리
  for (const item of explicitChildren) {
    const styles = item.child.styles;
    const colPlacement = parseGridPlacement(
      styles ? styles.gridColumnStart : 'auto',
      styles ? styles.gridColumnEnd : 'auto'
    );
    const rowPlacement = parseGridPlacement(
      styles ? styles.gridRowStart : 'auto',
      styles ? styles.gridRowEnd : 'auto'
    );

    const col = colPlacement.start > 0 ? colPlacement.start - 1 : 0;
    const row = rowPlacement.start > 0 ? rowPlacement.start - 1 : 0;
    const colSpan = colPlacement.span;
    const rowSpan = rowPlacement.span;

    for (let c = col; c < col + colSpan; c++) {
      for (let r = row; r < row + rowSpan; r++) {
        occupied.add(c + ',' + r);
      }
    }

    cells.push({ column: col, row: row, colSpan: colSpan, rowSpan: rowSpan, child: item.child });
  }

  // Phase 2: Auto 배치 아이템
  let autoCol = 0;
  let autoRow = 0;

  for (const item of autoChildren) {
    const styles = item.child.styles;
    const colPlacement = parseGridPlacement(
      styles ? styles.gridColumnStart : 'auto',
      styles ? styles.gridColumnEnd : 'auto'
    );
    const rowPlacement = parseGridPlacement(
      styles ? styles.gridRowStart : 'auto',
      styles ? styles.gridRowEnd : 'auto'
    );

    const colSpan = colPlacement.span;
    const rowSpan = rowPlacement.span;

    // 빈 셀 찾기
    while (true) {
      if (autoCol >= colCount) {
        autoCol = 0;
        autoRow++;
      }
      const key = autoCol + ',' + autoRow;
      if (!occupied.has(key)) break;
      autoCol++;
    }

    const col = autoCol;
    const row = autoRow;

    for (let c = col; c < col + colSpan; c++) {
      for (let r = row; r < row + rowSpan; r++) {
        occupied.add(c + ',' + r);
      }
    }

    cells.push({ column: col, row: row, colSpan: colSpan, rowSpan: rowSpan, child: item.child });

    autoCol = col + colSpan;
    if (autoCol >= colCount) {
      autoCol = 0;
      autoRow++;
    }
  }

  return cells;
}

/**
 * CSS Grid 컨테이너를 Figma 중첩 Auto Layout으로 변환
 *
 * 전략: 각 컬럼을 VERTICAL Auto Layout 프레임으로 만들고,
 * 부모를 HORIZONTAL Auto Layout으로 설정하여 컬럼을 나란히 배치.
 *
 * 예시 (2컬럼 그리드):
 *   HORIZONTAL Frame (grid container)
 *   ├── VERTICAL Frame (grid-col-1)
 *   │   ├── child A (row 0)
 *   │   └── child B (row 1)
 *   └── VERTICAL Frame (grid-col-2)
 *       └── child C (row 0, spanning rows)
 */
async function createGridLayout(
  frame: FrameNode,
  node: ExtractedNode,
  isRoot: boolean
): Promise<void> {
  const styles = node.styles;
  const children = node.children || [];

  if (children.length === 0) return;

  // 그리드 템플릿 파싱
  const columns = parseGridTemplate(styles.gridTemplateColumns);
  const colCount = columns.length > 0 ? columns.length : 1;

  // 1컬럼이면 단순 VERTICAL 레이아웃
  if (colCount <= 1) {
    frame.layoutMode = 'VERTICAL';

    const rowGap = styles.rowGap > 0 ? styles.rowGap : styles.gap;
    if (rowGap > 0) {
      frame.itemSpacing = rowGap;
    }

    for (const child of children) {
      const childNode = await createFigmaNode(child, false);
      if (childNode) {
        frame.appendChild(childNode);
      }
    }
    return;
  }

  // 다중 컬럼: 컬럼 래퍼 프레임 생성
  frame.layoutMode = 'HORIZONTAL';

  // columnGap → 부모 itemSpacing
  const colGap = styles.columnGap > 0 ? styles.columnGap : styles.gap;
  if (colGap > 0) {
    frame.itemSpacing = colGap;
  }

  const rowGap = styles.rowGap > 0 ? styles.rowGap : styles.gap;

  // 자식을 그리드 셀에 배치
  const cells = assignChildrenToGrid(children, colCount);

  // 컬럼별 그룹화
  const columnGroups: Map<number, GridCell[]> = new Map();
  for (let i = 0; i < colCount; i++) {
    columnGroups.set(i, []);
  }
  for (const cell of cells) {
    const group = columnGroups.get(cell.column);
    if (group) {
      group.push(cell);
    }
  }

  // 컬럼 래퍼 프레임 생성
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    const colCells = columnGroups.get(colIdx) || [];
    const track = columns[colIdx];

    // 행 순서대로 정렬
    colCells.sort(function(a, b) { return a.row - b.row; });

    const colWrapper = figma.createFrame();
    colWrapper.name = 'grid-col-' + (colIdx + 1);
    colWrapper.layoutMode = 'VERTICAL';
    colWrapper.fills = [];
    colWrapper.clipsContent = false;

    // 행 간격
    if (rowGap > 0) {
      colWrapper.itemSpacing = rowGap;
    }

    // 자식 노드 추가
    for (const cell of colCells) {
      const childNode = await createFigmaNode(cell.child, false);
      if (childNode) {
        colWrapper.appendChild(childNode);

        // 자식 정렬 적용
        if ('layoutAlign' in childNode) {
          const childFrame = childNode as FrameNode;
          const childStyles = cell.child.styles;

          if (childStyles && childStyles.alignSelf) {
            switch (childStyles.alignSelf) {
              case 'center':
                childFrame.layoutAlign = 'CENTER';
                break;
              case 'flex-start':
              case 'start':
                childFrame.layoutAlign = 'MIN';
                break;
              case 'flex-end':
              case 'end':
                childFrame.layoutAlign = 'MAX';
                break;
              case 'stretch':
                childFrame.layoutAlign = 'STRETCH';
                break;
            }
          }
        }
      }
    }

    // 부모에 먼저 추가 (FILL/layoutGrow는 auto-layout 자식이어야 설정 가능)
    frame.appendChild(colWrapper);

    // 트랙 타입에 따른 컬럼 크기 설정
    if (track && track.type === 'fixed') {
      colWrapper.resize(Math.max(track.value, 1), Math.max(frame.height, 1));
      colWrapper.layoutSizingHorizontal = 'FIXED';
    } else if (track && track.type === 'fr') {
      colWrapper.layoutGrow = track.value;
      colWrapper.layoutSizingHorizontal = 'FILL';
    } else {
      // auto - 콘텐츠에 맞춤
      colWrapper.layoutSizingHorizontal = 'HUG';
    }
    colWrapper.layoutSizingVertical = 'FILL';
  }
}

/**
 * 레이아웃 모드 적용
 * @param frame - Figma 프레임
 * @param styles - 부모 스타일
 * @param children - 자식 노드 배열 (선택, inline-block 자식 감지용)
 */
function applyLayoutMode(frame: FrameNode, styles: ComputedStyles, children?: ExtractedNode[]) {
  const { display, flexDirection } = styles;

  if (display === 'flex' || display === 'inline-flex') {
    frame.layoutMode = flexDirection === 'column' ? 'VERTICAL' : 'HORIZONTAL';
  } else if (display === 'grid' || display === 'inline-grid') {
    // CSS Grid는 기본적으로 행(row) 방향으로 아이템을 배치
    // grid-auto-flow: column인 경우 VERTICAL이지만, 기본값은 HORIZONTAL
    frame.layoutMode = 'HORIZONTAL';
  } else if (display === 'table' || display === 'table-row-group') {
    frame.layoutMode = 'VERTICAL';
  } else if (display === 'table-row') {
    frame.layoutMode = 'HORIZONTAL';
  } else if (display === 'table-cell') {
    // 테이블 셀은 내부 콘텐츠를 수직 배치
    frame.layoutMode = 'VERTICAL';
  } else if (display === 'inline' || display === 'inline-block') {
    frame.layoutMode = 'HORIZONTAL';
  } else {
    // block 등 기본값 → VERTICAL
    // 단, 자식이 inline-block인 경우 HORIZONTAL로 변경 (CSS 인라인 흐름 모방)
    const hasInlineBlockChildren = children && children.length > 0 && children.some(
      child => child.styles && (child.styles.display === 'inline-block' || child.styles.display === 'inline')
    );
    // table-cell 자식 감지: CSS anonymous table box 모방 (가로 배치)
    const hasTableCellChildren = children && children.length > 0 && children.some(
      child => child.styles && child.styles.display === 'table-cell'
    );

    if (hasInlineBlockChildren || hasTableCellChildren) {
      frame.layoutMode = 'HORIZONTAL';
    } else {
      frame.layoutMode = 'VERTICAL';
    }
  }

  // flexWrap 설정 (Auto Layout이 활성화된 경우에만)
  if (frame.layoutMode !== 'NONE' && styles.flexWrap === 'wrap') {
    frame.layoutWrap = 'WRAP';
  }

  // 갭 설정 - rowGap/columnGap이 있으면 우선 사용, 없으면 gap 사용
  if (frame.layoutMode !== 'NONE') {
    // Figma에서 itemSpacing은 주축 방향 간격
    // counterAxisSpacing은 교차축 방향 간격 (wrap 모드에서만 유효)
    const mainAxisGap = frame.layoutMode === 'HORIZONTAL'
      ? (styles.columnGap > 0 ? styles.columnGap : styles.gap)
      : (styles.rowGap > 0 ? styles.rowGap : styles.gap);

    const crossAxisGap = frame.layoutMode === 'HORIZONTAL'
      ? (styles.rowGap > 0 ? styles.rowGap : styles.gap)
      : (styles.columnGap > 0 ? styles.columnGap : styles.gap);

    if (mainAxisGap > 0) {
      frame.itemSpacing = mainAxisGap;
    }

    // counterAxisSpacing은 wrap 모드에서만 적용
    if (frame.layoutWrap === 'WRAP' && crossAxisGap > 0) {
      frame.counterAxisSpacing = crossAxisGap;
    }
  }
}

/**
 * 정렬 적용
 * @param frame - Figma 프레임
 * @param styles - 계산된 스타일
 * @param children - 자식 노드 배열 (선택, space-between 보정용)
 */
function applyAlignment(frame: FrameNode, styles: ComputedStyles, children?: ExtractedNode[]) {
  const { justifyContent, alignItems } = styles;
  const childCount = children ? children.length : 0;

  // 주축 정렬
  // NOTE: Figma와 CSS의 space-between 동작 차이 보정
  // - CSS: space-between + 1자식 = 자식이 시작점(왼쪽)에 위치
  // - Figma: SPACE_BETWEEN + 1자식 = 자식이 중앙에 위치 (버그 아님, 의도된 동작)
  // 따라서 자식이 1개일 때는 MIN(시작점)으로 변환
  switch (justifyContent) {
    case 'center':
      frame.primaryAxisAlignItems = 'CENTER';
      break;
    case 'flex-end':
    case 'end':
      frame.primaryAxisAlignItems = 'MAX';
      break;
    case 'space-between':
      // CSS와 Figma의 동작 차이 보정: 1자식일 때는 MIN으로
      frame.primaryAxisAlignItems = childCount <= 1 ? 'MIN' : 'SPACE_BETWEEN';
      break;
    default:
      frame.primaryAxisAlignItems = 'MIN';
  }

  // 교차축 정렬
  switch (alignItems) {
    case 'center':
      frame.counterAxisAlignItems = 'CENTER';
      break;
    case 'flex-end':
    case 'end':
      frame.counterAxisAlignItems = 'MAX';
      break;
    default:
      frame.counterAxisAlignItems = 'MIN';
  }
}

/**
 * 패딩 적용
 */
function applyPadding(frame: FrameNode, styles: ComputedStyles) {
  frame.paddingTop = styles.paddingTop || 0;
  frame.paddingRight = styles.paddingRight || 0;
  frame.paddingBottom = styles.paddingBottom || 0;
  frame.paddingLeft = styles.paddingLeft || 0;
}

/**
 * 배경색 적용
 * @param frame - Figma 프레임 노드
 * @param styles - 계산된 스타일
 * @param isRoot - 루트(최상위) 프레임 여부
 */
function applyBackground(frame: FrameNode, styles: ComputedStyles, isRoot: boolean = false) {
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    // 불투명한 배경색이 있으면 그대로 적용
    frame.fills = [createSolidPaint(styles.backgroundColor)];
  } else if (isRoot) {
    // 루트 프레임의 투명 배경 → 흰색 배경으로 대체
    // (Figma에서 빈 fills는 캔버스 배경(검은색/회색)이 노출됨)
    frame.fills = [createSolidPaint({ r: 1, g: 1, b: 1, a: 1 })];
  } else {
    // 자식 프레임의 투명 배경 → 빈 fills (부모 배경 비침)
    frame.fills = [];
  }
}

/**
 * 자식 요소의 CSS margin을 부모 Auto Layout의 itemSpacing/padding으로 변환
 * CSS margin collapsing: 인접 마진 중 큰 값 사용
 */
function applyChildMargins(frame: FrameNode, children: ExtractedNode[]) {
  if (frame.layoutMode === 'NONE' || children.length === 0) return;

  const isVertical = frame.layoutMode === 'VERTICAL';
  const leadingProp = isVertical ? 'marginTop' : 'marginLeft';
  const trailingProp = isVertical ? 'marginBottom' : 'marginRight';

  // 첫 자식의 leading margin → 부모 padding 시작 방향에 추가
  const firstStyles = children[0].styles;
  if (firstStyles) {
    const firstLeading = (firstStyles as any)[leadingProp] || 0;
    if (firstLeading > 0) {
      if (isVertical) {
        frame.paddingTop = (frame.paddingTop || 0) + firstLeading;
      } else {
        frame.paddingLeft = (frame.paddingLeft || 0) + firstLeading;
      }
    }
  }

  // 마지막 자식의 trailing margin → 부모 padding 끝 방향에 추가
  const lastStyles = children[children.length - 1].styles;
  if (lastStyles) {
    const lastTrailing = (lastStyles as any)[trailingProp] || 0;
    if (lastTrailing > 0) {
      if (isVertical) {
        frame.paddingBottom = (frame.paddingBottom || 0) + lastTrailing;
      } else {
        frame.paddingRight = (frame.paddingRight || 0) + lastTrailing;
      }
    }
  }

  // 인접 자식 간 margin → itemSpacing (gap이 이미 설정되지 않은 경우만)
  if (children.length > 1 && (frame.itemSpacing === 0 || frame.itemSpacing === undefined)) {
    let maxSpacing = 0;
    for (let i = 0; i < children.length - 1; i++) {
      const currentStyles = children[i].styles;
      const nextStyles = children[i + 1].styles;
      const currentTrailing = currentStyles ? ((currentStyles as any)[trailingProp] || 0) : 0;
      const nextLeading = nextStyles ? ((nextStyles as any)[leadingProp] || 0) : 0;
      // CSS margin collapsing: 인접 마진 중 큰 값
      const collapsed = Math.max(currentTrailing, nextLeading);
      if (collapsed > maxSpacing) {
        maxSpacing = collapsed;
      }
    }
    if (maxSpacing > 0) {
      frame.itemSpacing = maxSpacing;
    }
  }
}

/**
 * 테두리 적용
 */
function applyBorder(frame: FrameNode, styles: ComputedStyles) {
  const top = styles.borderTopWidth || 0;
  const right = styles.borderRightWidth || 0;
  const bottom = styles.borderBottomWidth || 0;
  const left = styles.borderLeftWidth || 0;

  const maxWidth = Math.max(top, right, bottom, left);
  if (maxWidth <= 0) return;

  // 가장 두꺼운 면의 색상 사용 (border-bottom만 있으면 borderBottomColor 사용)
  let borderColor: RGBA | null = null;
  if (top >= right && top >= bottom && top >= left) {
    borderColor = styles.borderTopColor;
  } else if (bottom >= top && bottom >= right && bottom >= left) {
    borderColor = styles.borderBottomColor;
  } else if (right >= top && right >= bottom && right >= left) {
    borderColor = styles.borderRightColor;
  } else {
    borderColor = styles.borderLeftColor;
  }

  // fallback: 아무 색상이나 찾기
  if (!borderColor) {
    borderColor = styles.borderTopColor || styles.borderRightColor
      || styles.borderBottomColor || styles.borderLeftColor;
  }
  if (!borderColor) return;

  frame.strokes = [createSolidPaint(borderColor)];

  // 4면 동일하면 uniform stroke, 다르면 per-side (IndividualStrokesMixin)
  const allEqual = (top === right && right === bottom && bottom === left);
  if (allEqual) {
    frame.strokeWeight = top;
  } else {
    frame.strokeTopWeight = top;
    frame.strokeRightWeight = right;
    frame.strokeBottomWeight = bottom;
    frame.strokeLeftWeight = left;
  }
}

/**
 * 모서리 라운드 적용
 */
function applyCornerRadius(frame: FrameNode, styles: ComputedStyles) {
  const { borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius } = styles;

  // 모두 같은 경우
  if (
    borderTopLeftRadius === borderTopRightRadius &&
    borderTopRightRadius === borderBottomRightRadius &&
    borderBottomRightRadius === borderBottomLeftRadius
  ) {
    frame.cornerRadius = borderTopLeftRadius || 0;
  } else {
    // 개별 설정
    frame.topLeftRadius = borderTopLeftRadius || 0;
    frame.topRightRadius = borderTopRightRadius || 0;
    frame.bottomRightRadius = borderBottomRightRadius || 0;
    frame.bottomLeftRadius = borderBottomLeftRadius || 0;
  }
}

/**
 * 그림자 적용 (다중 그림자 지원)
 */
function applyBoxShadow(frame: FrameNode, styles: ComputedStyles) {
  const { boxShadow } = styles;

  if (!boxShadow || boxShadow === 'none') return;

  const shadows = parseBoxShadows(boxShadow);
  if (shadows.length > 0) {
    frame.effects = shadows;
  }
}

/**
 * 다중 box-shadow CSS 파싱
 */
function parseBoxShadows(shadowStr: string): DropShadowEffect[] {
  const effects: DropShadowEffect[] = [];

  // 쉼표로 구분된 다중 그림자 분리 (rgba 내부의 쉼표 제외)
  const shadowParts = splitShadows(shadowStr);

  for (const part of shadowParts) {
    const shadow = parseSingleShadow(part.trim());
    if (shadow) {
      effects.push(shadow);
    }
  }

  return effects;
}

/**
 * 다중 그림자 문자열 분리 (rgba 내부 쉼표 무시)
 */
function splitShadows(shadowStr: string): string[] {
  const results: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (const char of shadowStr) {
    if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;
    else if (char === ',' && parenDepth === 0) {
      results.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    results.push(current.trim());
  }

  return results;
}

/**
 * 단일 box-shadow 파싱
 */
function parseSingleShadow(shadowStr: string): DropShadowEffect | null {
  // "rgba(0, 0, 0, 0.1) 0px 4px 6px 0px" 또는 "0px 4px 6px rgba(0, 0, 0, 0.1)" 형식

  // 색상 먼저 추출
  const colorMatch = shadowStr.match(/rgba?\s*\([^)]+\)/);
  if (!colorMatch) return null;

  const colorStr = colorMatch[0];
  const color = parseColorFromCSS(colorStr);
  if (!color) return null;

  // 색상 제거 후 숫자만 추출
  const numbersStr = shadowStr.replace(colorStr, '').trim();
  const numbers = numbersStr.match(/-?[\d.]+/g);

  if (!numbers || numbers.length < 2) return null;

  const offsetX = parseFloat(numbers[0]) || 0;
  const offsetY = parseFloat(numbers[1]) || 0;
  const blur = parseFloat(numbers[2]) || 0;
  const spread = parseFloat(numbers[3]) || 0;

  return {
    type: 'DROP_SHADOW',
    color: { r: color.r, g: color.g, b: color.b, a: color.a },
    offset: { x: offsetX, y: offsetY },
    radius: blur,
    spread: spread,
    visible: true,
    blendMode: 'NORMAL',
  };
}

/**
 * CSS 색상 문자열 파싱
 */
function parseColorFromCSS(colorStr: string): RGBA | null {
  const rgbaMatch = colorStr.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/
  );

  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  return null;
}

/**
 * Solid Paint 생성
 */
function createSolidPaint(color: RGBA): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a,
  };
}

// ============================================================
// HTML → Figma 변환
// ============================================================

/**
 * HTML 문자열로 Figma 프레임 생성
 */
async function createFrameFromHTML(html: string, name?: string, position?: { x: number; y: number }, pageId?: string) {
  try {
    // 대상 페이지 결정
    const targetPage = getTargetPage(pageId);
    const isCurrentPage = targetPage.id === figma.currentPage.id;

    // 폰트 로드
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    // HTML 파싱 → ExtractedNode 변환
    const node = parseHTML(html);
    if (!node) {
      figma.ui.postMessage({ type: 'error', message: 'HTML 파싱 실패' });
      return;
    }

    // 기존 JSON 변환 로직 재사용
    const frame = await createFigmaNode(node);

    if (frame) {
      frame.name = name || 'HTML Import';

      // 위치 결정
      if (position) {
        frame.x = position.x;
        frame.y = position.y;
      } else if (lastCreatedPosition) {
        frame.x = lastCreatedPosition.x + OFFSET_X;
        frame.y = lastCreatedPosition.y + OFFSET_Y;
      } else {
        const center = figma.viewport.center;
        frame.x = center.x - frame.width / 2;
        frame.y = center.y - frame.height / 2;
      }

      lastCreatedPosition = { x: frame.x, y: frame.y };

      // 대상 페이지에 추가
      targetPage.appendChild(frame);

      // 현재 페이지인 경우에만 선택 및 뷰포트 이동
      if (isCurrentPage) {
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
      }

      const pageInfo = isCurrentPage ? '' : ` (페이지: ${targetPage.name})`;
      figma.ui.postMessage({ type: 'success', message: `HTML에서 프레임이 생성되었습니다!${pageInfo}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({ type: 'error', message: `HTML 변환 오류: ${message}` });
  }
}

/**
 * 기존 프레임의 내용을 새 데이터로 전체 교체
 */
async function updateExistingFrame(
  nodeId: string,
  format: 'json' | 'html',
  data: ExtractedNode | string,
  name?: string,
  pageId?: string
) {
  // 1. 노드 찾기
  const targetNode = figma.getNodeById(nodeId);
  if (!targetNode) {
    figma.ui.postMessage({
      type: 'update-result',
      success: false,
      error: `노드를 찾을 수 없습니다: ${nodeId}`,
    });
    return;
  }

  // 2. 유효한 컨테이너 타입인지 확인
  if (targetNode.type !== 'FRAME' && targetNode.type !== 'SECTION' && targetNode.type !== 'COMPONENT') {
    figma.ui.postMessage({
      type: 'update-result',
      success: false,
      error: `노드 타입이 FRAME, SECTION, COMPONENT 중 하나여야 합니다. 현재: ${targetNode.type}`,
    });
    return;
  }

  const frame = targetNode as FrameNode;

  // 3. 폰트 로드
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // 4. 소스 데이터 결정
  let sourceNode: ExtractedNode;
  if (format === 'html') {
    const parsed = parseHTML(data as string);
    if (!parsed) {
      figma.ui.postMessage({
        type: 'update-result',
        success: false,
        error: 'HTML 파싱 실패',
      });
      return;
    }
    sourceNode = parsed;
  } else {
    sourceNode = data as ExtractedNode;
  }

  // 5. 기존 자식 모두 제거 (역순으로 제거하여 인덱스 안정성 보장)
  const childCount = frame.children.length;
  for (let i = childCount - 1; i >= 0; i--) {
    frame.children[i].remove();
  }

  // 6. 루트 레벨 스타일을 기존 프레임에 적용
  applyRootStylesToExistingFrame(frame, sourceNode);

  // 7. 새 자식 노드 재귀 생성 후 추가
  const sourceChildren = sourceNode.children || [];
  // 부모의 텍스트 콘텐츠 먼저 추가
  if (sourceNode.textContent) {
    const textNode = createTextNode(sourceNode.textContent, sourceNode.styles);
    if (textNode) {
      frame.appendChild(textNode);
    }
  }
  for (const child of sourceChildren) {
    const childNode = await createFigmaNode(child, false);
    if (childNode) {
      frame.appendChild(childNode);
    }
  }

  // 8. 이름 업데이트 (옵션)
  if (name) {
    frame.name = name;
  }

  // 9. 성공 응답
  figma.ui.postMessage({
    type: 'update-result',
    success: true,
    result: {
      nodeId: frame.id,
      name: frame.name,
      childCount: frame.children.length,
    },
  });
}

/**
 * 루트 레벨 스타일을 기존 프레임에 적용
 */
function applyRootStylesToExistingFrame(frame: FrameNode, sourceNode: ExtractedNode) {
  const { styles, boundingRect, children } = sourceNode;

  // 크기 설정
  const width = typeof styles.width === 'number' ? styles.width : boundingRect.width;
  const height = typeof styles.height === 'number' ? styles.height : boundingRect.height;
  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // 레이아웃 모드 설정
  applyLayoutMode(frame, styles, children);

  // Auto Layout 크기 모드 설정
  if (frame.layoutMode !== 'NONE') {
    applySizingMode(frame, styles, true);
  }

  // 정렬 설정 (children 전달하여 space-between 보정)
  applyAlignment(frame, styles, children);

  // 패딩 설정
  applyPadding(frame, styles);

  // 배경색 설정 (루트)
  applyBackground(frame, styles, true);

  // 테두리 설정
  applyBorder(frame, styles);

  // 모서리 라운드 설정
  applyCornerRadius(frame, styles);

  // 그림자 설정
  applyBoxShadow(frame, styles);

  // 불투명도 설정
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  } else {
    frame.opacity = 1;
  }
}

/**
 * 노드 타입별 지원 메서드 매트릭스
 * 각 메서드가 어떤 노드 타입에서 지원되는지 정의
 */
const METHOD_SUPPORT_MATRIX: Record<string, Set<string>> = {
  // FRAME: 모든 메서드 지원
  FRAME: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
    'setLayoutMode', 'setPadding', 'setItemSpacing', 'setClipsContent', 'setPrimaryAxisSizingMode', 'setCounterAxisSizingMode', 'setPrimaryAxisAlignItems', 'setCounterAxisAlignItems',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
  ]),
  // COMPONENT: FRAME과 동일
  COMPONENT: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
    'setLayoutMode', 'setPadding', 'setItemSpacing', 'setClipsContent', 'setPrimaryAxisSizingMode', 'setCounterAxisSizingMode', 'setPrimaryAxisAlignItems', 'setCounterAxisAlignItems',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
  ]),
  // SECTION: 제한적 (Auto Layout 미지원, stroke/cornerRadius 미지원)
  SECTION: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setEffects',
  ]),
  // GROUP: 가장 제한적 (크기는 자식에 의해 결정, fills 미지원)
  GROUP: new Set([
    'rename', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    // resize 미지원 - Group의 크기는 자식에 의해 자동 결정됨
    // fills 미지원 - Group은 fills를 지원하지 않음
  ]),
  // TEXT: 텍스트 관련 메서드 + 기본 스타일
  TEXT: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setEffects', 'setBlendMode',
    'setCharacters', 'setFontSize', 'setTextAlignHorizontal',
  ]),
  // INSTANCE: 제한적 (컴포넌트 인스턴스)
  INSTANCE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setEffects', 'setBlendMode',
  ]),
  // RECTANGLE, ELLIPSE 등 Shape 노드
  RECTANGLE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setCornerRadius', 'setCornerRadii', 'setEffects', 'setBlendMode',
  ]),
  ELLIPSE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
  ]),
  VECTOR: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setFills', 'setSolidFill', 'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
  ]),
  LINE: new Set([
    'rename', 'resize', 'move', 'setOpacity', 'setVisible', 'setLocked', 'remove',
    'setStrokes', 'setStrokeWeight', 'setEffects', 'setBlendMode',
  ]),
  // DEFAULT: 알 수 없는 타입에 대한 기본값 (가장 기본적인 메서드만)
  DEFAULT: new Set([
    'rename', 'setOpacity', 'setVisible', 'setLocked', 'remove',
  ]),
};

/**
 * 특정 노드 타입이 특정 메서드를 지원하는지 확인
 */
function isMethodSupportedForType(nodeType: string, method: string): boolean {
  const supported = METHOD_SUPPORT_MATRIX[nodeType] || METHOD_SUPPORT_MATRIX['DEFAULT'];
  return supported.has(method);
}

/**
 * 특정 노드 타입이 지원하는 메서드 목록 반환
 */
function getSupportedMethodsForType(nodeType: string): string[] {
  const supported = METHOD_SUPPORT_MATRIX[nodeType] || METHOD_SUPPORT_MATRIX['DEFAULT'];
  return Array.from(supported);
}

/**
 * 허용된 노드 조작 메서드 맵
 */
interface AllowedMethod {
  description: string;
  handler: (node: SceneNode, args: Record<string, unknown>) => Promise<unknown> | unknown;
}

const ALLOWED_METHODS: Record<string, AllowedMethod> = {
  // === Basic ===
  rename: {
    description: '노드 이름 변경. args: { name: string }',
    handler: (node, args) => {
      const name = args.name as string;
      if (!name) throw new Error('name이 필요합니다');
      node.name = name;
      return { name: node.name };
    },
  },
  resize: {
    description: '노드 크기 변경. args: { width: number, height: number }',
    handler: (node, args) => {
      if (!('resize' in node)) throw new Error('이 노드는 resize를 지원하지 않습니다');
      const w = args.width as number;
      const h = args.height as number;
      if (w === undefined || h === undefined) throw new Error('width, height가 필요합니다');
      (node as FrameNode).resize(Math.max(w, 0.01), Math.max(h, 0.01));
      return { width: (node as FrameNode).width, height: (node as FrameNode).height };
    },
  },
  move: {
    description: '노드 위치 변경. args: { x: number, y: number }',
    handler: (node, args) => {
      const x = args.x as number;
      const y = args.y as number;
      if (x !== undefined) node.x = x;
      if (y !== undefined) node.y = y;
      return { x: node.x, y: node.y };
    },
  },
  setOpacity: {
    description: '불투명도 설정 (0~1). args: { opacity: number }',
    handler: (node, args) => {
      const opacity = args.opacity as number;
      if (opacity === undefined) throw new Error('opacity가 필요합니다');
      node.opacity = Math.max(0, Math.min(1, opacity));
      return { opacity: node.opacity };
    },
  },
  setVisible: {
    description: '가시성 설정. args: { visible: boolean }',
    handler: (node, args) => {
      const visible = args.visible;
      if (visible === undefined) throw new Error('visible이 필요합니다');
      node.visible = !!visible;
      return { visible: node.visible };
    },
  },
  setLocked: {
    description: '잠금 설정. args: { locked: boolean }',
    handler: (node, args) => {
      const locked = args.locked;
      if (locked === undefined) throw new Error('locked가 필요합니다');
      node.locked = !!locked;
      return { locked: node.locked };
    },
  },
  remove: {
    description: '노드 삭제. args: 없음',
    handler: (node) => {
      const name = node.name;
      const id = node.id;
      node.remove();
      return { removed: true, name, id };
    },
  },

  // === Visual ===
  setFills: {
    description: '채우기 설정. args: { fills: Paint[] } (Figma Paint 배열)',
    handler: (node, args) => {
      if (!('fills' in node)) throw new Error('이 노드는 fills를 지원하지 않습니다');
      const fills = args.fills;
      if (!Array.isArray(fills)) throw new Error('fills 배열이 필요합니다');
      (node as GeometryMixin & SceneNode).fills = fills as Paint[];
      return { fills: (node as GeometryMixin & SceneNode).fills };
    },
  },
  setSolidFill: {
    description: '단색 채우기 설정 (편의 메서드). args: { r: 0~1, g: 0~1, b: 0~1, opacity?: 0~1 }',
    handler: (node, args) => {
      if (!('fills' in node)) throw new Error('이 노드는 fills를 지원하지 않습니다');
      const r = args.r as number;
      const g = args.g as number;
      const b = args.b as number;
      if (r === undefined || g === undefined || b === undefined) throw new Error('r, g, b가 필요합니다');
      const opacity = args.opacity !== undefined ? args.opacity as number : 1;
      (node as GeometryMixin & SceneNode).fills = [{
        type: 'SOLID',
        color: { r, g, b },
        opacity,
      }];
      return { fills: (node as GeometryMixin & SceneNode).fills };
    },
  },
  setStrokes: {
    description: '테두리(stroke) 설정. args: { strokes: Paint[] }',
    handler: (node, args) => {
      if (!('strokes' in node)) throw new Error('이 노드는 strokes를 지원하지 않습니다');
      const strokes = args.strokes;
      if (!Array.isArray(strokes)) throw new Error('strokes 배열이 필요합니다');
      (node as GeometryMixin & SceneNode).strokes = strokes as Paint[];
      return { strokes: (node as GeometryMixin & SceneNode).strokes };
    },
  },
  setStrokeWeight: {
    description: '테두리 두께 설정. args: { weight: number }',
    handler: (node, args) => {
      if (!('strokeWeight' in node)) throw new Error('이 노드는 strokeWeight를 지원하지 않습니다');
      const weight = args.weight as number;
      if (weight === undefined) throw new Error('weight가 필요합니다');
      (node as GeometryMixin & SceneNode).strokeWeight = weight;
      return { strokeWeight: (node as GeometryMixin & SceneNode).strokeWeight };
    },
  },
  setCornerRadius: {
    description: '모서리 라운드 설정 (균일). args: { radius: number }',
    handler: (node, args) => {
      if (!('cornerRadius' in node)) throw new Error('이 노드는 cornerRadius를 지원하지 않습니다');
      const radius = args.radius as number;
      if (radius === undefined) throw new Error('radius가 필요합니다');
      (node as FrameNode).cornerRadius = radius;
      return { cornerRadius: (node as FrameNode).cornerRadius };
    },
  },
  setCornerRadii: {
    description: '모서리 라운드 개별 설정. args: { topLeft?: number, topRight?: number, bottomRight?: number, bottomLeft?: number }',
    handler: (node, args) => {
      if (!('topLeftRadius' in node)) throw new Error('이 노드는 개별 cornerRadius를 지원하지 않습니다');
      const f = node as FrameNode;
      if (args.topLeft !== undefined) f.topLeftRadius = args.topLeft as number;
      if (args.topRight !== undefined) f.topRightRadius = args.topRight as number;
      if (args.bottomRight !== undefined) f.bottomRightRadius = args.bottomRight as number;
      if (args.bottomLeft !== undefined) f.bottomLeftRadius = args.bottomLeft as number;
      return {
        topLeftRadius: f.topLeftRadius,
        topRightRadius: f.topRightRadius,
        bottomRightRadius: f.bottomRightRadius,
        bottomLeftRadius: f.bottomLeftRadius,
      };
    },
  },
  setEffects: {
    description: '이펙트(그림자 등) 설정. args: { effects: Effect[] }',
    handler: (node, args) => {
      if (!('effects' in node)) throw new Error('이 노드는 effects를 지원하지 않습니다');
      const effects = args.effects;
      if (!Array.isArray(effects)) throw new Error('effects 배열이 필요합니다');
      (node as FrameNode).effects = effects as Effect[];
      return { effects: (node as FrameNode).effects };
    },
  },
  setBlendMode: {
    description: '블렌드 모드 설정. args: { blendMode: string } (NORMAL, MULTIPLY, SCREEN 등)',
    handler: (node, args) => {
      if (!('blendMode' in node)) throw new Error('이 노드는 blendMode를 지원하지 않습니다');
      const blendMode = args.blendMode as string;
      if (!blendMode) throw new Error('blendMode가 필요합니다');
      (node as FrameNode).blendMode = blendMode as BlendMode;
      return { blendMode: (node as FrameNode).blendMode };
    },
  },

  // === Layout (Auto Layout) ===
  setLayoutMode: {
    description: 'Auto Layout 모드 설정. args: { layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const mode = args.layoutMode as string;
      if (!mode) throw new Error('layoutMode가 필요합니다');
      (node as FrameNode).layoutMode = mode as 'NONE' | 'HORIZONTAL' | 'VERTICAL';
      return { layoutMode: (node as FrameNode).layoutMode };
    },
  },
  setPadding: {
    description: '패딩 설정. args: { top?: number, right?: number, bottom?: number, left?: number }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const f = node as FrameNode;
      if (args.top !== undefined) f.paddingTop = args.top as number;
      if (args.right !== undefined) f.paddingRight = args.right as number;
      if (args.bottom !== undefined) f.paddingBottom = args.bottom as number;
      if (args.left !== undefined) f.paddingLeft = args.left as number;
      return {
        paddingTop: f.paddingTop,
        paddingRight: f.paddingRight,
        paddingBottom: f.paddingBottom,
        paddingLeft: f.paddingLeft,
      };
    },
  },
  setItemSpacing: {
    description: 'Auto Layout 아이템 간격 설정. args: { spacing: number }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const spacing = args.spacing as number;
      if (spacing === undefined) throw new Error('spacing이 필요합니다');
      (node as FrameNode).itemSpacing = spacing;
      return { itemSpacing: (node as FrameNode).itemSpacing };
    },
  },
  setClipsContent: {
    description: '콘텐츠 클리핑(Clip content) 설정. args: { clips: boolean }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const clips = args.clips;
      if (clips === undefined) throw new Error('clips가 필요합니다');
      (node as FrameNode).clipsContent = !!clips;
      return { clipsContent: (node as FrameNode).clipsContent };
    },
  },
  setPrimaryAxisSizingMode: {
    description: '주축 크기 모드 설정. args: { mode: "FIXED" | "AUTO" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const mode = args.mode as string;
      if (!mode) throw new Error('mode가 필요합니다');
      (node as FrameNode).primaryAxisSizingMode = mode as 'FIXED' | 'AUTO';
      return { primaryAxisSizingMode: (node as FrameNode).primaryAxisSizingMode };
    },
  },
  setCounterAxisSizingMode: {
    description: '교차축 크기 모드 설정. args: { mode: "FIXED" | "AUTO" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const mode = args.mode as string;
      if (!mode) throw new Error('mode가 필요합니다');
      (node as FrameNode).counterAxisSizingMode = mode as 'FIXED' | 'AUTO';
      return { counterAxisSizingMode: (node as FrameNode).counterAxisSizingMode };
    },
  },
  setPrimaryAxisAlignItems: {
    description: '주축 정렬 설정. args: { align: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      (node as FrameNode).primaryAxisAlignItems = align as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
      return { primaryAxisAlignItems: (node as FrameNode).primaryAxisAlignItems };
    },
  },
  setCounterAxisAlignItems: {
    description: '교차축 정렬 설정. args: { align: "MIN" | "CENTER" | "MAX" }',
    handler: (node, args) => {
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('FRAME 또는 COMPONENT만 지원합니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      (node as FrameNode).counterAxisAlignItems = align as 'MIN' | 'CENTER' | 'MAX';
      return { counterAxisAlignItems: (node as FrameNode).counterAxisAlignItems };
    },
  },

  // === Text ===
  setCharacters: {
    description: '텍스트 내용 변경. args: { characters: string }. 노드가 TextNode여야 합니다.',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const characters = args.characters as string;
      if (characters === undefined) throw new Error('characters가 필요합니다');
      await figma.loadFontAsync((node as TextNode).fontName as FontName);
      (node as TextNode).characters = characters;
      return { characters: (node as TextNode).characters };
    },
  },
  setFontSize: {
    description: '폰트 크기 변경. args: { size: number }. 노드가 TextNode여야 합니다.',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const size = args.size as number;
      if (size === undefined) throw new Error('size가 필요합니다');
      await figma.loadFontAsync((node as TextNode).fontName as FontName);
      (node as TextNode).fontSize = size;
      return { fontSize: (node as TextNode).fontSize };
    },
  },
  setTextAlignHorizontal: {
    description: '텍스트 수평 정렬. args: { align: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" }',
    handler: async (node, args) => {
      if (node.type !== 'TEXT') throw new Error('TEXT 노드만 지원합니다');
      const align = args.align as string;
      if (!align) throw new Error('align이 필요합니다');
      await figma.loadFontAsync((node as TextNode).fontName as FontName);
      (node as TextNode).textAlignHorizontal = align as 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
      return { textAlignHorizontal: (node as TextNode).textAlignHorizontal };
    },
  },
};

/**
 * 노드 조작 메서드 실행
 */
async function executeModifyNode(
  nodeId: string,
  method: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
    throw new Error(`Document 또는 Page 노드는 수정할 수 없습니다`);
  }

  // 1. 먼저 메서드가 ALLOWED_METHODS에 존재하는지 확인
  const allowed = ALLOWED_METHODS[method];
  if (!allowed) {
    const availableMethods: Record<string, string> = {};
    for (const [key, val] of Object.entries(ALLOWED_METHODS)) {
      availableMethods[key] = val.description;
    }
    throw new Error(JSON.stringify({
      error: `허용되지 않은 메서드입니다: ${method}`,
      availableMethods,
    }));
  }

  // 2. 해당 노드 타입이 이 메서드를 지원하는지 확인
  if (!isMethodSupportedForType(node.type, method)) {
    const supportedForThisType = getSupportedMethodsForType(node.type);
    const supportedWithDescriptions: Record<string, string> = {};
    for (const m of supportedForThisType) {
      if (ALLOWED_METHODS[m]) {
        supportedWithDescriptions[m] = ALLOWED_METHODS[m].description;
      }
    }
    throw new Error(JSON.stringify({
      error: `'${method}' 메서드는 '${node.type}' 타입에서 지원되지 않습니다`,
      nodeType: node.type,
      supportedMethods: supportedWithDescriptions,
    }));
  }

  const result = await allowed.handler(node as SceneNode, args || {});
  return result;
}

/**
 * HTML 문자열을 ExtractedNode로 파싱
 * Figma Plugin 환경에서는 DOMParser가 없으므로 간단한 파서 구현
 */
function parseHTML(html: string): ExtractedNode | null {
  let cleaned = html.trim();
  if (!cleaned) return null;

  // DOCTYPE 제거
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');

  // HTML 주석 제거
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // CDATA 섹션 제거
  cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  cleaned = cleaned.trim();
  if (!cleaned) return null;

  return parseElement(cleaned, 0).node;
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&copy;': '\u00A9',      // ©
    '&reg;': '\u00AE',       // ®
    '&trade;': '\u2122',     // ™
    '&mdash;': '\u2014',     // —
    '&ndash;': '\u2013',     // –
    '&hellip;': '\u2026',    // …
    '&lsquo;': '\u2018',     // '
    '&rsquo;': '\u2019',     // '
    '&ldquo;': '\u201C',     // "
    '&rdquo;': '\u201D',     // "
    '&bull;': '\u2022',      // •
    '&middot;': '\u00B7',    // ·
  };

  let result = text;

  // Named entities
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Numeric entities (&#123; or &#x7B;)
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

interface ParseResult {
  node: ExtractedNode | null;
  endIndex: number;
}

/**
 * 고유 ID 생성
 */
let nodeIdCounter = 0;
function generateNodeId(): string {
  return `html-node-${Date.now()}-${++nodeIdCounter}`;
}

/**
 * HTML 요소 파싱 (재귀)
 */
function parseElement(html: string, startIndex: number): ParseResult {
  const rest = html.slice(startIndex);

  // 텍스트 노드 (태그 아님)
  if (!rest.startsWith('<') || rest.startsWith('</')) {
    const textEnd = rest.indexOf('<');
    const text = textEnd === -1 ? rest : rest.slice(0, textEnd);
    const trimmedText = decodeHTMLEntities(text.trim());

    if (trimmedText) {
      return {
        node: {
          id: generateNodeId(),
          tagName: 'span',
          className: '',
          textContent: trimmedText,
          attributes: {},
          styles: createDefaultStyles(),
          boundingRect: { x: 0, y: 0, width: 0, height: 0 },
          children: [],
        },
        endIndex: startIndex + (textEnd === -1 ? text.length : textEnd),
      };
    }
    return { node: null, endIndex: startIndex + (textEnd === -1 ? text.length : textEnd) };
  }

  // 시작 태그 파싱
  const tagMatch = rest.match(/^<(\w+)([^>]*)>/);
  if (!tagMatch) {
    return { node: null, endIndex: startIndex + 1 };
  }

  const tagName = tagMatch[1].toLowerCase();
  const attrsString = tagMatch[2];
  const afterOpenTag = startIndex + tagMatch[0].length;

  // 자기 종료 태그 체크 (br, img, input 등)
  const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link'];
  if (selfClosingTags.includes(tagName) || attrsString.endsWith('/')) {
    return {
      node: {
        id: generateNodeId(),
        tagName,
        className: extractClass(attrsString),
        textContent: '',
        attributes: extractAttributes(attrsString),
        styles: parseInlineStyles(attrsString),
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        children: [],
      },
      endIndex: afterOpenTag,
    };
  }

  // 자식 노드 파싱
  const children: ExtractedNode[] = [];
  let textContent = '';
  let currentIndex = afterOpenTag;
  const closingTag = `</${tagName}>`;

  while (currentIndex < html.length) {
    const remaining = html.slice(currentIndex);

    // 종료 태그 발견
    if (remaining.toLowerCase().startsWith(closingTag)) {
      break;
    }

    // 다음 태그 또는 텍스트
    if (remaining.startsWith('<') && !remaining.startsWith('</')) {
      const childResult = parseElement(html, currentIndex);
      if (childResult.node) {
        children.push(childResult.node);
      }
      currentIndex = childResult.endIndex;
    } else if (remaining.startsWith('</')) {
      // 다른 종료 태그 (잘못된 HTML)
      break;
    } else {
      // 텍스트 노드
      const nextTagIndex = remaining.indexOf('<');
      const text = nextTagIndex === -1 ? remaining : remaining.slice(0, nextTagIndex);
      const trimmedText = decodeHTMLEntities(text.trim());
      if (trimmedText) {
        textContent += (textContent ? ' ' : '') + trimmedText;
      }
      currentIndex += text.length;
    }
  }

  // 종료 태그 이후 인덱스
  const closingTagIndex = html.toLowerCase().indexOf(closingTag, currentIndex);
  const endIndex = closingTagIndex === -1 ? html.length : closingTagIndex + closingTag.length;

  return {
    node: {
      id: generateNodeId(),
      tagName,
      className: extractClass(attrsString),
      textContent: children.length === 0 ? textContent : '',
      attributes: extractAttributes(attrsString),
      styles: parseInlineStyles(attrsString),
      boundingRect: extractBoundingFromStyle(attrsString),
      children,
    },
    endIndex,
  };
}

/**
 * class 속성 추출
 */
function extractClass(attrsString: string): string {
  const match = attrsString.match(/class\s*=\s*["']([^"']*)["']/i);
  return match ? match[1] : '';
}

/**
 * 모든 속성 추출
 */
function extractAttributes(attrsString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  // 속성 매칭: name="value" 또는 name='value' 또는 name=value
  const attrRegex = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;

  while ((match = attrRegex.exec(attrsString)) !== null) {
    const name = match[1].toLowerCase();
    // ES2017 호환: ?? 대신 || 사용 (빈 문자열도 falsy이므로 마지막에 '' 처리)
    const value = match[2] !== undefined ? match[2]
                : match[3] !== undefined ? match[3]
                : match[4] !== undefined ? match[4]
                : '';
    // style과 class는 별도 처리하므로 제외
    if (name !== 'style' && name !== 'class') {
      attributes[name] = decodeHTMLEntities(value);
    }
  }

  return attributes;
}

/**
 * inline style 파싱
 */
function parseInlineStyles(attrsString: string): ComputedStyles {
  const styles = createDefaultStyles();
  const styleMatch = attrsString.match(/style\s*=\s*["']([^"']*)["']/i);

  if (!styleMatch) return styles;

  const styleStr = styleMatch[1];
  const rules = styleStr.split(';').filter(Boolean);

  for (const rule of rules) {
    const [prop, value] = rule.split(':').map((s) => s.trim());
    if (!prop || !value) continue;

    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    applyStyleProperty(styles, camelProp, value);
  }

  return styles;
}

/**
 * 스타일 속성 적용
 */
function applyStyleProperty(styles: ComputedStyles, prop: string, value: string) {
  const numValue = parseFloat(value);

  switch (prop) {
    case 'width':
      styles.width = numValue || 0;
      break;
    case 'height':
      styles.height = numValue || 0;
      break;
    case 'backgroundColor':
    case 'background':
      if (value.includes('rgb') || value.includes('#')) {
        styles.backgroundColor = parseCSSColor(value);
      }
      break;
    case 'color':
      styles.color = parseCSSColor(value);
      break;
    case 'fontSize':
      styles.fontSize = numValue || 14;
      break;
    case 'fontWeight':
      styles.fontWeight = value;
      break;
    case 'lineHeight':
      styles.lineHeight = numValue || 0;
      break;
    case 'letterSpacing':
      styles.letterSpacing = numValue || 0;
      break;
    case 'textAlign':
      styles.textAlign = value;
      break;
    case 'display':
      styles.display = value;
      break;
    case 'flexDirection':
      styles.flexDirection = value;
      break;
    case 'justifyContent':
      styles.justifyContent = value;
      break;
    case 'alignItems':
      styles.alignItems = value;
      break;
    case 'gap':
      styles.gap = numValue || 0;
      break;
    case 'padding':
      const paddings = parseSpacing(value);
      styles.paddingTop = paddings[0];
      styles.paddingRight = paddings[1];
      styles.paddingBottom = paddings[2];
      styles.paddingLeft = paddings[3];
      break;
    case 'paddingTop':
      styles.paddingTop = numValue || 0;
      break;
    case 'paddingRight':
      styles.paddingRight = numValue || 0;
      break;
    case 'paddingBottom':
      styles.paddingBottom = numValue || 0;
      break;
    case 'paddingLeft':
      styles.paddingLeft = numValue || 0;
      break;
    case 'borderRadius':
      const radii = parseSpacing(value);
      styles.borderTopLeftRadius = radii[0];
      styles.borderTopRightRadius = radii[1];
      styles.borderBottomRightRadius = radii[2];
      styles.borderBottomLeftRadius = radii[3];
      break;
    case 'borderWidth':
      const bw = numValue || 0;
      styles.borderTopWidth = bw;
      styles.borderRightWidth = bw;
      styles.borderBottomWidth = bw;
      styles.borderLeftWidth = bw;
      break;
    case 'borderColor':
      const bc = parseCSSColor(value);
      styles.borderTopColor = bc;
      styles.borderRightColor = bc;
      styles.borderBottomColor = bc;
      styles.borderLeftColor = bc;
      break;
    case 'opacity':
      styles.opacity = numValue || 1;
      break;
    case 'boxShadow':
      styles.boxShadow = value;
      break;
  }
}

/**
 * CSS 색상 파싱 (hex, rgb, rgba)
 */
function parseCSSColor(colorStr: string): RGBA {
  // rgba
  const rgbaMatch = colorStr.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // hex
  const hexMatch = colorStr.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
        a: 1,
      };
    } else if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  // 기본값 (투명)
  return { r: 0, g: 0, b: 0, a: 0 };
}

/**
 * CSS spacing 값 파싱 (padding, margin, border-radius)
 */
function parseSpacing(value: string): [number, number, number, number] {
  const parts = value.split(/\s+/).map((v) => parseFloat(v) || 0);

  switch (parts.length) {
    case 1:
      return [parts[0], parts[0], parts[0], parts[0]];
    case 2:
      return [parts[0], parts[1], parts[0], parts[1]];
    case 3:
      return [parts[0], parts[1], parts[2], parts[1]];
    case 4:
      return [parts[0], parts[1], parts[2], parts[3]];
    default:
      return [0, 0, 0, 0];
  }
}

/**
 * style 속성에서 width/height 추출
 */
function extractBoundingFromStyle(attrsString: string): { x: number; y: number; width: number; height: number } {
  const result = { x: 0, y: 0, width: 0, height: 0 };
  const styleMatch = attrsString.match(/style\s*=\s*["']([^"']*)["']/i);

  if (styleMatch) {
    const widthMatch = styleMatch[1].match(/width\s*:\s*([\d.]+)/);
    const heightMatch = styleMatch[1].match(/height\s*:\s*([\d.]+)/);
    if (widthMatch) result.width = parseFloat(widthMatch[1]);
    if (heightMatch) result.height = parseFloat(heightMatch[1]);
  }

  return result;
}

/**
 * 기본 스타일 생성
 */
function createDefaultStyles(): ComputedStyles {
  return {
    // 레이아웃
    display: 'block',
    position: 'static',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    flexWrap: 'nowrap',
    gap: 0,

    // 크기
    width: 'auto',
    height: 'auto',
    minWidth: 0,
    minHeight: 0,
    maxWidth: 0,
    maxHeight: 0,

    // 패딩
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,

    // 마진
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,

    // 배경
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    backgroundImage: null,

    // 테두리 두께
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,

    // 테두리 색상
    borderTopColor: { r: 0, g: 0, b: 0, a: 0 },
    borderRightColor: { r: 0, g: 0, b: 0, a: 0 },
    borderBottomColor: { r: 0, g: 0, b: 0, a: 0 },
    borderLeftColor: { r: 0, g: 0, b: 0, a: 0 },

    // 테두리 라운드
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,

    // 텍스트
    color: { r: 0, g: 0, b: 0, a: 1 },
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'left',
    textDecoration: 'none',
    lineHeight: 0,
    letterSpacing: 0,

    // 기타
    opacity: 1,
    overflow: 'visible',
    boxShadow: 'none',
    transform: 'none',
  };
}

// ============================================================
// Figma 객체 → JSON/HTML 추출
// ============================================================

/**
 * Figma 노드를 ExtractedNode JSON으로 추출
 */
function extractNodeToJSON(node: SceneNode): ExtractedNode | null {
  if (!('visible' in node) || !node.visible) {
    return null;
  }

  // 기본 구조
  const extracted: ExtractedNode = {
    id: node.id,
    tagName: getTagNameFromNode(node),
    className: node.name,
    textContent: '',
    attributes: {},
    styles: createDefaultStyles(),
    boundingRect: {
      x: 'x' in node ? node.x : 0,
      y: 'y' in node ? node.y : 0,
      width: 'width' in node ? node.width : 0,
      height: 'height' in node ? node.height : 0,
    },
    children: [],
  };

  // 텍스트 노드
  if (node.type === 'TEXT') {
    extracted.tagName = 'span';
    extracted.textContent = node.characters;
    extractTextStyles(node, extracted.styles);
    return extracted;
  }

  // 프레임/그룹/컴포넌트
  if (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    extracted.tagName = 'div';

    // 레이아웃 스타일 추출
    if ('layoutMode' in node) {
      extractLayoutStyles(node as FrameNode, extracted.styles);
    }

    // 배경/테두리/효과 추출
    if ('fills' in node) {
      extractFillStyles(node as FrameNode, extracted.styles);
    }
    if ('strokes' in node) {
      extractStrokeStyles(node as FrameNode, extracted.styles);
    }
    if ('cornerRadius' in node) {
      extractCornerStyles(node as FrameNode, extracted.styles);
    }
    if ('effects' in node) {
      extractEffectStyles(node as FrameNode, extracted.styles);
    }
    if ('opacity' in node) {
      extracted.styles.opacity = node.opacity;
    }

    // 크기 설정
    extracted.styles.width = node.width;
    extracted.styles.height = node.height;

    // 자식 노드 추출
    if ('children' in node) {
      for (const child of node.children) {
        const childExtracted = extractNodeToJSON(child);
        if (childExtracted) {
          extracted.children = extracted.children || [];
          extracted.children.push(childExtracted);
        }
      }
    }

    return extracted;
  }

  // 벡터/도형
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'LINE') {
    extracted.tagName = 'div';

    if ('fills' in node) {
      extractFillStyles(node as GeometryMixin & MinimalFillsMixin, extracted.styles);
    }
    if ('strokes' in node) {
      extractStrokeStyles(node as GeometryMixin & MinimalStrokesMixin, extracted.styles);
    }
    if ('cornerRadius' in node && node.type === 'RECTANGLE') {
      extractCornerStyles(node as RectangleNode, extracted.styles);
    }
    if ('opacity' in node) {
      extracted.styles.opacity = node.opacity;
    }

    extracted.styles.width = node.width;
    extracted.styles.height = node.height;

    return extracted;
  }

  // 벡터 노드 (SVG로 내보낼 수 있는 경우)
  if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') {
    extracted.tagName = 'svg';
    // SVG 문자열은 exportAsync로 추출해야 하지만, 동기 버전에서는 생략
    extracted.styles.width = node.width;
    extracted.styles.height = node.height;
    return extracted;
  }

  return extracted;
}

/**
 * 노드 타입에서 HTML 태그명 추론
 */
function getTagNameFromNode(node: SceneNode): string {
  switch (node.type) {
    case 'TEXT':
      return 'span';
    case 'FRAME':
    case 'GROUP':
    case 'COMPONENT':
    case 'INSTANCE':
    case 'RECTANGLE':
      return 'div';
    case 'VECTOR':
    case 'BOOLEAN_OPERATION':
      return 'svg';
    default:
      return 'div';
  }
}

/**
 * 텍스트 스타일 추출
 */
function extractTextStyles(node: TextNode, styles: ComputedStyles) {
  // 폰트 크기
  if (typeof node.fontSize === 'number') {
    styles.fontSize = node.fontSize;
  }

  // 폰트 두께
  if (typeof node.fontName === 'object' && 'family' in node.fontName) {
    const fontStyle = node.fontName.style.toLowerCase();
    if (fontStyle.includes('bold')) {
      styles.fontWeight = '700';
    } else if (fontStyle.includes('semi')) {
      styles.fontWeight = '600';
    } else if (fontStyle.includes('medium')) {
      styles.fontWeight = '500';
    } else {
      styles.fontWeight = '400';
    }
    styles.fontFamily = node.fontName.family;
  }

  // 텍스트 색상
  const fills = node.fills;
  if (Array.isArray(fills) && fills.length > 0) {
    const fill = fills[0];
    if (fill.type === 'SOLID') {
      styles.color = {
        r: fill.color.r,
        g: fill.color.g,
        b: fill.color.b,
        a: fill.opacity !== undefined ? fill.opacity : 1,
      };
    }
  }

  // 줄 높이
  if (node.lineHeight !== figma.mixed && typeof node.lineHeight === 'object') {
    if (node.lineHeight.unit === 'PIXELS') {
      styles.lineHeight = node.lineHeight.value;
    }
  }

  // 자간
  if (node.letterSpacing !== figma.mixed && typeof node.letterSpacing === 'object') {
    if (node.letterSpacing.unit === 'PIXELS') {
      styles.letterSpacing = node.letterSpacing.value;
    }
  }

  // 텍스트 정렬
  if (node.textAlignHorizontal !== undefined) {
    switch (node.textAlignHorizontal) {
      case 'CENTER':
        styles.textAlign = 'center';
        break;
      case 'RIGHT':
        styles.textAlign = 'right';
        break;
      case 'JUSTIFIED':
        styles.textAlign = 'justify';
        break;
      default:
        styles.textAlign = 'left';
    }
  }
}

/**
 * 레이아웃 스타일 추출
 */
function extractLayoutStyles(node: FrameNode, styles: ComputedStyles) {
  // 레이아웃 모드
  if (node.layoutMode === 'HORIZONTAL') {
    styles.display = 'flex';
    styles.flexDirection = 'row';
  } else if (node.layoutMode === 'VERTICAL') {
    styles.display = 'flex';
    styles.flexDirection = 'column';
  } else {
    styles.display = 'block';
  }

  // 갭
  if (node.itemSpacing !== undefined) {
    styles.gap = node.itemSpacing;
  }

  // 패딩
  styles.paddingTop = node.paddingTop || 0;
  styles.paddingRight = node.paddingRight || 0;
  styles.paddingBottom = node.paddingBottom || 0;
  styles.paddingLeft = node.paddingLeft || 0;

  // 주축 정렬
  if (node.primaryAxisAlignItems !== undefined) {
    switch (node.primaryAxisAlignItems) {
      case 'CENTER':
        styles.justifyContent = 'center';
        break;
      case 'MAX':
        styles.justifyContent = 'flex-end';
        break;
      case 'SPACE_BETWEEN':
        styles.justifyContent = 'space-between';
        break;
      default:
        styles.justifyContent = 'flex-start';
    }
  }

  // 교차축 정렬
  if (node.counterAxisAlignItems !== undefined) {
    switch (node.counterAxisAlignItems) {
      case 'CENTER':
        styles.alignItems = 'center';
        break;
      case 'MAX':
        styles.alignItems = 'flex-end';
        break;
      default:
        styles.alignItems = 'flex-start';
    }
  }
}

/**
 * 배경색 추출
 */
function extractFillStyles(node: MinimalFillsMixin, styles: ComputedStyles) {
  const fills = node.fills;
  if (!Array.isArray(fills) || fills.length === 0) {
    styles.backgroundColor = { r: 0, g: 0, b: 0, a: 0 };
    return;
  }

  const fill = fills[0];
  if (fill.type === 'SOLID') {
    styles.backgroundColor = {
      r: fill.color.r,
      g: fill.color.g,
      b: fill.color.b,
      a: fill.opacity !== undefined ? fill.opacity : 1,
    };
  }
}

/**
 * 테두리 스타일 추출
 */
function extractStrokeStyles(node: MinimalStrokesMixin, styles: ComputedStyles) {
  const strokes = node.strokes;
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return;
  }

  const stroke = strokes[0];
  if (stroke.type === 'SOLID') {
    const strokeColor: RGBA = {
      r: stroke.color.r,
      g: stroke.color.g,
      b: stroke.color.b,
      a: stroke.opacity !== undefined ? stroke.opacity : 1,
    };

    styles.borderTopColor = strokeColor;
    styles.borderRightColor = strokeColor;
    styles.borderBottomColor = strokeColor;
    styles.borderLeftColor = strokeColor;
  }

  // 스트로크 두께
  if ('strokeWeight' in node && typeof node.strokeWeight === 'number') {
    styles.borderTopWidth = node.strokeWeight;
    styles.borderRightWidth = node.strokeWeight;
    styles.borderBottomWidth = node.strokeWeight;
    styles.borderLeftWidth = node.strokeWeight;
  }
}

/**
 * 모서리 라운드 추출
 */
function extractCornerStyles(node: CornerMixin & RectangleCornerMixin, styles: ComputedStyles) {
  if (typeof node.cornerRadius === 'number') {
    styles.borderTopLeftRadius = node.cornerRadius;
    styles.borderTopRightRadius = node.cornerRadius;
    styles.borderBottomRightRadius = node.cornerRadius;
    styles.borderBottomLeftRadius = node.cornerRadius;
  } else {
    // 개별 모서리
    styles.borderTopLeftRadius = node.topLeftRadius || 0;
    styles.borderTopRightRadius = node.topRightRadius || 0;
    styles.borderBottomRightRadius = node.bottomRightRadius || 0;
    styles.borderBottomLeftRadius = node.bottomLeftRadius || 0;
  }
}

/**
 * 효과(그림자 등) 추출
 */
function extractEffectStyles(node: BlendMixin, styles: ComputedStyles) {
  const effects = node.effects;
  if (!Array.isArray(effects) || effects.length === 0) {
    styles.boxShadow = 'none';
    return;
  }

  const shadowParts: string[] = [];

  for (const effect of effects) {
    if (effect.type === 'DROP_SHADOW' && effect.visible) {
      const { offset, radius, spread, color } = effect;
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const a = color.a;
      shadowParts.push(`rgba(${r}, ${g}, ${b}, ${a}) ${offset.x}px ${offset.y}px ${radius}px ${spread || 0}px`);
    }
  }

  styles.boxShadow = shadowParts.length > 0 ? shadowParts.join(', ') : 'none';
}

/**
 * ExtractedNode를 HTML 문자열로 변환
 */
function convertExtractedNodeToHTML(node: ExtractedNode): string {
  const { tagName, className, textContent, styles, children } = node;

  // 스타일 문자열 생성
  const styleStr = buildStyleString(styles);

  // 클래스 속성
  const classAttr = className ? ` class="${escapeHTMLAttrForExport(className)}"` : '';

  // 스타일 속성
  const styleAttr = styleStr ? ` style="${escapeHTMLAttrForExport(styleStr)}"` : '';

  // 자식이 없고 텍스트만 있는 경우
  if ((!children || children.length === 0) && textContent) {
    return `<${tagName}${classAttr}${styleAttr}>${escapeHTMLContentForExport(textContent)}</${tagName}>`;
  }

  // 자식 노드 재귀 처리
  let childrenHTML = '';
  if (children && children.length > 0) {
    childrenHTML = children.map(child => convertExtractedNodeToHTML(child)).join('\n');
  }

  // 텍스트 + 자식 모두 있는 경우
  const content = textContent ? escapeHTMLContentForExport(textContent) + '\n' + childrenHTML : childrenHTML;

  return `<${tagName}${classAttr}${styleAttr}>${content ? '\n' + content + '\n' : ''}</${tagName}>`;
}

/**
 * ComputedStyles를 CSS 인라인 스타일 문자열로 변환
 */
function buildStyleString(styles: ComputedStyles): string {
  const parts: string[] = [];

  // 크기
  if (typeof styles.width === 'number' && styles.width > 0) {
    parts.push(`width: ${styles.width}px`);
  }
  if (typeof styles.height === 'number' && styles.height > 0) {
    parts.push(`height: ${styles.height}px`);
  }

  // 레이아웃
  if (styles.display && styles.display !== 'block') {
    parts.push(`display: ${styles.display}`);
  }
  if (styles.display === 'flex') {
    if (styles.flexDirection && styles.flexDirection !== 'row') {
      parts.push(`flex-direction: ${styles.flexDirection}`);
    }
    if (styles.justifyContent && styles.justifyContent !== 'flex-start') {
      parts.push(`justify-content: ${styles.justifyContent}`);
    }
    if (styles.alignItems && styles.alignItems !== 'stretch') {
      parts.push(`align-items: ${styles.alignItems}`);
    }
  }
  if (styles.gap > 0) {
    parts.push(`gap: ${styles.gap}px`);
  }

  // 패딩
  if (styles.paddingTop > 0 || styles.paddingRight > 0 || styles.paddingBottom > 0 || styles.paddingLeft > 0) {
    if (styles.paddingTop === styles.paddingRight &&
        styles.paddingRight === styles.paddingBottom &&
        styles.paddingBottom === styles.paddingLeft) {
      parts.push(`padding: ${styles.paddingTop}px`);
    } else {
      parts.push(`padding: ${styles.paddingTop}px ${styles.paddingRight}px ${styles.paddingBottom}px ${styles.paddingLeft}px`);
    }
  }

  // 배경색
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    parts.push(`background-color: ${rgbaToCSS(styles.backgroundColor)}`);
  }

  // 테두리
  const borderWidth = styles.borderTopWidth || 0;
  if (borderWidth > 0) {
    parts.push(`border-width: ${borderWidth}px`);
    parts.push(`border-style: solid`);
    if (styles.borderTopColor) {
      parts.push(`border-color: ${rgbaToCSS(styles.borderTopColor)}`);
    }
  }

  // 모서리 라운드
  if (styles.borderTopLeftRadius > 0 || styles.borderTopRightRadius > 0 ||
      styles.borderBottomRightRadius > 0 || styles.borderBottomLeftRadius > 0) {
    if (styles.borderTopLeftRadius === styles.borderTopRightRadius &&
        styles.borderTopRightRadius === styles.borderBottomRightRadius &&
        styles.borderBottomRightRadius === styles.borderBottomLeftRadius) {
      parts.push(`border-radius: ${styles.borderTopLeftRadius}px`);
    } else {
      parts.push(`border-radius: ${styles.borderTopLeftRadius}px ${styles.borderTopRightRadius}px ${styles.borderBottomRightRadius}px ${styles.borderBottomLeftRadius}px`);
    }
  }

  // 텍스트 스타일
  if (styles.color && styles.color.a > 0) {
    parts.push(`color: ${rgbaToCSS(styles.color)}`);
  }
  if (styles.fontSize && styles.fontSize !== 14) {
    parts.push(`font-size: ${styles.fontSize}px`);
  }
  if (styles.fontWeight && styles.fontWeight !== '400') {
    parts.push(`font-weight: ${styles.fontWeight}`);
  }
  if (styles.lineHeight && styles.lineHeight > 0) {
    parts.push(`line-height: ${styles.lineHeight}px`);
  }
  if (styles.letterSpacing && styles.letterSpacing !== 0) {
    parts.push(`letter-spacing: ${styles.letterSpacing}px`);
  }
  if (styles.textAlign && styles.textAlign !== 'left') {
    parts.push(`text-align: ${styles.textAlign}`);
  }

  // 불투명도
  if (styles.opacity < 1) {
    parts.push(`opacity: ${styles.opacity}`);
  }

  // 그림자
  if (styles.boxShadow && styles.boxShadow !== 'none') {
    parts.push(`box-shadow: ${styles.boxShadow}`);
  }

  return parts.join('; ');
}

/**
 * RGBA를 CSS 문자열로 변환
 */
function rgbaToCSS(color: RGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}

/**
 * HTML 속성값 이스케이프 (export용)
 */
function escapeHTMLAttrForExport(str: string): string {
  return str.replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

/**
 * HTML 콘텐츠 이스케이프 (export용)
 */
function escapeHTMLContentForExport(str: string): string {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

// ============================================================
// 라운드트립 테스트 (동일성 비교)
// ============================================================

interface RoundtripTestResult {
  success: boolean;
  identical: boolean;
  differences: string[];
  original: unknown;
  extracted: unknown;
  createdFrameId?: string;
}

/**
 * JSON 라운드트립 테스트
 * 1. JSON → Figma Frame 생성
 * 2. 생성된 Frame → JSON 재추출
 * 3. 원본과 비교
 */
async function testRoundtripJSON(originalNode: ExtractedNode, name?: string): Promise<RoundtripTestResult> {
  const differences: string[] = [];

  try {
    // 1. 프레임 생성
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    const frame = await createFigmaNode(originalNode);
    if (!frame) {
      return {
        success: false,
        identical: false,
        differences: ['프레임 생성 실패'],
        original: originalNode,
        extracted: null,
      };
    }

    frame.name = name || 'RoundtripTest-JSON';

    // 뷰포트 중앙에 배치
    const center = figma.viewport.center;
    frame.x = center.x - frame.width / 2;
    frame.y = center.y - frame.height / 2;
    figma.currentPage.appendChild(frame);

    // 2. 재추출
    const extractedNode = extractNodeToJSON(frame);
    if (!extractedNode) {
      return {
        success: false,
        identical: false,
        differences: ['추출 실패'],
        original: originalNode,
        extracted: null,
        createdFrameId: frame.id,
      };
    }

    // 3. 비교
    compareNodes(originalNode, extractedNode, '', differences);

    return {
      success: true,
      identical: differences.length === 0,
      differences,
      original: originalNode,
      extracted: extractedNode,
      createdFrameId: frame.id,
    };
  } catch (error) {
    return {
      success: false,
      identical: false,
      differences: [`오류: ${error instanceof Error ? error.message : 'Unknown error'}`],
      original: originalNode,
      extracted: null,
    };
  }
}

/**
 * HTML 라운드트립 테스트
 * 1. HTML → Figma Frame 생성
 * 2. 생성된 Frame → HTML 재추출
 * 3. 원본과 비교
 */
async function testRoundtripHTML(originalHTML: string, name?: string): Promise<RoundtripTestResult> {
  const differences: string[] = [];

  try {
    // 1. HTML 파싱 및 프레임 생성
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    const parsedNode = parseHTML(originalHTML);
    if (!parsedNode) {
      return {
        success: false,
        identical: false,
        differences: ['HTML 파싱 실패'],
        original: originalHTML,
        extracted: '',
      };
    }

    const frame = await createFigmaNode(parsedNode);
    if (!frame) {
      return {
        success: false,
        identical: false,
        differences: ['프레임 생성 실패'],
        original: originalHTML,
        extracted: '',
      };
    }

    frame.name = name || 'RoundtripTest-HTML';

    const center = figma.viewport.center;
    frame.x = center.x - frame.width / 2;
    frame.y = center.y - frame.height / 2;
    figma.currentPage.appendChild(frame);

    // 2. 재추출 (JSON으로 추출 후 HTML로 변환)
    const extractedNode = extractNodeToJSON(frame);
    if (!extractedNode) {
      return {
        success: false,
        identical: false,
        differences: ['추출 실패'],
        original: originalHTML,
        extracted: '',
        createdFrameId: frame.id,
      };
    }

    const extractedHTML = convertExtractedNodeToHTML(extractedNode);

    // 3. 비교 (정규화 후 비교)
    const normalizedOriginal = normalizeHTMLForCompare(originalHTML);
    const normalizedExtracted = normalizeHTMLForCompare(extractedHTML);

    if (normalizedOriginal !== normalizedExtracted) {
      differences.push('HTML 구조가 다름');
      differences.push(`원본 길이: ${normalizedOriginal.length}, 추출 길이: ${normalizedExtracted.length}`);
    }

    // 세부 비교를 위해 JSON으로도 비교
    compareNodes(parsedNode, extractedNode, '', differences);

    return {
      success: true,
      identical: differences.length === 0,
      differences,
      original: originalHTML,
      extracted: extractedHTML,
      createdFrameId: frame.id,
    };
  } catch (error) {
    return {
      success: false,
      identical: false,
      differences: [`오류: ${error instanceof Error ? error.message : 'Unknown error'}`],
      original: originalHTML,
      extracted: '',
    };
  }
}

/**
 * HTML 정규화 (비교용)
 */
function normalizeHTMLForCompare(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
    .toLowerCase();
}

/**
 * 두 ExtractedNode 비교
 */
function compareNodes(original: ExtractedNode, extracted: ExtractedNode, path: string, differences: string[]) {
  const prefix = path ? `${path}.` : '';

  // 태그명 비교
  if (original.tagName !== extracted.tagName) {
    differences.push(`${prefix}tagName: "${original.tagName}" -> "${extracted.tagName}"`);
  }

  // 텍스트 비교
  if ((original.textContent || '').trim() !== (extracted.textContent || '').trim()) {
    differences.push(`${prefix}textContent: "${original.textContent}" -> "${extracted.textContent}"`);
  }

  // 주요 스타일 비교
  compareStyleProperty(original.styles, extracted.styles, 'display', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'flexDirection', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'justifyContent', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'alignItems', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'gap', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingTop', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingRight', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingBottom', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingLeft', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'borderTopLeftRadius', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'fontSize', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'fontWeight', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'opacity', prefix, differences);

  // 색상 비교 (허용 오차)
  compareColor(original.styles.backgroundColor, extracted.styles.backgroundColor, `${prefix}backgroundColor`, differences);
  compareColor(original.styles.color, extracted.styles.color, `${prefix}color`, differences);

  // 크기 비교 (허용 오차 1px)
  const origWidth = typeof original.styles.width === 'number' ? original.styles.width : original.boundingRect.width;
  const extWidth = typeof extracted.styles.width === 'number' ? extracted.styles.width : extracted.boundingRect.width;
  if (Math.abs(origWidth - extWidth) > 1) {
    differences.push(`${prefix}width: ${origWidth} -> ${extWidth}`);
  }

  const origHeight = typeof original.styles.height === 'number' ? original.styles.height : original.boundingRect.height;
  const extHeight = typeof extracted.styles.height === 'number' ? extracted.styles.height : extracted.boundingRect.height;
  if (Math.abs(origHeight - extHeight) > 1) {
    differences.push(`${prefix}height: ${origHeight} -> ${extHeight}`);
  }

  // 자식 노드 비교
  const origChildren = original.children || [];
  const extChildren = extracted.children || [];

  if (origChildren.length !== extChildren.length) {
    differences.push(`${prefix}children.length: ${origChildren.length} -> ${extChildren.length}`);
  }

  const minLen = Math.min(origChildren.length, extChildren.length);
  for (let i = 0; i < minLen; i++) {
    compareNodes(origChildren[i], extChildren[i], `${prefix}children[${i}]`, differences);
  }
}

/**
 * 스타일 속성 비교
 */
function compareStyleProperty(
  original: ComputedStyles,
  extracted: ComputedStyles,
  prop: keyof ComputedStyles,
  prefix: string,
  differences: string[]
) {
  const origVal = original[prop];
  const extVal = extracted[prop];

  // 숫자 비교 (허용 오차)
  if (typeof origVal === 'number' && typeof extVal === 'number') {
    if (Math.abs(origVal - extVal) > 0.1) {
      differences.push(`${prefix}styles.${prop}: ${origVal} -> ${extVal}`);
    }
    return;
  }

  // 문자열 비교
  if (origVal !== extVal) {
    differences.push(`${prefix}styles.${prop}: "${origVal}" -> "${extVal}"`);
  }
}

/**
 * 색상 비교 (허용 오차 0.02)
 */
function compareColor(original: RGBA | null | undefined, extracted: RGBA | null | undefined, path: string, differences: string[]) {
  if (!original && !extracted) return;
  if (!original || !extracted) {
    differences.push(`${path}: 색상 불일치`);
    return;
  }

  const tolerance = 0.02; // 색상 오차 허용
  if (Math.abs(original.r - extracted.r) > tolerance ||
      Math.abs(original.g - extracted.g) > tolerance ||
      Math.abs(original.b - extracted.b) > tolerance ||
      Math.abs(original.a - extracted.a) > tolerance) {
    differences.push(`${path}: rgba(${original.r.toFixed(2)},${original.g.toFixed(2)},${original.b.toFixed(2)},${original.a.toFixed(2)}) -> rgba(${extracted.r.toFixed(2)},${extracted.g.toFixed(2)},${extracted.b.toFixed(2)},${extracted.a.toFixed(2)})`);
  }
}
