/**
 * lintLayout 스펙 — 공간 규약 6규칙 검출 + 안전 fix.
 *   R0 outside_section / R1 section_overlap / R2 card_overlap
 *   R3 frame_padding / R4 instance_orphan / R5 child_overflow
 * 좌표계: 섹션 직속 자식은 절대좌표(섹션은 원점 재설정 안 함).
 */
import { describe, test, expect } from 'bun:test';
import { lintLayout, mergeFixesBySection, type LayoutFix } from '../src/layout/lint';
import type { TreeNode } from '../src/types';

function node(
  id: string, name: string, type: string,
  box: [number, number, number, number], children: TreeNode[] = [],
): TreeNode {
  return {
    id, name, type,
    boundingBox: { x: box[0], y: box[1], width: box[2], height: box[3] },
    childCount: children.length,
    children,
  };
}

const rules = (roots: TreeNode[], opts = {}) =>
  lintLayout(roots, opts).violations.map((v) => v.rule).sort();

describe('lintLayout', () => {
  test('규약 준수 트리 → clean', () => {
    const roots = [
      // 프레임은 섹션 로컬좌표로 (40,20) 배치 → 사방 ≥20 여백. (비원점 섹션이어도 로컬 기준)
      node('sA', 'diagram', 'SECTION', [-40, -80, 1696, 1280], [
        node('f1', 'screen', 'FRAME', [40, 20, 1616, 1160], [
          node('i1', 'shell', 'INSTANCE', [48, 132, 1520, 780]),   // 프레임 로컬 좌표
        ]),
      ]),
      node('sB', 'library', 'SECTION', [-40, 1240, 1600, 1760], [
        node('board', 'masters', 'FRAME', [40, 20, 1520, 1680], [
          node('c1', 'shell/gnb', 'COMPONENT', [0, 0, 1520, 60]),   // 프레임 로컬 좌표(컴포넌트는 여백 불필요)
          node('c2', 'shell/lnb', 'COMPONENT', [0, 120, 240, 720]),
        ]),
      ]),
    ];
    const r = lintLayout(roots);
    expect(r.clean).toBe(true);
    expect(r.violationCount).toBe(0);
  });

  test('R1 section_overlap — 형제 섹션 겹침', () => {
    const roots = [
      node('sA', 'A', 'SECTION', [0, 0, 600, 400]),
      node('sB', 'B', 'SECTION', [500, 300, 400, 400]),
    ];
    expect(rules(roots)).toContain('section_overlap');
  });

  test('R2 card_overlap — 섹션 안 프레임끼리 겹침', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f1', 'f1', 'FRAME', [20, 20, 600, 400]),
        node('f2', 'f2', 'FRAME', [500, 350, 600, 400]),
      ]),
    ];
    expect(rules(roots)).toContain('card_overlap');
  });

  test('R3 frame_padding — 우/하 밀착 프레임 + grow fix(원점 이동 없음)', () => {
    // 좌/상은 20 여백, 우/하가 0 여백 → 안전 grow(우/하 확장)로 수정 가능
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('f', 'flush', 'FRAME', [20, 20, 580, 380]),
      ]),
    ];
    const r = lintLayout(roots);
    const v = r.violations.find((x) => x.rule === 'frame_padding');
    expect(v).toBeDefined();
    expect(v!.fix).toBeDefined();
    // 우/하 20px 확보 위해 섹션 W/H 만 확장, 원점(x,y)은 불변
    expect(v!.fix).toMatchObject({ op: 'grow_section', sectionId: 's', x: 0, y: 0, width: 620, height: 420 });
  });

  test('R3 frame_padding — 좌/상 밀착은 안전 grow 불가(수동, fix 없음)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('f', 'flush', 'FRAME', [0, 0, 560, 360]), // 좌/상 여백 0, 우/하는 여유
      ]),
    ];
    const v = lintLayout(roots).violations.find((x) => x.rule === 'frame_padding');
    expect(v).toBeDefined();
    expect(v!.fix).toBeUndefined(); // 좌/상 부족은 원점 이동 필요 → 자동수정 안 함
  });

  test('R5 child_overflow — 자식이 섹션 밖 + grow fix', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('f', 'big', 'FRAME', [550, 350, 300, 300]),
      ]),
    ];
    const r = lintLayout(roots);
    const v = r.violations.find((x) => x.rule === 'child_overflow');
    expect(v).toBeDefined();
    expect(v!.fix).toMatchObject({ op: 'grow_section', sectionId: 's', width: 850, height: 650 });
  });

  test('R0 outside_section — 페이지 직속 배치 노드', () => {
    const roots = [node('f', 'loose', 'FRAME', [0, 0, 100, 100])];
    expect(rules(roots)).toContain('outside_section');
  });

  test('R4 instance_orphan — 프레임 밖 인스턴스', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('i', 'floatingBtn', 'INSTANCE', [20, 20, 80, 32]),
      ]),
    ];
    expect(rules(roots)).toContain('instance_orphan');
  });

  test('R4 — 마스터 COMPONENT 내부 중첩 인스턴스는 orphan 아님 (컴포넌트 정의의 일부)', () => {
    const roots = [
      node('lib', 'library', 'SECTION', [0, 0, 2000, 2000], [
        node('m', 'shell/gnb', 'COMPONENT', [0, 0, 1520, 60], [
          node('t', 'OneUI/tabs/primary', 'INSTANCE', [320, 14, 62, 32]),
          node('inst', 'shell/lnb', 'INSTANCE', [0, 60, 240, 720], [
            node('deep', 'OneUI/badge', 'INSTANCE', [10, 10, 40, 20]),
          ]),
        ]),
      ]),
    ];
    expect(rules(roots)).not.toContain('instance_orphan');
  });

  test('component_needs_frame — 섹션 직속 COMPONENT 는 위반 (프레임 안에 있어야)', () => {
    const roots = [
      node('s', 'lib', 'SECTION', [0, 0, 2000, 2000], [
        node('m', 'shell/gnb', 'COMPONENT', [100, 100, 400, 60]),
      ]),
    ];
    expect(rules(roots)).toContain('component_needs_frame');
  });

  test('component_needs_frame — 프레임 안 COMPONENT 는 통과', () => {
    const roots = [
      node('s', 'lib', 'SECTION', [0, 0, 2000, 2000], [
        node('board', 'board', 'FRAME', [100, 100, 600, 400], [
          node('m', 'shell/gnb', 'COMPONENT', [20, 20, 400, 60]),
        ]),
      ]),
    ];
    expect(rules(roots)).not.toContain('component_needs_frame');
  });

  test('R4 예외 — 기획용(anno/wire) 인스턴스는 프레임 밖이어도 통과', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('m', 'marker', 'INSTANCE', [20, 20, 24, 24]),
      ]),
    ];
    expect(rules(roots)).not.toContain('instance_orphan');
  });

  test('프레임 안 인스턴스 겹침은 허용 (합성)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [20, 20, 800, 600], [
          node('a', 'card', 'INSTANCE', [0, 0, 400, 300]),
          node('b', 'button', 'INSTANCE', [100, 100, 200, 80]),
        ]),
      ]),
    ];
    expect(lintLayout(roots).clean).toBe(true);
  });

  test('padding 옵션 반영', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('f', 'f', 'FRAME', [10, 10, 580, 380]),
      ]),
    ];
    // 여백 10px → pad 20 이면 위반, pad 5 면 통과
    expect(rules(roots, { padding: 20 })).toContain('frame_padding');
    expect(rules(roots, { padding: 5 })).not.toContain('frame_padding');
  });
});

