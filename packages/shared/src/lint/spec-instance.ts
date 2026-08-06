/**
 * instance_resized_from_spec — **작은 스펙 인스턴스를 크게 늘려 컨테이너 대용으로 쓴 것**을 잡는다.
 *
 * 스펙 마스터는 HTML 을 한 번 해석해 **고정 크기 자식 트리로 구운 것**이라 오토레이아웃·제약이 없다.
 * 즉 인스턴스를 늘려도 **자식은 제자리에 그대로 있다.**
 *
 * ⚠️ 그렇다고 "마스터와 크기가 다르면 결함" 은 아니다 — 실측으로 확인했다. 표는 열 너비 때문에
 * 셀 인스턴스를 늘리고 줄이는 것이 정상 사용이고(한 페이지에서 2220건), 그렇게 써도 왼쪽 정렬
 * 텍스트는 멀쩡하다. 그래서 **크기 차이 자체를 잡으면 규칙이 아니라 소음**이 된다.
 *
 * 실제로 아팠던 셋을 가르면 이렇다:
 * - 24×24 아이콘을 16×16 으로 **줄임** → 자식이 상자를 넘음. 이건 이미 child_overflow 가 잡는다.
 * - 1116 폭 스펙을 880 으로 **줄임** → 마찬가지로 child_overflow.
 * - 16×16 체크박스를 48×42 표 칸으로 **늘림** → 넘치지 않으니 아무 규칙도 안 잡는데, 미선택일 땐
 *   테두리 칸처럼 보여 넘어가다가 **선택 상태로 바꾸는 순간 칸 전체가 색 덩어리**가 된다.
 *
 * 남는 고유 가치는 마지막 하나다 → **작은 컨트롤을 배 이상 늘린 경우**만 본다.
 * 줄임까지 원인 이름으로 듣고 싶으면 flagShrink 로 켠다(그때는 child_overflow 와 겹친다).
 *
 * ⚠️ 그리고 **hug 축은 아예 보지 않는다** — 스펙이 그 축을 내용에 맡긴 것이라(줄바꿈 텍스트 슬롯 등)
 * 커지는 게 정상 동작이다. 이걸 빼지 않으면 주석 범례·메모처럼 여러 줄로 늘어나는 스펙이 전부
 * 위반으로 잡힌다(실측 141건 중 대부분). 축별 sizing 은 서버 레지스트리에서 alias 로 찾아 넣는다.
 *
 * 기본 OFF(opt-in).
 */
import type { LintNode, Violation } from './types';

export interface InstanceResizedConfig {
  /** 이 픽셀 이하 차이는 무시. 기본 0.5 — Figma 부동소수 반올림(±1e-6)과 실제 리사이즈를 가른다. */
  tolerance?: number;
  /** 이 배율 이상으로 커지면 위반. 기본 2 (16→48 은 3배라 잡히고, 표 셀 180→300 은 1.67배라 안 잡힌다) */
  growthRatio?: number;
  /** "작은 컨트롤" 의 기준(px). 마스터의 해당 축이 이보다 크면 늘려 쓴 것을 의도로 본다. 기본 64 */
  smallMaster?: number;
  /** 줄임도 잡을지. 기본 false — 줄임의 실제 피해(자식 넘침)는 child_overflow 가 이미 잡는다. */
  flagShrink?: boolean;
  /**
   * alias → 축별 sizing. hug 축은 내용에 따라 늘어나는 게 정상이라 판정에서 뺀다.
   * 서버가 스펙 레지스트리에서 만들어 넣는다(같은 alias 가 여러 namespace 에 있고 sizing 이
   * 엇갈리면 그 alias 는 넣지 않는다 — 애매하면 판정하지 않는 쪽).
   */
  sizingByAlias?: Record<string, { horizontal?: string; vertical?: string }>;
}

const DEFAULT_TOLERANCE = 0.5;
const DEFAULT_GROWTH_RATIO = 2;
const DEFAULT_SMALL_MASTER = 64;

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
  const ratio = typeof config.growthRatio === 'number' ? config.growthRatio : DEFAULT_GROWTH_RATIO;
  const small = typeof config.smallMaster === 'number' ? config.smallMaster : DEFAULT_SMALL_MASTER;
  const flagShrink = config.flagShrink === true;
  const sizingByAlias = config.sizingByAlias || {};
  const out: Violation[] = [];

  for (const n of nodes) {
    if (n.type !== 'INSTANCE') continue;
    const alias = n.specAlias;
    const mw = n.componentWidth;
    const mh = n.componentHeight;
    if (typeof alias !== 'string' || typeof mw !== 'number' || typeof mh !== 'number') continue;
    if (mw <= 0 || mh <= 0) continue;

    const sizing = sizingByAlias[alias];

    /** 축 하나를 판정: 작은 마스터를 배 이상 늘렸으면 위반, (옵션) 줄임도. hug 축은 제외. */
    const judge = (axis: string, master: number, actual: number, hug: boolean): string | null => {
      if (hug) return null;
      const diff = actual - master;
      if (Math.abs(diff) <= tol) return null;
      if (diff > 0) {
        if (master > small) return null;                 // 원래 큰 요소를 늘린 건 의도로 본다
        if (actual < master * ratio) return null;        // 표 셀처럼 살짝 늘린 것도 정상 사용
        return `${axis} ${fmt(master)}→${fmt(actual)} (${(actual / master).toFixed(1)}배)`;
      }
      return flagShrink ? `${axis} ${fmt(master)}→${fmt(actual)}` : null;
    };

    const parts = [
      judge('폭', mw, n.width, sizing?.horizontal === 'hug'),
      judge('높이', mh, n.height, sizing?.vertical === 'hug'),
    ].filter(Boolean) as string[];
    if (parts.length === 0) continue;

    out.push({
      rule: 'instance_resized_from_spec', source: 'builtin',
      message:
        `"${n.name}" (${n.id}) 는 스펙 "${alias}"(${fmt(mw)}×${fmt(mh)}) 를 크게 늘려 쓴 것이다 — ${parts.join(' · ')}. ` +
        `스펙 인스턴스는 자식이 구워져 있어 상자만 커지고 **안쪽은 제자리에 남는다** — 지금은 빈 칸처럼 보여도 ` +
        `상태를 바꾸는 순간(체크·선택 등) 드러난다. 래퍼 프레임 안에 원래 크기로 넣거나, 그 크기의 스펙을 따로 등록하라.`,
      nodes: [n.id],
    });
  }

  return out;
}
