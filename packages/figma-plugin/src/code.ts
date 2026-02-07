import type { ExtractedNode, TreeNode, TreeFilter, FindNodeResult, GetTreeResult } from '@sigma/shared';
import { createFrameFromJSON, createFrameFromHTML, updateExistingFrame, setLastCreatedPosition } from './converter';
import { extractNodeToJSON } from './extractor';
import { convertExtractedNodeToHTML } from './extractor';
import { getTargetPage, getPageById, getAllPages, sendFileInfo, getStoredFileKey, saveFileKey } from './node-ops';
import { getNodeFullPath, findNodesByPath, serializeTreeNode } from './node-ops';
import { executeModifyNode } from './node-ops';
import { testRoundtripJSON, testRoundtripHTML } from './testing';

// UI 표시
figma.showUI(__html__, { width: 320, height: 400 });

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
      await createFrameFromJSON(msg.data as ExtractedNode, msg.name as string | undefined, position, pageId, getTargetPage);
      break;
    }

    case 'create-from-html': {
      const htmlPosition = msg.position as { x: number; y: number } | undefined;
      const htmlPageId = msg.pageId as string | undefined;
      await createFrameFromHTML(msg.data as string, msg.name as string | undefined, htmlPosition, htmlPageId, getTargetPage);
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
      setLastCreatedPosition(null);
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
