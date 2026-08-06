/**
 * font_not_default — 파일 기본 폰트와 다른 TEXT 검출.
 * 기대 패밀리를 모르면(파일이 기본 폰트를 정하지 않았으면) 판정하지 않는다.
 */
import { describe, test, expect } from 'bun:test';
import { fontNotDefaultRule } from '../src/lint/font';
import type { LintNode } from '../src/lint/types';

function text(over: Partial<LintNode> = {}): LintNode {
  return {
    id: 't1', name: 'page-title', type: 'TEXT', x: 0, y: 0, width: 100, height: 20,
    childCount: 0, characters: '제목', fontName: { family: 'Pretendard', style: 'Bold' },
    ...over,
  };
}

describe('fontNotDefaultRule', () => {
  test('기본 폰트와 같으면 통과', () => {
    expect(fontNotDefaultRule([text()], { family: 'Pretendard' })).toEqual([]);
  });

  test('다른 폰트를 잡고 어떤 폰트인지 알려 준다', () => {
    const v = fontNotDefaultRule([text({ fontName: { family: 'Inter', style: 'Bold' } })], { family: 'Pretendard' });
    expect(v.length).toBe(1);
    expect(v[0].rule).toBe('font_not_default');
    expect(v[0].message).toContain('Inter');
    expect(v[0].message).toContain('Pretendard');
  });

  test('내용 일부를 함께 실어 어느 텍스트인지 알아보게 한다', () => {
    const v = fontNotDefaultRule([text({ characters: 'PVC', fontName: { family: 'Inter', style: 'Regular' } })], { family: 'Pretendard' });
    expect(v[0].message).toContain('PVC');
  });

  test('allow 에 적은 폰트는 봐 준다 (코드용 고정폭 등)', () => {
    const nodes = [text({ fontName: { family: 'JetBrains Mono', style: 'Regular' } })];
    expect(fontNotDefaultRule(nodes, { family: 'Pretendard' }).length).toBe(1);
    expect(fontNotDefaultRule(nodes, { family: 'Pretendard', allow: ['JetBrains Mono'] })).toEqual([]);
  });

  test('한 텍스트 안에 폰트가 섞인 것도 잡는다', () => {
    const v = fontNotDefaultRule([text({ fontName: 'mixed' })], { family: 'Pretendard' });
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('섞여');
  });

  test('flagMixed:false 면 섞인 것은 넘어간다', () => {
    expect(fontNotDefaultRule([text({ fontName: 'mixed' })], { family: 'Pretendard', flagMixed: false })).toEqual([]);
  });

  test('기대 폰트를 모르면 아무것도 판정하지 않는다', () => {
    // 파일이 기본 폰트를 정하지 않았는데 전부 위반으로 만들면 규칙이 아니라 소음이다.
    expect(fontNotDefaultRule([text({ fontName: { family: 'Inter', style: 'Bold' } })], {})).toEqual([]);
  });

  test('폰트 정보가 안 실린 노드는 판정 보류', () => {
    expect(fontNotDefaultRule([text({ fontName: undefined })], { family: 'Pretendard' })).toEqual([]);
  });

  test('TEXT 가 아닌 노드는 건너뛴다', () => {
    expect(fontNotDefaultRule([text({ type: 'FRAME', fontName: { family: 'Inter' } })], { family: 'Pretendard' })).toEqual([]);
  });
});
