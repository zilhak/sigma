import { describe, expect, test } from 'bun:test';
import { validateComponentSpecHtml, isValidSpecName } from '../src/component-spec';

const BADGE_HTML = `
<div style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; background-color: #E3F2FD; border-radius: 10px;">
  <span data-sigma-slot="text" style="font-size: 12px; font-weight: 600; color: #1565C0;">Badge</span>
</div>
`;

describe('isValidSpecName', () => {
  test('유효한 이름', () => {
    expect(isValidSpecName('ui_badge')).toBe(true);
    expect(isValidSpecName('text')).toBe(true);
    expect(isValidSpecName('a1_b2')).toBe(true);
  });

  test('무효한 이름', () => {
    expect(isValidSpecName('UiBadge')).toBe(false);
    expect(isValidSpecName('1badge')).toBe(false);
    expect(isValidSpecName('ui-badge')).toBe(false);
    expect(isValidSpecName('')).toBe(false);
    expect(isValidSpecName('_x')).toBe(false);
  });
});

describe('validateComponentSpecHtml — 통과 케이스', () => {
  test('뱃지 예시: 통과 + text 파라미터 추출', () => {
    const result = validateComponentSpecHtml(BADGE_HTML);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.params).toEqual([{ name: 'text', type: 'text', defaultValue: 'Badge' }]);
  });

  test('slot 없는 정적 컴포넌트도 통과 (params 빈 배열)', () => {
    const result = validateComponentSpecHtml('<div style="width: 100px; height: 40px; background-color: #fff;"></div>');
    expect(result.ok).toBe(true);
    expect(result.params).toEqual([]);
  });

  test('slot 여러 개 추출', () => {
    const html = `
      <div style="display: flex; flex-direction: column; gap: 8px; padding: 16px;">
        <h3 data-sigma-slot="title" style="font-size: 16px; font-weight: 700;">Title</h3>
        <p data-sigma-slot="body" style="font-size: 13px; color: #666666;">Body text here</p>
      </div>`;
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(true);
    expect(result.params.map((p) => p.name)).toEqual(['title', 'body']);
    expect(result.params[1].defaultValue).toBe('Body text here');
  });

  test('void 태그(br, img) 허용', () => {
    const html = '<div style="padding: 8px;"><img src="x.png" alt="icon"><br></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });

  test('주석은 무시', () => {
    const html = '<!-- comment --><div style="width: 10px;"></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });
});

describe('validateComponentSpecHtml — 거부 케이스', () => {
  test('빈 입력', () => {
    const result = validateComponentSpecHtml('   ');
    expect(result.ok).toBe(false);
  });

  test('화이트리스트 밖 CSS 속성 거부 + 속성명 명시', () => {
    const result = validateComponentSpecHtml('<div style="float: left; width: 10px;"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('float');
  });

  test('여러 위반을 모두 나열', () => {
    const result = validateComponentSpecHtml(
      '<div style="float: left; z-index: 5;"><marquee>x</marquee></div>'
    );
    expect(result.ok).toBe(false);
    const joined = result.errors.join('\n');
    expect(joined).toContain('float');
    expect(joined).toContain('z-index');
    expect(joined).toContain('marquee');
  });

  test('복수 루트 거부', () => {
    const result = validateComponentSpecHtml('<div></div><div></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('루트');
  });

  test('루트 밖 텍스트 거부', () => {
    const result = validateComponentSpecHtml('<div></div> stray');
    expect(result.ok).toBe(false);
  });

  test('허용되지 않는 태그 거부', () => {
    const result = validateComponentSpecHtml('<video style="width: 10px;"></video>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('video');
  });

  test('class 속성 거부 (variant 단계 전)', () => {
    const result = validateComponentSpecHtml('<div class="badge"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('class');
  });

  test('알 수 없는 속성 거부', () => {
    const result = validateComponentSpecHtml('<div onclick="hack()"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('onclick');
  });

  test('알 수 없는 data-sigma-* 속성 거부', () => {
    const result = validateComponentSpecHtml('<div data-sigma-magic="x"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('data-sigma-magic');
  });

  test('<style>/<script>/문서 태그 거부', () => {
    expect(validateComponentSpecHtml('<style>.a{}</style>').ok).toBe(false);
    expect(validateComponentSpecHtml('<div><script>x()</script></div>').ok).toBe(false);
    expect(validateComponentSpecHtml('<html><body><div></div></body></html>').ok).toBe(false);
  });

  test('slot이 자식 요소를 가지면 거부', () => {
    const html = '<div><span data-sigma-slot="text"><b>bold</b></span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('자식 요소');
  });

  test('slot 이름 규칙 위반 거부', () => {
    const html = '<div><span data-sigma-slot="Text-1">x</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
  });

  test('slot 이름 중복 거부', () => {
    const html = '<div><span data-sigma-slot="text">a</span><span data-sigma-slot="text">b</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('중복');
  });

  test('루트 요소에 slot 거부', () => {
    const result = validateComponentSpecHtml('<span data-sigma-slot="text">x</span>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('루트');
  });

  test('기본 텍스트 없는 slot 거부', () => {
    const result = validateComponentSpecHtml('<div><span data-sigma-slot="text"></span></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('기본 텍스트');
  });

  test('닫히지 않은 태그 거부', () => {
    const result = validateComponentSpecHtml('<div><span>x</div>');
    expect(result.ok).toBe(false);
  });

  test('slot 요소에 배경/패딩 등 프레임화 유발 스타일 거부', () => {
    const html = '<div><span data-sigma-slot="text" style="padding: 4px; background-color: #fff;">x</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    const joined = result.errors.join('\n');
    expect(joined).toContain('padding');
    expect(joined).toContain('background-color');
  });

  test('slot 요소에 텍스트 속성은 허용', () => {
    const html = '<div><span data-sigma-slot="text" style="font-size: 12px; color: #333333; font-weight: 600;">x</span></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });

  test('텍스트 태그가 아닌 요소에 slot 거부', () => {
    const html = '<div><div data-sigma-slot="text">x</div></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('텍스트 태그');
  });
});
