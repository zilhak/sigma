import type { ExtractedNode, TreeFilter } from '@sigma/shared';
import { createFrameFromJSON, createFrameFromHTML, updateExistingFrame, setLastCreatedPosition } from './converter';
import { extractNodeToJSON } from './extractor';
import { convertExtractedNodeToHTML } from './extractor';
import { getTargetPage, getAllPages, sendFileInfo, saveFileKey, createPage, renamePage, switchPage, deletePage } from './node-ops';
import { findNodeWithDetails, getTreeWithFilter } from './node-ops';
import { executeModifyNode } from './node-ops';
import { getFrames, deleteFrame } from './node-ops';
import { createSection } from './node-ops';
import { groupNodes, ungroupNodes, flattenNodes, moveNode, cloneNode } from './node-ops';
import { exportImage } from './node-ops';
import { createRectangle, createText, createEmptyFrame, createEllipse, createPolygon, createStar, createLine, createVector, createImageNode } from './node-ops';
import { getSelection, setSelection, getViewport, setViewport } from './node-ops';
import { getLocalComponents, createComponentInstance, getInstanceOverrides, setInstanceOverrides } from './node-ops';
import { getNodeInfo, getDocumentInfo, getStyles, getNodesInfo, readMyDesign } from './node-ops';
import { scanTextNodes, scanNodesByTypes, batchModify, batchDelete, setMultipleTextContents } from './node-ops';
import { getAnnotations, setAnnotation, setMultipleAnnotations } from './node-ops';
import { getReactions, addReaction, removeReactions } from './node-ops';
import { performBooleanOperation } from './node-ops';
import { createPaintStyle, createTextStyle, createEffectStyle, createGridStyle, applyStyle, deleteStyle } from './node-ops';
import { createVariableCollection, createVariable, getVariables, setVariableValue, bindVariable, addVariableMode, setVariableScopes, setVariableAlias, setVariableCodeSyntax } from './node-ops';
import { createNodeFromSvg } from './node-ops';
import { listAvailableFonts, getNodeCSS } from './node-ops';
import { createComponent, convertToComponent, createComponentSet, addComponentProperty, editComponentProperty, deleteComponentProperty, getComponentPropertyDefinitions, detachInstance, swapComponent } from './node-ops';
import { getAvailableLibraries, getLibraryComponents, getLibraryVariables, importLibraryComponent, importLibraryStyle } from './node-ops';
import { setExportSettings, getExportSettings } from './node-ops';
import { createSticky, createConnector } from './node-ops';
import { testRoundtripJSON, testRoundtripHTML } from './testing';

/**
 * ExtractedNode 트리에서 svgString이 없는 SVG 노드를 찾아
 * exportAsync로 SVG 데이터를 비동기 보충
 */
async function enrichSvgData(extracted: ExtractedNode): Promise<void> {
  // svgString이 없는 SVG 태그 → exportAsync로 보충
  if (extracted.tagName === 'svg' && !extracted.svgString) {
    const figmaNode = figma.getNodeById(extracted.id);
    if (figmaNode && 'exportAsync' in figmaNode) {
      try {
        const svgBytes = await (figmaNode as SceneNode).exportAsync({ format: 'SVG' });
        const chars: string[] = [];
        for (let i = 0; i < svgBytes.length; i++) {
          chars.push(String.fromCharCode(svgBytes[i]));
        }
        extracted.svgString = chars.join('');
      } catch { /* export 실패 시 무시 */ }
    }
  }
  // 자식 재귀
  if (extracted.children) {
    for (const child of extracted.children) {
      await enrichSvgData(child);
    }
  }
}

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

// 선택 변경 시 UI에 정보 전송
function sendSelectionInfo() {
  const selection = figma.currentPage.selection;
  const nodes = selection.map(node => ({
    id: node.id,
    name: node.name,
    type: node.type,
    x: 'x' in node ? (node as SceneNode).x : 0,
    y: 'y' in node ? (node as SceneNode).y : 0,
    width: 'width' in node ? (node as SceneNode).width : 0,
    height: 'height' in node ? (node as SceneNode).height : 0,
  }));

  figma.ui.postMessage({
    type: 'selection-changed',
    nodes,
    viewport: {
      centerX: figma.viewport.center.x,
      centerY: figma.viewport.center.y,
      zoom: figma.viewport.zoom,
    },
  });
}

