/**
 * 노드 간 하이퍼링크 배선 (기획 문서용 상호 이동)
 *
 * Figma 텍스트의 하이퍼링크는 `{ type: 'NODE' }` 대상을 지원하며, 이 링크는 **편집 캔버스에서
 * 그대로 클릭 가능**하다(프로토타입 재생 모드가 필요 없다). 주석 마커 ↔ 범례처럼 "번호를 누르면
 * 설명과 화면을 오간다"는 기획 문서 성격의 이동에 프로토타입 reaction 보다 잘 맞는 이유다.
 *
 * 다만 링크는 TEXT 노드에만 걸린다. 실제로 지정하고 싶은 대상은 `anno/marker` 같은
 * **인스턴스**이므로, 그 안의 어느 텍스트에 걸지를 이 모듈이 해석한다. 판정은 이름이 아니라
 * 스펙 등록 시 심어둔 slot pluginData(`SLOT_MARK_KEY`) — 이름 규약을 만들지 않기 위함이며,
 * 순서에 의존하는 "첫 번째 TEXT" 휴리스틱과 달리 텍스트가 여럿인 스펙(`anno/legend` = 번호 `n`
 * + 설명 `desc`)에서도 정확히 번호만 집는다.
 */

import { loadAllFonts } from './modify';
import { SLOT_MARK_KEY } from './component-spec';

export type LinkDirection = 'both' | 'a_to_b' | 'b_to_a';

export interface SetHyperlinkParams {
  links: Array<{ a: string; b: string }>;
  direction?: LinkDirection;
  slot?: string;
  remove?: boolean;
}

export interface SetHyperlinkLinkResult {
  a: string;
  b: string;
  aTextId?: string;
  bTextId?: string;
  applied: string[];
  error?: string;
}

export interface SetHyperlinkResult {
  direction: LinkDirection;
  slot: string;
  removed: boolean;
  linkCount: number;
  appliedCount: number;
  failedCount: number;
  results: SetHyperlinkLinkResult[];
}

/**
 * 링크를 걸 TEXT 노드를 정한다.
 * 1) TEXT 면 그대로  2) slot 이 일치하는 하위 TEXT  3) 하위 TEXT 가 정확히 하나면 그것
 * 그 밖(후보 0개 또는 2개 이상)은 모호하므로 에러 — 사용 가능한 slot 을 함께 알린다.
 */
function resolveTextNode(nodeId: string, slot: string): TextNode {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  if (node.type === 'TEXT') return node as TextNode;
  if (!('findAll' in node)) {
    throw new Error(`텍스트를 가질 수 없는 노드입니다: ${nodeId} (${node.type})`);
  }

  const texts = (node as ChildrenMixin & BaseNode).findAll((n) => n.type === 'TEXT') as TextNode[];
  const bySlot = texts.filter((t) => t.getPluginData(SLOT_MARK_KEY) === slot);
  if (bySlot.length === 1) return bySlot[0];
  if (bySlot.length > 1) {
    throw new Error(`${nodeId}: slot "${slot}" 인 텍스트가 ${bySlot.length}개라 모호합니다`);
  }
  if (texts.length === 1) return texts[0];

  const available = texts
    .map((t) => t.getPluginData(SLOT_MARK_KEY))
    .filter((s) => s !== '');
  if (texts.length === 0) {
    throw new Error(`${nodeId}: 하위에 TEXT 노드가 없어 링크를 걸 수 없습니다`);
  }
  throw new Error(
    `${nodeId}: slot "${slot}" 인 텍스트가 없고 하위 TEXT 가 ${texts.length}개라 대상이 모호합니다` +
      (available.length > 0 ? ` — 사용 가능한 slot: ${available.join(', ')}` : ' (slot 표시가 없는 텍스트들)')
  );
}

/** 텍스트 전체 범위에 대상 노드로 향하는 링크를 걸거나(remove=false) 지운다. */
async function applyLink(textNode: TextNode, targetNodeId: string | null): Promise<void> {
  const length = textNode.characters.length;
  if (length === 0) {
    throw new Error(`${textNode.id}: 빈 텍스트에는 링크를 걸 수 없습니다`);
  }
  await loadAllFonts(textNode);
  if (targetNodeId === null) {
    textNode.setRangeHyperlink(0, length, null);
    return;
  }
  textNode.setRangeHyperlink(0, length, { type: 'NODE', value: targetNodeId });
}

/**
 * 노드 쌍마다 서로를 가리키는 링크를 건다(부분 실패 허용 — 한 쌍이 실패해도 나머지는 진행).
 */
export async function setHyperlink(params: SetHyperlinkParams): Promise<SetHyperlinkResult> {
  const links = params.links;
  if (!links || links.length === 0) throw new Error('links 가 비어 있습니다');
  const direction: LinkDirection = params.direction ? params.direction : 'both';
  const slot = params.slot ? params.slot : 'n';
  const remove = params.remove === true;

  const results: SetHyperlinkLinkResult[] = [];
  let appliedCount = 0;
  let failedCount = 0;

  for (const link of links) {
    const result: SetHyperlinkLinkResult = { a: link.a, b: link.b, applied: [] };
    try {
      const forward = direction === 'both' || direction === 'a_to_b';
      const backward = direction === 'both' || direction === 'b_to_a';

      // 한쪽이라도 해석에 실패하면 어느 쪽도 걸지 않는다(반쪽 배선 방지).
      const aText = forward ? resolveTextNode(link.a, slot) : null;
      const bText = backward ? resolveTextNode(link.b, slot) : null;
      if (aText) result.aTextId = aText.id;
      if (bText) result.bTextId = bText.id;

      if (aText) {
        await applyLink(aText, remove ? null : link.b);
        result.applied.push('a_to_b');
      }
      if (bText) {
        await applyLink(bText, remove ? null : link.a);
        result.applied.push('b_to_a');
      }
      appliedCount += result.applied.length;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      failedCount++;
    }
    results.push(result);
  }

  return {
    direction,
    slot,
    removed: remove,
    linkCount: links.length,
    appliedCount,
    failedCount,
    results,
  };
}