describe('R5 프레임 내부 포함 (로컬 좌표)', () => {
  test('프레임 안 배치형 자식이 내부에 있으면 clean', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('i', 'card', 'INSTANCE', [20, 20, 200, 100]), // 로컬 좌표
        ]),
      ]),
    ];
    expect(lintLayout(roots).clean).toBe(true);
  });

  test('배치형 자식이 로컬 좌표로 프레임을 벗어나면 child_overflow (자동수정 없음)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('i', 'card', 'INSTANCE', [300, 250, 200, 100]), // 300+200=500 > 400
        ]),
      ]),
    ];
    const v = lintLayout(roots).violations.filter((x) => x.rule === 'child_overflow');
    expect(v).toHaveLength(1);
    expect(v[0].nodes).toContain('i');
    expect(v[0].fix).toBeUndefined(); // 프레임 오버플로는 재배치 판단 필요 → 자동수정 안 함
  });

  test('리프(TEXT)는 프레임 밖으로 살짝 나가도 검사 제외 (baseline 노이즈 방지)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('t', 'label', 'TEXT', [12, -1, 38, 18]), // y=-1 로 위로 삐져나옴(정상)
        ]),
      ]),
    ];
    expect(lintLayout(roots).clean).toBe(true);
  });

  test('anno/wire 는 프레임 밖으로 나가도 예외', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('m', 'marker', 'INSTANCE', [390, -10, 24, 24]), // 밖으로 나가지만 marker(anno) 예외
        ]),
      ]),
    ];
    expect(rules(roots)).not.toContain('child_overflow');
  });

  test('중첩: 마스터 COMPONENT 내부 인스턴스가 컴포넌트 밖으로 나가면 잡음', () => {
    const roots = [
      node('lib', 'library', 'SECTION', [0, 0, 3000, 3000], [
        node('m', 'shell/gnb', 'COMPONENT', [0, 0, 1520, 60], [
          node('ovf', 'OneUI/select', 'INSTANCE', [1400, 10, 200, 32]), // 1400+200=1600 > 1520
        ]),
      ]),
    ];
    const v = lintLayout(roots).violations.filter((x) => x.rule === 'child_overflow');
    expect(v).toHaveLength(1);
    expect(v[0].nodes).toContain('ovf');
  });
});

