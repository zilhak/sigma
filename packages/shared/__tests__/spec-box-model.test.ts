/**
 * 스펙 등록 시 박스모델 검사 — 루트 내용상자보다 큰 직계 자식은 등록 때 경고한다.
 * (사후 child_overflow 250건 대신 등록 때 1건. 거부는 하지 않는다.)
 */
import { describe, test, expect } from 'bun:test';
import { validateComponentSpecHtml } from '../src/component-spec/validate';

const child = (style: string) => `<div style="${style}">x</div>`;
const root = (style: string, inner: string) => `<div style="display: flex; ${style}">${inner}</div>`;

describe('박스모델 경고', () => {
  test('border 를 빼지 않은 자식 높이를 잡는다 (표 셀 250건의 그 형태)', () => {
    const r = validateComponentSpecHtml(
      root('width: 200px; height: 40px; border-bottom-width: 1px; border-bottom-color: #eee;', child('width: 100px; height: 40px;')),
    );
    expect(r.ok).toBe(true);            // 거부가 아니라 경고
    expect(r.warnings?.length).toBe(1);
    expect(r.warnings?.[0]).toContain('내용상자는 39px');
    expect(r.warnings?.[0]).toContain('height 가 40px');
  });

  test('내용상자에 맞으면 경고 없음', () => {
    const r = validateComponentSpecHtml(
      root('width: 200px; height: 40px; border-bottom-width: 1px; border-bottom-color: #eee;', child('width: 100px; height: 39px;')),
    );
    expect(r.warnings).toBeUndefined();
  });

  test('padding 도 함께 뺀다', () => {
    const r = validateComponentSpecHtml(
      root('width: 100px; height: 50px; padding: 0 10px;', child('width: 100px; height: 20px;')),
    );
    expect(r.warnings?.length).toBe(1);
    expect(r.warnings?.[0]).toContain('내용상자는 80px');
  });

  test('per-side 선언이 shorthand 를 이긴다', () => {
    // border-width: 1px 이지만 left/right 를 0 으로 덮었으므로 가로 여유는 그대로다
    const r = validateComponentSpecHtml(
      root('width: 100px; border-width: 1px; border-left-width: 0; border-right-width: 0; border-color: #eee;', child('width: 100px;')),
    );
    expect(r.warnings).toBeUndefined();
  });

  test('자식이 hug(크기 미지정)면 판정하지 않는다', () => {
    const r = validateComponentSpecHtml(
      root('width: 100px; height: 40px; border-width: 1px; border-color: #eee;', child('font-size: 13px;')),
    );
    expect(r.warnings).toBeUndefined();
  });

  test('루트가 hug 면 판정하지 않는다', () => {
    const r = validateComponentSpecHtml(root('gap: 4px;', child('width: 500px;')));
    expect(r.warnings).toBeUndefined();
  });

  test('px 가 아닌 값(%, calc)은 건너뛴다', () => {
    const r = validateComponentSpecHtml(root('width: 100px;', child('width: 100%;')));
    expect(r.warnings).toBeUndefined();
  });

  test('여러 자식이 넘치면 각각 알려 준다 (몇 번째 자식인지 포함)', () => {
    const r = validateComponentSpecHtml(
      root('width: 100px; border-width: 1px; border-color: #eee;',
        child('width: 100px;') + child('width: 120px;')),
    );
    expect(r.warnings?.length).toBe(2);
    expect(r.warnings?.[0]).toContain('1번째 자식');
    expect(r.warnings?.[1]).toContain('2번째 자식');
  });

  test('손자는 대상이 아니다 (직계 자식만)', () => {
    const r = validateComponentSpecHtml(
      root('width: 100px; border-width: 1px; border-color: #eee;',
        `<div style="display: flex; width: 90px;">${child('width: 500px;')}</div>`),
    );
    expect(r.warnings).toBeUndefined();
  });

  test('고칠 값을 양쪽으로 알려 준다', () => {
    const r = validateComponentSpecHtml(
      root('width: 356px; border-width: 1px; border-color: #eee;', child('width: 356px;')),
    );
    expect(r.warnings?.[0]).toContain('354px 로 줄이거나');
    expect(r.warnings?.[0]).toContain('358px 로 키우세요');
  });
});
