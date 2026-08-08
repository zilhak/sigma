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
import { isOpaqueSolidFill } from './occlusion';

export interface AnnotationMarkerPairConfig {
  /** 마커 인스턴스의 스펙 alias. 기본 'marker'(anno 프리셋). */
  markerAlias?: string;
  /** 범례 인스턴스의 스펙 alias. 기본 'legend'. */
  legendAlias?: string;
  /** 왕복 하이퍼링크까지 요구할지. 기본 true. */
  requireHyperlink?: boolean;
  /**
   * 번호로 인정할 패턴(정규식 문자열). 기본 = 원문자 숫자 한 글자(①~㊿) **또는 1~2자리 숫자**.
   * 평문 숫자를 넣은 이유: 실제 파일에 원문자를 쓰는 섹션과 평문 숫자를 쓰는 섹션이 섞여 있었고,
   * 원문자만 인정하면 후자에서 규칙이 통째로 무용지물이 된다(그 섹션 마커가 전부 "번호를 읽을 수
   * 없다" 로만 나왔다). 어떤 기호를 쓸지는 파일의 규약이지 도구가 정할 일이 아니다.
   */
  symbolPattern?: string;
}

const DEFAULT_SYMBOL_PATTERN = '^([\\u2460-\\u2473\\u3251-\\u325F\\u32B1-\\u32BF]|[0-9]{1,2})$';

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

// ─────────────────────────────────────────────────────────────────────────────
// annotation_marker_gap — 마커가 대상을 덮거나, 너무 멀리 떠 있거나, 가리키는 게 아예 없는 것
//
// 규약은 "마커는 대상 경계에서 4~10px, 12px 초과 금지, 겹침 금지" 인데 지금까지 기계 백스톱이
// 없었다. 실제로 한 화면에서 **마커 14개가 전부 대상 위에 얹혀 있었고**(규약 신설 이전 산물),
// 반대로 그리지도 않은 위젯을 가리키는 마커가 빈 공간에 찍혀 있던 적도 있다.
//
// 판정에는 **절대좌표**가 필요하다 — 마커는 기획 레이어 안에 있고 대상은 상태 프레임 깊숙한 곳에
// 있어서, 부모 로컬좌표로는 애초에 비교가 불가능하다(get_tree 를 includeAbsolute 로 부른다).
//
// 대상 후보는 **원자적인 노드만** 본다(자식 없는 leaf + INSTANCE). 상태 프레임 같은 큰 컨테이너를
// 후보에 넣으면 마커는 언제나 그 위에 얹혀 있으므로 전부 "덮음" 으로 잡힌다.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationMarkerGapConfig {
  markerAlias?: string;
  /**
   * 이 거리를 넘으면 "떠 있음". 기본 12(규약: 4~10px 권장, 12 초과 금지)
   *
   * ⚠️ 한계 — **상태·영역 전체를 가리키는 마커**(빈 상태 프레임, 다이얼로그, 구역)는 원래 가까이 붙일
   * 대상이 없어 100px 넘게 떨어져 있는 게 정상이다. 도구는 이 둘을 구분하지 못하므로 그런 마커에는
   * 사유를 적은 `lint-ignore` 를 붙인다.
   */
  maxGap?: number;
  /** 이 거리 안에 후보가 하나도 없으면 "가리키는 대상이 없음". 기본 240 */
  orphanRadius?: number;
  /**
   * 마커 넓이의 몇 배부터 "배경·컨테이너" 로 볼지. 기본 30.
   *
   * 실측에서 덮음 판정의 대부분이 `content_overview_bg`·`dialog_overlay`·`dim` 같은 **배경판**이었다.
   * 마커는 어느 화면에서든 배경 위에 얹히므로 이건 결함이 아니다 — 배경을 덮어서 가려지는 정보가 없다.
   * 그 안의 작은 요소를 덮었다면 그쪽으로 잡히므로(같은 거리면 더 작은 후보를 고른다) 놓치지 않는다.
   */
  backgroundAreaRatio?: number;
  /**
   * 마커 넓이의 몇 할을 덮어야 "덮음" 으로 볼지. 기본 0.5.
   *
   * 실측 분포가 이유다 — 덮음 판정 43건 중 30건이 겹침 5% 이하였다. 대부분은 제목 텍스트 상자의
   * 디센더 공백을 스친 것이라(TEXT 상자는 글자보다 넓다) 눈으로 보면 아무것도 가리지 않는다.
   * 마커가 요소 **위에 올라앉은** 경우만 남긴다.
   */
  minCoverRatio?: number;
}

