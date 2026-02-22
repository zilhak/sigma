/**
 * Boolean Operations (합/차/교/배타합)
 */

type BooleanOp = 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';

export interface BooleanOperationResult {
  nodeId: string;
  name: string;
  operation: BooleanOp;
  width: number;
  height: number;
  sourceCount: number;
}

export function performBooleanOperation(
  nodeIds: string[],
  operation: BooleanOp,
  name?: string
): BooleanOperationResult {
  if (!nodeIds || nodeIds.length < 2) {
    throw new Error('Boolean 연산에는 최소 2개의 노드가 필요합니다');
  }

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) {
      throw new Error(`노드를 찾을 수 없습니다: ${id}`);
    }
    if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
      throw new Error(`Document 또는 Page는 Boolean 연산에 사용할 수 없습니다: ${id}`);
    }
    nodes.push(node as SceneNode);
  }

  const parent = nodes[0].parent as BaseNode & ChildrenMixin;
  if (!parent) {
    throw new Error('노드의 부모를 찾을 수 없습니다');
  }

  let result: BooleanOperationNode;
  switch (operation) {
    case 'UNION':
      result = figma.union(nodes, parent);
      break;
    case 'SUBTRACT':
      result = figma.subtract(nodes, parent);
      break;
    case 'INTERSECT':
      result = figma.intersect(nodes, parent);
      break;
    case 'EXCLUDE':
      result = figma.exclude(nodes, parent);
      break;
    default:
      throw new Error(`지원하지 않는 Boolean 연산: ${operation}`);
  }

  if (name) result.name = name;

  return {
    nodeId: result.id,
    name: result.name,
    operation,
    width: Math.round(result.width),
    height: Math.round(result.height),
    sourceCount: nodes.length,
  };
}
