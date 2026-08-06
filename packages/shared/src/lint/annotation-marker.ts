/**
 * annotation_marker_pair — 기획 레이어 안에서 **마커 ↔ 범례가 1:1로 짝이 맞고 서로 왕복 링크가
 * 걸려 있는지** 검사한다.
 *
 * 기획 주석은 "번호가 붙은 마커를 화면 위에 얹고, 같은 번호의 범례에 설명을 쓴다" 는 형식이라,
 * 번호가 어긋나면 문서가 조용히 거짓말을 한다 — 마커는 있는데 설명이 없거나(읽는 사람이 그 요소가
 * 뭔지 알 길이 없다), 설명은 있는데 가리키는 곳이 없다(어디 얘긴지 모른다). 중간에 마커를 하나
 * 빼고 재번호를 매기다 어긋나기 쉬운데, 눈으로는 번호를 하나씩 세어야만 보인다.
 *
 * 왕복 링크(sigma_set_hyperlink)까지 보는 이유: 링크는 걸어도 화면에 표시가 없어 빠뜨려도 티가
 * 안 난다. 실제로 한 콜에 여러 쌍을 넘겼다가 일부만 걸린 채 넘어간 적이 있다.
 *
 * 판정 대상은 **기획 레이어(pluginData role="annotation-layer") 안에 있는 것만**이고, 짝은
 * **레이어 단위로** 맞춘다 — 한 페이지에 섹션이 여럿이면 ① 번 마커도 여럿이라 페이지 전체로
 * 묶으면 전부 중복으로 잡힌다.
 *
 * 기본 OFF(opt-in): 마커/범례 프리셋을 쓰는 파일에서만 의미가 있다.
 */
import type { LintNode, Violation } from './types';

export interface AnnotationMarkerPairConfig {
  /** 마커 인스턴스의 스펙 alias. 기본 'marker'(anno 프리셋). */
  markerAlias?: string;
  /** 범례 인스턴스의 스펙 alias. 기본 'legend'. */
  legendAlias?: string;
  /** 왕복 하이퍼링크까지 요구할지. 기본 true. */
  requireHyperlink?: boolean;
  /** 번호로 인정할 문자 패턴(정규식 문자열). 기본 = 원문자 숫자 한 글자(①~㊿). */
  symbolPattern?: string;
}

const DEFAULT_SYMBOL_PATTERN = '^[\\u2460-\\u2473\\u3251-\\u325F\\u32B1-\\u32BF]$';

export interface MarkerPairRelations {
  /** 노드 id → 자식 id[] */
  children: Record<string, string[]>;
  /** 노드 id → 조상 id[](가까운 조상부터든 먼 조상부터든 무관) */
  ancestors: Record<string, string[]>;
}