interface Rect { x: number; y: number; w: number; h: number }

/** 두 사각형의 축별 간격 — 둘 다 0이면 겹침. 대각선은 큰 쪽을 취한다(경계에서 Npx 라는 감각과 맞다). */
function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.max(dx, dy);
}

/** 겹친 넓이가 마커 넓이의 몇 할인지 — "스쳤다" 와 "위에 올라앉았다" 를 가른다. */
function overlapRatio(m: Rect, c: Rect, markerArea: number): number {
  if (markerArea <= 0) return 0;
  const ox = Math.max(0, Math.min(m.x + m.w, c.x + c.w) - Math.max(m.x, c.x));
  const oy = Math.max(0, Math.min(m.y + m.h, c.y + c.h) - Math.max(m.y, c.y));
  return (ox * oy) / markerArea;
}

function rectOf(n: LintNode): Rect | null {
  if (typeof n.absoluteX !== 'number' || typeof n.absoluteY !== 'number') return null;
  return { x: n.absoluteX, y: n.absoluteY, w: n.width, h: n.height };
}

/** 후보를 격자에 담아 마커 주변만 훑는다 — 페이지 전체(수만 노드) × 마커 수의 전수 비교를 피한다. */
class Grid {
  private cells = new Map<string, Array<{ node: LintNode; rect: Rect }>>();
  constructor(private size: number) {}
  add(node: LintNode, rect: Rect) {
    const x0 = Math.floor(rect.x / this.size), x1 = Math.floor((rect.x + rect.w) / this.size);
    const y0 = Math.floor(rect.y / this.size), y1 = Math.floor((rect.y + rect.h) / this.size);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`;
        const arr = this.cells.get(key);
        if (arr) arr.push({ node, rect }); else this.cells.set(key, [{ node, rect }]);
      }
    }
  }
  near(rect: Rect, radius: number): Array<{ node: LintNode; rect: Rect }> {
    const out: Array<{ node: LintNode; rect: Rect }> = [];
    const seen = new Set<string>();
    const x0 = Math.floor((rect.x - radius) / this.size), x1 = Math.floor((rect.x + rect.w + radius) / this.size);
    const y0 = Math.floor((rect.y - radius) / this.size), y1 = Math.floor((rect.y + rect.h + radius) / this.size);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (const item of this.cells.get(`${x}:${y}`) || []) {
          if (seen.has(item.node.id)) continue;
          seen.add(item.node.id);
          out.push(item);
        }
      }
    }
    return out;
  }
}

/**
 * 전역 페인트 순서 비교기 — Figma 는 트리를 깊이우선으로 그리고 `children` 뒤쪽이 위다.
 * 두 노드의 루트부터의 자식 인덱스 경로를 사전순 비교하면 어느 쪽이 위인지 나온다.
 *
 * 형제 비교(`fully_occluded_sibling`)로는 안 되는 이유: 마커는 주석 레이어(섹션 최상위)에 있고
 * 가려진 후보는 **다른 프레임 안**이라 공통 부모가 없다. 그래서 절대좌표 + 전역 z 가 필요하다.
 */
class PaintOrder {
  private parentOf = new Map<string, string>();
  private indexOf = new Map<string, number>();
  private keyCache = new Map<string, number[]>();

  constructor(children: Record<string, string[]>) {
    for (const [parent, kids] of Object.entries(children)) {
      for (let i = 0; i < kids.length; i++) {
        this.parentOf.set(kids[i], parent);
        this.indexOf.set(kids[i], i);
      }
    }
  }

  private key(id: string): number[] {
    const cached = this.keyCache.get(id);
    if (cached) return cached;
    const path: number[] = [];
    let cur: string | undefined = id;
    const guard = new Set<string>();
    while (cur !== undefined && !guard.has(cur)) {
      guard.add(cur);
      const idx = this.indexOf.get(cur);
      if (idx === undefined) break;
      path.unshift(idx);
      cur = this.parentOf.get(cur);
    }
    this.keyCache.set(id, path);
    return path;
  }

  /** a 가 b 보다 나중에 그려지는가(= 위인가). 조상/자손 관계면 false(부모는 자식을 가리지 못한다). */
  isAbove(a: string, b: string): boolean {
    const ka = this.key(a), kb = this.key(b);
    const n = Math.min(ka.length, kb.length);
    for (let i = 0; i < n; i++) {
      if (ka[i] !== kb[i]) return ka[i] > kb[i];
    }
    return false;
  }
}

function containsRect(outer: Rect, inner: Rect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y
    && outer.x + outer.w >= inner.x + inner.w
    && outer.y + outer.h >= inner.y + inner.h;
}

export function annotationMarkerGapRule(
  nodes: LintNode[],
  relations: MarkerPairRelations,
  config: AnnotationMarkerGapConfig = {},
): Violation[] {
  const markerAlias = config.markerAlias || 'marker';
  const maxGap = typeof config.maxGap === 'number' ? config.maxGap : 12;
  const orphanRadius = typeof config.orphanRadius === 'number' ? config.orphanRadius : 240;
  const bgRatio = typeof config.backgroundAreaRatio === 'number' ? config.backgroundAreaRatio : 30;
  const minCoverRatio = typeof config.minCoverRatio === 'number' ? config.minCoverRatio : 0.5;

  const layerIds = new Set(nodes.filter((n) => n.isAnnotationLayer).map((n) => n.id));
  if (layerIds.size === 0) return [];

  const inLayer = (n: LintNode) => (relations.ancestors[n.id] || []).some((a) => layerIds.has(a));

  const markers: Array<{ node: LintNode; rect: Rect }> = [];
  const grid = new Grid(256);
  /** 불투명 가림판 후보(모달 패널 등). 후보와 같은 격자로 훑어 근처만 비교한다. */
  const occluders = new Grid(256);
  let hasAbsolute = false;

  for (const n of nodes) {
    const rect = rectOf(n);
    if (rect) hasAbsolute = true;
    if (n.type === 'INSTANCE' && n.specAlias === markerAlias && inLayer(n)) {
      if (rect) markers.push({ node: n, rect });
      continue;
    }
    // 가림판 수집은 후보 조건(원자적 노드)과 별개다 — 모달 패널은 자식을 가진 컨테이너다.
    if (rect && rect.w > 0 && rect.h > 0 && !n.isAnnotationLayer && !inLayer(n)
        && n.visible !== false && isOpaqueSolidFill(n)) {
      occluders.add(n, rect);
    }
    // 후보 = 주석 밖의 **원자적** 노드. 큰 컨테이너를 넣으면 마커가 항상 그 위에 있어 전부 겹침이 된다.
    if (!rect) continue;
    if (n.isAnnotationLayer || inLayer(n)) continue;
    if (n.type === 'SECTION' || n.type === 'PAGE') continue;
    const atomic = n.childCount === 0 || n.type === 'INSTANCE';
    if (!atomic) continue;
    if (rect.w <= 0 || rect.h <= 0) continue;
    grid.add(n, rect);
  }

  // 절대좌표가 전혀 없으면(호출이 includeAbsolute 없이 왔으면) 판정하지 않는다 — 좌표계가 섞이면 전부 오답이다.
  if (!hasAbsolute || markers.length === 0) return [];

  // 화면에 안 보이는 후보는 마커가 덮어도 가리는 정보가 없고, "가장 가까운 요소" 로도 부적절하다.
  // 실제 사례: 불투명 모달 패널에 완전히 가려진 표 셀이 "마커가 덮고 있다" 로 잡혔다 —
  // 마커는 패널 위에 있고 패널 위 요소는 하나도 덮지 않았는데도.
  // 배경: docs/history/014-marker-gap-judged-invisible-nodes.md
  const paintOrder = new PaintOrder(relations.children);
  const hiddenCache = new Map<string, boolean>();
  const isHidden = (c: LintNode, rect: Rect): boolean => {
    const cached = hiddenCache.get(c.id);
    if (cached !== undefined) return cached;
    const ancestors = new Set(relations.ancestors[c.id] || []);
    let hidden = false;
    for (const o of occluders.near(rect, 0)) {
      if (o.node.id === c.id) continue;
      // 조상은 자식보다 먼저 그려지므로 가리지 못한다. 자손도 제외(그건 다른 규칙의 몫).
      if (ancestors.has(o.node.id)) continue;
      if ((relations.ancestors[o.node.id] || []).includes(c.id)) continue;
      if (!containsRect(o.rect, rect)) continue;
      if (!paintOrder.isAbove(o.node.id, c.id)) continue;
      hidden = true;
      break;
    }
    hiddenCache.set(c.id, hidden);
    return hidden;
  };

  const out: Violation[] = [];
  for (const m of markers) {
    const near = grid.near(m.rect, orphanRadius).filter((c) => !isHidden(c.node, c.rect));
    const markerArea = m.rect.w * m.rect.h;
    const bgArea = markerArea * bgRatio;
    let best: { node: LintNode; gap: number } | null = null;
    let covered: { node: LintNode; ratio: number } | null = null;
    for (const c of near) {
      const gap = gapBetween(m.rect, c.rect);
      if (best === null || gap < best.gap) best = { node: c.node, gap };
      if (gap > 0) continue;
      // 배경판은 덮어도 가려지는 정보가 없다 — 그 위의 작은 요소를 덮었으면 그쪽이 잡힌다.
      if (c.rect.w * c.rect.h > bgArea) continue;
      const ratio = overlapRatio(m.rect, c.rect, markerArea);
      if (covered === null || ratio > covered.ratio) covered = { node: c.node, ratio };
    }

    if (covered !== null && covered.ratio >= minCoverRatio) {
      out.push({
        rule: 'annotation_marker_gap', source: 'builtin',
        message: `마커 "${m.node.name}" (${m.node.id}) 가 "${covered.node.name}" 을(를) 덮고 있다 — 가리키려는 것을 가리면 안 된다. 대상 경계 바깥 4~10px 로 옮겨라(여백이 없으면 그 영역만 담은 구조 프레임으로 분리).`,
        nodes: [m.node.id, covered.node.id],
      });
      continue;
    }

    if (best === null) {
      out.push({
        rule: 'annotation_marker_gap', source: 'builtin',
        message: `마커 "${m.node.name}" (${m.node.id}) 주변 ${orphanRadius}px 안에 가리킬 만한 요소가 없다 — 대상 없이 떠 있는 번호는 읽는 사람에게 아무것도 알려 주지 않는다(대상을 그렸는지 확인하라).`,
        nodes: [m.node.id],
      });
      continue;
    }
    if (best.gap > maxGap) {
      out.push({
        rule: 'annotation_marker_gap', source: 'builtin',
        message: `마커 "${m.node.name}" (${m.node.id}) 와 가장 가까운 요소 "${best.node.name}" 사이가 ${Math.round(best.gap)}px 다(허용 ${maxGap}px) — 멀리 떨어진 번호는 무엇을 가리키는지 알 수 없다.`,
        nodes: [m.node.id, best.node.id],
      });
    }
  }

  return out;
}
