/**
 * 레이아웃 공간 규약(spatial invariants) 린터 — 순수 기하 계산.
 *
 * Figma 캔버스에서 로스(loose) 노드는 자유 배치라 서로 겹칠 수 있고, 겹치면 렌더상 가려
 * 육안 판별이 안 된다(좌표로만 확실). 에이전트는 좌표 부기에 약해 이 클래스 버그를 반복한다.
 * 규칙이 전부 결정론적(AABB/containment)이라 툴이 흡수한다. check=린터, fix=포매터.
 *
 * 좌표계 주의(중요): Figma 의 모든 컨테이너(SECTION/FRAME/COMPONENT/GROUP)는 자식 좌표의
 * 원점을 자기 좌상단으로 새로 잡는다 → 자식 x/y 는 "직속 부모 로컬 좌표". **SECTION 도 예외가
 * 아니다** (실측 확인: 섹션 자식을 로컬 (0,0) 에 두면 섹션 좌상단 코너에 렌더된다). 따라서
 * 형제 겹침(R1/R2)은 같은 로컬 공간의 bbox 끼리 직접 비교하고, 부모 포함(R3/R5)은 부모 자신의
 * (부모공간) bbox 가 아니라 부모의 **로컬박스 (0,0,W,H)** 기준으로 본다 — 부모 좌표와 자식
 * 좌표를 섞으면 비원점 컨테이너에서 오판한다. R4 는 구조(타입)만 본다.
 */
import type { TreeNode } from '../types';

export const DEFAULT_PADDING = 20;
/** 형제 섹션 간 최소 간격(px). Figma 섹션 라벨이 위쪽에 렌더돼 경계를 가리므로, 겹치지
 *  않아도 너무 붙으면 시각적으로 한 섹션처럼 보인다 → 라벨 공간 확보용 최소 gap. */
export const DEFAULT_SECTION_GAP = 80;

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
  | 'section_gap'
  | 'card_overlap'
  | 'frame_padding'
  | 'instance_orphan'
  | 'component_needs_frame'
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
  /** 형제 섹션 간 최소 간격(px). 기본 80. 0 이면 gap 검사 비활성(겹침만 검사) */
  sectionGap?: number;
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

/**
 * 겹치지 않는 두 박스의 최단 간격(px). 한 축에서 범위가 겹치는(=이웃한) 축의 간격만 의미가 있다:
 * 세로로 이웃(가로 범위 겹침)이면 세로 간격, 가로로 이웃이면 가로 간격. 대각선 배치(양 축 모두
 * 안 겹침)는 라벨 가림 문제가 없으므로 null(gap 규칙 비적용).
 */
function edgeGap(a: Box, b: Box): number | null {
  const xOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const yOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (xOverlap > 0) return Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height); // 세로 간격
  if (yOverlap > 0) return Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);   // 가로 간격
  return null;
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

/**
 * 섹션을 **오른쪽/아래로만** 늘려(원점 이동 없음) child(섹션 로컬좌표)를 pad 여백으로 품게 하는
 * 안전 fix. 좌/상 여백이 부족하면(child 가 원점에 너무 붙음) 원점 이동이 필요해 안전 grow 로는
 * 못 고친다 → null 반환(수동 처리). resize 만 하고 move 는 no-op 이라 자식 로컬좌표가 안 밀린다.
 */
function growSectionFix(section: TreeNode, child: TreeNode, pad: number, reason: string): LayoutFix | null {
  const s = bb(section);
  const c = bb(child); // 섹션 로컬 좌표
  if (c.x < pad || c.y < pad) return null; // 좌/상 부족 → 원점 이동 필요 → 수동
  const newW = Math.max(s.width, c.x + c.width + pad);
  const newH = Math.max(s.height, c.y + c.height + pad);
  if (newW === s.width && newH === s.height) return null;
  return { op: 'grow_section', sectionId: section.id, x: s.x, y: s.y, width: newW, height: newH, reason };
}

/**
 * 트리(페이지 children)를 받아 공간 규약 위반을 계산한다. read-only.
 * roots = 페이지 최상위 노드 배열 (sigma get_tree 의 children).
 */
