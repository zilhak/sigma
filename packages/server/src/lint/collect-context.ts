/**
 * lint 실행에 필요한 **추가 컨텍스트**를 플러그인에서 모은다.
 *
 * 왜 별도 계층인가: opt-in 룰 몇 종은 TreeNode 에 없는 정보를 요구한다
 * (기획 레이어 role, 스펙 마스터 ID, 인스턴스↔마스터 이름, 문서 기본 폰트, 스펙 기준 크기).
 * 전부 WS 왕복이라 비용이 있으므로 **해당 룰이 켜졌을 때만** 부른다 — 각 함수가 맨 앞에서
 * 자기 룰의 enabled 를 보고 꺼져 있으면 조회 없이 빈 값을 돌려준다(비용 0).
 */
import type { TreeNode } from '@sigma/shared';
import { isEnabled, type LintConfig } from '@sigma/shared/lint';
import type { FigmaWebSocketServer } from '../websocket/server.js';
import { fetchNodesInfoBatched, type NodeInfoLike } from './enrich.js';
import { listComponentSpecs } from '../storage/component-specs.js';

/**
 * annotation_layer 규칙이 켜졌을 때, 기획 레이어로 태깅된 노드 id 집합을 수집한다.
 * 판정 = 노드 sharedPluginData("sigma","role") === "annotation-layer" (이름 아님).
 * 후보 = 모든 SECTION 의 직속 FRAME(레이어는 섹션 직속 프레임). 배치 1왕복으로 조회.
 * 규칙이 꺼져 있으면 조회 없이 빈 집합(비용 0).
 */
export async function collectAnnotationLayerIds(
  builtins: LintConfig['builtins'],
  roots: TreeNode[],
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
  alsoForCustom = false,
  scopeRoot?: TreeNode,
): Promise<Set<string>> {
  const empty = new Set<string>();
  // 빌트인 annotation_layer 가 꺼져 있어도 커스텀 규칙이 있으면 수집한다 — 커스텀이
  // 레이어 여부를 보려면 이 판정이 필요하고, 없으면 이름으로 짐작하게 된다.
  // 기획 주석 규칙들(marker_pair/marker_gap)도 이 판정 위에서만 동작한다 — 자기가 켜졌는데
  // 수집이 안 되면 **위반이 없는 게 아니라 규칙이 아예 안 도는데 0건으로 보인다**(실측으로 확인).
  const needsForAnnotationRules =
    builtins?.annotation_marker_pair?.enabled === true ||
    builtins?.annotation_marker_gap?.enabled === true;
  if (builtins?.annotation_layer?.enabled !== true && !alsoForCustom && !needsForAnnotationRules) return empty;

  const candidates: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'SECTION') {
        for (const c of n.children ?? []) if (c.type === 'FRAME') candidates.push(c.id);
      }
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  // ⚠️ nodeId 스코프로 **섹션 하나**를 검사하면 그 섹션은 roots 가 아니라 scopeRoot 로 오고,
  // roots 는 그 자식이다 → 위 walk 가 SECTION 을 못 만나 후보가 0이 되고, 기획 레이어 면제가
  // 통째로 사라져 주석 레이어가 card_overlap 오탐으로 잡혔다(같은 섹션이 page 스코프 0건 ↔
  // nodeId 스코프 7건). 스코프 시작점이 섹션이면 그 직속 FRAME(=roots)도 후보에 넣는다.
  if (scopeRoot?.type === 'SECTION') {
    for (const r of roots) if (r.type === 'FRAME') candidates.push(r.id);
  }
  if (candidates.length === 0) return empty;

  let data: Record<string, string> = {};
  try {
    const res = await wsServer.getNodesData(candidates, 'role', pluginId);
    data = res.data || {};
  } catch {
    return empty; // 조회 실패 시 면제·판정 없이 진행(안전 기본값)
  }
  const layerIds = new Set<string>();
  for (const [id, raw] of Object.entries(data)) {
    try {
      if (JSON.parse(raw) === 'annotation-layer') layerIds.add(id);
    } catch { /* JSON 아닌 값 무시 */ }
  }
  return layerIds;
}

/**
 * instance_resized_from_spec 이 켜졌을 때, alias → 축별 sizing 맵을 만든다.
 * hug 축(내용에 따라 늘어남)은 커지는 게 정상이라 판정에서 빼야 하는데, 그 정보는 Figma 노드가
 * 아니라 **스펙 레지스트리**에 있다. 같은 alias 가 여러 namespace 에 있고 sizing 이 엇갈리면
 * 그 alias 는 넣지 않는다(애매하면 판정하지 않는 쪽).
 */
export async function resolveSpecSizing(
  builtins: LintConfig['builtins'],
): Promise<Record<string, { horizontal?: string; vertical?: string }>> {
  if (builtins?.instance_resized_from_spec?.enabled !== true) return {};
  const records = await listComponentSpecs();
  const out: Record<string, { horizontal?: string; vertical?: string }> = {};
  const conflicting = new Set<string>();
  for (const r of records) {
    if (!r.sizing) continue;
    const prev = out[r.alias];
    if (prev && (prev.horizontal !== r.sizing.horizontal || prev.vertical !== r.sizing.vertical)) {
      conflicting.add(r.alias);
      continue;
    }
    out[r.alias] = { horizontal: r.sizing.horizontal, vertical: r.sizing.vertical };
  }
  for (const alias of conflicting) delete out[alias];
  return out;
}

