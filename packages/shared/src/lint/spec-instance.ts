/**
 * instance_resized_from_spec — 컴포넌트 스펙(sigma_create_component_spec)으로 만든 마스터의
 * 인스턴스를 **마스터와 다른 크기로** 놓아둔 것을 잡는다.
 *
 * 왜 스펙 인스턴스만인가: 스펙 마스터는 HTML 을 한 번 해석해 **고정 크기 자식 트리로 구운 것**이라
 * 오토레이아웃·제약이 걸려 있지 않다. 즉 인스턴스를 늘리거나 줄여도 **자식은 따라오지 않는다.**
 * 손으로 만든 일반 컴포넌트는 제약이 걸려 있으면 정상적으로 리플로우되므로 대상이 아니다
 * (그래서 판정 기준이 "INSTANCE" 가 아니라 "스펙 스탬프를 가진 마스터의 INSTANCE" 다).
 *
 * 이 규칙이 없을 때 실제로 벌어진 일:
 * - 24×24 아이콘 스펙을 16×16 으로 줄여 놓자 자식이 그대로라 child_overflow 가 7건 떴다.
 *   결과만 보고 원인을 찾느라 시간이 갔다 — 원인은 "인스턴스를 줄인 것" 하나였다.
 * - 16×16 체크박스 스펙을 48×42 표 칸 대용으로 늘려 썼다. 미선택 상태에선 테두리 칸처럼 보여
 *   넘어갔지만, 선택 상태로 바꾸자 칸 전체가 색 덩어리가 됐다(늘어난 건 상자뿐이고 자식은 제자리).
 * - 1116 폭 스펙을 880 으로 줄여 좌우 배치를 만들려다 자식이 1116 그대로라 overflow 8건.
 *
 * 기본 OFF(opt-in): 의도적으로 늘려 쓴 인스턴스가 이미 많은 파일에서는 폭주한다.
 * 예외를 두려면 그 노드에 lint-ignore 를 남긴다(사유가 파일에 남는다).
 */
import type { LintNode, Violation } from './types';

export interface InstanceResizedConfig {
  /** 이 픽셀 이하 차이는 무시. 기본 0.5 — Figma 부동소수 반올림(±1e-6)과 실제 리사이즈를 가른다. */
  tolerance?: number;
}

const DEFAULT_TOLERANCE = 0.5;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * nodes 는 서버가 get_nodes_info 로 enrich 한 LintNode[] —
 * `specAlias`·`componentWidth`·`componentHeight` 가 실려 있어야 판정한다(없으면 그 노드는 건너뜀).
 */
export function instanceResizedFromSpecRule(
  nodes: LintNode[],
  config: InstanceResizedConfig = {},
): Violation[] {
  const tol = typeof config.tolerance === 'number' ? config.tolerance : DEFAULT_TOLERANCE;
  const out: Violation[] = [];

  for (const n of nodes) {
    if (n.type !== 'INSTANCE') continue;
    const alias = n.specAlias;
    const mw = n.componentWidth;
    const mh = n.componentHeight;
    if (typeof alias !== 'string' || typeof mw !== 'number' || typeof mh !== 'number') continue;
    if (mw <= 0 || mh <= 0) continue;

    const dw = Math.abs(n.width - mw);
    const dh = Math.abs(n.height - mh);
    if (dw <= tol && dh <= tol) continue;

    const parts: string[] = [];
    if (dw > tol) parts.push(`폭 ${fmt(mw)}→${fmt(n.width)}`);
    if (dh > tol) parts.push(`높이 ${fmt(mh)}→${fmt(n.height)}`);

    out.push({
      rule: 'instance_resized_from_spec', source: 'builtin',
      message:
        `"${n.name}" (${n.id}) 가 스펙 "${alias}" 마스터와 다른 크기다 — ${parts.join(' · ')}. ` +
        `스펙 인스턴스는 자식이 구워져 있어 크기를 바꿔도 따라오지 않는다(레이아웃이 깨지거나 상태를 바꾸면 드러난다). ` +
        `크기를 되돌리거나, 다른 크기가 필요하면 그 크기의 스펙을 등록하라.`,
      nodes: [n.id],
    });
  }

  return out;
}