figma.on('selectionchange', sendSelectionInfo);

// 뷰포트 변경 감지 (폴링, 500ms 간격)
let lastViewportX = figma.viewport.center.x;
let lastViewportY = figma.viewport.center.y;
let lastViewportZoom = figma.viewport.zoom;

setInterval(() => {
  const cx = figma.viewport.center.x;
  const cy = figma.viewport.center.y;
  const z = figma.viewport.zoom;

  if (cx !== lastViewportX || cy !== lastViewportY || z !== lastViewportZoom) {
    lastViewportX = cx;
    lastViewportY = cy;
    lastViewportZoom = z;
    sendSelectionInfo();
  }
}, 500);

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

        // HTML 포맷: SVG 데이터 비동기 보충 후 변환
        if (extractFormat === 'html') {
          await enrichSvgData(extracted);
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

    case 'group-nodes': {
      try {
        const result = groupNodes(
          msg.nodeIds as string[],
          msg.name as string | undefined
        );
        sendResult('group-nodes-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('group-nodes-result', `그룹화 실패: ${errMsg}`);
      }
      break;
    }

    case 'ungroup-nodes': {
      try {
        const result = ungroupNodes(msg.nodeId as string);
        sendResult('ungroup-nodes-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('ungroup-nodes-result', `그룹 해제 실패: ${errMsg}`);
      }
      break;
    }

    case 'flatten-nodes': {
      try {
        const result = flattenNodes(
          msg.nodeIds as string[],
          msg.name as string | undefined
        );
        sendResult('flatten-nodes-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('flatten-nodes-result', `Flatten 실패: ${errMsg}`);
      }
      break;
    }

    case 'boolean-operation': {
      try {
        const result = performBooleanOperation(
          msg.nodeIds as string[],
          msg.operation as 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE',
          msg.name as string | undefined
        );
        sendResult('boolean-operation-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('boolean-operation-result', `Boolean 연산 실패: ${errMsg}`);
      }
      break;
    }

    case 'create-page': {
      try {
        const result = createPage(msg.name as string | undefined);
        sendResult('create-page-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-page-result', `페이지 생성 실패: ${errMsg}`);
      }
      break;
    }

    case 'rename-page': {
      try {
        const result = renamePage(msg.pageId as string, msg.name as string);
        sendResult('rename-page-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('rename-page-result', `페이지 이름 변경 실패: ${errMsg}`);
      }
      break;
    }

    case 'switch-page': {
      try {
        const result = switchPage(msg.pageId as string);
        sendResult('switch-page-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('switch-page-result', `페이지 전환 실패: ${errMsg}`);
      }
      break;
    }

    case 'delete-page': {
      try {
        const result = deletePage(msg.pageId as string);
        sendResult('delete-page-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('delete-page-result', `페이지 삭제 실패: ${errMsg}`);
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

    case 'create-ellipse': {
      try {
        const result = createEllipse({
          x: msg.x as number,
          y: msg.y as number,
          width: msg.width as number,
          height: msg.height as number,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          fillColor: msg.fillColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeColor: msg.strokeColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeWeight: msg.strokeWeight as number | undefined,
          arcData: msg.arcData as { startingAngle: number; endingAngle: number; innerRadius: number } | undefined,
        });
        sendResult('create-ellipse-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-ellipse-result', errMsg);
      }
      break;
    }

    case 'create-polygon': {
      try {
        const result = createPolygon({
          x: msg.x as number,
          y: msg.y as number,
          width: msg.width as number,
          height: msg.height as number,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          fillColor: msg.fillColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeColor: msg.strokeColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeWeight: msg.strokeWeight as number | undefined,
          pointCount: msg.pointCount as number | undefined,
        });
        sendResult('create-polygon-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-polygon-result', errMsg);
      }
      break;
    }

    case 'create-star': {
      try {
        const result = createStar({
          x: msg.x as number,
          y: msg.y as number,
          width: msg.width as number,
          height: msg.height as number,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          fillColor: msg.fillColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeColor: msg.strokeColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeWeight: msg.strokeWeight as number | undefined,
          pointCount: msg.pointCount as number | undefined,
          innerRadius: msg.innerRadius as number | undefined,
        });
        sendResult('create-star-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-star-result', errMsg);
      }
      break;
    }

    case 'create-line': {
      try {
        const result = createLine({
          x: msg.x as number,
          y: msg.y as number,
          length: msg.length as number,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          strokeColor: msg.strokeColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeWeight: msg.strokeWeight as number | undefined,
          rotation: msg.rotation as number | undefined,
          dashPattern: msg.dashPattern as number[] | undefined,
        });
        sendResult('create-line-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-line-result', errMsg);
      }
      break;
    }

    case 'create-vector': {
      try {
        const result = createVector({
          x: msg.x as number,
          y: msg.y as number,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          fillColor: msg.fillColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeColor: msg.strokeColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeWeight: msg.strokeWeight as number | undefined,
          vectorPaths: msg.vectorPaths as Array<{ windingRule: 'NONZERO' | 'EVENODD'; data: string }> | undefined,
        });
        sendResult('create-vector-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-vector-result', errMsg);
      }
      break;
    }

    case 'create-image-node': {
      try {
        const result = createImageNode({
          x: msg.x as number,
          y: msg.y as number,
          width: msg.width as number,
          height: msg.height as number,
          imageData: msg.imageData as string,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          scaleMode: msg.scaleMode as 'FILL' | 'FIT' | 'CROP' | 'TILE' | undefined,
          cornerRadius: msg.cornerRadius as number | undefined,
        });
        sendResult('create-image-node-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-image-node-result', errMsg);
      }
      break;
    }

    // === Styles ===

    case 'create-paint-style': {
      try {
        const result = createPaintStyle({
          name: msg.name as string,
          paints: msg.paints as any[],
          description: msg.description as string | undefined,
        });
        sendResult('create-paint-style-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-paint-style-result', errMsg);
      }
      break;
    }

    case 'create-text-style': {
      try {
        const result = await createTextStyle({
          name: msg.name as string,
          fontSize: msg.fontSize as number | undefined,
          fontFamily: msg.fontFamily as string | undefined,
          fontWeight: msg.fontWeight as string | undefined,
          lineHeight: msg.lineHeight as any,
          letterSpacing: msg.letterSpacing as any,
          textCase: msg.textCase as any,
          textDecoration: msg.textDecoration as any,
          description: msg.description as string | undefined,
        });
        sendResult('create-text-style-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-text-style-result', errMsg);
      }
      break;
    }

    case 'create-effect-style': {
      try {
        const result = createEffectStyle({
          name: msg.name as string,
          effects: msg.effects as any[],
          description: msg.description as string | undefined,
        });
        sendResult('create-effect-style-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-effect-style-result', errMsg);
      }
      break;
    }

    case 'create-grid-style': {
      try {
        const result = createGridStyle({
          name: msg.name as string,
          grids: msg.grids as any[],
          description: msg.description as string | undefined,
        });
        sendResult('create-grid-style-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-grid-style-result', errMsg);
      }
      break;
    }

    case 'apply-style': {
      try {
        const result = await applyStyle({
          nodeId: msg.nodeId as string,
          styleType: msg.styleType as 'fill' | 'stroke' | 'text' | 'effect' | 'grid',
          styleId: msg.styleId as string,
        });
        sendResult('apply-style-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('apply-style-result', errMsg);
      }
      break;
    }

    case 'delete-style': {
      try {
        const result = deleteStyle(msg.styleId as string);
        sendResult('delete-style-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('delete-style-result', errMsg);
      }
      break;
    }

    // === Variables ===

    case 'create-variable-collection': {
      try {
        const result = createVariableCollection(msg.name as string);
        sendResult('create-variable-collection-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-variable-collection-result', errMsg);
      }
      break;
    }

    case 'create-variable': {
      try {
        const result = createVariable({
          name: msg.name as string,
          collectionId: msg.collectionId as string,
          resolvedType: msg.resolvedType as 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN',
        });
        sendResult('create-variable-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-variable-result', errMsg);
      }
      break;
    }

    case 'get-variables': {
      try {
        const result = getVariables(msg.variableType as string | undefined);
        sendResult('get-variables-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-variables-result', errMsg);
      }
      break;
    }

    case 'set-variable-value': {
      try {
        const result = setVariableValue({
          variableId: msg.variableId as string,
          modeId: msg.modeId as string,
          value: msg.value,
        });
        sendResult('set-variable-value-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-variable-value-result', errMsg);
      }
      break;
    }

    case 'bind-variable': {
      try {
        const result = await bindVariable({
          nodeId: msg.nodeId as string,
          field: msg.field as string,
          variableId: msg.variableId as string,
        });
        sendResult('bind-variable-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('bind-variable-result', errMsg);
      }
      break;
    }

    case 'add-variable-mode': {
      try {
        const result = addVariableMode(msg.collectionId as string, msg.name as string);
        sendResult('add-variable-mode-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('add-variable-mode-result', errMsg);
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

    // === Viewport ===
    case 'get-viewport': {
      try {
        const result = getViewport();
        sendResult('get-viewport-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-viewport-result', errMsg);
      }
      break;
    }

    case 'set-viewport': {
      try {
        const result = setViewport({
          center: msg.center as { x: number; y: number } | undefined,
          zoom: msg.zoom as number | undefined,
          nodeIds: msg.nodeIds as string[] | undefined,
        });
        sendResult('set-viewport-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-viewport-result', errMsg);
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

    // === Component System (New) ===

    case 'create-component': {
      try {
        const result = createComponent({
          x: msg.x as number,
          y: msg.y as number,
          width: msg.width as number,
          height: msg.height as number,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
        });
        sendResult('create-component-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-component-result', errMsg);
      }
      break;
    }

    case 'convert-to-component': {
      try {
        const result = convertToComponent(msg.nodeId as string);
        sendResult('convert-to-component-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('convert-to-component-result', errMsg);
      }
      break;
    }

    case 'create-component-set': {
      try {
        const result = createComponentSet(
          msg.componentIds as string[],
          msg.name as string | undefined
        );
        sendResult('create-component-set-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-component-set-result', errMsg);
      }
      break;
    }

    case 'add-component-property': {
      try {
        const result = addComponentProperty(
          msg.nodeId as string,
          msg.propertyName as string,
          msg.propertyType as string,
          msg.defaultValue
        );
        sendResult('add-component-property-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('add-component-property-result', errMsg);
      }
      break;
    }

    case 'edit-component-property': {
      try {
        const result = editComponentProperty(
          msg.nodeId as string,
          msg.propertyName as string,
          msg.newValues as Record<string, unknown>
        );
        sendResult('edit-component-property-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('edit-component-property-result', errMsg);
      }
      break;
    }

    case 'delete-component-property': {
      try {
        const result = deleteComponentProperty(
          msg.nodeId as string,
          msg.propertyName as string
        );
        sendResult('delete-component-property-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('delete-component-property-result', errMsg);
      }
      break;
    }

    case 'get-component-properties': {
      try {
        const result = getComponentPropertyDefinitions(msg.nodeId as string);
        sendResult('get-component-properties-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-component-properties-result', errMsg);
      }
      break;
    }

    case 'detach-instance': {
      try {
        const result = detachInstance(msg.nodeId as string);
        sendResult('detach-instance-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('detach-instance-result', errMsg);
      }
      break;
    }

    case 'swap-component': {
      try {
        const result = await swapComponent(
          msg.nodeId as string,
          msg.newComponentKey as string
        );
        sendResult('swap-component-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('swap-component-result', errMsg);
      }
      break;
    }

    // === Creation (New) ===

    case 'create-node-from-svg': {
      try {
        const result = createNodeFromSvg({
          svgString: msg.svgString as string,
          x: msg.x as number | undefined,
          y: msg.y as number | undefined,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
        });
        sendResult('create-node-from-svg-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-node-from-svg-result', errMsg);
      }
      break;
    }

    // === Query (New) ===

    case 'list-fonts': {
      try {
        const result = await listAvailableFonts();
        sendResult('list-fonts-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('list-fonts-result', errMsg);
      }
      break;
    }

    case 'get-css': {
      try {
        const result = await getNodeCSS(msg.nodeId as string);
        sendResult('get-css-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-css-result', errMsg);
      }
      break;
    }

    // === Variables Advanced (New) ===

    case 'set-variable-scopes': {
      try {
        const result = setVariableScopes(
          msg.variableId as string,
          msg.scopes as string[]
        );
        sendResult('set-variable-scopes-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-variable-scopes-result', errMsg);
      }
      break;
    }

    case 'set-variable-alias': {
      try {
        const result = setVariableAlias(
          msg.variableId as string,
          msg.modeId as string,
          msg.aliasTargetId as string
        );
        sendResult('set-variable-alias-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-variable-alias-result', errMsg);
      }
      break;
    }

    case 'set-variable-code-syntax': {
      try {
        const result = setVariableCodeSyntax(
          msg.variableId as string,
          msg.platform as string,
          msg.syntax as string
        );
        sendResult('set-variable-code-syntax-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-variable-code-syntax-result', errMsg);
      }
      break;
    }

    // === Team Library (New) ===

    case 'get-libraries': {
      try {
        const result = await getAvailableLibraries();
        sendResult('get-libraries-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-libraries-result', errMsg);
      }
      break;
    }

    case 'get-library-components': {
      try {
        const result = await getLibraryComponents(msg.libraryKey as string);
        sendResult('get-library-components-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-library-components-result', errMsg);
      }
      break;
    }

    case 'get-library-variables': {
      try {
        const result = await getLibraryVariables(msg.collectionKey as string);
        sendResult('get-library-variables-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-library-variables-result', errMsg);
      }
      break;
    }

    case 'import-library-component': {
      try {
        const result = await importLibraryComponent(msg.key as string);
        sendResult('import-library-component-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('import-library-component-result', errMsg);
      }
      break;
    }

    case 'import-library-style': {
      try {
        const result = await importLibraryStyle(msg.key as string);
        sendResult('import-library-style-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('import-library-style-result', errMsg);
      }
      break;
    }

    // === Utilities (New) ===

    case 'notify': {
      try {
        const message = msg.message as string;
        if (!message) {
          sendError('notify-result', 'message가 필요합니다');
          break;
        }
        const options = msg.options as { timeout?: number; error?: boolean } | undefined;
        figma.notify(message, options);
        sendResult('notify-result', { notified: true, message });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('notify-result', errMsg);
      }
      break;
    }

    case 'commit-undo': {
      try {
        figma.commitUndo();
        sendResult('commit-undo-result', { committed: true });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('commit-undo-result', errMsg);
      }
      break;
    }

    case 'trigger-undo': {
      try {
        figma.triggerUndo();
        sendResult('trigger-undo-result', { undone: true });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('trigger-undo-result', errMsg);
      }
      break;
    }

    case 'save-version': {
      try {
        const title = msg.title as string;
        if (!title) {
          sendError('save-version-result', 'title이 필요합니다');
          break;
        }
        await figma.saveVersionHistoryAsync(title, msg.description as string | undefined);
        sendResult('save-version-result', { saved: true, title });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('save-version-result', errMsg);
      }
      break;
    }

    case 'set-export-settings': {
      try {
        const result = setExportSettings(
          msg.nodeId as string,
          msg.settings as ExportSettings[]
        );
        sendResult('set-export-settings-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-export-settings-result', errMsg);
      }
      break;
    }

    case 'get-export-settings': {
      try {
        const result = getExportSettings(msg.nodeId as string);
        sendResult('get-export-settings-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('get-export-settings-result', errMsg);
      }
      break;
    }

    // === FigJam (New) ===

    case 'create-sticky': {
      try {
        const result = await createSticky({
          text: msg.text as string | undefined,
          x: msg.x as number | undefined,
          y: msg.y as number | undefined,
          parentId: msg.parentId as string | undefined,
        });
        sendResult('create-sticky-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-sticky-result', errMsg);
      }
      break;
    }

    case 'create-connector': {
      try {
        const result = createConnector({
          startNodeId: msg.startNodeId as string,
          endNodeId: msg.endNodeId as string,
          strokeColor: msg.strokeColor as { r: number; g: number; b: number; a?: number } | undefined,
          strokeWeight: msg.strokeWeight as number | undefined,
        });
        sendResult('create-connector-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('create-connector-result', errMsg);
      }
      break;
    }

    case 'cancel':
      figma.closePlugin();
      break;
  }
};
