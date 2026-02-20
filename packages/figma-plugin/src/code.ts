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

    case 'extract-node-json': {
      const extractNodeId = msg.nodeId as string;

      if (!extractNodeId) {
        figma.ui.postMessage({
          type: 'extract-node-json-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      const targetNode = figma.getNodeById(extractNodeId);
      if (!targetNode) {
        figma.ui.postMessage({
          type: 'extract-node-json-result',
          success: false,
          error: `노드를 찾을 수 없습니다: ${extractNodeId}`,
        });
        break;
      }

      if (targetNode.type === 'DOCUMENT' || targetNode.type === 'PAGE') {
        figma.ui.postMessage({
          type: 'extract-node-json-result',
          success: false,
          error: `이 노드 타입은 추출할 수 없습니다: ${targetNode.type}`,
        });
        break;
      }

      try {
        const extracted = extractNodeToJSON(targetNode as SceneNode);
        if (!extracted) {
          figma.ui.postMessage({
            type: 'extract-node-json-result',
            success: false,
            error: '추출 가능한 데이터가 없습니다',
          });
          break;
        }

        figma.ui.postMessage({
          type: 'extract-node-json-result',
          success: true,
          result: {
            nodeId: extractNodeId,
            nodeName: targetNode.name,
            nodeType: targetNode.type,
            data: extracted,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'extract-node-json-result',
          success: false,
          error: `추출 실패: ${errMsg}`,
        });
      }
      break;
    }

    case 'create-section': {
      const sectionName = msg.name as string || 'Section';
      const sectionPageId = msg.pageId as string | undefined;
      const sectionPosition = msg.position as { x: number; y: number } | undefined;
      const sectionSize = msg.size as { width: number; height: number } | undefined;
      const childrenIds = msg.children as string[] | undefined;
      const sectionFills = msg.fills as Paint[] | undefined;

      try {
        const section = figma.createSection();
        section.name = sectionName;

        if (sectionPosition) {
          section.x = sectionPosition.x;
          section.y = sectionPosition.y;
        }

        if (sectionSize) {
          section.resizeWithoutConstraints(
            Math.max(sectionSize.width, 1),
            Math.max(sectionSize.height, 1)
          );
        }

        if (sectionFills) {
          section.fills = sectionFills;
        }

        // 특정 페이지에 생성해야 하는 경우
        if (sectionPageId) {
          const targetPage = getPageById(sectionPageId);
          if (targetPage && targetPage.id !== figma.currentPage.id) {
            targetPage.appendChild(section);
          }
        }

        // 자식 노드 이동
        if (childrenIds && childrenIds.length > 0) {
          for (const childId of childrenIds) {
            const child = figma.getNodeById(childId);
            if (child && child.type !== 'DOCUMENT' && child.type !== 'PAGE') {
              section.appendChild(child as SceneNode);
            }
          }
        }

        figma.ui.postMessage({
          type: 'create-section-result',
          success: true,
          result: {
            nodeId: section.id,
            name: section.name,
            x: section.x,
            y: section.y,
            width: section.width,
            height: section.height,
            childCount: section.children.length,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'create-section-result',
          success: false,
          error: `Section 생성 실패: ${errMsg}`,
        });
      }
      break;
    }

    case 'move-node': {
      const moveNodeId = msg.nodeId as string;
      const targetParentId = msg.parentId as string;
      const insertIndex = msg.index as number | undefined;

      if (!moveNodeId) {
        figma.ui.postMessage({
          type: 'move-node-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      if (!targetParentId) {
        figma.ui.postMessage({
          type: 'move-node-result',
          success: false,
          error: 'parentId가 필요합니다',
        });
        break;
      }

      const moveNode = figma.getNodeById(moveNodeId);
      if (!moveNode) {
        figma.ui.postMessage({
          type: 'move-node-result',
          success: false,
          error: `노드를 찾을 수 없습니다: ${moveNodeId}`,
        });
        break;
      }

      const targetParent = figma.getNodeById(targetParentId);
      if (!targetParent) {
        figma.ui.postMessage({
          type: 'move-node-result',
          success: false,
          error: `대상 부모 노드를 찾을 수 없습니다: ${targetParentId}`,
        });
        break;
      }

      if (!('appendChild' in targetParent)) {
        figma.ui.postMessage({
          type: 'move-node-result',
          success: false,
          error: `대상 노드(${targetParent.type})는 자식을 가질 수 없습니다`,
        });
        break;
      }

      try {
        const oldParentId = moveNode.parent ? moveNode.parent.id : null;
        const oldParentName = moveNode.parent ? moveNode.parent.name : null;

        if (insertIndex !== undefined) {
          (targetParent as ChildrenMixin).insertChild(insertIndex, moveNode as SceneNode);
        } else {
          (targetParent as ChildrenMixin).appendChild(moveNode as SceneNode);
        }

        figma.ui.postMessage({
          type: 'move-node-result',
          success: true,
          result: {
            nodeId: moveNode.id,
            nodeName: moveNode.name,
            nodeType: moveNode.type,
            oldParentId,
            oldParentName,
            newParentId: targetParent.id,
            newParentName: targetParent.name,
            newParentType: targetParent.type,
            index: insertIndex,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'move-node-result',
          success: false,
          error: `노드 이동 실패: ${errMsg}`,
        });
      }
      break;
    }

    case 'clone-node': {
      const cloneNodeId = msg.nodeId as string;
      const cloneParentId = msg.parentId as string | undefined;
      const clonePosition = msg.position as { x: number; y: number } | undefined;
      const cloneName = msg.name as string | undefined;

      if (!cloneNodeId) {
        figma.ui.postMessage({
          type: 'clone-node-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      const sourceNode = figma.getNodeById(cloneNodeId);
      if (!sourceNode) {
        figma.ui.postMessage({
          type: 'clone-node-result',
          success: false,
          error: `노드를 찾을 수 없습니다: ${cloneNodeId}`,
        });
        break;
      }

      if (sourceNode.type === 'DOCUMENT' || sourceNode.type === 'PAGE') {
        figma.ui.postMessage({
          type: 'clone-node-result',
          success: false,
          error: `Document 또는 Page는 복제할 수 없습니다`,
        });
        break;
      }

      try {
        const cloned = (sourceNode as SceneNode).clone();

        // 이름 변경
        if (cloneName) {
          cloned.name = cloneName;
        }

        // 다른 부모로 이동
        if (cloneParentId) {
          const newParent = figma.getNodeById(cloneParentId);
          if (!newParent) {
            // 복제는 이미 됐으므로 제거하고 에러 반환
            cloned.remove();
            figma.ui.postMessage({
              type: 'clone-node-result',
              success: false,
              error: `대상 부모 노드를 찾을 수 없습니다: ${cloneParentId}`,
            });
            break;
          }
          if (!('appendChild' in newParent)) {
            cloned.remove();
            figma.ui.postMessage({
              type: 'clone-node-result',
              success: false,
              error: `대상 노드(${newParent.type})는 자식을 가질 수 없습니다`,
            });
            break;
          }
          (newParent as ChildrenMixin).appendChild(cloned);
        }

        // 위치 설정
        if (clonePosition) {
          cloned.x = clonePosition.x;
          cloned.y = clonePosition.y;
        }

        const width = 'width' in cloned ? (cloned as any).width : 0;
        const height = 'height' in cloned ? (cloned as any).height : 0;

        figma.ui.postMessage({
          type: 'clone-node-result',
          success: true,
          result: {
            nodeId: cloned.id,
            name: cloned.name,
            type: cloned.type,
            x: cloned.x,
            y: cloned.y,
            width: Math.round(width),
            height: Math.round(height),
            parentId: cloned.parent ? cloned.parent.id : null,
            parentName: cloned.parent ? cloned.parent.name : null,
            sourceNodeId: cloneNodeId,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'clone-node-result',
          success: false,
          error: `노드 복제 실패: ${errMsg}`,
        });
      }
      break;
    }

    case 'export-image': {
      const exportNodeId = msg.nodeId as string;
      const exportFormat = (msg.format as string || 'PNG').toUpperCase();
      const exportScale = msg.scale as number || 2;

      if (!exportNodeId) {
        figma.ui.postMessage({
          type: 'export-image-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      const exportNode = figma.getNodeById(exportNodeId);
      if (!exportNode) {
        figma.ui.postMessage({
          type: 'export-image-result',
          success: false,
          error: `노드를 찾을 수 없습니다: ${exportNodeId}`,
        });
        break;
      }

      // exportAsync is available on SceneNode (not DOCUMENT or PAGE)
      if (exportNode.type === 'DOCUMENT' || exportNode.type === 'PAGE') {
        figma.ui.postMessage({
          type: 'export-image-result',
          success: false,
          error: `이 노드 타입은 export할 수 없습니다: ${exportNode.type}`,
        });
        break;
      }

      try {
        const sceneNode = exportNode as SceneNode;

        // Determine export settings
        const validFormats = ['PNG', 'SVG', 'JPG', 'PDF'];
        const finalFormat = validFormats.includes(exportFormat) ? exportFormat : 'PNG';

        const exportSettings: ExportSettings = finalFormat === 'SVG'
          ? { format: 'SVG' }
          : finalFormat === 'PDF'
            ? { format: 'PDF' }
            : {
                format: finalFormat as 'PNG' | 'JPG',
                constraint: { type: 'SCALE', value: exportScale },
              };

        const bytes = await sceneNode.exportAsync(exportSettings);
        const base64 = figma.base64Encode(bytes);

        // Get dimensions
        const width = 'width' in sceneNode ? (sceneNode as any).width : 0;
        const height = 'height' in sceneNode ? (sceneNode as any).height : 0;

        figma.ui.postMessage({
          type: 'export-image-result',
          success: true,
          result: {
            base64,
            format: finalFormat,
            nodeId: exportNodeId,
            nodeName: sceneNode.name,
            width: Math.round(width),
            height: Math.round(height),
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'export-image-result',
          success: false,
          error: `export 실패: ${errMsg}`,
        });
      }
      break;
    }

    case 'cancel':
      figma.closePlugin();
      break;
  }
};
