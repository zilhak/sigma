/**
 * CDP 폰트 보강
 *
 * CSS.getPlatformFontsForNode를 사용하여
 * CSS font-family 선언이 아닌 실제 렌더링 폰트를 감지합니다.
 */
import type { ExtractedNode } from '../types';
import type { CDPClient, FontEnhancement, PlatformFontInfo } from './types';

/**
 * DOM nodeId로 실제 렌더링 폰트를 조회
 */
async function getPlatformFonts(cdp: CDPClient, backendNodeId: number): Promise<PlatformFontInfo[]> {
  try {
    const { nodeId } = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', {
      backendNodeIds: [backendNodeId],
    });
    if (!nodeId || (Array.isArray(nodeId) && nodeId[0] === 0)) return [];

    const resolvedNodeId = Array.isArray(nodeId) ? nodeId[0] : nodeId;
    const result = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: resolvedNodeId });
    if (!result?.fonts) return [];

    return result.fonts.map((f: any) => ({
      familyName: f.familyName,
      postScriptName: f.postScriptName || '',
      isCustomFont: f.isCustomFont || false,
      glyphCount: f.glyphCount || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * 텍스트를 가진 노드들의 실제 렌더링 폰트를 보강
 */
export async function enhanceFonts(
  cdp: CDPClient,
  rootNode: ExtractedNode
): Promise<FontEnhancement[]> {
  // CDP 도메인 활성화
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');

  // DOM 문서 가져오기
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });

  const results: FontEnhancement[] = [];

  // 텍스트 노드만 수집 (재귀)
  const textNodes: ExtractedNode[] = [];
  function collectTextNodes(node: ExtractedNode) {
    if (node.textContent && node.textContent.trim()) {
      textNodes.push(node);
    }
    for (const child of node.children) {
      collectTextNodes(child);
    }
  }
  collectTextNodes(rootNode);

  // 각 텍스트 노드에 대해 CSS selector로 DOM nodeId를 찾고 폰트 조회
  for (const textNode of textNodes) {
    try {
      // className이나 tagName 기반으로 DOM에서 매칭 시도
      // (정확한 매칭을 위해서는 data-sigma-id 같은 식별자가 필요하지만,
      //  기본 구현에서는 className + tagName + textContent 조합으로 시도)
      const selector = buildSelectorForNode(textNode);
      if (!selector) continue;

      const searchResult = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      });
      if (!searchResult?.nodeId) continue;

      // backendNodeId 얻기
      const nodeInfo = await cdp.send('DOM.describeNode', { nodeId: searchResult.nodeId });
      if (!nodeInfo?.node?.backendNodeId) continue;

      const fonts = await getPlatformFonts(cdp, nodeInfo.node.backendNodeId);
      if (fonts.length > 0) {
        // 가장 많이 사용된 폰트 결정
        const primaryFont = fonts.reduce((a, b) => a.glyphCount > b.glyphCount ? a : b);

        results.push({
          nodeId: textNode.id,
          platformFonts: fonts,
          primaryFont: primaryFont.familyName,
        });

        // ExtractedNode의 fontFamily도 업데이트
        textNode.styles.fontFamily = primaryFont.familyName;
      }
    } catch {
      // 개별 노드 실패는 무시
    }
  }

  return results;
}

/**
 * ExtractedNode에서 CSS selector를 추론
 */
function buildSelectorForNode(node: ExtractedNode): string | null {
  const tag = node.tagName;
  if (!tag || tag.startsWith('::')) return null;

  // id 속성이 있으면 우선 사용
  if (node.attributes['id']) {
    return `#${node.attributes['id']}`;
  }

  // className 기반 selector
  if (node.className) {
    const classes = node.className.split(/\s+/).filter(c => c && !c.includes(':'));
    if (classes.length > 0) {
      return `${tag}.${classes.join('.')}`;
    }
  }

  return null;
}
