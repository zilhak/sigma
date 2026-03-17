import { describe, test, expect } from 'bun:test';
import { parseHTML, parseCSSColor } from '../src/converter/html-parser';

describe('parseHTML', () => {
  test('빈 문자열 → null', () => {
    expect(parseHTML('')).toBeNull();
    expect(parseHTML('   ')).toBeNull();
  });

  test('단순 div', () => {
    const result = parseHTML('<div>Hello</div>');
    expect(result).not.toBeNull();
    expect(result!.tagName).toBe('div');
    expect(result!.textContent).toBe('Hello');
  });

  test('중첩된 요소', () => {
    const result = parseHTML('<div><span>World</span></div>');
    expect(result!.tagName).toBe('div');
    expect(result!.children).toHaveLength(1);
    expect(result!.children[0].tagName).toBe('span');
    expect(result!.children[0].textContent).toBe('World');
  });

  test('class 속성 추출', () => {
    const result = parseHTML('<div class="container main">Text</div>');
    expect(result!.className).toBe('container main');
  });

  test('data-* 속성 추출', () => {
    const result = parseHTML('<div data-id="123" data-role="button">Text</div>');
    expect(result!.attributes['data-id']).toBe('123');
    expect(result!.attributes['data-role']).toBe('button');
  });

  test('self-closing 태그 (br, img)', () => {
    const result = parseHTML('<div><br><img></div>');
    expect(result!.children).toHaveLength(2);
    expect(result!.children[0].tagName).toBe('br');
    expect(result!.children[1].tagName).toBe('img');
  });

  test('inline style 파싱 → ComputedStyles', () => {
    const result = parseHTML('<div style="width: 100px; height: 50px; font-size: 16px">Hi</div>');
    expect(result!.styles.width).toBe(100);
    expect(result!.styles.height).toBe(50);
    expect(result!.styles.fontSize).toBe(16);
  });

  test('inline style: display, flex', () => {
    const result = parseHTML('<div style="display: flex; flex-direction: column; gap: 8px">X</div>');
    expect(result!.styles.display).toBe('flex');
    expect(result!.styles.flexDirection).toBe('column');
    expect(result!.styles.gap).toBe(8);
  });

  test('inline style: padding shorthand', () => {
    const result = parseHTML('<div style="padding: 10px 20px 30px 40px">X</div>');
    expect(result!.styles.paddingTop).toBe(10);
    expect(result!.styles.paddingRight).toBe(20);
    expect(result!.styles.paddingBottom).toBe(30);
    expect(result!.styles.paddingLeft).toBe(40);
  });

  test('inline style: border-radius shorthand', () => {
    const result = parseHTML('<div style="border-radius: 4px 8px 12px 16px">X</div>');
    expect(result!.styles.borderTopLeftRadius).toBe(4);
    expect(result!.styles.borderTopRightRadius).toBe(8);
    expect(result!.styles.borderBottomRightRadius).toBe(12);
    expect(result!.styles.borderBottomLeftRadius).toBe(16);
  });

  test('inline style: backgroundColor', () => {
    const result = parseHTML('<div style="background-color: #ff0000">X</div>');
    expect(result!.styles.backgroundColor).not.toBeNull();
    expect(result!.styles.backgroundColor!.r).toBeCloseTo(1, 2);
    expect(result!.styles.backgroundColor!.g).toBe(0);
  });

  test('inline style: opacity', () => {
    const result = parseHTML('<div style="opacity: 0.5">X</div>');
    expect(result!.styles.opacity).toBe(0.5);
  });

  test('SVG 요소 → svgString 캡처', () => {
    const svgInput = '<svg width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>';
    const result = parseHTML(svgInput);
    expect(result!.tagName).toBe('svg');
    expect(result!.svgString).toBe(svgInput);
  });

  test('DOCTYPE 제거', () => {
    const result = parseHTML('<!DOCTYPE html><div>Content</div>');
    expect(result!.tagName).toBe('div');
    expect(result!.textContent).toBe('Content');
  });

  test('HTML 주석 제거', () => {
    const result = parseHTML('<!-- comment --><div>Text</div>');
    expect(result!.tagName).toBe('div');
  });

  test('HTML 엔티티 디코딩', () => {
    const result = parseHTML('<div>&amp; &lt; &gt; &quot;</div>');
    expect(result!.textContent).toBe('& < > "');
  });

  test('style에서 bounding rect 추출', () => {
    const result = parseHTML('<div style="width: 200px; height: 100px; left: 10px; top: 20px">X</div>');
    expect(result!.boundingRect.width).toBe(200);
    expect(result!.boundingRect.height).toBe(100);
    expect(result!.boundingRect.x).toBe(10);
    expect(result!.boundingRect.y).toBe(20);
  });

  test('깊은 중첩', () => {
    const result = parseHTML('<div><div><div><span>Deep</span></div></div></div>');
    expect(result!.children[0].children[0].children[0].textContent).toBe('Deep');
  });

  test('여러 자식 노드', () => {
    const result = parseHTML('<div><span>A</span><span>B</span><span>C</span></div>');
    expect(result!.children).toHaveLength(3);
    expect(result!.children[0].textContent).toBe('A');
    expect(result!.children[1].textContent).toBe('B');
    expect(result!.children[2].textContent).toBe('C');
  });
});

describe('parseCSSColor', () => {
  test('hex → RGBA', () => {
    const result = parseCSSColor('#ff0000');
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  test('rgb() → RGBA', () => {
    const result = parseCSSColor('rgb(0, 255, 0)');
    expect(result.g).toBeCloseTo(1, 2);
  });

  test('파싱 불가 → 투명', () => {
    const result = parseCSSColor('unknown-color');
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test('named color', () => {
    const result = parseCSSColor('blue');
    expect(result.b).toBe(1);
    expect(result.r).toBe(0);
  });
});
