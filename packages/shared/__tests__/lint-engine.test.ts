/**
 * lint 엔진 스펙 — geometric.ts(기하 8종, sigma_layout_lint 시절과 동일 로직) +
 * simple-rules.ts(신규 4종) + engine.ts(config.builtins enable/disable) + json-rule.ts(5개 연산자).
 */
import { describe, test, expect } from 'bun:test';
import { lintLayout, mergeFixesBySection, type LayoutFix } from '../src/lint/geometric';
import { runBuiltinRules } from '../src/lint/engine';
import {
  componentDescriptionEmptyRule, defaultNameRule, emptyContainerRule,
  fillSizingOrphanRule, hiddenLeafRule, rawNodeRule, strayPixelRule,
} from '../src/lint/simple-rules';
import { compileMatchRule, runMatchRule, matchesQuery, queryNodes, type NodeQuery } from '../src/lint/json-rule';
import { fullyOccludedSiblingRule } from '../src/lint/occlusion';
import type { LintNode, MatchRule } from '../src/lint/types';
import type { TreeNode } from '../src/types';

function node(
  id: string, name: string, type: string,
  box: [number, number, number, number], children: TreeNode[] = [],
  meta?: TreeNode['meta'],
): TreeNode {
  return {
    id, name, type,
    boundingBox: { x: box[0], y: box[1], width: box[2], height: box[3] },
    childCount: children.length,
    children,
    meta,
  };
}

const rules = (roots: TreeNode[], opts = {}) =>
  lintLayout(roots, opts).violations.map((v) => v.rule).sort();

