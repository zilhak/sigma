import type { ExtractedNode, TreeFilter } from '@sigma/shared';
import { createFrameFromJSON, createFrameFromHTML, updateExistingFrame, setLastCreatedPosition } from './converter';
import { extractNodeToJSON } from './extractor';
import { convertExtractedNodeToHTML } from './extractor';
import { getTargetPage, getAllPages, sendFileInfo, saveFileKey } from './node-ops';
import { findNodeWithDetails, getTreeWithFilter } from './node-ops';
import { executeModifyNode } from './node-ops';
import { getFrames, deleteFrame } from './node-ops';
import { createSection } from './node-ops';
import { moveNode, cloneNode } from './node-ops';
import { exportImage } from './node-ops';
import { createRectangle, createText, createEmptyFrame } from './node-ops';
import { getSelection, setSelection } from './node-ops';
import { getLocalComponents, createComponentInstance, getInstanceOverrides, setInstanceOverrides } from './node-ops';
import { getNodeInfo, getDocumentInfo, getStyles, getNodesInfo, readMyDesign } from './node-ops';
import { scanTextNodes, scanNodesByTypes, batchModify, batchDelete, setMultipleTextContents } from './node-ops';
import { getAnnotations, setAnnotation, setMultipleAnnotations } from './node-ops';
import { getReactions, addReaction, removeReactions } from './node-ops';
import { testRoundtripJSON, testRoundtripHTML } from './testing';

// UI 표시
figma.showUI(__html__, { width: 320, height: 400 });

// --- postMessage 헬퍼 ---
function sendResult(type: string, result: unknown) {
  figma.ui.postMessage({ type, success: true, result });
}