export function lintLayout(roots: TreeNode[], opts: LintOptions = {}): LintResult {
  const pad = opts.padding ?? DEFAULT_PADDING;
  const sectionGap = opts.sectionGap ?? DEFAULT_SECTION_GAP;
  const annoWire = new Set(ANNO_WIRE_NAMES);
  if (opts.annoWireNames) for (const n of opts.annoWireNames) annoWire.add(n);
  const V: LayoutViolation[] = [];
  const add = (rule: LayoutRule, message: string, nodes: string[], fix?: LayoutFix) =>
    V.push(fix ? { rule, message, nodes, fix } : { rule, message, nodes });

  // container 의 직속 자식에 규칙 적용 후 재귀. kind: page | section | frame
  function checkContainer(children: TreeNode[], container: TreeNode | null, kind: 'page' | 'section' | 'frame') {
    // R1: 형제 SECTION 끼리 겹침 + 간격 부족 (모든 레벨)
    const sections = children.filter((c) => c.type === 'SECTION');
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        if (overlaps(bb(sections[i]), bb(sections[j]))) {
          add('section_overlap', `섹션 "${sections[i].name}" ↔ "${sections[j].name}" 겹침`,
            [sections[i].id, sections[j].id]);
        } else if (sectionGap > 0) {
          // 겹치진 않지만 이웃한 두 섹션이 너무 붙음 → 라벨이 경계를 가림
          const g = edgeGap(bb(sections[i]), bb(sections[j]));
          if (g !== null && g < sectionGap) {
            add('section_gap', `섹션 "${sections[i].name}" ↔ "${sections[j].name}" 간격 ${Math.round(g)}px < ${sectionGap}px (섹션 라벨이 경계를 가림)`,
              [sections[i].id, sections[j].id]);
          }
        }
      }
    }

    if (kind === 'section' && container) {
      // 섹션 자식은 섹션 로컬좌표 → 포함검사는 섹션의 로컬박스(0,0,W,H) 기준. (부모공간 bbox 아님)
      const localBox = { x: 0, y: 0, width: container.boundingBox.width, height: container.boundingBox.height };
      // R2: 섹션 직속 카드(FRAME/COMPONENT)끼리 겹침 (형제 = 같은 로컬 공간, bbox 직접 비교)
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
        if (annoWire.has(c.name)) continue; // 기획 프리셋 예외
        // 섹션 직속은 FRAME/SECTION 만 허용. 배치형 컴포넌트/그룹은 프레임 안에 있어야 함.
        // (INSTANCE 는 R4 instance_orphan 이 담당하므로 여기선 제외해 중복 방지)
        if (c.type === 'COMPONENT' || c.type === 'COMPONENT_SET' || c.type === 'GROUP') {
          add('component_needs_frame',
            `"${c.name}" (${c.id}, ${c.type}) 는 섹션 직속이 아니라 프레임 안에 있어야 함`, [c.id]);
        }
        // R5(섹션): 자식(섹션 로컬좌표)은 섹션 로컬박스(0,0,W,H) 안에 있어야 함
        if (!insetOk(localBox, bb(c), 0)) {
          add('child_overflow', `"${c.name}" (${c.id}) 가 섹션 "${container.name}" 밖으로 나감`,
            [c.id], growSectionFix(container, c, 0, 'child_overflow: 자식을 품도록 섹션 확장') ?? undefined);
        } else if (c.type === 'FRAME' && !insetOk(localBox, bb(c), pad)) {
          // R3: 프레임 여백 부족 (섹션에 딱 붙으면 섹션 의미 없음)
          add('frame_padding', `프레임 "${c.name}" 가 섹션 "${container.name}" 안 ${pad}px 여백 미달`,
            [c.id, container.id], growSectionFix(container, c, pad, `frame_padding: ${pad}px 여백 확보`) ?? undefined);
        }
      }
    }

    if (kind === 'frame' && container) {
      // R5(프레임): 프레임/컴포넌트/인스턴스의 배치형 자식은 그 내부 좌표(0,0~W,H) 안에 있어야 함.
      // ⚠️ 좌표계: 프레임/컴포넌트 자식은 "부모 로컬 좌표" → (0,0,W,H) 기준. (섹션도 동일하게 로컬박스로 봄)
      // ⚠️ TEXT/RECT/VECTOR 리프는 폰트 baseline 등으로 1px 삐져나오는 게 정상 → 배치형(PLACED)만 검사.
      const local = { x: 0, y: 0, width: container.boundingBox.width, height: container.boundingBox.height };
      for (const c of children) {
        if (annoWire.has(c.name)) continue; // 기획 프리셋 예외
        if (!PLACED_TYPES.has(c.type)) continue; // 배치형 자식만 (리프 제외)
        if (!insetOk(local, bb(c), 0)) {
          add('child_overflow', `"${c.name}" (${c.id}) 가 "${container.name}" 프레임 내부 좌표를 벗어남`, [c.id]);
          // 프레임 확대는 디자인 변경이라 자동수정 안 함(needsManual) — check-first
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

    // 재귀: SECTION → section, 배치형(프레임/컴포넌트/인스턴스/그룹) → frame. 기획 프리셋 하위는 제외.
    for (const c of children) {
      if (annoWire.has(c.name)) continue;
      if (c.type === 'SECTION') checkContainer(kids(c), c, 'section');
      else if (PLACED_TYPES.has(c.type)) checkContainer(kids(c), c, 'frame');
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