describe('lintLayout (기하 8종, geometric.ts — 무변경 이관)', () => {
  test('규약 준수 트리 → clean', () => {
    const roots = [
      node('sA', 'diagram', 'SECTION', [-40, -80, 1696, 1280], [
        node('f1', 'screen', 'FRAME', [40, 20, 1616, 1160], [
          node('i1', 'shell', 'INSTANCE', [48, 132, 1520, 780]),
        ]),
      ]),
      node('sB', 'library', 'SECTION', [-40, 1290, 1600, 1760], [
        node('board', 'masters', 'FRAME', [40, 20, 1520, 1680], [
          node('c1', 'shell/gnb', 'COMPONENT', [0, 0, 1520, 60]),
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

  test('section_gap — 세로로 이웃한 섹션 간격 부족 (라벨 가림)', () => {
    const roots = [
      node('sA', 'A', 'SECTION', [0, 0, 600, 400]),
      node('sB', 'B', 'SECTION', [0, 440, 600, 400]),
    ];
    const rs = rules(roots);
    expect(rs).toContain('section_gap');
    expect(rs).not.toContain('section_overlap');
  });

  test('section_gap — 간격 충분하면 clean', () => {
    const roots = [
      node('sA', 'A', 'SECTION', [0, 0, 600, 400]),
      node('sB', 'B', 'SECTION', [0, 520, 600, 400]),
    ];
    expect(rules(roots)).not.toContain('section_gap');
  });

  test('section_gap — 대각선 배치는 비적용(라벨 가림 없음)', () => {
    const roots = [
      node('sA', 'A', 'SECTION', [0, 0, 400, 400]),
      node('sB', 'B', 'SECTION', [600, 600, 400, 400]),
    ];
    expect(rules(roots)).not.toContain('section_gap');
  });

  test('section_gap — sectionGap:0 이면 검사 비활성', () => {
    const roots = [
      node('sA', 'A', 'SECTION', [0, 0, 600, 400]),
      node('sB', 'B', 'SECTION', [0, 440, 600, 400]),
    ];
    expect(rules(roots, { sectionGap: 0 })).not.toContain('section_gap');
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
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('f', 'flush', 'FRAME', [20, 20, 580, 380]),
      ]),
    ];
    const r = lintLayout(roots);
    const v = r.violations.find((x) => x.rule === 'frame_padding');
    expect(v).toBeDefined();
    expect(v!.fix).toBeDefined();
    expect(v!.fix).toMatchObject({ op: 'grow_section', sectionId: 's', x: 0, y: 0, width: 620, height: 420 });
  });

  test('R3 frame_padding — 좌/상 밀착은 안전 grow 불가(수동, fix 없음)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 600, 400], [
        node('f', 'flush', 'FRAME', [0, 0, 560, 360]),
      ]),
    ];
    const v = lintLayout(roots).violations.find((x) => x.rule === 'frame_padding');
    expect(v).toBeDefined();
    expect(v!.fix).toBeUndefined();
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

  test('R4 — 마스터 COMPONENT 내부 중첩 인스턴스는 orphan 아님', () => {
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

  test('component_needs_frame — 섹션 직속 COMPONENT 는 위반', () => {
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
    expect(rules(roots, { padding: 20 })).toContain('frame_padding');
    expect(rules(roots, { padding: 5 })).not.toContain('frame_padding');
  });
});

describe('R5 프레임 내부 포함 (로컬 좌표)', () => {
  test('프레임 안 배치형 자식이 내부에 있으면 clean', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('i', 'card', 'INSTANCE', [20, 20, 200, 100]),
        ]),
      ]),
    ];
    expect(lintLayout(roots).clean).toBe(true);
  });

  test('배치형 자식이 로컬 좌표로 프레임을 벗어나면 child_overflow (자동수정 없음)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('i', 'card', 'INSTANCE', [300, 250, 200, 100]),
        ]),
      ]),
    ];
    const v = lintLayout(roots).violations.filter((x) => x.rule === 'child_overflow');
    expect(v).toHaveLength(1);
    expect(v[0].nodes).toContain('i');
    expect(v[0].fix).toBeUndefined();
  });

  test('리프(TEXT)는 프레임 밖으로 살짝 나가도 검사 제외 (baseline 노이즈 방지)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('t', 'label', 'TEXT', [12, -1, 38, 18]),
        ]),
      ]),
    ];
    expect(lintLayout(roots).clean).toBe(true);
  });

  test('anno/wire 는 프레임 밖으로 나가도 예외', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 400, 300], [
          node('m', 'marker', 'INSTANCE', [390, -10, 24, 24]),
        ]),
      ]),
    ];
    expect(rules(roots)).not.toContain('child_overflow');
  });

  test('중첩: 마스터 COMPONENT 내부 인스턴스가 컴포넌트 밖으로 나가면 잡음', () => {
    const roots = [
      node('lib', 'library', 'SECTION', [0, 0, 3000, 3000], [
        node('m', 'shell/gnb', 'COMPONENT', [0, 0, 1520, 60], [
          node('ovf', 'OneUI/select', 'INSTANCE', [1400, 10, 200, 32]),
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

describe('simple-rules.ts (신규 빌트인 4종)', () => {
  test('stray_pixel — 비정수 좌표/크기 검출', () => {
    const roots = [node('a', 'a', 'FRAME', [10.5, 20, 100, 100])];
    const v = strayPixelRule(roots);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('stray_pixel');
  });

  test('stray_pixel — 전부 정수면 clean', () => {
    const roots = [node('a', 'a', 'FRAME', [10, 20, 100, 100])];
    expect(strayPixelRule(roots)).toHaveLength(0);
  });

  test('default_name — Figma 기본 이름 패턴 검출', () => {
    const roots = [
      node('a', 'Rectangle 123', 'RECTANGLE', [0, 0, 10, 10]),
      node('b', 'Frame 45', 'FRAME', [0, 0, 10, 10]),
      node('c', 'MyButton', 'FRAME', [0, 0, 10, 10]),
    ];
    const violated = defaultNameRule(roots).map((v) => v.nodes[0]);
    expect(violated).toContain('a');
    expect(violated).toContain('b');
    expect(violated).not.toContain('c');
  });

  test('empty_container — 자식 없는 FRAME/GROUP 검출', () => {
    const roots = [
      node('a', 'empty', 'FRAME', [0, 0, 10, 10], []),
      node('b', 'nonempty', 'FRAME', [0, 0, 10, 10], [node('c', 'child', 'TEXT', [0, 0, 5, 5])]),
    ];
    const violated = emptyContainerRule(roots).map((v) => v.nodes[0]);
    expect(violated).toContain('a');
    expect(violated).not.toContain('b');
  });

  test('hidden_leaf — visible:false 노드 검출', () => {
    const roots = [
      node('a', 'ghost', 'FRAME', [0, 0, 10, 10], [], { visible: false }),
      node('b', 'shown', 'FRAME', [0, 0, 10, 10], [], { visible: true }),
    ];
    const violated = hiddenLeafRule(roots).map((v) => v.nodes[0]);
    expect(violated).toContain('a');
    expect(violated).not.toContain('b');
  });
});

describe('simple-rules.ts (신규 빌트인 2종 — fill_sizing_orphan, component_description_empty)', () => {
  test('fill_sizing_orphan — 부모가 layoutMode:NONE 이면 위반', () => {
    const roots = [
      node('parent', 'NoAutoLayout', 'FRAME', [0, 0, 200, 200], [
        node('child', 'orphan', 'TEXT', [10, 10, 50, 20], [], { layoutSizingHorizontal: 'FILL' }),
      ], { layoutMode: 'NONE' }),
    ];
    const violated = fillSizingOrphanRule(roots).map((v) => v.nodes[0]);
    expect(violated).toContain('child');
  });

  test('fill_sizing_orphan — 부모가 오토레이아웃이면 clean', () => {
    const roots = [
      node('parent', 'AutoLayout', 'FRAME', [0, 0, 200, 200], [
        node('child', 'valid', 'TEXT', [10, 10, 50, 20], [], { layoutSizingHorizontal: 'FILL' }),
      ], { layoutMode: 'HORIZONTAL' }),
    ];
    expect(fillSizingOrphanRule(roots)).toHaveLength(0);
  });

  test('fill_sizing_orphan — 부모 없는 루트 노드도 위반(무효 상태)', () => {
    const roots = [node('root', 'orphanRoot', 'FRAME', [0, 0, 200, 200], [], { layoutSizingVertical: 'FILL' })];
    const violated = fillSizingOrphanRule(roots).map((v) => v.nodes[0]);
    expect(violated).toContain('root');
  });

  test('fill_sizing_orphan — FIXED/HUG는 무시', () => {
    const roots = [
      node('parent', 'NoAutoLayout', 'FRAME', [0, 0, 200, 200], [
        node('child', 'fine', 'TEXT', [10, 10, 50, 20], [], { layoutSizingHorizontal: 'FIXED' }),
      ], { layoutMode: 'NONE' }),
    ];
    expect(fillSizingOrphanRule(roots)).toHaveLength(0);
  });

  test('component_description_empty — 빈/누락 description 검출', () => {
    const roots = [
      node('a', 'Button', 'COMPONENT', [0, 0, 10, 10], [], { description: '' }),
      node('b', 'Card', 'COMPONENT', [0, 0, 10, 10], [], { description: '   ' }),
      node('c', 'Icon', 'COMPONENT', [0, 0, 10, 10]),
      node('d', 'Documented', 'COMPONENT', [0, 0, 10, 10], [], { description: '용도 설명' }),
      node('e', 'NotAComponent', 'FRAME', [0, 0, 10, 10]),
    ];
    const violated = componentDescriptionEmptyRule(roots).map((v) => v.nodes[0]);
    expect(violated).toContain('a');
    expect(violated).toContain('b');
    expect(violated).toContain('c');
    expect(violated).not.toContain('d');
    expect(violated).not.toContain('e');
  });
});

describe('simple-rules.ts (raw_node — opt-in, 컴포넌트 강제)', () => {
  test('화면의 raw FRAME/도형은 위반, INSTANCE 는 통과', () => {
    const roots = [
      node('screen', 'Screen', 'FRAME', [0, 0, 1000, 800], [
        node('inst', 'OneUI/switch/on', 'INSTANCE', [0, 0, 42, 26]),
        node('rawpill', 'toggle', 'FRAME', [50, 0, 36, 20]),
        node('rawrect', 'bar', 'RECTANGLE', [0, 40, 100, 8]),
        node('label', '자동 갱신', 'TEXT', [0, 60, 48, 16]),
      ]),
    ];
    const violated = rawNodeRule(roots).map((v) => v.nodes[0]);
    expect(violated).toContain('rawpill'); // raw FRAME
    expect(violated).toContain('rawrect'); // raw RECTANGLE
    expect(violated).toContain('screen');  // 최상위 화면 프레임도 raw(strict)
    expect(violated).not.toContain('inst'); // INSTANCE 는 정의된 컴포넌트
    expect(violated).not.toContain('label'); // TEXT 는 기본 비대상
  });

  test('INSTANCE 내부의 raw 노드는 항상 제외(정의의 사본)', () => {
    const roots = [
      node('inst', 'OneUI/button', 'INSTANCE', [0, 0, 70, 32], [
        node('innerframe', 'bg', 'FRAME', [0, 0, 70, 32]),
      ]),
    ];
    expect(rawNodeRule(roots)).toHaveLength(0);
  });

  test('COMPONENT 정의 내부는 기본 제외, checkInsideComponent=true 면 포함', () => {
    const roots = [
      node('comp', 'MyButton', 'COMPONENT', [0, 0, 70, 32], [
        node('innerframe', 'bg', 'FRAME', [0, 0, 70, 32]),
      ]),
    ];
    expect(rawNodeRule(roots).map((v) => v.nodes[0])).not.toContain('innerframe');
    expect(rawNodeRule(roots, { checkInsideComponent: true }).map((v) => v.nodes[0])).toContain('innerframe');
  });

  test('types 재정의 시 그 타입만 검사(FRAME 빼면 프레임은 통과)', () => {
    const roots = [
      node('screen', 'Screen', 'FRAME', [0, 0, 100, 100], [
        node('rawrect', 'bar', 'RECTANGLE', [0, 0, 50, 8]),
      ]),
    ];
    const violated = rawNodeRule(roots, { types: ['RECTANGLE'] }).map((v) => v.nodes[0]);
    expect(violated).toContain('rawrect');
    expect(violated).not.toContain('screen');
  });

  test('exemptNamePattern 매칭 이름은 제외', () => {
    const roots = [
      node('a', 'wire/box', 'FRAME', [0, 0, 50, 50]),
      node('b', 'toggle', 'FRAME', [0, 60, 36, 20]),
    ];
    const violated = rawNodeRule(roots, { exemptNamePattern: '^(wire|anno)/' }).map((v) => v.nodes[0]);
    expect(violated).not.toContain('a');
    expect(violated).toContain('b');
  });

  test('engine: raw_node 는 opt-in — enabled:true 없으면 실행 안 됨', () => {
    const roots = [node('screen', 'Screen', 'FRAME', [0, 0, 100, 100])];
    expect(runBuiltinRules(roots, {}).map((v) => v.rule)).not.toContain('raw_node');
    expect(runBuiltinRules(roots, { raw_node: { enabled: true } }).map((v) => v.rule)).toContain('raw_node');
  });
});

describe('runBuiltinRules (engine.ts) — config.builtins enable/disable', () => {
  const looseFrame = [node('f', 'loose', 'FRAME', [0, 0, 100, 100])]; // outside_section 위반

  test('config 없이 호출하면 기존 sigma_layout_lint 와 동일하게 전부 ON', () => {
    const violations = runBuiltinRules(looseFrame);
    expect(violations.map((v) => v.rule)).toContain('outside_section');
  });

  test('enabled:false 로 특정 기하 규칙만 끌 수 있다', () => {
    const violations = runBuiltinRules(looseFrame, { outside_section: { enabled: false } });
    expect(violations.map((v) => v.rule)).not.toContain('outside_section');
  });

  test('신규 빌트인도 같은 config로 켜진다', () => {
    const roots = [node('a', 'Rectangle 1', 'RECTANGLE', [0, 0, 10, 10])];
    const violations = runBuiltinRules(roots, {});
    expect(violations.map((v) => v.rule)).toContain('default_name');
  });

  test('신규 빌트인도 enabled:false 로 끌 수 있다', () => {
    const roots = [node('a', 'Rectangle 1', 'RECTANGLE', [0, 0, 10, 10])];
    const violations = runBuiltinRules(roots, { default_name: { enabled: false } });
    expect(violations.map((v) => v.rule)).not.toContain('default_name');
  });

  test('section_gap.gap 파라미터가 기하 엔진에 반영된다', () => {
    const roots = [
      node('sA', 'A', 'SECTION', [0, 0, 600, 400]),
      node('sB', 'B', 'SECTION', [0, 440, 600, 400]), // 간격 40
    ];
    expect(runBuiltinRules(roots, { section_gap: { gap: 30 } }).map((v) => v.rule)).not.toContain('section_gap');
    expect(runBuiltinRules(roots, { section_gap: { gap: 50 } }).map((v) => v.rule)).toContain('section_gap');
  });

  test('violation.source 는 항상 builtin', () => {
    const violations = runBuiltinRules(looseFrame);
    expect(violations.every((v) => v.source === 'builtin')).toBe(true);
  });

  test('fill_sizing_orphan / component_description_empty 도 기본 ON, enabled:false 로 끌 수 있다', () => {
    const roots = [
      node('parent', 'NoAutoLayout', 'FRAME', [0, 0, 200, 200], [
        node('child', 'orphan', 'TEXT', [10, 10, 50, 20], [], { layoutSizingHorizontal: 'FILL' }),
      ], { layoutMode: 'NONE' }),
      node('comp', 'Button', 'COMPONENT', [0, 0, 10, 10]),
    ];
    const on = runBuiltinRules(roots, {}).map((v) => v.rule);
    expect(on).toContain('fill_sizing_orphan');
    expect(on).toContain('component_description_empty');

    const off = runBuiltinRules(roots, {
      fill_sizing_orphan: { enabled: false },
      component_description_empty: { enabled: false },
    }).map((v) => v.rule);
    expect(off).not.toContain('fill_sizing_orphan');
    expect(off).not.toContain('component_description_empty');
  });
});

describe('json-rule.ts — MatchRule 5개 연산자 컴파일러', () => {
  function lnode(overrides: Partial<LintNode>): LintNode {
    return { id: 'n1', name: 'Card/Button', type: 'FRAME', x: 0, y: 0, width: 10, height: 10, childCount: 0, ...overrides };
  }

  test('equals — 통과/위반', () => {
    const rule: MatchRule = {
      id: 'card-radius-12', select: { type: 'FRAME', namePattern: 'Card' },
      check: { op: 'equals', field: 'cornerRadius', value: 12 },
    };
    expect(compileMatchRule(rule)(lnode({ cornerRadius: 12 }))).toBeNull();
    const v = compileMatchRule(rule)(lnode({ cornerRadius: 8 }));
    expect(v).not.toBeNull();
    expect(v!.rule).toBe('card-radius-12');
    expect(v!.source).toBe('custom');
  });

  test('select 불일치면 검사 자체를 건너뜀(null)', () => {
    const rule: MatchRule = {
      id: 'r', select: { type: 'TEXT' },
      check: { op: 'equals', field: 'cornerRadius', value: 12 },
    };
    expect(compileMatchRule(rule)(lnode({ type: 'FRAME', cornerRadius: 999 }))).toBeNull();
  });

  test('range — 경계값 포함', () => {
    const rule: MatchRule = {
      id: 'cta-fontsize', select: { type: 'TEXT' },
      check: { op: 'range', field: 'fontSize', min: 14, max: 18 },
    };
    const compiled = compileMatchRule(rule);
    expect(compiled(lnode({ type: 'TEXT', fontSize: 14 }))).toBeNull();
    expect(compiled(lnode({ type: 'TEXT', fontSize: 18 }))).toBeNull();
    expect(compiled(lnode({ type: 'TEXT', fontSize: 20 }))).not.toBeNull();
  });

  test('regex — 이름 접두사 검사', () => {
    const rule: MatchRule = {
      id: 'section-prefix', select: { type: 'SECTION' },
      check: { op: 'regex', field: 'name', pattern: '^\\d{2}_' },
    };
    const compiled = compileMatchRule(rule);
    expect(compiled(lnode({ type: 'SECTION', name: '01_Hero' }))).toBeNull();
    expect(compiled(lnode({ type: 'SECTION', name: 'Hero' }))).not.toBeNull();
  });

  test('oneOf — 허용 목록', () => {
    const rule: MatchRule = {
      id: 'radius-scale', select: {},
      check: { op: 'oneOf', field: 'cornerRadius', values: [0, 4, 8, 16] },
    };
    const compiled = compileMatchRule(rule);
    expect(compiled(lnode({ cornerRadius: 8 }))).toBeNull();
    expect(compiled(lnode({ cornerRadius: 6 }))).not.toBeNull();
  });

  test('exists — 필드 존재 여부', () => {
    const rule: MatchRule = {
      id: 'has-fill', select: {},
      check: { op: 'exists', field: 'fills' },
    };
    const compiled = compileMatchRule(rule);
    expect(compiled(lnode({ fills: [] }))).toBeNull();
    expect(compiled(lnode({}))).not.toBeNull();
  });

  test('message 템플릿의 {name}/{actual} 치환', () => {
    const rule: MatchRule = {
      id: 'r', select: {},
      check: { op: 'equals', field: 'cornerRadius', value: 12 },
      message: '"{name}" cornerRadius={actual}',
    };
    const v = compileMatchRule(rule)(lnode({ name: 'MyCard', cornerRadius: 4 }));
    expect(v!.message).toBe('"MyCard" cornerRadius=4');
  });

  test('runMatchRule — 노드 목록 전체에 일괄 적용', () => {
    const rule: MatchRule = {
      id: 'card-radius-12', select: { type: 'FRAME', namePattern: 'Card' },
      check: { op: 'equals', field: 'cornerRadius', value: 12 },
    };
    const nodes = [
      lnode({ id: 'a', name: 'Card/1', cornerRadius: 12 }),
      lnode({ id: 'b', name: 'Card/2', cornerRadius: 4 }),
      lnode({ id: 'c', name: 'Other', type: 'TEXT', cornerRadius: 4 }),
    ];
    const violations = runMatchRule(rule, nodes);
    expect(violations).toHaveLength(1);
    expect(violations[0].nodes).toEqual(['b']);
  });
});

describe('occlusion.ts — fully_occluded_sibling', () => {
  function lnode(overrides: Partial<LintNode>): LintNode {
    return { id: 'n', name: 'n', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10, childCount: 0, ...overrides };
  }
  const solidFill = (opacity = 1) => [{ type: 'SOLID', opacity }];

  test('나중에 그려지는(z-order 위) 불투명 SOLID 형제가 완전히 덮으면 위반', () => {
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50 });
    const cover = lnode({ id: 'over', type: 'FRAME', x: 0, y: 0, width: 200, height: 200, fills: solidFill() });
    const violated = fullyOccludedSiblingRule([covered, cover], { parent: ['under', 'over'] }).map((v) => v.nodes[0]);
    expect(violated).toContain('under');
  });

  test('먼저 그려지는(z-order 아래) 형제는 덮어도 위반 아님(순서 반대)', () => {
    const cover = lnode({ id: 'over', type: 'FRAME', x: 0, y: 0, width: 200, height: 200, fills: solidFill() });
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50 });
    expect(fullyOccludedSiblingRule([cover, covered], { parent: ['over', 'under'] })).toHaveLength(0);
  });

  test('부분 겹침(완전 포함 아님)은 위반 아님', () => {
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50 });
    const cover = lnode({ id: 'over', type: 'FRAME', x: 30, y: 30, width: 50, height: 50, fills: solidFill() });
    expect(fullyOccludedSiblingRule([covered, cover], { parent: ['under', 'over'] })).toHaveLength(0);
  });

  test('덮는 노드의 opacity < 1 이면 위반 아님', () => {
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50 });
    const cover = lnode({ id: 'over', type: 'FRAME', x: 0, y: 0, width: 200, height: 200, fills: solidFill(), opacity: 0.5 });
    expect(fullyOccludedSiblingRule([covered, cover], { parent: ['under', 'over'] })).toHaveLength(0);
  });

  test('덮는 노드 fill이 SOLID가 아니면(IMAGE 등) 위반 아님', () => {
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50 });
    const cover = lnode({ id: 'over', type: 'FRAME', x: 0, y: 0, width: 200, height: 200, fills: [{ type: 'IMAGE' }] });
    expect(fullyOccludedSiblingRule([covered, cover], { parent: ['under', 'over'] })).toHaveLength(0);
  });

  test('덮는 노드 타입이 ELLIPSE 등 비사각형이면 위반 아님(바운딩박스 근사 오탐 방지)', () => {
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50 });
    const cover = lnode({ id: 'over', type: 'ELLIPSE', x: 0, y: 0, width: 200, height: 200, fills: solidFill() });
    expect(fullyOccludedSiblingRule([covered, cover], { parent: ['under', 'over'] })).toHaveLength(0);
  });

  test('덮는 노드가 visible:false 면 위반 아님', () => {
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50 });
    const cover = lnode({ id: 'over', type: 'FRAME', x: 0, y: 0, width: 200, height: 200, fills: solidFill(), visible: false });
    expect(fullyOccludedSiblingRule([covered, cover], { parent: ['under', 'over'] })).toHaveLength(0);
  });

  test('가려지는 노드가 이미 visible:false 면 위반 아님(hidden_leaf 몫)', () => {
    const covered = lnode({ id: 'under', x: 10, y: 10, width: 50, height: 50, visible: false });
    const cover = lnode({ id: 'over', type: 'FRAME', x: 0, y: 0, width: 200, height: 200, fills: solidFill() });
    expect(fullyOccludedSiblingRule([covered, cover], { parent: ['under', 'over'] })).toHaveLength(0);
  });
});

