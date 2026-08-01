/**
 * 페이지 루트에서만 의미가 있는 규칙들 — "페이지를 열었을 때 내용을 찾을 수 있는가".
 *
 * Figma 에서 사람이 콘텐츠를 찾는 수단은 셋뿐이다: zoom-to-fit(Shift+1) · 캔버스에 항상
 * 보이는 섹션 라벨 · 레이어 패널 이름. 이 중 zoom-to-fit 은 **멀리 떨어진 이상치 노드 하나**로
 * 무력화된다(5만px 밖 조각 하나 때문에 진짜 콘텐츠가 점으로 찍힌다) → content_spread.
 * origin_anchor 는 그와 별개로 "페이지 시작점은 원점"이라는 좌표 규약을 고정한다(도구/에이전트용).
 *
 * ⚠️ 둘 다 **페이지 루트 트리에서만** 유효하다. `sigma_lint(nodeId/path)` 로 서브트리를 검사하면
 *    roots 가 부모 로컬좌표라 원점·거리 판정이 전부 무의미해진다 → 엔진이 ctx.isPageRoot 로 가드한다.
 */
import type { TreeNode } from '../types';
import type { Violation } from './types';

/** 최상위 섹션이 원점에서 이만큼 이내면 "원점에 앵커됨"으로 인정(px). */
export const DEFAULT_ORIGIN_TOLERANCE = 100;
/** 최상위 노드가 이 거리 이상 떨어져 있으면 다른 덩어리로 본다(px). */
export const DEFAULT_MAX_GAP = 3000;

type Box = { x: number; y: number; width: number; height: number };

/** 두 박스의 최단 거리(px). 겹치거나 맞닿으면 0. */
function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * origin_anchor (opt-in) — 페이지에 최상위 SECTION 이 하나라도 있으면, 그 중 하나는 좌상단이
 * 원점(0,0)에서 tolerance 이내에 있어야 한다. 섹션이 없는 페이지는 검사 대상이 아니다
 * (그 경우는 outside_section 이 담당). 위반은 페이지당 최대 1건이며, 주체 노드로는 원점에
 * 가장 가까운 섹션을 실어 "무엇을 옮기면 되는지"를 가리킨다.
 *
 * 자동수정 없음 — 고치려면 최상위 노드 전체를 평행이동해야 하는데, 안전 fix(grow_section)의
 * 범주가 아니고 다중 노드 이동은 되돌리기 어렵다(check-first).
 */
export function originAnchorRule(roots: TreeNode[], tolerance: number = DEFAULT_ORIGIN_TOLERANCE): Violation[] {
  const sections = roots.filter((n) => n.type === 'SECTION');
  if (sections.length === 0) return [];

  const dist = (n: TreeNode) => Math.hypot(n.boundingBox.x, n.boundingBox.y);
  const anchored = sections.some((s) => Math.abs(s.boundingBox.x) <= tolerance && Math.abs(s.boundingBox.y) <= tolerance);
  if (anchored) return [];

  const closest = sections.reduce((best, s) => (dist(s) < dist(best) ? s : best), sections[0]);
  const b = closest.boundingBox;
  return [{
    rule: 'origin_anchor', source: 'builtin',
    message: `페이지에 섹션이 ${sections.length}개 있는데 원점(0,0) ${tolerance}px 이내에서 시작하는 섹션이 없습니다 — 가장 가까운 섹션 "${closest.name}" (${closest.id}) 가 (${Math.round(b.x)}, ${Math.round(b.y)})`,
    nodes: [closest.id],
  }];
}

/**
 * content_spread (opt-in) — 최상위 노드들을 maxGap 이내로 이어지는 덩어리(cluster)로 묶고,
 * 가장 큰 덩어리(본진) 밖에 홀로 떨어진 노드를 위반으로 낸다. 이런 이상치가 하나라도 있으면
 * zoom-to-fit 이 그것까지 품느라 진짜 콘텐츠가 점으로 찍혀 "내용을 못 찾는" 상태가 된다.
 *
 * - 숨김(visible:false) 노드는 제외 — 렌더되지 않아 fit 에 영향이 없다(hidden_leaf 가 별도 담당).
 * - 최상위 노드 수 기준 O(n²) 거리 계산. 현실 페이지의 최상위 노드는 수십 개라 비용 무시 가능.
 * - 본진 판정: 노드 수 최대 → 동수면 면적 합 최대 → 그래도 같으면 먼저 나온 덩어리(결정론적).
 * - 자동수정 없음(어디로 옮길지는 사람 판단).
 */
export function contentSpreadRule(roots: TreeNode[], maxGap: number = DEFAULT_MAX_GAP): Violation[] {
  const nodes = roots.filter((n) => n.meta?.visible !== false);
  if (nodes.length < 2) return [];

  // maxGap 이내로 이어지는 것끼리 같은 덩어리로 병합(BFS).
  const clusterOf = new Array<number>(nodes.length).fill(-1);
  const clusters: number[][] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (clusterOf[i] !== -1) continue;
    const idx = clusters.length;
    const members: number[] = [];
    const queue = [i];
    clusterOf[i] = idx;
    while (queue.length) {
      const cur = queue.pop() as number;
      members.push(cur);
      for (let j = 0; j < nodes.length; j++) {
        if (clusterOf[j] !== -1) continue;
        if (boxGap(nodes[cur].boundingBox, nodes[j].boundingBox) <= maxGap) {
          clusterOf[j] = idx;
          queue.push(j);
        }
      }
    }
    clusters.push(members);
  }
  if (clusters.length < 2) return [];

  const area = (ids: number[]) => ids.reduce((s, i) => s + nodes[i].boundingBox.width * nodes[i].boundingBox.height, 0);
  const main = clusters.reduce((best, c) =>
    c.length > best.length || (c.length === best.length && area(c) > area(best)) ? c : best, clusters[0]);
  const mainBox = unionBox(main.map((i) => nodes[i].boundingBox));

  const out: Violation[] = [];
  for (const cluster of clusters) {
    if (cluster === main) continue;
    for (const i of cluster) {
      const n = nodes[i];
      const d = Math.round(boxGap(n.boundingBox, mainBox));
      out.push({
        rule: 'content_spread', source: 'builtin',
        message: `"${n.name}" (${n.id}, ${n.type}) 가 본진 콘텐츠에서 ${d}px 떨어져 고립돼 있습니다 (허용 ${maxGap}px) — zoom-to-fit 이 이 노드까지 품느라 실제 내용이 안 보입니다`,
        nodes: [n.id],
      });
    }
  }
  return out;
}
