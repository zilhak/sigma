import type { ExtractedNode, TreeFilter, ComponentParam } from '@sigma/shared';
import { createFrameFromJSON, createFrameFromHTML, updateExistingFrame } from './converter';
import { extractNodeToJSON } from './extractor';
import { convertExtractedNodeToHTML } from './extractor';
import { getTargetPage, getPageById, getAllPages, sendFileInfo, saveFileKey, createPage, renamePage, switchPage, deletePage, reorderPage } from './node-ops';
import { findNodeWithDetails, getTreeWithFilter } from './node-ops';
import { executeModifyNode } from './node-ops';
import { deleteFrame } from './node-ops';
import { isReachable } from './node-ops/removal';
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
import { setHyperlink } from './node-ops';
import { performBooleanOperation } from './node-ops';
import { createPaintStyle, createTextStyle, createEffectStyle, createGridStyle, applyStyle, deleteStyle } from './node-ops';
import { createVariableCollection, createVariable, getVariables, setVariableValue, bindVariable, addVariableMode, setVariableScopes, setVariableAlias, setVariableCodeSyntax, renameVariable, deleteVariable } from './node-ops';
import { createNodeFromSvg } from './node-ops';
import { listAvailableFonts, getNodeCSS } from './node-ops';
import { createComponent, convertToComponent, createComponentSet, addComponentProperty, editComponentProperty, deleteComponentProperty, getComponentPropertyDefinitions, detachInstance, swapComponent } from './node-ops';
import { buildComponentFromSpec, useComponentSpec, setComponentSpecInstanceProps } from './node-ops';
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

// postMessage 응답 헬퍼(sendResult/sendError)는 figma.ui.onmessage 핸들러 내부에서
// 매 메시지의 commandId를 클로저로 캡처하는 지역 함수로 정의된다 (아래 참고).
// 전역/모듈 스코프에 두면 async 인터리브 시 commandId가 뒤섞이므로 의도적으로 지역화했다.

// 초기 파일 정보 전달
sendFileInfo();

// 페이지 변경 시 업데이트
figma.on('currentpagechange', () => {
  sendFileInfo();
});

// 노드의 부모 경로 구하기
function getNodePath(node: BaseNode): string {
  const parts: string[] = [];
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' > ');
}

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
    parentPath: getNodePath(node),
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

// pageId(바인딩 page)를 대상으로 노드를 생성하는 command 집합 — 아래 유효성 검증에만 쓴다.
// 각 명령은 getTargetPage(pageId)로 얻은 page에 노드를 직접 배치하므로 활성 page를
// 전환하지 않는다. create-from-json/html, create-section 등은 자체적으로 동일하게
// 처리하므로 여기 없어도 무방하다(검증 범위만의 차이).
const PAGE_SCOPED_CREATE = new Set([
  'create-rectangle', 'create-text', 'create-empty-frame', 'create-ellipse',
  'create-polygon', 'create-star', 'create-line', 'create-vector',
  'create-image-node', 'create-component-instance', 'create-component',
  'create-component-set', 'create-node-from-svg', 'create-sticky', 'create-connector',
  'build-component-from-spec', 'use-component-spec',
]);

