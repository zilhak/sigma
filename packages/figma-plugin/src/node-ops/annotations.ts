/**
 * 주석(Annotation) 관련 기능
 * cursor-talk-to-figma의 get_annotations, set_annotation 참고
 */

export interface AnnotationInfo {
  label: string;
  labelType: string;
}

export interface GetAnnotationsResult {
  nodeId: string;
  name: string;
  annotations: AnnotationInfo[];
}

export function getAnnotations(nodeId?: string): GetAnnotationsResult {
  let node: BaseNode | null;

  if (nodeId) {
    node = figma.getNodeById(nodeId);
  } else {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) throw new Error('노드를 선택하거나 nodeId를 지정하세요');
    node = selection[0];
  }

  if (!node) throw new Error('노드를 찾을 수 없습니다');

  const annotations: AnnotationInfo[] = [];
  if ('annotations' in node) {
    const nodeAnnotations = (node as any).annotations;
    if (Array.isArray(nodeAnnotations)) {
      for (const ann of nodeAnnotations) {
        annotations.push({
          label: ann.label || '',
          labelType: ann.labelType || '',
        });
      }
    }
  }

  return {
    nodeId: node.id,
    name: node.name,
    annotations,
  };
}

export interface SetAnnotationResult {
  nodeId: string;
  name: string;
  annotationCount: number;
}

export function setAnnotation(
  nodeId: string,
  label: string,
  labelType?: string
): SetAnnotationResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);

  if (!('annotations' in node)) {
    throw new Error(`이 노드 타입은 annotations를 지원하지 않습니다: ${node.type}`);
  }

  const annotation: Record<string, string> = { label };
  if (labelType) {
    annotation.labelType = labelType;
  }

  const existing = (node as any).annotations || [];
  (node as any).annotations = [...existing, annotation];

  return {
    nodeId: node.id,
    name: node.name,
    annotationCount: (node as any).annotations.length,
  };
}

// --- Set Multiple Annotations ---

export interface SetMultipleAnnotationsItem {
  nodeId: string;
  label: string;
  labelType?: string;
}

export interface SetMultipleAnnotationsResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    nodeId: string;
    success: boolean;
    name?: string;
    annotationCount?: number;
    error?: string;
  }>;
}

export function setMultipleAnnotations(items: SetMultipleAnnotationsItem[]): SetMultipleAnnotationsResult {
  const results: SetMultipleAnnotationsResult['results'] = [];

  for (const item of items) {
    try {
      const result = setAnnotation(item.nodeId, item.label, item.labelType);
      results.push({
        nodeId: result.nodeId,
        success: true,
        name: result.name,
        annotationCount: result.annotationCount,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ nodeId: item.nodeId, success: false, error: errMsg });
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
