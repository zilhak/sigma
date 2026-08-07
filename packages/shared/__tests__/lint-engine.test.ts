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
import { contentSpreadRule, originAnchorRule } from '../src/lint/page-rules';
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

  // Figma 가 클론에서 폭을 123 → 123.000244 로 흘리는데 GROUP 은 resize 가 없어
  // 고칠 방법이 없는 위반이 영구히 남았다(사유 적은 lint-ignore 로 손수 억제했다).
  test('소수점 반올림 오차는 child_overflow 로 보지 않는다', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'screen', 'FRAME', [100, 100, 123, 300], [
          node('g', 'logo', 'GROUP', [0, 0, 123.000244, 100]),
        ]),
      ]),
    ];
    expect(lintLayout(roots).violations.filter((x) => x.rule === 'child_overflow')).toHaveLength(0);
  });

  // ⚠️ 1px 은 봐 주면 안 된다 — 스펙 루트 border 1px 때문에 내용상자가 1px 작아져
  // 자식이 삐져나오는 것은 진짜 결함이고(한 번에 250건 발생) 그게 묻히면 안 된다.
  test('테두리 1px 만큼 넘치는 것은 여전히 child_overflow', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'cell', 'FRAME', [100, 100, 48, 39], [
          node('i', 'inner', 'INSTANCE', [0, 0, 48, 40]),
        ]),
      ]),
    ];
    const v = lintLayout(roots).violations.filter((x) => x.rule === 'child_overflow');
    expect(v).toHaveLength(1);
    expect(v[0].nodes).toContain('i');
  });

  // 판정에 쓴 수치를 버리지 않는다 — 없으면 호출자가 get_tree 로 부모·자식 박스를 다시 받아
  // 손으로 빼야 한다. 배경: docs/history/005-geometric-lint-threw-away-its-own-numbers.md
  describe('metrics (판정 수치 노출)', () => {
    test('child_overflow 는 넘친 변과 양을 싣는다', () => {
      const roots = [
        node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
          node('f', 'cell', 'FRAME', [100, 100, 48, 39], [
            node('i', 'inner', 'INSTANCE', [0, 0, 48, 40]),
          ]),
        ]),
      ];
      const v = lintLayout(roots).violations.find((x) => x.rule === 'child_overflow')!;
      expect(v.metrics).toMatchObject({ sides: 'bottom', bottom: 1, containerWidth: 48, containerHeight: 39 });
      // message 를 파싱하지 않아도 metrics 만으로 초과량을 알 수 있어야 한다
      expect(v.message).toContain('1px');
    });

    test('두 변이 함께 넘치면 둘 다 싣는다', () => {
      const roots = [
        node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
          // ⚠️ 이름을 'box' 로 두면 안 된다 — ANNO_WIRE_NAMES 예외라 검사에서 통째로 빠진다.
          node('f', 'panel', 'FRAME', [100, 100, 100, 100], [
            node('i', 'inner', 'INSTANCE', [0, 0, 103, 110]),
          ]),
        ]),
      ];
      const v = lintLayout(roots).violations.find((x) => x.rule === 'child_overflow')!;
      expect(v.metrics).toMatchObject({ sides: 'right,bottom', right: 3, bottom: 10 });
    });

    test('frame_padding 은 모자란 양과 요구값을 싣는다', () => {
      const roots = [
        node('s', 'S', 'SECTION', [0, 0, 500, 500], [
          node('f', 'card', 'FRAME', [5, 40, 100, 100]),
        ]),
      ];
      const v = lintLayout(roots, { padding: 20 }).violations.find((x) => x.rule === 'frame_padding')!;
      expect(v.metrics).toMatchObject({ sides: 'left', left: 15, requiredPadding: 20 });
    });

    test('겹침 규칙은 겹친 크기를 싣는다', () => {
      const roots = [
        node('a', 'A', 'SECTION', [0, 0, 100, 100]),
        node('b', 'B', 'SECTION', [90, 80, 100, 100]),
      ];
      const v = lintLayout(roots).violations.find((x) => x.rule === 'section_overlap')!;
      expect(v.metrics).toMatchObject({ overlapWidth: 10, overlapHeight: 20 });
    });

    test('수치가 없는 규칙은 metrics 를 달지 않는다', () => {
      const roots = [node('t', 'stray', 'FRAME', [0, 0, 100, 100])];
      const v = lintLayout(roots).violations.find((x) => x.rule === 'outside_section')!;
      expect(v.metrics).toBeUndefined();
    });
  });

  // Figma 의 GROUP 은 자체 좌표계를 만들지 않는다(자식이 그룹의 부모 공간 좌표를 쓴다).
  // 그룹을 (0,0,W,H) 컨테이너로 보면 그룹 안 그룹이 항상 위반으로 잡혔다.
  test('GROUP 은 child_overflow 컨테이너로 보지 않는다', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('f', 'icon', 'FRAME', [0, 0, 24, 24], [
          node('g1', 'outer', 'GROUP', [4.47, 0, 15.05, 24], [
            node('g2', 'inner', 'GROUP', [4.47, 0, 15.05, 24]),
          ]),
        ]),
      ]),
    ];
    expect(lintLayout(roots).violations.filter((x) => x.rule === 'child_overflow')).toHaveLength(0);
  });

  test('GROUP 안에 있는 프레임은 여전히 검사한다 (재귀는 계속)', () => {
    const roots = [
      node('s', 'S', 'SECTION', [0, 0, 2000, 2000], [
        node('g', 'wrap', 'GROUP', [0, 0, 400, 300], [
          node('f', 'screen', 'FRAME', [0, 0, 400, 300], [
            node('i', 'card', 'INSTANCE', [300, 250, 200, 100]),
          ]),
        ]),
      ]),
    ];
    const v = lintLayout(roots).violations.filter((x) => x.rule === 'child_overflow');
    expect(v).toHaveLength(1);
    expect(v[0].nodes).toContain('i');
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

  // 이 셋이 통째로 꺼져 있던 이유가 인스턴스 내부 오탐이었다 — 스펙 HTML 이 만든 래퍼 이름·
  // CSS 계산 소수 좌표·자식 없는 아이콘 프레임. 이 화면에서 고칠 수 없는 것들이라 기본 제외.
  test('인스턴스 내부는 기본으로 건너뛴다 (스펙이 정하는 것이라 화면에서 못 고친다)', () => {
    const roots = [
      node('inst', 'button_primary', 'INSTANCE', [0, 0, 100, 40], [
        node('w', 'Frame', 'FRAME', [0.5, 0, 100, 40], [
          node('deep', 'Rectangle 3', 'RECTANGLE', [1.5, 2, 10, 10]),
        ]),
        node('empty', 'Frame 2', 'FRAME', [0, 0, 8, 8]),
      ]),
    ];
    expect(strayPixelRule(roots)).toHaveLength(0);
    expect(defaultNameRule(roots)).toHaveLength(0);
    expect(emptyContainerRule(roots)).toHaveLength(0);
  });

  test('includeInsideInstances 를 켜면 인스턴스 내부도 본다 (마스터 페이지 감사용)', () => {
    const roots = [
      node('inst', 'button_primary', 'INSTANCE', [0, 0, 100, 40], [
        node('w', 'Frame', 'FRAME', [0.5, 0, 100, 40]),
      ]),
    ];
    const o = { includeInsideInstances: true };
    expect(strayPixelRule(roots, o)).toHaveLength(1);
    expect(defaultNameRule(roots, o)).toHaveLength(1);
    expect(emptyContainerRule(roots, o)).toHaveLength(1);
  });

  // 인스턴스만 제외하면 절반만 닫힌다 — 같은 래퍼가 마스터(COMPONENT) 안에도 그대로 있다.
  // 마스터 페이지 실측: OneUI 452 · SECloudit 마스터 1851 이 100% COMPONENT 내부였고, 그래서
  // 그 페이지들은 page config 로 세 규칙을 통째로 끄는 수밖에 없었다(진짜 위반도 함께 실명).
  test('스펙 스탬프가 찍힌 마스터 내부도 건너뛴다 (specMasterIds)', () => {
    const roots = [
      node('spec', 'button_primary_md', 'COMPONENT', [0, 0, 100, 40], [
        node('w', 'Frame', 'FRAME', [0.5, 0, 100, 40], [
          node('deep', 'Rectangle 3', 'RECTANGLE', [1.5, 2, 10, 10]),
        ]),
        node('empty', 'Frame 2', 'FRAME', [0, 0, 8, 8]),
      ]),
    ];
    const o = { specMasterIds: new Set(['spec']) };
    expect(strayPixelRule(roots, o)).toHaveLength(0);
    expect(defaultNameRule(roots, o)).toHaveLength(0);
    expect(emptyContainerRule(roots, o)).toHaveLength(0);
  });

  // 반대쪽 — 스탬프가 없으면 사람이 조립한 로컬 컴포넌트이므로 그 안쪽 위반은 고칠 수 있다.
  test('스탬프 없는 로컬 COMPONENT 내부는 계속 검사한다', () => {
    const roots = [
      node('local', 'gnb_cluster_only', 'COMPONENT', [0, 0, 100, 40], [
        node('w', 'Frame', 'FRAME', [0.5, 0, 100, 40]),
      ]),
    ];
    const o = { specMasterIds: new Set(['other-id']) };
    expect(defaultNameRule(roots, o)).toHaveLength(1);
    expect(strayPixelRule(roots, o)).toHaveLength(1);
    expect(emptyContainerRule(roots, o)).toHaveLength(1);
    // specMasterIds 를 아예 주지 않아도 같다(수집 실패 시 예전 동작 유지)
    expect(defaultNameRule(roots)).toHaveLength(1);
  });

  test('스펙 마스터 **자신**은 건너뛰지 않는다 (내부만 제외)', () => {
    const roots = [node('spec', 'Frame 7', 'COMPONENT', [0.5, 0, 100, 40])];
    const o = { specMasterIds: new Set(['spec']) };
    expect(defaultNameRule(roots, o)).toHaveLength(1);
    expect(strayPixelRule(roots, o)).toHaveLength(1);
  });

  test('includeInsideInstances 는 스펙 마스터 내부까지 다시 켠다 (스펙 감사용)', () => {
    const roots = [
      node('spec', 'button_primary_md', 'COMPONENT', [0, 0, 100, 40], [
        node('w', 'Frame', 'FRAME', [0.5, 0, 100, 40]),
      ]),
    ];
    const o = { specMasterIds: new Set(['spec']), includeInsideInstances: true };
    expect(defaultNameRule(roots, o)).toHaveLength(1);
    expect(strayPixelRule(roots, o)).toHaveLength(1);
  });

  test('인스턴스 **자신**은 건너뛰지 않는다 (내부만 제외)', () => {
    const roots = [node('inst', 'Frame 9', 'INSTANCE', [0.5, 0, 100, 40])];
    expect(defaultNameRule(roots)).toHaveLength(1);
    expect(strayPixelRule(roots)).toHaveLength(1);
  });

  test("SVG 임포트 산물 VECTOR \"Vector\" 는 기본 제외 (사람이 안 지은 게 아니라 지을 이름이 없다)", () => {
    const roots = [node('v', 'Vector', 'VECTOR', [0, 0, 10, 10])];
    expect(defaultNameRule(roots)).toHaveLength(0);
    expect(defaultNameRule(roots, { includeVectors: true })).toHaveLength(1);
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

  test('empty_container — fill 로 내용을 그리는 컨테이너는 자식이 없어도 제외', () => {
    // 이미지 프레임(<img> 스펙)은 자식 0 이지만 IMAGE fill 로 실제 내용을 그린다
    const roots = [
      node('img', 'photo', 'FRAME', [0, 0, 48, 48], [], { hasVisibleFill: true }),
      node('bare', 'hollow', 'FRAME', [0, 0, 48, 48], [], { hasVisibleFill: false }),
      node('unknown', 'nofillinfo', 'FRAME', [0, 0, 48, 48], []),
    ];
    const violated = emptyContainerRule(roots).map((v) => v.nodes[0]);
    expect(violated).not.toContain('img');
    expect(violated).toContain('bare');
    expect(violated).toContain('unknown');
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

  // 빈 조건은 "전건 매칭"이라 안전 점검(인스턴스 0건 확인 후 삭제)이 조용히 거짓 통과한다.
  test('조건이 비면 거부 (전건 매칭이 그대로 통과하면 안 된다)', () => {
    expect(() => queryNodes(nodes, {})).toThrow(/조건이 하나도 없습니다/);
    expect(() => queryNodes(nodes, { checks: [] })).toThrow(/조건이 하나도 없습니다/);
  });

  // 실사고 모양 — select 로 감싸지 않고 평탄한 키를 where 에 바로 준 것.
  test('where 자신의 모르는 키도 거부 (select 로 감싸라고 알려 준다)', () => {
    expect(() => queryNodes(nodes, { nameContains: 'Card' } as unknown as NodeQuery)).toThrow(/select 안에 넣으세요/);
    expect(() => queryNodes(nodes, { type: 'FRAME' } as unknown as NodeQuery)).toThrow(/모르는 키 "type"/);
  });

  // 조건이 사라지면 0건이 아니라 **전건**이 나오는 방향으로 실패하므로, 모르는 키를
  // 조용히 무시하면 "필터가 동작하지 않는다"로 오진하게 된다.
  test('select 에 모르는 키가 오면 거부 (전건 매칭으로 새지 않게)', () => {
    expect(() => queryNodes(nodes, { select: { nameContains: 'Card' } } as unknown as NodeQuery)).toThrow(/nameContains/);
    expect(() => queryNodes(nodes, { select: { name: 'Card' } } as unknown as NodeQuery)).toThrow(/namePattern/);
  });

  test('checks 의 없는 연산자·모르는 키도 거부', () => {
    expect(() => queryNodes(nodes, { checks: [{ op: 'contains', field: 'name', value: 'x' }] } as unknown as NodeQuery)).toThrow(/contains/);
    expect(() => queryNodes(nodes, { checks: [{ op: 'equals', field: 'name', valeu: 'x' }] } as unknown as NodeQuery)).toThrow(/valeu/);
    expect(() => queryNodes(nodes, { checks: [{ op: 'equals', value: 'x' }] } as unknown as NodeQuery)).toThrow(/field/);
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

describe('스코프 검사(nodeId/path) — 검사 시작 노드가 컨테이너로 인식돼야 함', () => {
  // sigma_lint(nodeId: 섹션) → roots = 섹션의 자식들. 이때 섹션 자신이 전달되지 않으면
  // (1) 자식들이 "페이지 직속"으로 오인돼 outside_section 오탐, (2) 섹션 로컬박스를 몰라
  // child_overflow 가 아예 판정 불가(false clean) 가 된다. 둘은 같은 원인의 양면이다.
  const section = () => node('sec', '본문', 'SECTION', [0, 0, 600, 400]);
  const scopedChildren = () => [
    node('a', '카드A', 'FRAME', [20, 20, 200, 200]),   // 정상 (섹션 안)
    node('b', '카드B', 'FRAME', [550, 350, 300, 300]), // 섹션 밖으로 넘침
  ];

  test('scopeRoot 없이 검사하면 정상 자식까지 outside_section 오탐 + 넘침 미검출', () => {
    const rs = lintLayout(scopedChildren()).violations;
    expect(rs.filter((v) => v.rule === 'outside_section')).toHaveLength(2); // 둘 다 오탐
    expect(rs.filter((v) => v.rule === 'child_overflow')).toHaveLength(0);  // 넘침을 못 잡음
  });

  test('scopeRoot 를 주면 오탐 0 + 넘친 자식만 child_overflow', () => {
    const rs = lintLayout(scopedChildren(), { scopeRoot: section() }).violations;
    expect(rs.filter((v) => v.rule === 'outside_section')).toHaveLength(0);
    const overflow = rs.filter((v) => v.rule === 'child_overflow');
    expect(overflow.map((v) => v.nodes[0])).toEqual(['b']);
  });

  test('scopeRoot 가 FRAME 이면 프레임 규칙으로 검사 — 직속 INSTANCE 는 orphan 아님', () => {
    const frame = node('fr', '래퍼', 'FRAME', [0, 0, 600, 400]);
    const kids = [
      node('i', '버튼', 'INSTANCE', [20, 20, 100, 40]),
      node('over', '삐져나옴', 'FRAME', [500, 20, 300, 100]),
    ];
    const rs = lintLayout(kids, { scopeRoot: frame }).violations;
    expect(rs.map((v) => v.rule)).not.toContain('instance_orphan');   // 래퍼 안이므로 정상
    expect(rs.map((v) => v.rule)).not.toContain('outside_section');
    expect(rs.filter((v) => v.rule === 'child_overflow').map((v) => v.nodes[0])).toEqual(['over']);
  });

  test('페이지 루트 검사(scopeRoot 없음)는 기존 동작 그대로 — 섹션→자식 넘침 검출', () => {
    const roots = [node('sec', '본문', 'SECTION', [0, 0, 600, 400], scopedChildren())];
    const overflow = lintLayout(roots).violations.filter((v) => v.rule === 'child_overflow');
    expect(overflow.map((v) => v.nodes[0])).toEqual(['b']);
  });
});

describe('origin_anchor (opt-in, 페이지 루트 전용) — 원점에서 시작하는 섹션', () => {
  const anchored = () => [
    node('s1', 'A', 'SECTION', [0, 0, 800, 600]),
    node('s2', 'B', 'SECTION', [900, 0, 800, 600]),
  ];
  const drifted = () => [
    node('s1', 'A', 'SECTION', [5000, 3000, 800, 600]),
    node('s2', 'B', 'SECTION', [6000, 3000, 800, 600]),
  ];

  test('원점 근처 섹션 있음 — 통과', () => {
    expect(originAnchorRule(anchored())).toEqual([]);
  });

  test('전부 원점에서 멀면 위반 1건 + 주체는 가장 가까운 섹션', () => {
    const vs = originAnchorRule(drifted());
    expect(vs).toHaveLength(1);
    expect(vs[0].rule).toBe('origin_anchor');
    expect(vs[0].nodes).toEqual(['s1']); // (5000,3000) 이 (6000,3000) 보다 가까움
  });

  test('tolerance 로 허용 범위 조절', () => {
    const near = [node('s', 'A', 'SECTION', [150, 80, 800, 600])];
    expect(originAnchorRule(near, 100)).toHaveLength(1); // x=150 > 100
    expect(originAnchorRule(near, 200)).toEqual([]);
  });

  test('음수 좌표도 절대값으로 판정', () => {
    expect(originAnchorRule([node('s', 'A', 'SECTION', [-50, -30, 800, 600])])).toEqual([]);
  });

  test('섹션이 하나도 없는 페이지는 검사 대상 아님(vacuous pass)', () => {
    expect(originAnchorRule([node('f', 'loose', 'FRAME', [9000, 9000, 100, 100])])).toEqual([]);
  });

  test('opt-in — 기본 OFF, enabled:true + isPageRoot 일 때만 실행', () => {
    const rules = (builtins: Parameters<typeof runBuiltinRules>[1], ctx?: Parameters<typeof runBuiltinRules>[2]) =>
      runBuiltinRules(drifted(), builtins, ctx).map((v) => v.rule);
    expect(rules({}, { isPageRoot: true })).not.toContain('origin_anchor');
    expect(rules({ origin_anchor: { enabled: true } })).not.toContain('origin_anchor'); // isPageRoot 미지정 = 서브트리
    expect(rules({ origin_anchor: { enabled: true } }, { isPageRoot: true })).toContain('origin_anchor');
  });
});

describe('content_spread (opt-in, 페이지 루트 전용) — 본진에서 떨어진 이상치', () => {
  // 본진 3개(서로 붙어 있음) + 5만px 밖 조각 1개 → zoom-to-fit 을 망치는 전형
  const withOutlier = () => [
    node('a', 'A', 'SECTION', [0, 0, 800, 600]),
    node('b', 'B', 'SECTION', [900, 0, 800, 600]),
    node('c', 'C', 'SECTION', [0, 700, 800, 600]),
    node('stray', '조각', 'RECTANGLE', [50000, 0, 10, 10]),
  ];

  test('이상치를 잡고 본진은 통과', () => {
    const vs = contentSpreadRule(withOutlier());
    expect(vs.map((v) => v.nodes[0])).toEqual(['stray']);
    expect(vs[0].rule).toBe('content_spread');
    expect(vs[0].message).toContain('48300px'); // 본진 오른쪽 끝(1700) → 50000
  });

  test('maxGap 을 키우면 같은 덩어리로 인정', () => {
    expect(contentSpreadRule(withOutlier(), 60000)).toEqual([]);
  });

  test('전이적으로 이어지면 한 덩어리 — 징검다리 배치는 통과', () => {
    const chain = [
      node('a', 'A', 'SECTION', [0, 0, 800, 600]),
      node('b', 'B', 'SECTION', [3000, 0, 800, 600]),   // a 와 2200px
      node('c', 'C', 'SECTION', [6000, 0, 800, 600]),   // b 와 2200px (a 와는 5200px)
    ];
    expect(contentSpreadRule(chain, 3000)).toEqual([]);
  });

  test('숨김 노드는 제외 — fit 에 영향이 없음', () => {
    const roots = [
      node('a', 'A', 'SECTION', [0, 0, 800, 600]),
      node('b', 'B', 'SECTION', [900, 0, 800, 600]),
      node('h', '숨김', 'FRAME', [90000, 0, 100, 100], [], { visible: false }),
    ];
    expect(contentSpreadRule(roots)).toEqual([]);
  });

  test('최상위 노드가 1개 이하면 검사 대상 아님', () => {
    expect(contentSpreadRule([node('a', 'A', 'SECTION', [50000, 50000, 800, 600])])).toEqual([]);
  });

  test('덩어리 둘이 동수면 면적이 큰 쪽이 본진', () => {
    const two = [
      node('big1', 'big1', 'SECTION', [0, 0, 2000, 2000]),
      node('big2', 'big2', 'SECTION', [2100, 0, 2000, 2000]),
      node('small1', 'small1', 'SECTION', [80000, 0, 100, 100]),
      node('small2', 'small2', 'SECTION', [80200, 0, 100, 100]),
    ];
    expect(contentSpreadRule(two).map((v) => v.nodes[0]).sort()).toEqual(['small1', 'small2']);
  });

  test('opt-in — 기본 OFF, enabled:true + isPageRoot 일 때만 실행', () => {
    const rules = (builtins: Parameters<typeof runBuiltinRules>[1], ctx?: Parameters<typeof runBuiltinRules>[2]) =>
      runBuiltinRules(withOutlier(), builtins, ctx).map((v) => v.rule);
    expect(rules({}, { isPageRoot: true })).not.toContain('content_spread');
    expect(rules({ content_spread: { enabled: true } })).not.toContain('content_spread');
    expect(rules({ content_spread: { enabled: true } }, { isPageRoot: true })).toContain('content_spread');
    expect(rules({ content_spread: { enabled: true, maxGap: 60000 } }, { isPageRoot: true })).not.toContain('content_spread');
  });
});