// 메시지 핸들러
figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
  // 이 메시지(요청)의 commandId를 클로저 지역으로 캡처한다. 각 onmessage 호출은
  // 자기만의 commandId를 가지므로, await로 처리가 인터리브돼도 sendResult/sendError가
  // 항상 "이 요청"의 commandId를 응답에 실어 보낸다 (전역 슬롯 교차 버그 제거).
  const commandId = msg.commandId as string | undefined;
  const sendResult = (type: string, result: unknown) =>
    figma.ui.postMessage({ type, commandId, success: true, result });
  const sendError = (type: string, error: string) =>
    figma.ui.postMessage({ type, commandId, success: false, error });

  // ── 바인딩 page 유효성 검증 ──
  // create 계열은 targetPage(=getTargetPage(pageId))로 노드를 직접 배치한다(placeNode 참조).
  // getTargetPage는 stale한 pageId를 만나면 조용히 currentPage로 폴백하므로, 여기서
  // 존재 여부만 미리 끊어 엉뚱한 page에 생성되는 것을 막는다.
  // (과거에는 이 지점에서 figma.currentPage를 바인딩 page로 전환했다. 사용자가 보던
  //  page/뷰를 MCP 작업이 강제로 흔드는 부작용이 있어 제거했다.)
  if (PAGE_SCOPED_CREATE.has(msg.type) && typeof msg.pageId === 'string' && msg.pageId) {
    if (!getPageById(msg.pageId)) {
      sendError(`${msg.type}-result`, `바인딩된 페이지(${msg.pageId})를 찾을 수 없습니다. sigma_bind로 다시 바인딩하세요.`);
      return;
    }
  }

  switch (msg.type) {
    case 'create-from-json': {
      const position = msg.position as { x: number; y: number } | undefined;
      const pageId = msg.pageId as string | undefined;
      const forceAbsolute = msg.forceAbsolute as boolean | undefined;
      await createFrameFromJSON(msg.data as ExtractedNode, msg.name as string | undefined, position, pageId, getTargetPage, forceAbsolute, msg.focusView === true);
      break;
    }

    case 'create-from-html': {
      const htmlPosition = msg.position as { x: number; y: number } | undefined;
      const htmlPageId = msg.pageId as string | undefined;
      const htmlForceAbsolute = msg.forceAbsolute as boolean | undefined;
      await createFrameFromHTML(msg.data as string, msg.name as string | undefined, htmlPosition, htmlPageId, getTargetPage, htmlForceAbsolute, msg.focusView === true);
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

    case 'set-page-data': {
      // sigma 전용 페이지/문서 메타데이터 저장 (modify_node 가드 우회 전용 경로).
      // namespace는 항상 "sigma"로 고정 — 형식/검증은 서버 핸들러가 담당하고
      // 여기서는 대상 노드 해석 + sharedPluginData 저장만 한다.
      const setKey = msg.key as string;
      const setValue = msg.value as string;
      const setPageId = msg.pageId as string | undefined;
      if (!setKey) {
        sendError('set-page-data-result', 'key가 필요합니다');
        break;
      }
      const setTarget: BaseNode | null =
        setPageId === 'document' ? figma.root
          : setPageId ? getPageById(setPageId)
          : figma.currentPage;
      if (!setTarget) {
        sendError('set-page-data-result', `페이지를 찾을 수 없습니다: ${setPageId}`);
        break;
      }
      try {
        setTarget.setSharedPluginData('sigma', setKey, setValue);
        sendResult('set-page-data-result', {
          targetId: setTarget.id,
          targetType: setTarget.type,
          targetName: setTarget.name,
          key: setKey,
        });
      } catch (error) {
        sendError('set-page-data-result', error instanceof Error ? error.message : 'Unknown error');
      }
      break;
    }

    case 'get-page-data': {
      const getKey = msg.key as string | undefined;
      const getPageId = msg.pageId as string | undefined;
      const getTarget: BaseNode | null =
        getPageId === 'document' ? figma.root
          : getPageId ? getPageById(getPageId)
          : figma.currentPage;
      if (!getTarget) {
        sendError('get-page-data-result', `페이지를 찾을 수 없습니다: ${getPageId}`);
        break;
      }
      try {
        if (getKey) {
          const raw = getTarget.getSharedPluginData('sigma', getKey);
          sendResult('get-page-data-result', {
            targetId: getTarget.id,
            targetName: getTarget.name,
            key: getKey,
            value: raw === '' ? null : raw,
          });
        } else {
          // key 미지정 → sigma namespace 전체 key/value 맵
          const keys = getTarget.getSharedPluginDataKeys('sigma');
          const data: Record<string, string> = {};
          for (const k of keys) {
            data[k] = getTarget.getSharedPluginData('sigma', k);
          }
          sendResult('get-page-data-result', {
            targetId: getTarget.id,
            targetName: getTarget.name,
            keys,
            data,
          });
        }
      } catch (error) {
        sendError('get-page-data-result', error instanceof Error ? error.message : 'Unknown error');
      }
      break;
    }

    case 'set-node-data': {
      // 임의(scene) 노드에 sigma sharedPluginData 저장. 예약 키 "lint-ignore" = 룰 억제.
      const snKey = msg.key as string;
      const snValue = msg.value as string;
      const snNodeId = msg.nodeId as string;
      if (!snNodeId) { sendError('set-node-data-result', 'nodeId가 필요합니다'); break; }
      if (!snKey) { sendError('set-node-data-result', 'key가 필요합니다'); break; }
      const snNode = figma.getNodeById(snNodeId);
      // 지워진 COMPONENT 는 id 로 계속 조회된다 — 거기에 써 봐야 아무 데도 영향이 없다(조용한 no-op).
      if (!snNode || !isReachable(snNode)) { sendError('set-node-data-result', `노드를 찾을 수 없습니다: ${snNodeId}`); break; }
      try {
        snNode.setSharedPluginData('sigma', snKey, snValue);
        sendResult('set-node-data-result', { nodeId: snNode.id, nodeType: snNode.type, nodeName: snNode.name, key: snKey });
      } catch (error) {
        sendError('set-node-data-result', error instanceof Error ? error.message : 'Unknown error');
      }
      break;
    }

    case 'get-node-data': {
      const gnKey = msg.key as string | undefined;
      const gnNodeId = msg.nodeId as string;
      if (!gnNodeId) { sendError('get-node-data-result', 'nodeId가 필요합니다'); break; }
      const gnNode = figma.getNodeById(gnNodeId);
      if (!gnNode || !isReachable(gnNode)) { sendError('get-node-data-result', `노드를 찾을 수 없습니다: ${gnNodeId}`); break; }
      try {
        if (gnKey) {
          const raw = gnNode.getSharedPluginData('sigma', gnKey);
          sendResult('get-node-data-result', { nodeId: gnNode.id, nodeName: gnNode.name, key: gnKey, value: raw === '' ? null : raw });
        } else {
          const keys = gnNode.getSharedPluginDataKeys('sigma');
          const data: Record<string, string> = {};
          for (const k of keys) data[k] = gnNode.getSharedPluginData('sigma', k);
          sendResult('get-node-data-result', { nodeId: gnNode.id, nodeName: gnNode.name, keys, data });
        }
      } catch (error) {
        sendError('get-node-data-result', error instanceof Error ? error.message : 'Unknown error');
      }
      break;
    }

    case 'get-nodes-data': {
      // 배치 조회: nodeIds 각각의 sigma sharedPluginData[key] (lint suppress 필터용).
      const gndKey = msg.key as string;
      const gndIds = (msg.nodeIds as string[] | undefined) || [];
      if (!gndKey) { sendError('get-nodes-data-result', 'key가 필요합니다'); break; }
      try {
        const map: Record<string, string> = {};
        for (const id of gndIds) {
          const n = figma.getNodeById(id);
          if (!n) continue;
          const raw = n.getSharedPluginData('sigma', gndKey);
          if (raw !== '') map[id] = raw;
        }
        sendResult('get-nodes-data-result', { key: gndKey, data: map });
      } catch (error) {
        sendError('get-nodes-data-result', error instanceof Error ? error.message : 'Unknown error');
      }
      break;
    }

    case 'get-page-lint': {
      // 플러그인 UI 전용 — 현재 페이지의 lint config 를 읽어 UI 로만 돌려준다(서버 forward 안 함).
      // 저장소는 서버 도구(set/get-page-data)와 동일: sharedPluginData("sigma","lint").
      const raw = figma.currentPage.getSharedPluginData('sigma', 'lint');
      figma.ui.postMessage({
        type: 'page-lint-result',
        action: 'get',
        success: true,
        pageName: figma.currentPage.name,
        value: raw === '' ? null : raw,
      });
      break;
    }

    case 'set-page-lint': {
      // data 가 빈 문자열/미지정이면 삭제(clear), 아니면 JSON 검증 후 저장.
      const rawInput = (msg.data as string | undefined) ?? '';
      const trimmed = rawInput.trim();
      if (trimmed === '') {
        figma.currentPage.setSharedPluginData('sigma', 'lint', '');
        figma.ui.postMessage({ type: 'page-lint-result', action: 'clear', success: true, pageName: figma.currentPage.name });
        break;
      }
      try {
        JSON.parse(trimmed);
      } catch (error) {
        figma.ui.postMessage({
          type: 'page-lint-result', action: 'set', success: false,
          error: `유효한 JSON 이 아닙니다: ${error instanceof Error ? error.message : 'parse error'}`,
        });
        break;
      }
      figma.currentPage.setSharedPluginData('sigma', 'lint', trimmed);
      figma.ui.postMessage({ type: 'page-lint-result', action: 'set', success: true, pageName: figma.currentPage.name });
      break;
    }

    case 'goto-node': {
      // 플러그인 UI 전용 — nodeId 로 뷰포트를 옮긴다(서버 forward 안 함).
      // 서버 경로의 set-viewport(nodeIds)와 달리, 못 찾은 id 를 조용히 넘기지 않고
      // UI 에 실패를 알린다(사용자가 직접 타이핑하므로 오타가 흔하다).
      const gotoId = ((msg.nodeId as string | undefined) || '').trim();
      if (!gotoId) {
        figma.ui.postMessage({ type: 'goto-node-result', success: false, error: '노드 ID를 입력하세요' });
        break;
      }
      const gotoNode = figma.getNodeById(gotoId);
      if (!gotoNode) {
        figma.ui.postMessage({ type: 'goto-node-result', success: false, error: `노드를 찾을 수 없습니다: ${gotoId}` });
        break;
      }
      if (gotoNode.type === 'DOCUMENT') {
        figma.ui.postMessage({ type: 'goto-node-result', success: false, error: '문서 루트로는 이동할 수 없습니다' });
        break;
      }
      try {
        // PAGE 는 페이지 전환만 (뷰포트 대상 노드가 아님)
        if (gotoNode.type === 'PAGE') {
          figma.currentPage = gotoNode as PageNode;
          figma.ui.postMessage({
            type: 'goto-node-result', success: true,
            result: { nodeId: gotoNode.id, nodeName: gotoNode.name, nodeType: 'PAGE', pageSwitched: true, pageName: gotoNode.name },
          });
          break;
        }

        // 다른 페이지의 노드면 그 페이지로 먼저 전환해야 scrollAndZoomIntoView 가 동작한다.
        let ancestor: BaseNode | null = gotoNode.parent;
        while (ancestor && ancestor.type !== 'PAGE') {
          ancestor = ancestor.parent;
        }
        if (!ancestor) {
          // 트리에서 분리된 노드(삭제됨 등) — 이동 대상이 없다.
          figma.ui.postMessage({ type: 'goto-node-result', success: false, error: `노드가 페이지에 속해 있지 않습니다: ${gotoId}` });
          break;
        }
        const ownerPage = ancestor as PageNode;
        const pageSwitched = ownerPage.id !== figma.currentPage.id;
        if (pageSwitched) {
          figma.currentPage = ownerPage;
        }

        figma.viewport.scrollAndZoomIntoView([gotoNode as SceneNode]);
        figma.ui.postMessage({
          type: 'goto-node-result', success: true,
          result: {
            nodeId: gotoNode.id, nodeName: gotoNode.name, nodeType: gotoNode.type,
            pageSwitched, pageName: ownerPage.name,
          },
        });
      } catch (error) {
        figma.ui.postMessage({
          type: 'goto-node-result', success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      break;
    }

    case 'get-pages': {
      const pages = getAllPages();
      figma.ui.postMessage({
        type: 'pages-list',
        commandId,
        pages,
        currentPageId: figma.currentPage.id,
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

    case 'extract-to-json': {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'extract-result',
          commandId,
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
          commandId,
          format: 'json',
          success: false,
          error: '추출 가능한 노드가 없습니다.',
        });
        break;
      }

      const resultData = extractedNodes.length === 1 ? extractedNodes[0] : extractedNodes;
      figma.ui.postMessage({
        type: 'extract-result',
        commandId,
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
          commandId,
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
          commandId,
          format: 'html',
          success: false,
          error: '추출 가능한 노드가 없습니다.',
        });
        break;
      }

      figma.ui.postMessage({
        type: 'extract-result',
        commandId,
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
          commandId,
          format: 'json',
          success: false,
          error: 'JSON 데이터가 필요합니다.',
        });
        break;
      }

      const jsonResult = await testRoundtripJSON(jsonData, jsonName);
      figma.ui.postMessage({
        type: 'roundtrip-result',
        commandId,
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
          commandId,
          format: 'html',
          success: false,
          error: 'HTML 데이터가 필요합니다.',
        });
        break;
      }

      const htmlResult = await testRoundtripHTML(htmlData, htmlName);
      figma.ui.postMessage({
        type: 'roundtrip-result',
        commandId,
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
          fields: msg.fields as 'all' | 'geometry' | undefined,
          includeAbsolute: msg.includeAbsolute as boolean | undefined,
        });
        figma.ui.postMessage({
          type: 'tree-result',
          commandId,
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
          commandId,
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
        sendFileInfo(); // 페이지 목록 변경 → 서버 캐시(list_pages/bind용) 갱신
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
        sendFileInfo(); // 페이지 목록 변경 → 서버 캐시(list_pages/bind용) 갱신
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
        sendFileInfo(); // 페이지 목록 변경 → 서버 캐시(list_pages/bind용) 갱신
        sendResult('delete-page-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('delete-page-result', `페이지 삭제 실패: ${errMsg}`);
      }
      break;
    }

    case 'reorder-page': {
      try {
        const result = reorderPage(msg.pageId as string, msg.index as number);
        sendFileInfo(); // 페이지 목록 변경 → 서버 캐시(list_pages/bind용) 갱신
        sendResult('reorder-page-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('reorder-page-result', `페이지 순서 변경 실패: ${errMsg}`);
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
          x: msg.x as number,
          y: msg.y as number,
          text: msg.text as string,
          name: msg.name as string | undefined,
          parentId: msg.parentId as string | undefined,
          fontSize: msg.fontSize as number | undefined,
          fontFamily: msg.fontFamily as string | undefined,
          fontWeight: msg.fontWeight as number | undefined,
          fontColor: msg.fontColor as { r: number; g: number; b: number; a?: number } | undefined,
          textAlignHorizontal: msg.textAlignHorizontal as 'CENTER' | 'LEFT' | 'RIGHT' | 'JUSTIFIED' | undefined,
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
        const result = createEmptyFrame({ ...(msg as any), targetPage: getTargetPage(msg.pageId as string | undefined) });
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          msg.parentId as string | undefined,
          getTargetPage(msg.pageId as string | undefined)
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
        const result = getInstanceOverrides(msg.nodeId as string);
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
        const result = getAnnotations(msg.nodeId as string);
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
        const result = getReactions(msg.nodeId as string);
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

    case 'set-hyperlink': {
      try {
        const result = await setHyperlink({
          links: msg.links as Array<{ a: string; b: string }>,
          direction: msg.direction as 'both' | 'a_to_b' | 'b_to_a' | undefined,
          slot: msg.slot as string | undefined,
          remove: msg.remove as boolean | undefined,
        });
        sendResult('set-hyperlink-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-hyperlink-result', errMsg);
      }
      break;
    }

    // === Component System (New) ===

    case 'create-component': {
      try {
        const result = createComponent({
          targetPage: getTargetPage(msg.pageId as string | undefined),
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

    // === Component Spec System (스펙 기반 컴포넌트) ===

    case 'build-component-from-spec': {
      try {
        const result = await buildComponentFromSpec(
          {
            html: msg.html as string,
            alias: msg.alias as string,
            // ⚠️ 여기는 전달 필드를 손으로 나열한다 — 서버가 새 인자를 보내도 이 목록에 없으면
            // **조용히 사라진다**(get-tree 의 fields/includeAbsolute 가 같은 이유로 없어졌다).
            // 인자를 늘릴 때 이 줄을 함께 고칠 것.
            namespace: msg.namespace as string | undefined,
            params: msg.params as ComponentParam[],
            position: msg.position as { x: number; y: number } | undefined,
            pageId: msg.pageId as string | undefined,
            existingNodeId: msg.existingNodeId as string | undefined,
          },
          getTargetPage
        );
        sendResult('build-component-from-spec-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('build-component-from-spec-result', errMsg);
      }
      break;
    }

    case 'use-component-spec': {
      try {
        const result = await useComponentSpec(
          {
            componentNodeId: msg.componentNodeId as string,
            alias: msg.alias as string,
            props: msg.props as Record<string, string> | undefined,
            position: msg.position as { x: number; y: number } | undefined,
            width: msg.width as number | undefined,
            height: msg.height as number | undefined,
            parentId: msg.parentId as string | undefined,
            pageId: msg.pageId as string | undefined,
            expectedFileId: msg.expectedFileId as string | undefined,
            specFileName: msg.specFileName as string | undefined,
          },
          getTargetPage
        );
        sendResult('use-component-spec-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('use-component-spec-result', errMsg);
      }
      break;
    }

    case 'set-component-spec-instance-props': {
      try {
        const result = await setComponentSpecInstanceProps({
          nodeId: msg.nodeId as string,
          props: msg.props as Record<string, string>,
        });
        sendResult('set-component-spec-instance-props-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('set-component-spec-instance-props-result', errMsg);
      }
      break;
    }

    case 'create-component-set': {
      try {
        const result = createComponentSet(
          msg.componentIds as string[],
          msg.name as string | undefined,
          getTargetPage(msg.pageId as string | undefined)
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
          msg.propertyType as 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP' | 'VARIANT',
          msg.defaultValue as string | boolean
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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

    case 'rename-variable': {
      try {
        const result = renameVariable(
          msg.variableId as string,
          msg.name as string
        );
        sendResult('rename-variable-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('rename-variable-result', errMsg);
      }
      break;
    }

    case 'delete-variable': {
      try {
        const result = deleteVariable(msg.variableId as string);
        sendResult('delete-variable-result', result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        sendError('delete-variable-result', errMsg);
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
          targetPage: getTargetPage(msg.pageId as string | undefined),
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
