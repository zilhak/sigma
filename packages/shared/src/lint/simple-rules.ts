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

export function strayPixelRule(roots: TreeNode[]): Violation[] {
  const out: Violation[] = [];
  walk(roots, (n) => {
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

export function defaultNameRule(roots: TreeNode[]): Violation[] {
  const out: Violation[] = [];
  walk(roots, (n) => {
    if (DEFAULT_NAME_RE.test(n.name)) {
      out.push({ rule: 'default_name', source: 'builtin', message: `"${n.name}" (${n.id}) 기본 이름 방치`, nodes: [n.id] });
    }
  });
  return out;
}

export function emptyContainerRule(roots: TreeNode[]): Violation[] {
  const out: Violation[] = [];
  walk(roots, (n) => {
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
