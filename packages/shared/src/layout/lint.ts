/**
 * 레이아웃 공간 규약(spatial invariants) 린터 — 순수 기하 계산.
 *
 * Figma 캔버스에서 로스(loose) 노드는 자유 배치라 서로 겹칠 수 있고, 겹치면 렌더상 가려
 * 육안 판별이 안 된다(좌표로만 확실). 에이전트는 좌표 부기에 약해 이 클래스 버그를 반복한다.
 * 규칙이 전부 결정론적(AABB/containment)이라 툴이 흡수한다. check=린터, fix=포매터.
 *
 * 좌표계 주의: Figma 에서 SECTION 은 좌표 원점을 새로 잡지 않는다 → 섹션 직속 자식은
 * 페이지(절대) 좌표 유지. FRAME/COMPONENT 는 로컬 원점 → 자식은 상대 좌표. 따라서 섹션
 * 레벨 기하 규칙(R1~R3,R5)은 전부 절대좌표라 서로 비교 가능하고, R4 는 구조(타입)만 본다.
 */
import type { TreeNode } from '../types';

export const DEFAULT_PADDING = 20;

/** 기획용(anno/wire) 프리셋 인스턴스 이름 — 프레임 밖에 떠 있어도 R4 예외.
 *  (한계: 노드 이름엔 spec namespace 가 안 실림 → 이름 휴리스틱. 정확 판정은 호출측에서 보강) */
const ANNO_WIRE_NAMES = new Set([
  'region', 'marker', 'legend', 'label',
  'box', 'section_title', 'item', 'kv', 'note',
]);
const CARD_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET']);
const PLACED_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP']);
/** INSTANCE 를 감싸면 "떠 있는 게 아닌" 것으로 인정하는 래퍼 타입.
 *  COMPONENT/INSTANCE 내부의 중첩 인스턴스(컴포넌트 정의의 일부)는 orphan 이 아니다. */
const WRAPPER_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP']);

export type LayoutRule =
  | 'outside_section'
  | 'section_overlap'
  | 'card_overlap'
  | 'frame_padding'
  | 'instance_orphan'
  | 'child_overflow';

/** 안전 자동수정: 형제를 안 건드리고 섹션을 목표 bbox 로 확장 (grow container > move sibling). */
export interface LayoutFix {
  op: 'grow_section';
  sectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
}

export interface LayoutViolation {
  rule: LayoutRule;
  message: string;
  /** 관련 노드 id (첫 번째가 위반 주체) */
  nodes: string[];
  /** 자동수정 가능하면 안전 fix (frame_padding/child_overflow 만) */
  fix?: LayoutFix;
}

export interface LintOptions {
  /** 섹션 안 프레임 최소 여백(px). 기본 20 */
  padding?: number;
  /** R4 예외로 볼 인스턴스 이름 집합 확장 (기획용 커스텀 등) */
  annoWireNames?: Iterable<string>;
}

export interface LintResult {
  clean: boolean;
  violationCount: number;
  violations: LayoutViolation[];
}

type Box = { x: number; y: number; width: number; height: number };