/**
 * font_not_default 규칙이 켜졌을 때, 이 파일이 정한 기본 폰트 패밀리를 읽는다.
 * 출처는 폰트 파이프라인과 같은 자리 — 문서 노드 sharedPluginData("sigma","fonts")의 `default`.
 * 규칙이 꺼져 있으면 조회하지 않고(비용 0), 설정이 없거나 조회에 실패하면 undefined
 * → 규칙이 "기대값을 모르므로 판정하지 않음"으로 스스로 비활성된다.
 */
export async function resolveDefaultFontFamily(
  builtins: LintConfig['builtins'],
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
): Promise<string | undefined> {
  if (builtins?.font_not_default?.enabled !== true) return undefined;
  const configured = builtins.font_not_default.family;
  if (typeof configured === 'string' && configured) return configured;
  try {
    const res = await wsServer.getPageData({ key: 'fonts', pageId: 'document' }, pluginId);
    const raw = (res.value ?? null) as string | null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { default?: unknown };
    return typeof parsed.default === 'string' && parsed.default ? parsed.default : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 스펙 스탬프가 찍힌 COMPONENT id 를 모은다 — 이름·소수좌표·빈프레임 규칙이 그 **내부**를
 * 건너뛰기 위한 판정 근거다.
 *
 * ⚠️ 왜 이 조회가 필요한가: 스탬프는 `component.setPluginData('sigma-spec', …)` 로 찍히는데
 * (`node-ops/component-spec.ts`), 이건 **네임스페이스 없는 pluginData** 라 기존 배치 조회
 * (sharedPluginData "sigma")로는 읽히지 않는다. 그래서 `plain: true` 로 부른다.
 *
 * 이게 없으면 마스터 페이지에서 세 규칙을 통째로 끄는 수밖에 없었고(실측 100% COMPONENT 내부),
 * 그러면 그 페이지의 **손조립 컴포넌트 위반도 함께 안 보인다**.
 * 규칙이 하나도 안 켜져 있으면 조회하지 않는다(비용 0).
 */
const SPEC_TREE_RULES = ['stray_pixel', 'default_name', 'empty_container'] as const;

export async function collectSpecMasterIds(
  builtins: LintConfig['builtins'],
  roots: TreeNode[],
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
): Promise<Set<string>> {
  const empty = new Set<string>();
  const anyEnabled = SPEC_TREE_RULES.some((id) => isEnabled(builtins || {}, id));
  if (!anyEnabled) return empty;

  const candidates: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'COMPONENT') { candidates.push(n.id); continue; } // 마스터 안의 중첩은 볼 필요 없다
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  if (candidates.length === 0) return empty;

  try {
    const res = await wsServer.getNodesData(candidates, 'sigma-spec', pluginId, true);
    return new Set(Object.keys(res.data || {}));
  } catch {
    return empty; // 조회 실패 시 제외 없이 진행(= 예전 동작, 안전측)
  }
}

/**
 * instance_default_name 규칙이 켜졌을 때, INSTANCE id → 마스터 컴포넌트 이름 맵을 만든다.
 * 마스터 이름은 TreeNode 에 없어 get_nodes_info(componentName)로 resolve 한다.
 * 후보 = 최상위(다른 INSTANCE 내부가 아닌) INSTANCE 노드. 배치 1왕복으로 조회.
 * 규칙이 꺼져 있으면 조회 없이 빈 맵(비용 0). 조회 실패 시에도 빈 맵(판정 없이 진행).
 */
export async function collectInstanceComponentNames(
  builtins: LintConfig['builtins'],
  roots: TreeNode[],
  wsServer: FigmaWebSocketServer,
  pluginId: string | undefined,
): Promise<Map<string, string>> {
  const empty = new Map<string, string>();
  if (builtins?.instance_default_name?.enabled !== true) return empty;

  const candidates: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'INSTANCE') { candidates.push(n.id); continue; } // 중첩 인스턴스는 제외(엔진 규칙과 동일)
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  if (candidates.length === 0) return empty;

  let infos: NodeInfoLike[] = [];
  try {
    // 배치 필수 — 한 번에 다 보내면 응답이 절벽(~18MB)을 넘겨 플러그인이 죽는다.
    // 배경: docs/history/012-nodes-info-asked-for-a-whole-page-and-killed-the-plugin.md
    infos = await fetchNodesInfoBatched(candidates, wsServer, pluginId);
  } catch {
    return empty; // 조회 실패 시 판정 없이 진행(안전 기본값)
  }
  const map = new Map<string, string>();
  for (const info of infos) {
    if (!info.error && typeof info.componentName === 'string') map.set(info.nodeId, info.componentName);
  }
  return map;
}
