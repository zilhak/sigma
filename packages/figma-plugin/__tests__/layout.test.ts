/**
 * Flexbox/table → Figma Auto Layout 매핑.
 *
 * layout.ts 는 figma API 를 전혀 부르지 않고 frame 객체의 속성만 대입한다(figma. 참조 0건).
 * 따라서 검사에 필요한 속성만 가진 plain object 를 넘겨 결과를 읽으면 된다 — FrameNode 대역.
 */
import { describe, test, expect } from 'bun:test';
import { applyLayoutMode, applySizingMode, applyAlignment } from '../src/converter/layout';
import type { ComputedStyles, ExtractedNode } from '@sigma/shared';

/** 검사에 필요한 속성만 가진 최소 FrameNode 대역 */
type FakeFrame = Record<string, unknown>;
const fake = (layoutMode = 'NONE'): FakeFrame => ({ layoutMode });

const styles = (s: Record<string, unknown>) => s as unknown as ComputedStyles;
const noChildren = [] as ExtractedNode[];

describe('applyLayoutMode', () => {
  test('flex 는 flexDirection 으로 축이 갈린다', () => {
    const row = fake();
    applyLayoutMode(row as never, styles({ display: 'flex', flexDirection: 'row' }), noChildren);
    expect(row.layoutMode).toBe('HORIZONTAL');

    const col = fake();
    applyLayoutMode(col as never, styles({ display: 'flex', flexDirection: 'column' }), noChildren);
    expect(col.layoutMode).toBe('VERTICAL');
  });

  test('flexDirection 미지정은 CSS 기본값(row)을 따른다', () => {
    const f = fake();
    applyLayoutMode(f as never, styles({ display: 'flex' }), noChildren);
    expect(f.layoutMode).toBe('HORIZONTAL');
  });

  test('inline-flex 도 flex 와 같게 다룬다', () => {
    const f = fake();
    applyLayoutMode(f as never, styles({ display: 'inline-flex', flexDirection: 'column' }), noChildren);
    expect(f.layoutMode).toBe('VERTICAL');
  });

  test('grid 는 행 방향이므로 HORIZONTAL', () => {
    const f = fake();
    applyLayoutMode(f as never, styles({ display: 'grid' }), noChildren);
    expect(f.layoutMode).toBe('HORIZONTAL');
  });

  test('table 은 VERTICAL, table-row 는 HORIZONTAL', () => {
    const t = fake();
    applyLayoutMode(t as never, styles({ display: 'table' }), noChildren);
    expect(t.layoutMode).toBe('VERTICAL');

    const tr = fake();
    applyLayoutMode(tr as never, styles({ display: 'table-row' }), noChildren);
    expect(tr.layoutMode).toBe('HORIZONTAL');
  });

  test('그 밖의 display 는 문서 흐름과 같은 VERTICAL', () => {
    const f = fake();
    applyLayoutMode(f as never, styles({ display: 'block' }), noChildren);
    expect(f.layoutMode).toBe('VERTICAL');
  });
});

describe('applySizingMode', () => {
  // 규칙: 명시 크기(number) → FIXED, 'auto' → HUG(=AUTO).
  // 어느 축이 primary 인지는 layoutMode 가 정한다.
  test('HORIZONTAL: width 가 주축, height 가 교차축', () => {
    const f = fake('HORIZONTAL');
    applySizingMode(f as never, styles({ width: 100, height: 'auto' }), false);
    expect(f.primaryAxisSizingMode).toBe('FIXED');   // width
    expect(f.counterAxisSizingMode).toBe('AUTO');    // height
  });

  test('VERTICAL: height 가 주축, width 가 교차축', () => {
    const f = fake('VERTICAL');
    applySizingMode(f as never, styles({ width: 'auto', height: 50 }), false);
    expect(f.primaryAxisSizingMode).toBe('FIXED');   // height
    expect(f.counterAxisSizingMode).toBe('AUTO');    // width
  });

  test('둘 다 auto 면 양축 HUG', () => {
    const f = fake('HORIZONTAL');
    applySizingMode(f as never, styles({ width: 'auto', height: 'auto' }), false);
    expect(f.primaryAxisSizingMode).toBe('AUTO');
    expect(f.counterAxisSizingMode).toBe('AUTO');
  });

  test('둘 다 명시면 양축 FIXED', () => {
    const f = fake('VERTICAL');
    applySizingMode(f as never, styles({ width: 100, height: 50 }), false);
    expect(f.primaryAxisSizingMode).toBe('FIXED');
    expect(f.counterAxisSizingMode).toBe('FIXED');
  });
});

describe('applyAlignment', () => {
  test('justifyContent/alignItems 를 주축·교차축에 매핑한다', () => {
    const f = fake('HORIZONTAL');
    applyAlignment(f as never, styles({ display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }), noChildren);
    expect(f.primaryAxisAlignItems).toBe('CENTER');
    expect(f.counterAxisAlignItems).toBe('MAX');
  });

  test('미지정은 MIN(시작점)', () => {
    const f = fake('HORIZONTAL');
    applyAlignment(f as never, styles({ display: 'flex' }), noChildren);
    expect(f.primaryAxisAlignItems).toBe('MIN');
    expect(f.counterAxisAlignItems).toBe('MIN');
  });

  test('space-between 은 자식이 2개 이상일 때만 SPACE_BETWEEN', () => {
    // CSS: space-between + 1자식 = 시작점 / Figma: SPACE_BETWEEN + 1자식 = 중앙.
    // 이 차이를 보정하려고 자식 수를 본다 (layout.ts:252-267).
    const one = fake('HORIZONTAL');
    applyAlignment(one as never, styles({ display: 'flex', justifyContent: 'space-between' }), [{} as ExtractedNode]);
    expect(one.primaryAxisAlignItems).toBe('MIN');

    const two = fake('HORIZONTAL');
    applyAlignment(two as never, styles({ display: 'flex', justifyContent: 'space-between' }), [{}, {}] as ExtractedNode[]);
    expect(two.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  });

  test('table-cell 은 textAlign/verticalAlign 을 쓰고 layoutMode 로 축을 바꾼다', () => {
    const h = fake('HORIZONTAL');
    applyAlignment(h as never, styles({ display: 'table-cell', textAlign: 'center', verticalAlign: 'middle' }), noChildren);
    expect(h.primaryAxisAlignItems).toBe('CENTER');   // 가로
    expect(h.counterAxisAlignItems).toBe('CENTER');   // 세로

    const v = fake('VERTICAL');
    applyAlignment(v as never, styles({ display: 'table-cell', textAlign: 'right', verticalAlign: 'bottom' }), noChildren);
    expect(v.primaryAxisAlignItems).toBe('MAX');      // 세로(bottom)
    expect(v.counterAxisAlignItems).toBe('MAX');      // 가로(right)
  });
});
