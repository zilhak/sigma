/**
 * parseHTML 스펙:
 *   - HTML 문자열을 ExtractedNode로 파싱
 *   - Figma Plugin 환경 (DOMParser 없음)이므로 자체 파서 구현
 *   - 지원: 태그 중첩, 속성, inline style, self-closing 태그, SVG, HTML 엔티티
 *   - DOCTYPE/주석/CDATA 제거
 *   - 빈 입력 → null
 *
 * parseCSSColor 스펙:
 *   - parseColor에 위임하되, null 대신 투명(rgba 0,0,0,0) 반환
 */
import { describe, test, expect } from 'bun:test';
import { parseHTML, parseCSSColor } from '../src/converter/html-parser';

describe('parseHTML', () => {
  // === 무효한 입력 ===
  describe('무효한 입력 → null', () => {
    test('빈 문자열', () => expect(parseHTML('')).toBeNull());
    test('공백만', () => expect(parseHTML('   ')).toBeNull());
    test('주석만', () => expect(parseHTML('<!-- comment -->')).toBeNull());
    test('DOCTYPE만', () => expect(parseHTML('<!DOCTYPE html>')).toBeNull());
  });

  // === 기본 파싱 ===
  describe('기본 요소 파싱', () => {
    test('단일 태그 + 텍스트', () => {
      const result = parseHTML('<div>Hello</div>')!;
      expect(result.tagName).toBe('div');
      expect(result.textContent).toBe('Hello');
    });

    test('빈 태그', () => {
      const result = parseHTML('<div></div>')!;
      expect(result.tagName).toBe('div');
      expect(result.textContent).toBe('');
      expect(result.children).toHaveLength(0);
    });

    test('태그 이름은 소문자로 정규화해야 함', () => {
      const result = parseHTML('<DIV>text</DIV>')!;
      expect(result.tagName).toBe('div');
    });
  });

  // === 중첩 ===
  describe('중첩 구조', () => {
    test('부모 → 자식', () => {
      const result = parseHTML('<div><span>Child</span></div>')!;
      expect(result.children).toHaveLength(1);
      expect(result.children[0].tagName).toBe('span');
      expect(result.children[0].textContent).toBe('Child');
    });

    test('형제 노드', () => {
      const result = parseHTML('<div><span>A</span><span>B</span><span>C</span></div>')!;
      expect(result.children).toHaveLength(3);
    });

    test('깊은 중첩', () => {
      const result = parseHTML('<div><div><div><p>Deep</p></div></div></div>')!;
      const deep = result.children[0].children[0].children[0];
      expect(deep.tagName).toBe('p');
      expect(deep.textContent).toBe('Deep');
    });

    test('자식이 있으면 부모의 textContent는 비어야 함', () => {
      const result = parseHTML('<div><span>Text</span></div>')!;
      // 텍스트는 자식에 있고, 부모의 textContent는 비어야 함
      expect(result.textContent).toBe('');
    });
  });

  // === 속성 ===
  describe('속성 추출', () => {
    test('class 속성 → className에 매핑', () => {
      const result = parseHTML('<div class="btn primary">X</div>')!;
      expect(result.className).toBe('btn primary');
    });

    test('data-* 속성', () => {
      const result = parseHTML('<div data-id="42" data-role="button">X</div>')!;
      expect(result.attributes['data-id']).toBe('42');
      expect(result.attributes['data-role']).toBe('button');
    });

    test('style/class는 attributes에 포함되지 않아야 함 (별도 처리)', () => {
      const result = parseHTML('<div style="color:red" class="x" data-x="1">T</div>')!;
      expect(result.attributes).not.toHaveProperty('style');
      expect(result.attributes).not.toHaveProperty('class');
      expect(result.attributes).toHaveProperty('data-x');
    });

    test('class 없으면 className 빈 문자열', () => {
      const result = parseHTML('<div>X</div>')!;
      expect(result.className).toBe('');
    });
  });

  // === Self-closing 태그 ===
  describe('self-closing 태그', () => {
    test('br', () => {
      const result = parseHTML('<div><br></div>')!;
      expect(result.children.some(c => c.tagName === 'br')).toBe(true);
    });

    test('img', () => {
      const result = parseHTML('<div><img></div>')!;
      expect(result.children.some(c => c.tagName === 'img')).toBe(true);
    });

    test('input', () => {
      const result = parseHTML('<div><input></div>')!;
      expect(result.children.some(c => c.tagName === 'input')).toBe(true);
    });

    test('hr', () => {
      const result = parseHTML('<div><hr></div>')!;
      expect(result.children.some(c => c.tagName === 'hr')).toBe(true);
    });
  });

  // === Inline Style 파싱 ===
  describe('inline style → ComputedStyles', () => {
    test('width/height', () => {
      const result = parseHTML('<div style="width: 200px; height: 100px">X</div>')!;
      expect(result.styles.width).toBe(200);
      expect(result.styles.height).toBe(100);
    });

    test('display + flexDirection', () => {
      const result = parseHTML('<div style="display: flex; flex-direction: column">X</div>')!;
      expect(result.styles.display).toBe('flex');
      expect(result.styles.flexDirection).toBe('column');
    });

    test('padding shorthand (4값)', () => {
      const result = parseHTML('<div style="padding: 10px 20px 30px 40px">X</div>')!;
      expect(result.styles.paddingTop).toBe(10);
      expect(result.styles.paddingRight).toBe(20);
      expect(result.styles.paddingBottom).toBe(30);
      expect(result.styles.paddingLeft).toBe(40);
    });

    test('padding shorthand (2값: top/bottom, left/right)', () => {
      const result = parseHTML('<div style="padding: 10px 20px">X</div>')!;
      expect(result.styles.paddingTop).toBe(10);
      expect(result.styles.paddingRight).toBe(20);
      expect(result.styles.paddingBottom).toBe(10);
      expect(result.styles.paddingLeft).toBe(20);
    });

    test('padding shorthand (1값: 전체 동일)', () => {
      const result = parseHTML('<div style="padding: 16px">X</div>')!;
      expect(result.styles.paddingTop).toBe(16);
      expect(result.styles.paddingRight).toBe(16);
      expect(result.styles.paddingBottom).toBe(16);
      expect(result.styles.paddingLeft).toBe(16);
    });

    test('border-radius shorthand', () => {
      const result = parseHTML('<div style="border-radius: 4px 8px 12px 16px">X</div>')!;
      expect(result.styles.borderTopLeftRadius).toBe(4);
      expect(result.styles.borderTopRightRadius).toBe(8);
      expect(result.styles.borderBottomRightRadius).toBe(12);
      expect(result.styles.borderBottomLeftRadius).toBe(16);
    });

    test('background-color (hex)', () => {
      const result = parseHTML('<div style="background-color: #ff0000">X</div>')!;
      expect(result.styles.backgroundColor).not.toBeNull();
      expect(result.styles.backgroundColor!.r).toBeCloseTo(1, 2);
    });

    test('opacity', () => {
      const result = parseHTML('<div style="opacity: 0.7">X</div>')!;
      expect(result.styles.opacity).toBeCloseTo(0.7);
    });

    test('스타일 없으면 기본값 사용', () => {
      const result = parseHTML('<div>X</div>')!;
      // 기본 display는 block
      expect(result.styles.display).toBe('block');
      expect(result.styles.opacity).toBe(1);
    });
  });

  // === SVG ===
  describe('SVG 처리', () => {
    test('SVG → svgString에 전체 마크업 캡처', () => {
      const svg = '<svg width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>';
      const result = parseHTML(svg)!;
      expect(result.tagName).toBe('svg');
      expect(result.svgString).toBe(svg);
    });

    test('SVG 자식은 별도 파싱하지 않음 (svgString으로만)', () => {
      const result = parseHTML('<svg><rect/><circle/></svg>')!;
      expect(result.children).toHaveLength(0);
    });
  });

  // === HTML 전처리 ===
  describe('전처리', () => {
    test('DOCTYPE 제거', () => {
      const result = parseHTML('<!DOCTYPE html><div>OK</div>')!;
      expect(result.tagName).toBe('div');
    });

    test('HTML 주석 제거', () => {
      const result = parseHTML('<!-- skip --><div>OK</div>')!;
      expect(result.tagName).toBe('div');
    });

    test('HTML 엔티티 디코딩', () => {
      const result = parseHTML('<span>&amp; &lt; &gt; &quot;</span>')!;
      expect(result.textContent).toBe('& < > "');
    });

    test('숫자 엔티티 디코딩', () => {
      const result = parseHTML('<span>&#65;</span>')!;  // A
      expect(result.textContent).toBe('A');
    });

    test('hex 엔티티 디코딩', () => {
      const result = parseHTML('<span>&#x41;</span>')!;  // A
      expect(result.textContent).toBe('A');
    });
  });

  // === bounding rect ===
  describe('style에서 bounding rect 추출', () => {
    test('left/top → boundingRect 위치만, width/height는 rect에 넣지 않음 (styles가 전달)', () => {
      // 스타일 유래 크기가 rect에 들어가면 변환기의 "실측 데이터" 판정이 오발동해
      // Auto Layout이 파괴되므로, 손-HTML의 rect는 위치만 담는다.
      const result = parseHTML('<div style="width: 200px; height: 100px; left: 10px; top: 20px">X</div>')!;
      expect(result.boundingRect).toEqual({ x: 10, y: 20, width: 0, height: 0 });
      expect(result.styles.width).toBe(200);
      expect(result.styles.height).toBe(100);
    });

    test('style 없으면 boundingRect 0', () => {
      const result = parseHTML('<div>X</div>')!;
      expect(result.boundingRect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });
  });

  // === 엣지 케이스 ===
  describe('엣지 케이스', () => {
    test('닫히지 않은 태그 → 크래시 없이 최대한 파싱', () => {
      expect(() => parseHTML('<div><span>no close')).not.toThrow();
    });

    test('잘못 중첩된 태그 → 크래시 없이 처리', () => {
      expect(() => parseHTML('<div><span></div></span>')).not.toThrow();
    });

    test('빈 속성 태그', () => {
      const result = parseHTML('<div id="" class="">X</div>')!;
      expect(result.tagName).toBe('div');
    });

    test('텍스트와 태그 혼합', () => {
      const result = parseHTML('<div>Before<span>Mid</span>After</div>')!;
      // "Before", <span>, "After" — 구현에 따라 children에 텍스트 노드가 올 수 있음
      expect(result).not.toBeNull();
    });
  });
});

describe('parseCSSColor', () => {
  test('유효한 색상 → RGBA 반환', () => {
    const result = parseCSSColor('#ff0000');
    expect(result.r).toBeCloseTo(1, 2);
    expect(result.a).toBe(1);
  });

  test('파싱 불가 → 투명 (0,0,0,0) 반환 (null이 아님!)', () => {
    const result = parseCSSColor('not-a-color');
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test('named color', () => {
    const result = parseCSSColor('blue');
    expect(result.b).toBe(1);
    expect(result.r).toBe(0);
  });

  test('빈 문자열 → 투명', () => {
    const result = parseCSSColor('');
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});