describe('비원점 섹션 — 자식은 섹션 로컬좌표 (회귀: 절대좌표로 착각하면 오판)', () => {
  test('비원점 섹션 안 프레임이 로컬 여백 OK 면 clean', () => {
    // 섹션이 (-40,1240) 비원점. 보드가 섹션 로컬 (40,20) 이면 사방 여백 ≥20 → clean.
    // (구버그: 섹션의 부모공간 bbox 와 자식 로컬좌표를 섞어 비교 → frame_padding 오탐)
    const roots = [
      node('s', 'lib', 'SECTION', [-40, 1240, 1600, 1760], [
        node('board', 'board', 'FRAME', [40, 20, 1520, 1680], [
          node('c', 'shell/gnb', 'COMPONENT', [0, 0, 1520, 60]),
        ]),
      ]),
    ];
    expect(lintLayout(roots).clean).toBe(true);
  });

  test('비원점 섹션 — 프레임이 로컬좌표로 섹션 하단을 벗어나면 overflow (실제 겪은 버그)', () => {
    // 보드가 섹션 로컬 (0,1260) → 1260+1680=2940 > 1760 → 하단 오버플로.
    // 구버그는 board(0,1260) 를 섹션 abs(-40,1240) 안에 있다고 오판해 clean 처리했음.
    const roots = [
      node('s', 'lib', 'SECTION', [-40, 1240, 1600, 1760], [
        node('board', 'board', 'FRAME', [0, 1260, 1520, 1680]),
      ]),
    ];
    expect(rules(roots)).toContain('child_overflow');
  });
});

describe('mergeFixesBySection', () => {
  test('같은 섹션 확장 요구를 union', () => {
    const fixes: LayoutFix[] = [
      { op: 'grow_section', sectionId: 's', x: -20, y: 0, width: 640, height: 400, reason: 'a' },
      { op: 'grow_section', sectionId: 's', x: 0, y: -20, width: 600, height: 440, reason: 'b' },
    ];
    const merged = mergeFixesBySection(fixes);
    expect(merged).toHaveLength(1);
    // union: x=-20,y=-20, right=max(620,600)=620, bottom=max(400,420)=420 → w=640,h=440
    expect(merged[0]).toMatchObject({ sectionId: 's', x: -20, y: -20, width: 640, height: 440 });
  });

  test('다른 섹션은 분리 유지', () => {
    const fixes: LayoutFix[] = [
      { op: 'grow_section', sectionId: 's1', x: 0, y: 0, width: 100, height: 100, reason: '' },
      { op: 'grow_section', sectionId: 's2', x: 0, y: 0, width: 100, height: 100, reason: '' },
    ];
    expect(mergeFixesBySection(fixes)).toHaveLength(2);
  });
});