/** 인스턴스 하위에서 번호로 보이는 TEXT 한 글자를 찾는다(마커는 그 글자 하나, 범례는 번호 슬롯). */
function findSymbol(rootId: string, byId: Map<string, LintNode>, children: Record<string, string[]>, re: RegExp): string | null {
  const stack = [...(children[rootId] || [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    const n = byId.get(id);
    if (!n) continue;
    if (n.type === 'TEXT' && typeof n.characters === 'string') {
      const s = n.characters.trim();
      if (re.test(s)) return s;
    }
    stack.push(...(children[id] || []));
  }
  return null;
}

/** 인스턴스 자신 + 모든 후손 id */
function subtreeIds(rootId: string, children: Record<string, string[]>): Set<string> {
  const out = new Set<string>([rootId]);
  const stack = [...(children[rootId] || [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    out.add(id);
    stack.push(...(children[id] || []));
  }
  return out;
}

/** 인스턴스 하위 TEXT 들에 걸린 NODE 하이퍼링크 대상 id 전부 */
function linkTargets(rootId: string, byId: Map<string, LintNode>, children: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [rootId, ...(children[rootId] || [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    const n = byId.get(id);
    if (n && Array.isArray(n.hyperlinks)) {
      for (const h of n.hyperlinks) {
        if (h && h.type === 'NODE' && typeof h.value === 'string') out.add(h.value);
      }
    }
    stack.push(...(children[id] || []));
  }
  return out;
}

export function annotationMarkerPairRule(
  nodes: LintNode[],
  relations: MarkerPairRelations,
  config: AnnotationMarkerPairConfig = {},
): Violation[] {
  const markerAlias = config.markerAlias || 'marker';
  const legendAlias = config.legendAlias || 'legend';
  const requireLink = config.requireHyperlink !== false;
  const re = new RegExp(config.symbolPattern || DEFAULT_SYMBOL_PATTERN, 'u');

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const layerIds = new Set(nodes.filter((n) => n.isAnnotationLayer).map((n) => n.id));
  if (layerIds.size === 0) return [];

  /** 노드가 속한 기획 레이어 id (없으면 null) */
  const layerOf = (n: LintNode): string | null => {
    for (const a of relations.ancestors[n.id] || []) if (layerIds.has(a)) return a;
    return null;
  };

  // 레이어별 수집
  interface Entry { node: LintNode; symbol: string | null }
  const perLayer = new Map<string, { markers: Entry[]; legends: Entry[] }>();
  for (const n of nodes) {
    if (n.type !== 'INSTANCE') continue;
    const alias = n.specAlias;
    if (alias !== markerAlias && alias !== legendAlias) continue;
    const layer = layerOf(n);
    if (!layer) continue;
    let bucket = perLayer.get(layer);
    if (!bucket) { bucket = { markers: [], legends: [] }; perLayer.set(layer, bucket); }
    const entry: Entry = { node: n, symbol: findSymbol(n.id, byId, relations.children, re) };
    (alias === markerAlias ? bucket.markers : bucket.legends).push(entry);
  }

  const out: Violation[] = [];
  const push = (node: LintNode, message: string, extra: string[] = []) => {
    out.push({ rule: 'annotation_marker_pair', source: 'builtin', message, nodes: [node.id, ...extra] });
  };

  for (const [, bucket] of perLayer) {
    const bySymbol = (list: Entry[]) => {
      const m = new Map<string, Entry[]>();
      for (const e of list) {
        if (e.symbol === null) continue;
        const arr = m.get(e.symbol);
        if (arr) arr.push(e); else m.set(e.symbol, [e]);
      }
      return m;
    };
    const markerBy = bySymbol(bucket.markers);
    const legendBy = bySymbol(bucket.legends);

    for (const e of [...bucket.markers, ...bucket.legends]) {
      if (e.symbol === null) {
        push(e.node, `"${e.node.name}" (${e.node.id}) 에서 번호를 읽을 수 없다 — 마커·범례는 번호 글자(①②③…)를 가져야 짝을 맞출 수 있다.`);
      }
    }

    for (const [sym, list] of markerBy) {
      if (list.length > 1) {
        push(list[0].node, `마커 ${sym} 이(가) 이 기획 레이어에 ${list.length}개 있다 — 번호는 레이어 안에서 유일해야 한다(재번호 중 어긋난 흔적).`, list.slice(1).map((e) => e.node.id));
      }
      const legends = legendBy.get(sym);
      if (!legends || legends.length === 0) {
        push(list[0].node, `마커 ${sym} 에 대응하는 범례가 없다 — 가리키기만 하고 설명이 없으면 읽는 사람은 그 요소가 무엇인지 알 수 없다.`);
        continue;
      }
      if (legends.length > 1) {
        push(legends[0].node, `범례 ${sym} 이(가) ${legends.length}개 있다 — 마커 하나에 설명이 여럿이면 어느 것이 맞는지 알 수 없다.`, legends.slice(1).map((e) => e.node.id));
      }
      if (!requireLink) continue;

      const marker = list[0].node;
      const legend = legends[0].node;
      const legendSubtree = subtreeIds(legend.id, relations.children);
      const markerSubtree = subtreeIds(marker.id, relations.children);
      const fromMarker = linkTargets(marker.id, byId, relations.children);
      const fromLegend = linkTargets(legend.id, byId, relations.children);
      const markerLinked = [...fromMarker].some((t) => legendSubtree.has(t));
      const legendLinked = [...fromLegend].some((t) => markerSubtree.has(t));
      if (!markerLinked || !legendLinked) {
        const missing = !markerLinked && !legendLinked ? '양방향 모두' : !markerLinked ? '마커→범례' : '범례→마커';
        push(marker, `마커 ${sym} 과(와) 범례 사이 왕복 링크가 없다(${missing}) — 링크는 화면에 표시가 없어 빠뜨려도 티가 안 나므로 여기서 잡는다.`, [legend.id]);
      }
    }

    for (const [sym, list] of legendBy) {
      if (!markerBy.has(sym)) {
        push(list[0].node, `범례 ${sym} 에 대응하는 마커가 없다 — 설명만 있고 가리키는 곳이 없으면 어디 얘기인지 알 수 없다(마커를 지우고 범례를 남긴 흔적).`);
      }
    }
  }

  return out;
}
