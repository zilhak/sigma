/**
 * fully_occluded_sibling — 같은 부모 안에서 나중에 그려지는(z-order 위) 형제가 완전 불투명한
 * SOLID fill로 자신의 바운딩박스 전체를 덮으면, 그 아래 형제는 어떤 상태에서도 픽셀 단위로
 * 절대 보이지 않는다. hidden_leaf(명시적 visible:false)의 암묵적 버전.
 *
 * TreeNode(get_tree)만으로는 판정 불가 — fills/opacity는 get_nodes_info 상세 조회가 필요해
 * runBuiltinRules(TreeNode 전용)에 넣지 않고 별도 함수로 분리했다. 서버가 이미 커스텀 규칙용으로
 * LintNode 를 만들 때(config.custom 유무와 무관하게 이 규칙이 켜져 있으면) 함께 실행한다.
 *
 * 알려진 근사치(문서화된 스코프 한계, 확대 계획 없음):
 * - 덮는 형제는 RECTANGLE/FRAME/COMPONENT/INSTANCE만 인정(원/별 등은 바운딩박스가 실제 채워진
 *   영역과 달라 오탐 위험 — 제외).
 * - cornerRadius로 인한 모서리 미세 여백은 무시(사실상 완전히 가려진 것으로 취급).
 * - 그라디언트/이미지 fill은 "완전 불투명"을 증명할 수 없어 SOLID만 인정(누락 허용, 오탐 방지 우선).
 * - 형제 여럿이 조각조각 합쳐서 덮는 경우는 단일 형제 비교라 못 잡는다(누락 허용).
 */
import type { LintNode, Violation } from './types';

const OCCLUDER_TYPES = new Set(['RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE']);

interface PaintLike {
  type?: string;
  opacity?: number;
  visible?: boolean;
}

function isOpaqueSolidFill(node: LintNode): boolean {
  const nodeOpacity = typeof node.opacity === 'number' ? node.opacity : 1;
  if (nodeOpacity < 1) return false;
  if (!Array.isArray(node.fills)) return false;
  return (node.fills as unknown[]).some((f) => {
    if (!f || typeof f !== 'object') return false;
    const paint = f as PaintLike;
    if (paint.visible === false) return false;
    if (paint.type !== 'SOLID') return false;
    const paintOpacity = typeof paint.opacity === 'number' ? paint.opacity : 1;
    return paintOpacity >= 1;
  });
}

function fullyContains(outer: LintNode, inner: LintNode): boolean {
  if (outer.width <= 0 || outer.height <= 0) return false;
  return (
    outer.x <= inner.x && outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

/** childrenOf: 부모 id -> 자식 id 배열(z-order, 배열 뒤쪽이 나중에 그려짐 = 위). */
export function fullyOccludedSiblingRule(nodes: LintNode[], childrenOf: Record<string, string[]>): Violation[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const out: Violation[] = [];

  for (const childIds of Object.values(childrenOf)) {
    for (let i = 0; i < childIds.length; i++) {
      const covered = byId.get(childIds[i]);
      if (!covered || covered.visible === false) continue;

      for (let j = i + 1; j < childIds.length; j++) {
        const cover = byId.get(childIds[j]);
        if (!cover || cover.visible === false) continue;
        if (!OCCLUDER_TYPES.has(cover.type)) continue;
        if (!fullyContains(cover, covered)) continue;
        if (!isOpaqueSolidFill(cover)) continue;

        out.push({
          rule: 'fully_occluded_sibling', source: 'builtin',
          message: `"${covered.name}" (${covered.id}) 가 "${cover.name}" (${cover.id}) 에 완전히 가려져 절대 보이지 않음`,
          nodes: [covered.id, cover.id],
        });
        break;
      }
    }
  }

  return out;
}