function sendError(type: string, error: string) {
  figma.ui.postMessage({ type, success: false, error });
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
        sendError('update-result', 'nodeId가 필요합니다');
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
        sendError('update-result', errMsg);
      }
      break;
    }

    case 'modify-node': {
      const modifyNodeId = msg.nodeId as string;
      const modifyMethod = msg.method as string;
      const modifyArgs = msg.args as Record<string, unknown>;

      if (!modifyNodeId) {
        sendError('modify-result', 'nodeId가 필요합니다');
        break;
      }
      if (!modifyMethod) {
        sendError('modify-result', 'method가 필요합니다');
        break;
      }

      try {
        const modifyResult = await executeModifyNode(modifyNodeId, modifyMethod, modifyArgs);
        sendResult('modify-result', modifyResult);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('modify-result', errMsg);
      }
      break;
    }

    case 'get-pages': {
      const pages = getAllPages();
      figma.ui.postMessage({
        type: 'pages-list',
        pages,
        currentPageId: figma.currentPage.id,
      });
      break;
    }

    case 'get-frames': {
      const result = getFrames(msg.pageId as string | undefined);
      figma.ui.postMessage({
        type: 'frames-list',
        frames: result.frames,
        pageId: result.pageId,
        pageName: result.pageName,
      });
      break;
    }

    case 'delete-frame': {
      try {
        const result = deleteFrame(msg.nodeId as string);
        sendResult('delete-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('delete-result', errMsg);
      }
      break;
    }

    case 'get-file-info':
      sendFileInfo();
      break;

    case 'save-file-key': {
      const newFileKey = msg.fileKey as string;
      if (newFileKey && newFileKey.trim()) {
        saveFileKey(newFileKey.trim());
        figma.ui.postMessage({ type: 'success', message: 'File Key가 저장되었습니다.' });
        sendFileInfo();
      } else {
        figma.ui.postMessage({ type: 'error', message: 'File Key를 입력해주세요.' });
      }
      break;
    }

    case 'resize': {
      const { width, height } = msg.data as { width: number; height: number };
      figma.ui.resize(width, height);
      break;
    }

    case 'reset-position':
      setLastCreatedPosition(null);
      figma.ui.postMessage({ type: 'info', message: '위치가 리셋되었습니다.' });
      break;

    case 'extract-to-json': {
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
      if (!findPath) {
        sendError('find-node-result', 'path가 필요합니다');
        break;
      }

      try {
        const result = findNodeWithDetails(findPath, msg.typeFilter as string | undefined, msg.pageId as string | undefined);
        sendResult('find-node-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('find-node-result', errMsg);
      }
      break;
    }

    case 'get-tree': {
      try {
        const result = getTreeWithFilter({
          nodeId: msg.nodeId as string | undefined,
          path: msg.path as string | string[] | undefined,
          depth: msg.depth as number | string | undefined,
          filter: msg.filter as TreeFilter | undefined,
          limit: msg.limit as number | undefined,
          pageId: msg.pageId as string | undefined,
        });
        figma.ui.postMessage({
          type: 'tree-result',
          success: true,
          result,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('tree-result', errMsg);
      }
      break;
    }

    case 'extract-node-json': {
      const extractNodeId = msg.nodeId as string;
      const extractFormat = (msg.format as 'json' | 'html') || 'json';

      if (!extractNodeId) {
        sendError('extract-node-json-result', 'nodeId가 필요합니다');
        break;
      }

      const targetNode = figma.getNodeById(extractNodeId);
      if (!targetNode) {
        sendError('extract-node-json-result', `노드를 찾을 수 없습니다: ${extractNodeId}`);
        break;
      }

      if (targetNode.type === 'DOCUMENT' || targetNode.type === 'PAGE') {
        sendError('extract-node-json-result', `이 노드 타입은 추출할 수 없습니다: ${targetNode.type}`);
        break;
      }

      try {
        const extracted = extractNodeToJSON(targetNode as SceneNode);
        if (!extracted) {
          sendError('extract-node-json-result', '추출 가능한 데이터가 없습니다');
          break;
        }

        const resultData = extractFormat === 'html'
          ? convertExtractedNodeToHTML(extracted)
          : extracted;

        figma.ui.postMessage({
          type: 'extract-node-json-result',
          success: true,
          result: {
            nodeId: extractNodeId,
            nodeName: targetNode.name,
            nodeType: targetNode.type,
            data: resultData,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('extract-node-json-result', `추출 실패: ${errMsg}`);
      }
      break;
    }

    case 'create-section': {
      try {
        const result = createSection({
          name: msg.name as string | undefined,
          pageId: msg.pageId as string | undefined,
          position: msg.position as { x: number; y: number } | undefined,
          size: msg.size as { width: number; height: number } | undefined,
          children: msg.children as string[] | undefined,
          fills: msg.fills as Paint[] | undefined,
        });
        sendResult('create-section-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-section-result', `Section 생성 실패: ${errMsg}`);
      }
      break;
    }

    case 'move-node': {
      try {
        const result = moveNode(
          msg.nodeId as string,
          msg.parentId as string,
          msg.index as number | undefined
        );
        sendResult('move-node-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('move-node-result', `노드 이동 실패: ${errMsg}`);
      }
      break;
    }

    case 'clone-node': {
      try {
        const result = cloneNode(
          msg.nodeId as string,
          msg.parentId as string | undefined,
          msg.position as { x: number; y: number } | undefined,
          msg.name as string | undefined
        );
        sendResult('clone-node-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('clone-node-result', `노드 복제 실패: ${errMsg}`);
      }
      break;
    }

    case 'export-image': {
      try {
        const result = await exportImage(
          msg.nodeId as string,
          msg.format as string | undefined,
          msg.scale as number | undefined
        );
        sendResult('export-image-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('export-image-result', `export 실패: ${errMsg}`);
      }
      break;
    }

    // === Create Nodes ===
    case 'create-rectangle': {
      try {
        const result = await createRectangle({
          x: msg.x as number,
          y: msg.y as number,
          width: msg.width as number,
          height: msg.height as number,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          fillColor: msg.fillColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeColor: msg.strokeColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeWeight: msg.strokeWeight as number | undefined,
          cornerRadius: msg.cornerRadius as number | undefined,
        });
        sendResult('create-rectangle-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-rectangle-result', errMsg);
      }
      break;
    }

    case 'create-text': {
      try {
        const result = await createText({
          x: msg.x as number,
          y: msg.y as number,
          text: msg.text as string,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          fontSize: msg.fontSize as number | undefined,
          fontFamily: msg.fontFamily as string | undefined,
          fontWeight: msg.fontWeight as number | undefined,
          fontColor: msg.fontColor as { r: number; g: number; b: number; a?: number } | undefined,
          textAlignHorizontal: msg.textAlignHorizontal as string | undefined,
        });
        sendResult('create-text-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-text-result', errMsg);
      }
      break;
    }

    case 'create-empty-frame': {
      try {
        const result = createEmptyFrame(msg as any);
        sendResult('create-empty-frame-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-empty-frame-result', errMsg);
      }
      break;
    }

    // === Selection ===
    case 'get-selection': {
      try {
        const result = getSelection();
        sendResult('get-selection-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-selection-result', errMsg);
      }
      break;
    }

    case 'set-selection': {
      try {
        const result = setSelection(
          msg.nodeIds as string[],
          msg.zoomToFit as boolean | undefined
        );
        sendResult('set-selection-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-selection-result', errMsg);
      }
      break;
    }

    // === Components ===
    case 'get-local-components': {
      try {
        const result = getLocalComponents();
        sendResult('get-local-components-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-local-components-result', errMsg);
      }
      break;
    }

    case 'create-component-instance': {
      try {
        const result = await createComponentInstance(
          msg.componentKey as string,
          Number(msg.x),
          Number(msg.y),
          msg.parentId as string | undefined
        );
        sendResult('create-component-instance-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-component-instance-result', errMsg);
      }
      break;
    }

    case 'get-instance-overrides': {
      try {
        const result = getInstanceOverrides(msg.nodeId as string | undefined);
        sendResult('get-instance-overrides-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-instance-overrides-result', errMsg);
      }
      break;
    }

    case 'set-instance-overrides': {
      try {
        const result = setInstanceOverrides(
          msg.nodeId as string,
          msg.overrides as Record<string, unknown>
        );
        sendResult('set-instance-overrides-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-instance-overrides-result', errMsg);
      }
      break;
    }

    // === Query ===
    case 'get-node-info': {
      try {
        const result = getNodeInfo(msg.nodeId as string);
        sendResult('get-node-info-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-node-info-result', errMsg);
      }
      break;
    }

    case 'get-document-info': {
      try {
        const result = getDocumentInfo();
        sendResult('get-document-info-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-document-info-result', errMsg);
      }
      break;
    }

    case 'get-styles': {
      try {
        const result = await getStyles();
        sendResult('get-styles-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-styles-result', errMsg);
      }
      break;
    }

    // === Batch ===
    case 'scan-text-nodes': {
      try {
        const result = scanTextNodes(msg.nodeId as string);
        sendResult('scan-text-nodes-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('scan-text-nodes-result', errMsg);
      }
      break;
    }

    case 'scan-nodes-by-types': {
      try {
        const result = scanNodesByTypes(msg.nodeId as string, msg.types as string[]);
        sendResult('scan-nodes-by-types-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('scan-nodes-by-types-result', errMsg);
      }
      break;
    }

    case 'batch-modify': {
      try {
        const result = await batchModify(msg.operations as any[]);
        sendResult('batch-modify-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('batch-modify-result', errMsg);
      }
      break;
    }

    case 'batch-delete': {
      try {
        const result = batchDelete(msg.nodeIds as string[]);
        sendResult('batch-delete-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('batch-delete-result', errMsg);
      }
      break;
    }

    case 'set-multiple-text-contents': {
      try {
        const result = await setMultipleTextContents(msg.items as Array<{ nodeId: string; text: string }>);
        sendResult('set-multiple-text-contents-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-multiple-text-contents-result', errMsg);
      }
      break;
    }

    // === Query (batch) ===
    case 'get-nodes-info': {
      try {
        const result = getNodesInfo(msg.nodeIds as string[]);
        sendResult('get-nodes-info-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-nodes-info-result', errMsg);
      }
      break;
    }

    case 'read-my-design': {
      try {
        const result = readMyDesign();
        sendResult('read-my-design-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('read-my-design-result', errMsg);
      }
      break;
    }

    // === Annotations ===
    case 'get-annotations': {
      try {
        const result = getAnnotations(msg.nodeId as string | undefined);
        sendResult('get-annotations-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-annotations-result', errMsg);
      }
      break;
    }

    case 'set-annotation': {
      try {
        const result = setAnnotation(
          msg.nodeId as string,
          msg.label as string,
          msg.labelType as string | undefined
        );
        sendResult('set-annotation-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-annotation-result', errMsg);
      }
      break;
    }

    case 'set-multiple-annotations': {
      try {
        const result = setMultipleAnnotations(msg.items as Array<{ nodeId: string; label: string; labelType?: string }>);
        sendResult('set-multiple-annotations-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-multiple-annotations-result', errMsg);
      }
      break;
    }

    // === Prototyping ===
    case 'get-reactions': {
      try {
        const result = getReactions(msg.nodeId as string | undefined);
        sendResult('get-reactions-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-reactions-result', errMsg);
      }
      break;
    }

    case 'add-reaction': {
      try {
        const result = addReaction({
          nodeId: msg.nodeId as string,
          trigger: msg.trigger as string,
          action: msg.action as string,
          destinationId: msg.destinationId as string | undefined,
          url: msg.url as string | undefined,
          transition: msg.transition as { type: string; duration?: number; direction?: string } | undefined,
          preserveScrollPosition: msg.preserveScrollPosition as boolean | undefined,
        });
        sendResult('add-reaction-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('add-reaction-result', errMsg);
      }
      break;
    }

    case 'remove-reactions': {
      try {
        const result = removeReactions(
          msg.nodeId as string,
          msg.triggerType as string | undefined
        );
        sendResult('remove-reactions-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('remove-reactions-result', errMsg);
      }
      break;
    }

    case 'cancel':
      figma.closePlugin();
      break;
  }
};
