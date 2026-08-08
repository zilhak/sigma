/**
 * RuleCoverage 스펙 — "위반 0건" 이 깨끗함인지 규칙이 안 돈 것인지 가르는 신호.
 *
 * 여기서 지키는 불변식: **엔진이 담당하는 규칙은 하나도 빠짐없이 어느 한 바구니에 담긴다.**
 * 빠지면 호출자는 그 규칙을 "안 돌았다" 로 읽는데 실제로는 돌았을 수 있고, 그게 바로
 * 이 기능이 없애려는 혼동이다. 배경: docs/history/004-lint-zero-violations-was-unreadable.md
 */
import { describe, test, expect } from 'bun:test';
import {
  runBuiltinRules, emptyCoverage, ALL_BUILTIN_RULE_IDS, ENGINE_EXTERNAL_RULE_IDS, BUILTIN_RULE_PARAMS,
} from '../src/lint/engine';
import type { BuiltinRuleId } from '../src/lint/types';
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

/** 규약을 지키는 트리 — 위반 0건이 나오는 픽스처 */
const cleanRoots: TreeNode[] = [
  node('sA', 'diagram', 'SECTION', [0, 0, 1600, 1200], [
    node('f1', 'screen', 'FRAME', [40, 20, 1520, 1160], [
      node('t1', 'title', 'TEXT', [0, 0, 200, 40]),
    ]),
  ]),
];

/** 엔진이 담당해야 하는 규칙 = 전체 − 엔진 밖 실행분 */
const ENGINE_OWNED = ALL_BUILTIN_RULE_IDS.filter((id) => !ENGINE_EXTERNAL_RULE_IDS.includes(id));

function bucketsOf(cov: ReturnType<typeof emptyCoverage>): BuiltinRuleId[] {
  return [...cov.ran, ...cov.disabled, ...cov.optInOff, ...cov.skipped.map((s) => s.rule)];
}

describe('runBuiltinRules coverage', () => {
  test('엔진 담당 규칙이 정확히 한 번씩 분류된다 (기본 config)', () => {
    const cov = emptyCoverage();
    runBuiltinRules(cleanRoots, {}, { isPageRoot: true }, cov);
    const all = bucketsOf(cov);
    expect(all.slice().sort()).toEqual(ENGINE_OWNED.slice().sort());
    expect(new Set(all).size).toBe(all.length); // 중복 없음
  });

  test('규칙을 끄면 disabled 에 나타난다', () => {
    const cov = emptyCoverage();
    runBuiltinRules(cleanRoots, { hidden_leaf: { enabled: false } }, { isPageRoot: true }, cov);
    expect(cov.disabled).toContain('hidden_leaf');
    expect(cov.ran).not.toContain('hidden_leaf');
  });

  test('opt-in 규칙은 안 켜면 optInOff, 켜면 ran', () => {
    const off = emptyCoverage();
    runBuiltinRules(cleanRoots, {}, { isPageRoot: true }, off);
    expect(off.optInOff).toContain('raw_node');

    const on = emptyCoverage();
    runBuiltinRules(cleanRoots, { raw_node: { enabled: true } }, { isPageRoot: true }, on);
    expect(on.ran).toContain('raw_node');
  });

  test('기하 규칙을 전부 끄면 8종이 모두 disabled 다', () => {
    const cov = emptyCoverage();
    const allOff = {
      outside_section: { enabled: false }, section_overlap: { enabled: false },
      section_gap: { enabled: false }, card_overlap: { enabled: false },
      frame_padding: { enabled: false }, instance_orphan: { enabled: false },
      component_needs_frame: { enabled: false }, child_overflow: { enabled: false },
    };
    runBuiltinRules(cleanRoots, allOff, { isPageRoot: true }, cov);
    for (const id of Object.keys(allOff)) expect(cov.disabled).toContain(id as BuiltinRuleId);
    expect(cov.ran).not.toContain('outside_section');
  });

  test('페이지 루트 전용 규칙은 켰어도 서브트리 스코프면 skipped (optInOff 아님)', () => {
    const cov = emptyCoverage();
    runBuiltinRules(cleanRoots, { origin_anchor: { enabled: true } }, { isPageRoot: false }, cov);
    expect(cov.skipped.map((s) => s.rule)).toContain('origin_anchor');
    expect(cov.optInOff).not.toContain('origin_anchor');
    expect(cov.ran).not.toContain('origin_anchor');
  });

  test('coverage 를 안 넘기면 violations 가 종전과 완전히 동일하다', () => {
    // 회귀 방어 — coverage 는 부가 출력일 뿐 판정에 영향을 주면 안 된다.
    const dirty = [
      node('f0', 'Frame', 'FRAME', [0, 0, 100, 100], [
        node('h1', 'hidden', 'TEXT', [0, 0, 10, 10], [], { visible: false }),
      ]),
    ];
    const withoutCov = runBuiltinRules(dirty, {}, { isPageRoot: true });
    const withCov = runBuiltinRules(dirty, {}, { isPageRoot: true }, emptyCoverage());
    expect(withCov).toEqual(withoutCov);
  });
});

/**
 * BUILTIN_RULE_PARAMS — config 검증(server/src/lint/load-config.ts)이 이 목록으로 오타를 거부한다.
 * 목록이 카탈로그와 어긋나면 **멀쩡한 config 가 거부되거나 오타가 통과한다** — 둘 다 조용히 틀린다.
 * 배경: docs/history/011-lint-config-typos-were-silently-ignored.md
 */
describe('BUILTIN_RULE_PARAMS', () => {
  test('24종 전부 항목이 있다 (규칙을 추가하고 파라미터 등록을 빠뜨리면 여기서 걸린다)', () => {
    expect(Object.keys(BUILTIN_RULE_PARAMS).sort()).toEqual([...ALL_BUILTIN_RULE_IDS].sort());
  });

  test('enabled 는 전 규칙 공통이라 목록에 넣지 않는다', () => {
    for (const params of Object.values(BUILTIN_RULE_PARAMS)) {
      expect(params).not.toContain('enabled');
    }
  });

  test('엔진이 실제로 읽는 파라미터가 선언돼 있다', () => {
    // 엔진 소스에서 읽는 키를 직접 확인한다 — 선언만 늘고 구현이 안 따라오는 것을 막는다.
    expect(BUILTIN_RULE_PARAMS.frame_padding).toContain('padding');
    expect(BUILTIN_RULE_PARAMS.section_gap).toContain('gap');
    expect(BUILTIN_RULE_PARAMS.default_name).toContain('includeVectors');
    expect(BUILTIN_RULE_PARAMS.origin_anchor).toContain('tolerance');
    expect(BUILTIN_RULE_PARAMS.content_spread).toContain('maxGap');
    // 서버가 항상 덮어쓰는 값은 "받는 척" 하지 않는다.
    expect(BUILTIN_RULE_PARAMS.instance_resized_from_spec).not.toContain('sizingByAlias');
  });
});
