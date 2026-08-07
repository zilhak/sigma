/**
 * CSS Grid 파싱 스펙 — 문자열 → 트랙/배치 구조체.
 *
 * 입력 계약(중요): `parseGridTemplate` 은 **getComputedStyle 이 resolved 한 값**을 받는다
 * ("156.469px 73.0312px"). 원본 `repeat(3, 1fr)` 같은 축약형은 추출 시점에 이미 풀려 있으므로
 * 여기서 처리하지 않는다 — grid.ts 의 함수 주석이 규정한 계약이다.
 *
 * 이 함수들은 figma API 를 부르지 않아 전역 없이 그대로 테스트한다
 * (grid.ts 의 유일한 figma 참조는 :249 함수 본문 안이라 import 시점에 실행되지 않는다).
 */
import { describe, test, expect } from 'bun:test';
import {
  parseGridTemplate, parseGridPlacement, assignChildrenToGrid,
} from '../src/converter/grid';
import type { ExtractedNode } from '@sigma/shared';

describe('parseGridTemplate', () => {
  test('fr / 고정 px 을 구분한다', () => {
    expect(parseGridTemplate('1fr 2fr 100px')).toEqual([
      { type: 'fr', value: 1 },
      { type: 'fr', value: 2 },
      { type: 'fixed', value: 100 },
    ]);
  });

  test('auto 계열은 type=auto, value=0', () => {
    expect(parseGridTemplate('auto 1fr')).toEqual([
      { type: 'auto', value: 0 },
      { type: 'fr', value: 1 },
    ]);
  });

  test('빈 문자열과 none 은 빈 배열', () => {
    expect(parseGridTemplate('')).toEqual([]);
    expect(parseGridTemplate('none')).toEqual([]);
  });

  test('resolved px 문자열(실제 입력 형태)을 처리한다', () => {
    expect(parseGridTemplate('156.469px 73.0312px')).toEqual([
      { type: 'fixed', value: 156.469 },
      { type: 'fixed', value: 73.0312 },
    ]);
  });
});

describe('parseGridPlacement', () => {
  test('start/end 로 span 을 계산한다', () => {
    expect(parseGridPlacement('2', '4')).toEqual({ start: 2, span: 2 });
  });

  test('span 표기를 그대로 읽는다', () => {
    expect(parseGridPlacement('1', 'span 2')).toEqual({ start: 1, span: 2 });
  });

  test('auto(파싱 불가)는 start=-1', () => {
    // -1 이 "auto" 의 내부 표현이다 (grid.ts:51 주석)
    expect(parseGridPlacement('', '')).toEqual({ start: -1, span: 1 });
    expect(parseGridPlacement('auto', 'auto')).toEqual({ start: -1, span: 1 });
  });
});

describe('assignChildrenToGrid', () => {
  const child = () => ({ tag: 'div' }) as unknown as ExtractedNode;

  test('열 수를 넘으면 다음 행으로 넘어간다', () => {
    const cells = assignChildrenToGrid([child(), child(), child()], 2);
    expect(cells.map((c) => [c.column, c.row])).toEqual([[0, 0], [1, 0], [0, 1]]);
  });

  test('기본 span 은 1x1', () => {
    const cells = assignChildrenToGrid([child()], 3);
    expect(cells[0].colSpan).toBe(1);
    expect(cells[0].rowSpan).toBe(1);
  });

  test('자식이 없으면 빈 배열', () => {
    expect(assignChildrenToGrid([], 3)).toEqual([]);
  });
});