function bb(n: TreeNode): Box {
  return n.boundingBox;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

/** inner 가 outer 안에 pad 여백을 두고 들어가는가 */
function insetOk(outer: Box, inner: Box, pad: number): boolean {
  return inner.x - outer.x >= pad &&
    inner.y - outer.y >= pad &&
    (outer.x + outer.width) - (inner.x + inner.width) >= pad &&
    (outer.y + outer.height) - (inner.y + inner.height) >= pad;
}

function kids(n: TreeNode): TreeNode[] {
  return n.children ?? [];
}

/** 섹션이 child 를 pad 여백으로 품도록 확장하는 목표 bbox (형제 불변) */
function growSectionFix(section: TreeNode, child: TreeNode, pad: number, reason: string): LayoutFix {
  const s = bb(section);
  const c = bb(child);
  const nx = Math.min(s.x, c.x - pad);
  const ny = Math.min(s.y, c.y - pad);
  const right = Math.max(s.x + s.width, c.x + c.width + pad);
  const bottom = Math.max(s.y + s.height, c.y + c.height + pad);
  return { op: 'grow_section', sectionId: section.id, x: nx, y: ny, width: right - nx, height: bottom - ny, reason };
}

/**
 * 트리(페이지 children)를 받아 공간 규약 위반을 계산한다. read-only.
 * roots = 페이지 최상위 노드 배열 (sigma get_tree 의 children).
 */
export function lintLayout(roots: TreeNode[], opts: LintOptions = {}): LintResult {
  const pad = opts.padding ?? DEFAULT_PADDING;
  const annoWire = new Set(ANNO_WIRE_NAMES);
  if (opts.annoWireNames) for (const n of opts.annoWireNames) annoWire.add(n);
  const V: LayoutViolation[] = [];
  const add = (rule: LayoutRule, message: string, nodes: string[], fix?: LayoutFix) =>
    V.push(fix ? { rule, message, nodes, fix } : { rule, message, nodes });

  // container 의 직속 자식에 규칙 적용 후 재귀. kind: page | section | frame
  function checkContainer(children: TreeNode[], container: TreeNode | null, kind: 'page' | 'section' | 'frame') {
    // R1: 형제 SECTION 끼리 겹침 (모든 레벨)
    const sections = children.filter((c) => c.type === 'SECTION');
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        if (overlaps(bb(sections[i]), bb(sections[j]))) {
          add('section_overlap', `섹션 "${sections[i].name}" ↔ "${sections[j].name}" 겹침`,
            [sections[i].id, sections[j].id]);
        }
      }
    }

    if (kind === 'section' && container) {
      // R2: 섹션 직속 카드(FRAME/COMPONENT)끼리 겹침
      const cards = children.filter((c) => CARD_TYPES.has(c.type));
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          if (overlaps(bb(cards[i]), bb(cards[j]))) {
            add('card_overlap', `섹션 "${container.name}" 안 "${cards[i].name}" ↔ "${cards[j].name}" 겹침`,
              [cards[i].id, cards[j].id]);
          }
        }
      }
      for (const c of children) {
        // R5: 섹션 밖으로 튀어나감
        if (!insetOk(bb(container), bb(c), 0)) {
          add('child_overflow', `"${c.name}" (${c.id}) 가 섹션 "${container.name}" 밖으로 나감`,
            [c.id], growSectionFix(container, c, 0, 'child_overflow: 자식을 품도록 섹션 확장'));
        } else if (c.type === 'FRAME' && !insetOk(bb(container), bb(c), pad)) {
          // R3: 프레임 여백 부족 (섹션에 딱 붙으면 섹션 의미 없음)
          add('frame_padding', `프레임 "${c.name}" 가 섹션 "${container.name}" 안 ${pad}px 여백 미달`,
            [c.id, container.id], growSectionFix(container, c, pad, `frame_padding: ${pad}px 여백 확보`));
        }
      }
    }

    if (kind === 'page') {
      // R0: 페이지 직속에 섹션 아닌 배치 노드
      for (const c of children) {
        if (PLACED_TYPES.has(c.type)) {
          add('outside_section', `"${c.name}" (${c.id}, ${c.type}) 가 섹션 밖 페이지 직속에 있음`, [c.id]);
        }
      }
    }

    // 재귀: SECTION → section, FRAME → frame (COMPONENT 내부 guts 는 기하 검사 대상 아님)
    for (const c of children) {
      if (c.type === 'SECTION') checkContainer(kids(c), c, 'section');
      else if (c.type === 'FRAME') checkContainer(kids(c), c, 'frame');
    }
  }

  // R4: INSTANCE 는 래퍼(프레임/컴포넌트/그룹) 조상 필요 = 섹션/페이지 직속으로 뜨면 안 됨.
  //     (마스터 COMPONENT·다른 INSTANCE 내부의 중첩 인스턴스는 정상 — 컴포넌트 정의의 일부)
  function walkOrphan(n: TreeNode, hasWrapperAncestor: boolean) {
    if (n.type === 'INSTANCE' && !hasWrapperAncestor && !annoWire.has(n.name)) {
      add('instance_orphan', `INSTANCE "${n.name}" (${n.id}) 가 프레임 밖에 떠 있음`, [n.id]);
    }
    const nextWrap = hasWrapperAncestor || WRAPPER_TYPES.has(n.type);
    for (const c of kids(n)) walkOrphan(c, nextWrap);
  }

  checkContainer(roots, null, 'page');
  for (const r of roots) walkOrphan(r, false);

  return { clean: V.length === 0, violationCount: V.length, violations: V };
}

/**
 * grow_section fix 들을 섹션별로 합쳐(union) 섹션당 하나의 목표 bbox 로 만든다.
 * 같은 섹션에 여러 확장 요구가 있을 때 충돌 없이 한 번에 적용하기 위함.
 */
export function mergeFixesBySection(fixes: LayoutFix[]): LayoutFix[] {
  const bySection = new Map<string, LayoutFix>();
  for (const f of fixes) {
    const cur = bySection.get(f.sectionId);
    if (!cur) {
      bySection.set(f.sectionId, { ...f });
      continue;
    }
    const nx = Math.min(cur.x, f.x);
    const ny = Math.min(cur.y, f.y);
    const right = Math.max(cur.x + cur.width, f.x + f.width);
    const bottom = Math.max(cur.y + cur.height, f.y + f.height);
    bySection.set(f.sectionId, {
      op: 'grow_section', sectionId: f.sectionId,
      x: nx, y: ny, width: right - nx, height: bottom - ny,
      reason: 'merged: 여러 확장 요구 통합',
    });
  }
  return [...bySection.values()];
}
