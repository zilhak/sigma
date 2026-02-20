/**
 * 이미지 내보내기 결과
 */
export interface ExportImageResult {
  base64: string;
  format: string;
  nodeId: string;
  nodeName: string;
  width: number;
  height: number;
}

/**
 * 노드를 이미지로 내보내기
 */
export async function exportImage(
  nodeId: string,
  format?: string,
  scale?: number
): Promise<ExportImageResult> {
  if (!nodeId) {
    throw new Error('nodeId가 필요합니다');
  }

  const exportNode = figma.getNodeById(nodeId);
  if (!exportNode) {
    throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  }

  if (exportNode.type === 'DOCUMENT' || exportNode.type === 'PAGE') {
    throw new Error(`이 노드 타입은 export할 수 없습니다: ${exportNode.type}`);
  }

  const sceneNode = exportNode as SceneNode;
  const exportFormat = (format || 'PNG').toUpperCase();

  // 유효한 형식 확인
  const validFormats = ['PNG', 'SVG', 'JPG', 'PDF'];
  const finalFormat = validFormats.includes(exportFormat) ? exportFormat : 'PNG';
  const effectiveScale = scale || 2;

  const exportSettings: ExportSettings = finalFormat === 'SVG'
    ? { format: 'SVG' }
    : finalFormat === 'PDF'
      ? { format: 'PDF' }
      : {
          format: finalFormat as 'PNG' | 'JPG',
          constraint: { type: 'SCALE', value: effectiveScale },
        };

  const bytes = await sceneNode.exportAsync(exportSettings);
  const base64 = figma.base64Encode(bytes);

  // 크기 계산
  const width = 'width' in sceneNode ? (sceneNode as any).width : 0;
  const height = 'height' in sceneNode ? (sceneNode as any).height : 0;

  return {
    base64,
    format: finalFormat,
    nodeId,
    nodeName: sceneNode.name,
    width: Math.round(width),
    height: Math.round(height),
  };
}
