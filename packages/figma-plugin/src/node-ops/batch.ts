/**
 * 배치 작업: 텍스트 스캔, 타입별 스캔, 일괄 수정/삭제
 * cursor-talk-to-figma의 scan_text_nodes, scan_nodes_by_types,
 * set_multiple_text_contents, delete_multiple_nodes 참고
 */

import { executeModifyNode } from './modify';

// --- Text Node Scan ---

export interface TextNodeInfo {
  nodeId: string;
  name: string;
  characters: string;
  path: string;
  fontSize: number | typeof figma.mixed;
  fontName: FontName | typeof figma.mixed;
}

export interface ScanTextNodesResult {
  count: number;
  textNodes: TextNodeInfo[];
}

export function scanTextNodes(nodeId: string): ScanTextNodesResult {
  const root = figma.getNodeById(nodeId);
  if (!root) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);

  const textNodes: TextNodeInfo[] = [];

  function walk(node: BaseNode, pathParts: string[]) {
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      textNodes.push({
        nodeId: textNode.id,
        name: textNode.name,
        characters: textNode.characters,
        path: pathParts.join(' > '),
        fontSize: textNode.fontSize,
        fontName: textNode.fontName,
      });
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child, [...pathParts, child.name]);
      }
    }
  }

  walk(root, [root.name]);
  return { count: textNodes.length, textNodes };
}

// --- Scan Nodes by Types ---

export interface ScannedNodeInfo {
  nodeId: string;
  name: string;
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScanNodesByTypesResult {
  count: number;
  nodes: ScannedNodeInfo[];
}

export function scanNodesByTypes(nodeId: string, types: string[]): ScanNodesByTypesResult {
  const root = figma.getNodeById(nodeId);
  if (!root) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);

  const typeSet = new Set(types.map(t => t.toUpperCase()));
  const found: ScannedNodeInfo[] = [];

  function walk(node: BaseNode, pathParts: string[]) {
    if (typeSet.has(node.type)) {
      const scene = node as SceneNode;
      found.push({
        nodeId: scene.id,
        name: scene.name,
        type: scene.type,
        path: pathParts.join(' > '),
        x: scene.x,
        y: scene.y,
        width: 'width' in scene ? (scene as any).width : 0,
        height: 'height' in scene ? (scene as any).height : 0,
      });
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child, [...pathParts, child.name]);
      }
    }
  }

  walk(root, [root.name]);
  return { count: found.length, nodes: found };
}

// --- Batch Modify ---

export interface BatchModifyOperation {
  nodeId: string;
  method: string;
  args?: Record<string, unknown>;
}

export interface BatchModifyResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    nodeId: string;
    method: string;
    success: boolean;
    result?: unknown;
    error?: string;
  }>;
}

export async function batchModify(operations: BatchModifyOperation[]): Promise<BatchModifyResult> {
  const results: BatchModifyResult['results'] = [];

  for (const op of operations) {
    try {
      const result = await executeModifyNode(op.nodeId, op.method, op.args ? op.args : {});
      results.push({ nodeId: op.nodeId, method: op.method, success: true, result });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ nodeId: op.nodeId, method: op.method, success: false, error: errMsg });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  return {
    total: operations.length,
    succeeded,
    failed: operations.length - succeeded,
    results,
  };
}

// --- Set Multiple Text Contents ---

export interface SetMultipleTextItem {
  nodeId: string;
  text: string;
}

export interface SetMultipleTextResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    nodeId: string;
    success: boolean;
    name?: string;
    characters?: string;
    error?: string;
  }>;
}

export async function setMultipleTextContents(items: SetMultipleTextItem[]): Promise<SetMultipleTextResult> {
  const results: SetMultipleTextResult['results'] = [];

  // 먼저 모든 텍스트 노드의 폰트를 수집하여 한 번에 로드
  const fontsToLoad = new Set<string>();
  const validItems: Array<{ node: TextNode; text: string }> = [];

  for (const item of items) {
    const node = figma.getNodeById(item.nodeId);
    if (!node) {
      results.push({ nodeId: item.nodeId, success: false, error: '노드를 찾을 수 없습니다' });
      continue;
    }
    if (node.type !== 'TEXT') {
      results.push({ nodeId: item.nodeId, success: false, name: node.name, error: `TEXT 노드가 아닙니다: ${node.type}` });
      continue;
    }
    const textNode = node as TextNode;
    const fontName = textNode.fontName;
    if (fontName !== figma.mixed) {
      fontsToLoad.add(JSON.stringify(fontName));
    }
    validItems.push({ node: textNode, text: item.text });
  }

  // 폰트 일괄 로드
  const fontPromises = Array.from(fontsToLoad).map(f => {
    const font = JSON.parse(f) as FontName;
    return figma.loadFontAsync(font);
  });
  await Promise.all(fontPromises);

  // 텍스트 변경 적용
  for (const { node, text } of validItems) {
    try {
      // mixed 폰트인 경우 개별 로드
      if (node.fontName === figma.mixed) {
        const len = node.characters.length;
        for (let i = 0; i < len; i++) {
          const charFont = node.getRangeFontName(i, i + 1) as FontName;
          await figma.loadFontAsync(charFont);
        }
      }
      node.characters = text;
      results.push({ nodeId: node.id, success: true, name: node.name, characters: text });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ nodeId: node.id, success: false, name: node.name, error: errMsg });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  return {
    total: items.length,
    succeeded,
    failed: items.length - succeeded,
    results,
  };
}

// --- Batch Delete ---

export interface BatchDeleteResult {
  total: number;
  deleted: number;
  failed: number;
  results: Array<{
    nodeId: string;
    success: boolean;
    name?: string;
    error?: string;
  }>;
}

export function batchDelete(nodeIds: string[]): BatchDeleteResult {
  const results: BatchDeleteResult['results'] = [];

  for (const nodeId of nodeIds) {
    const node = figma.getNodeById(nodeId);
    if (!node) {
      results.push({ nodeId, success: false, error: '노드를 찾을 수 없습니다' });
      continue;
    }
    if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
      results.push({ nodeId, success: false, name: node.name, error: 'Document/Page는 삭제할 수 없습니다' });
      continue;
    }
    const name = node.name;
    try {
      (node as SceneNode).remove();
      results.push({ nodeId, success: true, name });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ nodeId, success: false, name, error: errMsg });
    }
  }

  const deleted = results.filter(r => r.success).length;
  return {
    total: nodeIds.length,
    deleted,
    failed: nodeIds.length - deleted,
    results,
  };
}
