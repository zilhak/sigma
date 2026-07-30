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

export function getAnnotations(nodeId: string): GetAnnotationsResult {
  // nodeId 필수 — 예전에는 미지정 시 "현재 선택"으로 폴백했으나, 도구 결과가
  // 사용자의 캔버스 선택 상태에 따라 달라져 재현이 불가능했다(뷰 상태 의존).
  if (!nodeId) throw new Error('nodeId가 필요합니다');
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);

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
