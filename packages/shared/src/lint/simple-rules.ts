/**
 * 즉시 빌트인화 가능한 6개 규칙 — 순수 기하/이름/가시성/구조 계열이라 프로젝트 무관.
 * TreeNode(get_tree) 데이터만으로 판정되고 커스텀 등록 메커니즘이 필요 없다.
 * (1단계 벤치마킹: .claude-workspace/analysis/lint-benchmark-ideation.md §2,
 *  2단계 조사: .claude-workspace/analysis/figma-invisible-problems-research.md)
 */
import type { TreeNode } from '../types';
import { buildRelationMaps, flattenTree } from './tree-utils';
import type { Violation } from './types';

const DEFAULT_NAME_RE = /^(Rectangle|Frame|Group|Ellipse|Line|Polygon|Star|Vector|Section|Component)\s?\d*$/;
const CONTAINER_TYPES = new Set(['FRAME', 'GROUP']);

function walk(roots: TreeNode[], visit: (n: TreeNode) => void): void {
  const stack = [...roots];
  while (stack.length) {
    const n = stack.pop() as TreeNode;
    visit(n);
    if (n.children) stack.push(...n.children);
  }
}

/**
 * 인스턴스 **내부**를 건너뛰는 옵션이 있는 순회.
 *
 * ⚠️ 왜 필요한가: 이름·소수 좌표·빈 프레임 계열 규칙이 **오탐이 너무 많다는 이유로 통째로 꺼져
 * 있었다.** 실측해 보니 그 오탐이 전부 한 곳에서 나왔다 — component-spec 인스턴스 내부다.
 * 스펙 HTML 이 만든 래퍼는 이름이 "Frame" 이고, CSS 로 계산된 좌표는 소수이며, 아이콘 프레임은
 * 자식이 없다. 전부 **스펙이 정하는 것이라 이 화면에서 고칠 수 없는 것들**이다.
 * L1-2 기준 default_name 5277건·empty_container 72건이 **100% 인스턴스 내부**였고,
 * 그것만 빼면 각각 0건 — 즉 규칙이 죽어 있을 이유가 없었다.
 *
 * 마스터 페이지에서는 그 안쪽이 곧 검사 대상이므로 `includeInsideInstances: true` 로 켠다.
 */
function walkOutsideInstances(
  roots: TreeNode[],
  includeInside: boolean,
  visit: (n: TreeNode) => void,
): void {
  const stack: Array<{ n: TreeNode; inside: boolean }> = roots.map((n) => ({ n, inside: false }));
  while (stack.length) {
    const { n, inside } = stack.pop() as { n: TreeNode; inside: boolean };
    if (!inside || includeInside) visit(n);
    const childInside = inside || n.type === 'INSTANCE';
    if (n.children) for (const c of n.children) stack.push({ n: c, inside: childInside });
  }
}

/** 인스턴스 내부까지 볼지 정하는 공통 옵션. 기본 = 보지 않는다. */
export interface InstanceScopeOption {
  includeInsideInstances?: boolean;
}

export function strayPixelRule(roots: TreeNode[], opts: InstanceScopeOption = {}): Violation[] {
  const out: Violation[] = [];
  walkOutsideInstances(roots, opts.includeInsideInstances === true, (n) => {
    const b = n.boundingBox;
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || !Number.isInteger(b.width) || !Number.isInteger(b.height)) {
      out.push({
        rule: 'stray_pixel', source: 'builtin',
        message: `"${n.name}" (${n.id}) 좌표/크기가 정수가 아님 (x:${b.x}, y:${b.y}, w:${b.width}, h:${b.height})`,
        nodes: [n.id],
      });
    }
  });
  return out;
}

export function defaultNameRule(roots: TreeNode[], opts: InstanceScopeOption = {}): Violation[] {
  const out: Violation[] = [];
  walkOutsideInstances(roots, opts.includeInsideInstances === true, (n) => {
    if (DEFAULT_NAME_RE.test(n.name)) {
      out.push({ rule: 'default_name', source: 'builtin', message: `"${n.name}" (${n.id}) 기본 이름 방치`, nodes: [n.id] });
    }
  });
  return out;
}

export function emptyContainerRule(roots: TreeNode[], opts: InstanceScopeOption = {}): Violation[] {
  const out: Violation[] = [];
  walkOutsideInstances(roots, opts.includeInsideInstances === true, (n) => {
    // fill 로 내용을 그리는 컨테이너는 자식이 없어도 비어있지 않다(이미지 프레임이 대표적)
    if (n.meta?.hasVisibleFill) return;
    if (CONTAINER_TYPES.has(n.type) && n.childCount === 0) {
      out.push({ rule: 'empty_container', source: 'builtin', message: `"${n.name}" (${n.id}) 빈 컨테이너`, nodes: [n.id] });
    }
  });
  return out;
}

export function hiddenLeafRule(roots: TreeNode[]): Violation[] {
  const out: Violation[] = [];
  walk(roots, (n) => {
    if (n.meta?.visible === false) {
      out.push({ rule: 'hidden_leaf', source: 'builtin', message: `"${n.name}" (${n.id}) 숨김 상태로 잔존`, nodes: [n.id] });
    }
  });
  return out;
}

