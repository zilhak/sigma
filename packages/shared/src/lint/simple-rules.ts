/**
 * 즉시 빌트인화 가능한 4개 규칙 — 순수 기하/이름/가시성 계열이라 프로젝트 무관.
 * TreeNode(get_tree) 데이터만으로 판정되고 커스텀 등록 메커니즘이 필요 없다.
 * (1단계 벤치마킹: .claude-workspace/analysis/lint-benchmark-ideation.md §2)
 */
import type { TreeNode } from '../types';
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
