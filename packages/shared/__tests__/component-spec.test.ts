import { describe, expect, test } from 'bun:test';
import { validateComponentSpecHtml, isValidSpecName, checkSpecNamingPolicy } from '../src/component-spec';

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

  test('void 태그(br, img) 허용 — img는 base64 data URI', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const html = `<div style="display: flex; padding: 8px;"><img src="${png}" alt="icon"><br></div>`;
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
    const html = '<div style="display: flex;"><span data-sigma-slot="text" style="font-size: 12px; color: #333333; font-weight: 600;">x</span></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });

  test('텍스트 태그가 아닌 요소에 slot 거부', () => {
    const html = '<div><div data-sigma-slot="text">x</div></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('텍스트 태그');
  });

  test('img 원격 URL 거부 (Figma에서 렌더 불가 → 빈 프레임)', () => {
    const html = '<div><img src="https://example.com/logo.png" alt="logo"></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('data URI');
  });

  test('img 상대 경로 거부', () => {
    const html = '<div><img src="x.png" alt="icon"></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('data URI');
  });

  test('img src 누락 거부', () => {
    const html = '<div><img alt="icon"></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('src');
  });
});

describe('validateComponentSpecHtml — 값 수준 검증', () => {
  test('% 단위 거부', () => {
    const result = validateComponentSpecHtml('<div style="width: 100%;"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('px');
  });

  test('rem/em 단위 거부', () => {
    expect(validateComponentSpecHtml('<div style="width: 1.5rem;"></div>').ok).toBe(false);
    expect(validateComponentSpecHtml('<div style="padding: 1em;"></div>').ok).toBe(false);
  });

  test('calc/var 거부', () => {
    expect(validateComponentSpecHtml('<div style="width: calc(100px - 8px);"></div>').ok).toBe(false);
    expect(validateComponentSpecHtml('<div style="color: var(--main);"></div>').ok).toBe(false);
  });

  test('px와 단위 없는 0은 허용', () => {
    const html = '<div style="width: 100px; padding: 0; border-radius: 12px 12px 0 0;"></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });

  test('gradient 배경 거부', () => {
    const result = validateComponentSpecHtml('<div style="background: linear-gradient(90deg, #FF0000, #0000FF);"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('색상으로 해석할 수 없는');
  });

  test('hex/rgb/rgba/색상명은 허용', () => {
    const html = '<div style="background-color: rgba(0,0,0,0.3); color: red; border-color: #1565C0;"></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });

  test('display는 flex만 허용', () => {
    const result = validateComponentSpecHtml('<div style="display: block;"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('display');
  });

  test('justify-content 잘못된 값 거부', () => {
    const result = validateComponentSpecHtml('<div style="display: flex; justify-content: space-around;"></div>');
    expect(result.ok).toBe(false);
  });

  test('text-align은 화이트리스트에서 제외 (정렬은 flex로)', () => {
    const result = validateComponentSpecHtml('<div style="text-align: center;"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('text-align');
  });

  test('inset box-shadow 거부', () => {
    const result = validateComponentSpecHtml('<div style="box-shadow: inset 0 2px 4px #000000;"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('inset');
  });

  test('일반 box-shadow 허용', () => {
    const html = '<div style="box-shadow: 0 4px 12px rgba(0,0,0,0.3);"></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });

  test('font-weight 값 검증', () => {
    expect(validateComponentSpecHtml('<div style="display: flex;"><span style="font-weight: 600;">x</span></div>').ok).toBe(true);
    expect(validateComponentSpecHtml('<div style="display: flex;"><span style="font-weight: 650;">x</span></div>').ok).toBe(false);
  });

  test('font-family 허용 — 단일/폴백 체인/따옴표/한글 폰트명', () => {
    const ok = (style: string) =>
      validateComponentSpecHtml(`<div style="display: flex;"><span style="${style}">x</span></div>`).ok;
    expect(ok('font-family: Pretendard;')).toBe(true);
    expect(ok('font-family: Pretendard, sans-serif;')).toBe(true);
    expect(ok("font-family: 'Noto Sans KR', Pretendard;")).toBe(true);
    expect(ok('font-family: 나눔고딕;')).toBe(true);
  });

  test('font-family 값 검증 — 함수 표기/빈 이름 거부', () => {
    const ok = (style: string) =>
      validateComponentSpecHtml(`<div style="display: flex;"><span style="${style}">x</span></div>`).ok;
    expect(ok('font-family: var(--font-body);')).toBe(false);
    expect(ok('font-family: local(Pretendard);')).toBe(false);
    expect(ok('font-family: Pretendard,;')).toBe(false);
  });

  test('slot에도 font-family 허용', () => {
    const html = '<div style="display: flex;"><span data-sigma-slot="text" style="font-family: Pretendard; font-size: 13px;">x</span></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });
});

describe('validateComponentSpecHtml — 구조 규칙', () => {
  test('자식을 가진 컨테이너에 display: flex 필수', () => {
    const result = validateComponentSpecHtml('<div><span>x</span></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('display: flex');
  });

  test('텍스트 태그는 자식 요소 금지 (leaf 전용)', () => {
    const result = validateComponentSpecHtml('<div style="display: flex;"><p>hello <strong>world</strong></p></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('자식 요소를 가질 수 없습니다');
  });

  test('순수 텍스트 요소의 width/height 거부 (TextNode에서 무시됨)', () => {
    const result = validateComponentSpecHtml('<div style="display: flex;"><span style="width: 200px;">x</span></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('무시');
  });

  test('프레임화된 텍스트 요소(배경 있음)의 width는 허용', () => {
    const html = '<div style="display: flex;"><span style="width: 200px; background-color: #EEEEEE;">x</span></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(true);
  });

  test('position 속성 거부 (배치는 Auto Layout으로만)', () => {
    const result = validateComponentSpecHtml('<div style="position: absolute;"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('position');
  });
});

describe('validateComponentSpecHtml — sizing 유도', () => {
  test('루트 width/height 명시 → fixed', () => {
    const result = validateComponentSpecHtml('<div style="width: 200px; height: 40px;"></div>');
    expect(result.sizing).toEqual({ horizontal: 'fixed', vertical: 'fixed' });
  });

  test('루트 크기 미지정 → hug', () => {
    const result = validateComponentSpecHtml('<div style="display: flex;"><span>x</span></div>');
    expect(result.sizing).toEqual({ horizontal: 'hug', vertical: 'hug' });
  });

  test('width만 명시 → 가로 fixed, 세로 hug', () => {
    const result = validateComponentSpecHtml('<div style="width: 220px;"></div>');
    expect(result.sizing).toEqual({ horizontal: 'fixed', vertical: 'hug' });
  });
});

describe('validateComponentSpecHtml — param 설명(data-sigma-desc)과 ellipsis', () => {
  test('data-sigma-desc → param.description', () => {
    const html = '<div style="display: flex;"><span data-sigma-slot="text" data-sigma-desc="버튼에 표시할 라벨">OK</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(true);
    expect(result.params[0].description).toBe('버튼에 표시할 라벨');
  });

  test('slot 없는 요소의 data-sigma-desc 거부', () => {
    const result = validateComponentSpecHtml('<div data-sigma-desc="x"></div>');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('data-sigma-desc');
  });

  test('고정폭 부모 안의 ellipsis slot → truncates: true', () => {
    const html = '<div style="display: flex; width: 220px;"><span data-sigma-slot="value" style="text-overflow: ellipsis;">Select</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.params[0].truncates).toBe(true);
  });

  test('hug 부모 안의 ellipsis slot 거부', () => {
    const html = '<div style="display: flex;"><span data-sigma-slot="value" style="text-overflow: ellipsis;">Select</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('width가 명시');
  });

  test('slot 아닌 요소의 text-overflow 거부', () => {
    const html = '<div style="display: flex; width: 100px;"><span style="text-overflow: ellipsis;">x</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('slot 요소에서만');
  });

  test('ellipsis 값 외 거부', () => {
    const html = '<div style="display: flex; width: 100px;"><span data-sigma-slot="v" style="text-overflow: clip;">x</span></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(false);
  });

  test('고정폭 부모 안의 wrap slot → wraps: true', () => {
    const html = '<div style="display: flex; width: 260px;"><span data-sigma-slot="note" style="white-space: normal;">memo</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.errors).toEqual([]);
    expect(result.params[0].wraps).toBe(true);
  });

  test('white-space: nowrap은 no-op (wraps 미설정)', () => {
    const html = '<div style="display: flex; width: 260px;"><span data-sigma-slot="note" style="white-space: nowrap;">memo</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(true);
    expect(result.params[0].wraps).toBeUndefined();
  });

  test('hug 부모 안의 wrap slot 거부', () => {
    const html = '<div style="display: flex;"><span data-sigma-slot="note" style="white-space: normal;">memo</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('width가 명시');
  });

  test('ellipsis + wrap 동시 선언 거부', () => {
    const html = '<div style="display: flex; width: 260px;"><span data-sigma-slot="v" style="text-overflow: ellipsis; white-space: normal;">x</span></div>';
    const result = validateComponentSpecHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('함께 쓸 수 없습니다');
  });

  test('slot 아닌 요소의 white-space 거부', () => {
    const html = '<div style="display: flex; width: 100px;"><span style="white-space: normal;">x</span></div>';
    expect(validateComponentSpecHtml(html).ok).toBe(false);
  });
});

describe('checkSpecNamingPolicy — 파일 등록 정책(alias 이름 패턴 경고)', () => {
  const policy = {
    warn: [
      { aliasPattern: '^table$', message: '테이블은 wire/table 프리셋을 쓰세요' },
      { aliasPattern: '^btn_', message: '버튼은 ui_button 권장', namespace: 'design' },
    ],
  };

  test('정책 없음 — 경고 없음', () => {
    expect(checkSpecNamingPolicy(undefined, { alias: 'table', namespace: 'default' })).toEqual([]);
    expect(checkSpecNamingPolicy({}, { alias: 'table', namespace: 'default' })).toEqual([]);
  });

  test('패턴 매칭 시 그 규칙의 message 를 반환', () => {
    expect(checkSpecNamingPolicy(policy, { alias: 'table', namespace: 'default' }))
      .toEqual(['테이블은 wire/table 프리셋을 쓰세요']);
  });

  test('매칭 안 되면 경고 없음', () => {
    expect(checkSpecNamingPolicy(policy, { alias: 'ui_badge', namespace: 'default' })).toEqual([]);
  });

  test('namespace 지정 규칙은 그 namespace 에서만 적용', () => {
    expect(checkSpecNamingPolicy(policy, { alias: 'btn_primary', namespace: 'plan' })).toEqual([]);
    expect(checkSpecNamingPolicy(policy, { alias: 'btn_primary', namespace: 'design' }))
      .toEqual(['버튼은 ui_button 권장']);
  });

  test('여러 규칙이 걸리면 전부 반환', () => {
    const multi = { warn: [
      { aliasPattern: '^tab', message: 'A' },
      { aliasPattern: 'le$', message: 'B' },
    ] };
    expect(checkSpecNamingPolicy(multi, { alias: 'table', namespace: 'default' })).toEqual(['A', 'B']);
  });

  test('잘못된 정규식은 조용히 넘기지 않고 그 사실을 경고로 알린다', () => {
    const broken = { warn: [{ aliasPattern: '[', message: '안 쓰임' }] };
    const out = checkSpecNamingPolicy(broken, { alias: 'table', namespace: 'default' });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('올바른 정규식이 아니라');
  });
});

describe('checkSpecNamingPolicy — HTML/description 조건 (아이콘 창작 금지 같은 규약 집행)', () => {
  // alias 로는 못 잡는다 — 위반은 대부분 "다른 컴포넌트 HTML 안에 inline <svg> 로 묻힌" 형태다.
  const svgRule = {
    warn: [{
      htmlPattern: '<svg',
      unlessDescription: '출처',
      message: '아이콘을 새로 그리지 말고 등록된 icon 세트에서 가져오세요. 부득이하면 description 에 출처를 적으세요.',
    }],
  };

  test('HTML 에 svg 가 있으면 경고한다', () => {
    const w = checkSpecNamingPolicy(svgRule, {
      alias: 'tmplcard', namespace: 'ccp',
      html: '<div style="display: flex;"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg></div>',
      description: '템플릿 카드',
    });
    expect(w.length).toBe(1);
    expect(w[0]).toContain('아이콘');
  });

  test('description 에 출처를 적어 뒀으면 면제', () => {
    const w = checkSpecNamingPolicy(svgRule, {
      alias: 'tmplcard', namespace: 'ccp',
      html: '<div style="display: flex;"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg></div>',
      description: '템플릿 카드 (아이콘 출처: 제품 소스 images/ico/ico_helm.png)',
    });
    expect(w).toEqual([]);
  });

  test('svg 가 없으면 걸리지 않는다', () => {
    const w = checkSpecNamingPolicy(svgRule, {
      alias: 'tmplcard', namespace: 'ccp', html: '<div style="display: flex;">x</div>', description: '카드',
    });
    expect(w).toEqual([]);
  });

  test('html 을 넘기지 않은 호출에서는 html 조건 규칙을 적용하지 않는다', () => {
    expect(checkSpecNamingPolicy(svgRule, { alias: 'tmplcard', namespace: 'ccp' })).toEqual([]);
  });

  test('alias 와 html 을 함께 걸면 둘 다 만족해야 경고', () => {
    const both = { warn: [{ aliasPattern: '^icon_', htmlPattern: '<svg', message: 'x' }] };
    expect(checkSpecNamingPolicy(both, { alias: 'icon_a', namespace: 'n', html: '<div><svg/></div>' }).length).toBe(1);
    expect(checkSpecNamingPolicy(both, { alias: 'btn_a', namespace: 'n', html: '<div><svg/></div>' })).toEqual([]);
    expect(checkSpecNamingPolicy(both, { alias: 'icon_a', namespace: 'n', html: '<div>x</div>' })).toEqual([]);
  });

  test('조건이 하나도 없는 규칙은 전부 매칭되므로 규칙 실수로 알려 준다', () => {
    const w = checkSpecNamingPolicy({ warn: [{ message: 'x' } as never] }, { alias: 'a', namespace: 'n' });
    expect(w.length).toBe(1);
    expect(w[0]).toContain('조건 없는 규칙');
  });
});