/**
 * layoutSizing이 FILL인데 부모가 오토레이아웃(layoutMode !== 'NONE')이 아니면 위반.
 * FILL은 오토레이아웃 부모 안에서만 의미가 있는 값이라(resize()나 reparent 이후 남은
 * 흔적이 거의 유일한 원인), "이 상태를 의도했다"는 시나리오가 존재하지 않는 무효 상태.
 */
export function fillSizingOrphanRule(roots: TreeNode[]): Violation[] {
  const out: Violation[] = [];
  const rel = buildRelationMaps(roots);
  for (const { node, parentId } of flattenTree(roots)) {
    const h = node.meta?.layoutSizingHorizontal;
    const v = node.meta?.layoutSizingVertical;
    if (h !== 'FILL' && v !== 'FILL') continue;

    const parent = parentId ? rel.byId.get(parentId)?.node : undefined;
    const parentLayoutMode = parent?.meta?.layoutMode;
    if (!parent || parentLayoutMode === undefined || parentLayoutMode === 'NONE') {
      const axis = h === 'FILL' && v === 'FILL' ? '가로/세로' : h === 'FILL' ? '가로' : '세로';
      const parentDesc = parent ? `layoutMode:${parentLayoutMode}` : '부모 없음(루트)';
      out.push({
        rule: 'fill_sizing_orphan', source: 'builtin',
        message: `"${node.name}" (${node.id}) ${axis} FILL 사이징인데 부모가 오토레이아웃이 아님(${parentDesc}) — 무효 상태`,
        nodes: [node.id],
      });
    }
  }
  return out;
}

/** COMPONENT/COMPONENT_SET의 description이 비어있으면 위반. default_name과 같은 급의 최소 위생 규칙. */
export function componentDescriptionEmptyRule(roots: TreeNode[]): Violation[] {
  const out: Violation[] = [];
  walk(roots, (n) => {
    if (n.type !== 'COMPONENT' && n.type !== 'COMPONENT_SET') return;
    const desc = n.meta?.description;
    if (!desc || !desc.trim()) {
      out.push({ rule: 'component_description_empty', source: 'builtin', message: `"${n.name}" (${n.id}) description 비어있음`, nodes: [n.id] });
    }
  });
  return out;
}

export interface RawNodeConfig {
  /** "정의됐어야 하는" 것으로 볼 노드 타입. 기본 = FRAME + 기본 도형(TEXT/GROUP/SECTION/INSTANCE/COMPONENT 는 비대상). */
  types?: string[];
  /** COMPONENT 정의 내부의 raw 노드까지 검사할지. 기본 false(컴포넌트를 이루는 원시 요소는 정상). */
  checkInsideComponent?: boolean;
  /** 이 정규식에 매칭되는 이름은 제외(기획 킷/주석 등 의도적 raw 허용). */
  exemptNamePattern?: string;
}

const DEFAULT_RAW_TYPES = ['FRAME', 'RECTANGLE', 'ELLIPSE', 'VECTOR', 'LINE', 'POLYGON', 'STAR'];

/**
 * raw_node (opt-in, 기본 OFF) — "화면(조립 레이어)에서 쓰는 모든 시각 요소는 사전 정의된
 * 컴포넌트의 INSTANCE 여야 한다"를 강제한다. 등록 컴포넌트를 raw 도형/프레임으로 흉내낸 노드를 전수 검출.
 * 휴리스틱으로 "이게 컴포넌트여야 했나"를 추측하지 않고, "정의된 것만 쓴다"는 정책을 기계적으로 강제하는 방식.
 *
 * 스코프(오탐/노이즈 방지):
 * - 대상 타입(cfg.types)만 검사. 기본 목록에 TEXT/GROUP/SECTION/INSTANCE/COMPONENT 없음(라벨·구조 컨테이너·정의는 정상).
 * - INSTANCE 내부 노드는 **항상** 제외(인스턴스 내부는 독립 저작 대상이 아니라 정의의 사본).
 * - COMPONENT 정의 내부 노드는 기본 제외(컴포넌트를 이루는 원시 요소) — cfg.checkInsideComponent=true 면 포함.
 * - cfg.exemptNamePattern 매칭 이름 제외.
 */
export function rawNodeRule(roots: TreeNode[], cfg: RawNodeConfig = {}): Violation[] {
  const out: Violation[] = [];
  const types = new Set(cfg.types && cfg.types.length ? cfg.types : DEFAULT_RAW_TYPES);
  let exemptRe: RegExp | null = null;
  if (cfg.exemptNamePattern) {
    try { exemptRe = new RegExp(cfg.exemptNamePattern); } catch { exemptRe = null; }
  }
  const rel = buildRelationMaps(roots);

  for (const { node } of flattenTree(roots)) {
    if (!types.has(node.type)) continue;
    if (exemptRe && exemptRe.test(node.name)) continue;

    const ancestorTypes = rel.ancestorsOf(node.id).map((aid) => rel.byId.get(aid)?.node.type);
    if (ancestorTypes.includes('INSTANCE')) continue;
    if (!cfg.checkInsideComponent && ancestorTypes.includes('COMPONENT')) continue;

    out.push({
      rule: 'raw_node', source: 'builtin',
      message: `"${node.name}" (${node.id}) raw ${node.type} — 등록된 컴포넌트 인스턴스가 아님(컴포넌트로 정의 후 인스턴스로 사용)`,
      nodes: [node.id],
    });
  }
  return out;
}