describe('json-rule.ts — queryNodes (조건 검색, lint 와 같은 부품 재사용)', () => {
  function qnode(overrides: Partial<LintNode>): LintNode {
    return { id: 'n', name: 'Node', type: 'FRAME', x: 0, y: 0, width: 100, height: 100, childCount: 0, ...overrides };
  }

  const nodes: LintNode[] = [
    qnode({ id: 'a', name: 'Card A', width: 1200, height: 300 }),
    qnode({ id: 'b', name: 'Card B', width: 800, height: 300 }),
    qnode({ id: 'c', name: 'Banner', width: 1500, height: 250, type: 'RECTANGLE' }),
    qnode({ id: 'd', name: 'Card C', width: 1100, height: 900, layoutMode: 'NONE' }),
  ];

  test('checks 하나 — width range 로 큰 노드만', () => {
    const found = queryNodes(nodes, { checks: [{ op: 'range', field: 'width', min: 1000 }] });
    expect(found.map((n) => n.id)).toEqual(['a', 'c', 'd']);
  });

  test('select.type 으로 대상 축소', () => {
    const found = queryNodes(nodes, {
      select: { type: 'FRAME' },
      checks: [{ op: 'range', field: 'width', min: 1000 }],
    });
    expect(found.map((n) => n.id)).toEqual(['a', 'd']);
  });

  test('select.namePattern 은 정규식', () => {
    const found = queryNodes(nodes, { select: { namePattern: '^Card' } });
    expect(found.map((n) => n.id)).toEqual(['a', 'b', 'd']);
  });

  test('checks 여러 개는 AND 결합', () => {
    const found = queryNodes(nodes, {
      checks: [
        { op: 'range', field: 'width', min: 1000 },
        { op: 'range', field: 'height', min: 500 },
      ],
    });
    expect(found.map((n) => n.id)).toEqual(['d']);
  });

  test('조건이 비면 전체 반환 (필터 없음)', () => {
    expect(queryNodes(nodes, {})).toHaveLength(nodes.length);
    expect(queryNodes(nodes, { checks: [] })).toHaveLength(nodes.length);
  });

  test('없는 필드는 매칭 실패로 처리 (range/equals)', () => {
    expect(queryNodes(nodes, { checks: [{ op: 'range', field: 'opacity', min: 0.5 }] })).toHaveLength(0);
    expect(queryNodes(nodes, { checks: [{ op: 'equals', field: 'layoutMode', value: 'NONE' }] }).map((n) => n.id))
      .toEqual(['d']);
  });

  test('exists — 필드 존재 여부', () => {
    const found = queryNodes(nodes, { checks: [{ op: 'exists', field: 'layoutMode' }] });
    expect(found.map((n) => n.id)).toEqual(['d']);
  });

  test('oneOf — 열거값', () => {
    const found = queryNodes(nodes, { checks: [{ op: 'oneOf', field: 'type', values: ['RECTANGLE'] }] });
    expect(found.map((n) => n.id)).toEqual(['c']);
  });

  test('중첩 경로 접근 (fills[0].opacity)', () => {
    const withFill = qnode({ id: 'f', fills: [{ type: 'SOLID', opacity: 0.3 }] });
    const q: NodeQuery = { checks: [{ op: 'range', field: 'fills[0].opacity', max: 0.5 }] };
    expect(matchesQuery(withFill, q)).toBe(true);
    expect(matchesQuery(qnode({ id: 'g' }), q)).toBe(false);
  });

  test('입력 순서를 유지한다', () => {
    const found = queryNodes(nodes, { checks: [{ op: 'range', field: 'height', min: 200 }] });
    expect(found.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('기획 레이어 (annotation-layer) — 면제 + annotation_layer 규칙', () => {
  // 섹션 안에 디자인 프레임 2개(겹침 없음) + 그 위를 덮는 기획 레이어 프레임 L.
  const withLayer = () => [
    node('sec', 'page', 'SECTION', [0, 0, 3000, 1000], [
      node('f1', '채워짐', 'FRAME', [20, 20, 1440, 900]),
      node('f2', '빈 상태', 'FRAME', [1520, 20, 1440, 900]),
      // 레이어: 섹션을 통째로 덮음 → f1/f2 와 겹침, 여백 0, 안에 마커
      node('L', '📝 기획 주석', 'FRAME', [0, 0, 3000, 1000], [
        node('m1', 'marker', 'INSTANCE', [140, 350, 24, 24]),
      ]),
    ]),
  ];

  test('레이어 미인식 시 — card_overlap + frame_padding 위반 (기준선)', () => {
    const rs = rules(withLayer()); // annotationLayerIds 없음
    expect(rs).toContain('card_overlap');
    expect(rs).toContain('frame_padding');
  });

  test('레이어 인식(annotationLayerIds) 시 — 겹침/여백/오버플로우 자동 면제 → clean', () => {
    const r = lintLayout(withLayer(), { annotationLayerIds: ['L'] });
    expect(r.clean).toBe(true);
    expect(r.violationCount).toBe(0);
  });

  test('annotation_layer 규칙 opt-in — 기본 OFF: 레이어 없어도 위반 없음', () => {
    const noLayer = [node('s', 'p', 'SECTION', [0, 0, 800, 600], [node('f', 'scr', 'FRAME', [20, 20, 400, 400])])];
    const rs = runBuiltinRules(noLayer, {}).map((v) => v.rule);
    expect(rs).not.toContain('annotation_layer');
  });

  test('annotation_layer 규칙 ON — 레이어 없는 섹션은 위반', () => {
    const noLayer = [node('s', 'p', 'SECTION', [0, 0, 800, 600], [node('f', 'scr', 'FRAME', [20, 20, 400, 400])])];
    const rs = runBuiltinRules(noLayer, { annotation_layer: { enabled: true } }).map((v) => v.rule);
    expect(rs).toContain('annotation_layer');
  });

  test('annotation_layer 규칙 ON + 레이어 주입 — 존재 강제 통과 & 면제 동시', () => {
    const vs = runBuiltinRules(withLayer(), { annotation_layer: { enabled: true } }, { annotationLayerIds: ['L'] });
    const rs = vs.map((v) => v.rule);
    expect(rs).not.toContain('annotation_layer'); // 레이어 존재 → 존재 규칙 통과
    expect(rs).not.toContain('card_overlap');     // 레이어 → 겹침 면제
    expect(rs).not.toContain('frame_padding');
  });
});

describe('instance_default_name (opt-in) — 인스턴스가 마스터 이름 그대로', () => {
  // 프레임 안에 인스턴스 2개: 하나는 마스터명 그대로("marker"), 하나는 고유 이름 부여("3번 마커").
  const roots = () => [
    node('wrap', 'wrap', 'FRAME', [0, 0, 400, 400], [
      node('i_default', 'marker', 'INSTANCE', [10, 10, 24, 24]),
      node('i_named', '3번 마커', 'INSTANCE', [50, 10, 24, 24]),
    ]),
  ];
  const names = new Map([['i_default', 'marker'], ['i_named', 'marker']]);

  test('opt-in — 기본 OFF: 마스터명 그대로여도 위반 없음', () => {
    const rs = runBuiltinRules(roots(), {}, { instanceComponentNames: names }).map((v) => v.rule);
    expect(rs).not.toContain('instance_default_name');
  });

  test('규칙 ON — 마스터명 그대로인 인스턴스만 위반, 고유 이름은 통과', () => {
    const vs = runBuiltinRules(roots(), { instance_default_name: { enabled: true } }, { instanceComponentNames: names });
    const flagged = vs.filter((v) => v.rule === 'instance_default_name').flatMap((v) => v.nodes);
    expect(flagged).toContain('i_default');
    expect(flagged).not.toContain('i_named');
  });

  test('규칙 ON 이지만 맵에 없음(조회 실패) — 판정 없이 건너뜀', () => {
    const rs = runBuiltinRules(roots(), { instance_default_name: { enabled: true } }, { instanceComponentNames: new Map() })
      .map((v) => v.rule);
    expect(rs).not.toContain('instance_default_name');
  });

  test('중첩 인스턴스 제외 — INSTANCE 내부의 인스턴스는 마스터명 그대로여도 검사 안 함', () => {
    const nested = [
      node('outer', 'card', 'INSTANCE', [0, 0, 200, 200], [
        node('inner', 'icon', 'INSTANCE', [10, 10, 24, 24]),
      ]),
    ];
    const map = new Map([['outer', 'card'], ['inner', 'icon']]);
    const flagged = runBuiltinRules(nested, { instance_default_name: { enabled: true } }, { instanceComponentNames: map })
      .filter((v) => v.rule === 'instance_default_name').flatMap((v) => v.nodes);
    expect(flagged).toContain('outer');   // 최상위 인스턴스는 검사
    expect(flagged).not.toContain('inner'); // 내부 인스턴스는 제외
  });
});
