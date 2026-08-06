/**
 * 컴포넌트 스펙 HTML 검증기
 *
 * 원칙: "표현력은 전부 기존 언어(HTML/CSS)에서 빌리고, 우리가 발명하는 것은 최소한의 표식뿐."
 * 변환기가 손실 없이 Figma로 옮길 수 있다고 보장된 부분집합만 통과시킨다.
 * 벗어나면 조용히 근사하지 않고 **등록을 거부**하며 위반 항목을 구체적으로 알려준다.
 *
 * 검증은 두 층위:
 * 1) 속성 화이트리스트 — 변환기(html-parser)가 지원하는 속성만
 * 2) 값 검증 — 속성이 허용되어도 값이 변환 불가하면 거부
 *    (예: width: 100% → parseFloat가 100px로 오변환, gradient → 투명으로 소실)
 *
 * 구조 규칙:
 * - 컨테이너 태그(div, button)만 자식 요소를 가질 수 있고, 이때 display: flex 명시 필수
 *   (스펙의 배치는 Auto Layout으로만 — 암시적 블록 배치 불가)
 * - 텍스트 태그(span, p, h1~h6 등)는 leaf 전용 (rich text 중첩은 이후 단계)
 * - 길이 값은 px 필수 (0만 단위 생략 허용) — %, rem, em, calc, var 불가
 */

import type { ComponentParam, ComponentSizing, SpecValidationResult } from './types';
import { parseColor } from '../colors';

/** alias / 파라미터 이름 규칙 */
export const SPEC_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** 스펙 HTML 최대 크기 (bytes 아님, 문자 수) */
export const SPEC_HTML_MAX_LENGTH = 50000;

/** 컨테이너 태그 — 자식 요소를 가질 수 있는 유일한 태그 (display: flex 필수) */
export const CONTAINER_TAGS = new Set(['div', 'button']);

/** 텍스트 태그 — leaf 전용, 변환기가 TextNode(또는 프레임+텍스트)로 변환 */
export const TEXT_TAGS = new Set([
  'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong', 'em', 'b', 'i',
]);

/** 자기 종료(void) 태그 */
const VOID_TAGS = new Set(['br', 'img']);

/** 허용 태그 전체 */
export const ALLOWED_TAGS = new Set([...CONTAINER_TAGS, ...TEXT_TAGS, ...VOID_TAGS]);

/**
 * <svg> 벡터 아이콘 — 컨테이너(div/button)의 자식 leaf로만 허용.
 * 빌더(figma-plugin html-parser)가 svg 전체를 svgString으로 캡처해 createNodeFromSvg로
 * 정적 벡터를 만든다. createNodeFromSvg는 정적 path/shape만 안전하게 옮기므로,
 * 애니메이션·스크립트·필터·foreignObject·외부참조 등은 아래에서 차단한다.
 *
 * 태그 비교는 스캐너가 소문자화한 이름 기준(예: linearGradient→lineargradient).
 */
export const SVG_ALLOWED_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'title', 'desc',
]);

/** svg 내부에서 명시적으로 차단하는 요소 (fe* 필터 프리미티브는 접두사로 별도 차단) */
export const SVG_BLOCKED_TAGS = new Set([
  'script', 'style',
  'animate', 'animatetransform', 'animatemotion', 'animatecolor', 'set',
  'foreignobject', 'filter', 'image', 'a', 'iframe', 'switch',
  'use', 'symbol', 'text', 'tspan',
]);

/**
 * 허용 CSS 속성 (kebab-case) — html-parser.ts applyStyleProperty 지원 집합.
 * 여기 없는 속성이 스펙에 들어오면 등록 거부.
 *
 * 의도적 제외:
 * - position/left/top: absolute 배치 표현 불가 — 배치는 Auto Layout(flex)으로만
 * - text-align: TextNode가 hug 폭이라 정렬할 공간이 없어 무시됨 — 정렬은 부모의
 *   justify-content/align-items로 표현
 */
export const ALLOWED_CSS_PROPS = new Set([
  'width', 'height',
  'background-color', 'background', 'color', 'opacity',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
  'flex-wrap', 'flex-grow', 'flex-shrink', 'align-self',
  'overflow',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-radius',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'box-shadow',
  'text-overflow',
  'white-space',
]);

/** 허용 HTML 속성 (style, data-sigma-* 외에는 최소한만) */
const ALLOWED_ATTRS = new Set(['style', 'src', 'alt', 'href']);

/** data-sigma-* 주석 어휘 */
const SIGMA_ATTRS = new Set(['data-sigma-slot', 'data-sigma-desc']);

/** slot을 붙일 수 있는 태그 — 텍스트 태그와 동일 */
export const SLOT_ALLOWED_TAGS = TEXT_TAGS;

/**
 * slot 요소에 허용되는 CSS 속성 — 순수 텍스트 속성만.
 * 배경/패딩/보더가 있으면 변환기가 요소를 프레임으로 감싸 "slot = 단일 TextNode"
 * 보장이 깨지고, width/height는 TextNode에서 무시되므로 모두 거부한다.
 */
export const SLOT_ALLOWED_CSS_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'opacity',
  // ellipsis: 고정폭 컨테이너 안에서 넘치는 텍스트를 …으로 처리 (slot 전용, 단일 행)
  'text-overflow',
  // wrap: 고정폭 컨테이너 안에서 줄바꿈되는 다중 행 텍스트 (slot 전용)
  'white-space',
]);

// ── 값 검증 테이블 ──

/** 길이: px 필수, 0만 단위 생략 허용, 음수 허용(letter-spacing 등) */
const PX_LENGTH_RE = /^-?(0|\d*\.?\d+px)$/;

/** 단일 길이 값 속성 */
const LENGTH_PROPS = new Set([
  'width', 'height', 'gap', 'font-size', 'line-height', 'letter-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
]);

/** 1~4개 길이 값(shorthand) 속성 */
const LENGTH_LIST_PROPS = new Set(['padding', 'border-radius', 'border-width']);

/** 색상 값 속성 — parseColor로 해석 가능해야 함 */
const COLOR_PROPS = new Set([
  'color', 'background-color', 'background',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
]);

/** 단위 없는 숫자 속성 */
const NUMBER_PROPS = new Set(['opacity', 'flex-grow', 'flex-shrink']);

/**
 * 폰트 패밀리 이름 — 영숫자/한글/공백/점/하이픈/밑줄만.
 * 괄호를 막아 var()·local()·url() 같은 함수 표기를 자동으로 배제한다
 * (변환기가 해석할 수 없고, 색상 속성이 var()를 막는 것과 같은 이유).
 */
const FONT_FAMILY_NAME_RE = /^[\w가-힣][\w가-힣 .-]*$/;

/** enum 값 속성 — 변환기가 매핑을 보장하는 값만 */
const ENUM_PROPS: Record<string, string[]> = {
  'display': ['flex'],
  'flex-direction': ['row', 'column'],
  'justify-content': ['flex-start', 'center', 'flex-end', 'space-between'],
  'align-items': ['flex-start', 'center', 'flex-end', 'stretch'],
  'align-self': ['auto', 'flex-start', 'center', 'flex-end', 'stretch'],
  'flex-wrap': ['nowrap', 'wrap'],
  'overflow': ['visible', 'hidden'],
  'text-overflow': ['ellipsis'],
  'white-space': ['normal', 'nowrap'],
};

/** 텍스트 요소를 프레임으로 승격시키는 속성 (이게 있으면 width/height가 유효해짐) */
const FRAME_FORCING_PROPS = new Set([
  'background-color', 'background', 'display',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
]);

export function isValidSpecName(name: string): boolean {
  return SPEC_NAME_RE.test(name);
}

function lengthErrorMsg(v: string): string {
  return `길이 값은 px 단위만 허용 (0만 단위 생략 가능): "${v}" 불가 — %, rem, em, calc(), var()는 변환이 보장되지 않습니다`;
}

/** 속성 값 검증. 문제 없으면 null, 있으면 에러 메시지 반환 */
function validateCssValue(prop: string, value: string): string | null {
  const enumValues = ENUM_PROPS[prop];
  if (enumValues) {
    return enumValues.includes(value)
      ? null
      : `지원하지 않는 값 "${value}" (지원: ${enumValues.join(', ')})`;
  }
  if (prop === 'font-weight') {
    return /^(normal|bold|[1-9]00)$/.test(value)
      ? null
      : `지원하지 않는 값 "${value}" (normal, bold, 100~900)`;
  }
  if (prop === 'font-family') {
    // 폴백 체인(쉼표 구분)을 그대로 허용한다 — 변환기가 앞에서부터 Figma에
    // 실제로 있는 패밀리를 찾고, 하나도 없으면 기본 폰트로 폴백한다.
    const families = value.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
    for (const family of families) {
      if (!family) return `빈 폰트명이 있습니다: "${value}"`;
      if (!FONT_FAMILY_NAME_RE.test(family)) {
        return `폰트명으로 쓸 수 없는 값 "${family}" — 이름만 허용 (var()·local()·url() 등 함수 표기 불가)`;
      }
    }
    return null;
  }
  if (NUMBER_PROPS.has(prop)) {
    return /^\d*\.?\d+$/.test(value) ? null : `단위 없는 숫자만 허용: "${value}" 불가`;
  }
  if (LENGTH_PROPS.has(prop)) {
    return PX_LENGTH_RE.test(value) ? null : lengthErrorMsg(value);
  }
  if (LENGTH_LIST_PROPS.has(prop)) {
    const parts = value.split(/\s+/);
    if (parts.length < 1 || parts.length > 4) {
      return `1~4개의 길이 값이어야 합니다: "${value}"`;
    }
    for (const part of parts) {
      if (!PX_LENGTH_RE.test(part)) return lengthErrorMsg(part);
    }
    return null;
  }
  if (COLOR_PROPS.has(prop)) {
    return parseColor(value)
      ? null
      : `색상으로 해석할 수 없는 값 "${value.length > 40 ? value.slice(0, 40) + '…' : value}" — hex/rgb/rgba/색상명만 지원 (gradient, var() 불가)`;
  }
  if (prop === 'box-shadow') {
    return /\binset\b/.test(value) ? 'inset 그림자는 지원되지 않습니다' : null;
  }
  return null;
}

interface OpenElement {
  tagName: string;
  /** data-sigma-slot 값 (slot 요소인 경우) */
  slotName: string | null;
  /** data-sigma-desc 값 (slot 파라미터 설명) */
  slotDesc: string | null;
  /** white-space: normal (wrap) 선언 여부 */
  slotWraps: boolean;
  /** slot 요소의 텍스트 조각 */
  slotText: string[];
  /** 자식 요소를 가졌는지 */
  hasChildElement: boolean;
  /** 직접 텍스트를 가졌는지 */
  hasText: boolean;
  /** style에 선언된 속성 집합 */
  styleProps: Set<string>;
  /** style 선언 원본(prop → value). 박스모델 검사에 값이 필요하다. */
  styleDecls: Map<string, string>;
  /** display: flex 선언 여부 (컨테이너 필수 규칙용) */
  hasFlexDisplay: boolean;
  /** flex 누락 에러를 이미 냈는지 (자식마다 중복 방지) */
  flexWarned: boolean;
}

/**
 * 스펙 HTML을 검증하고 파라미터를 추출한다.
 * 반환: ok=false면 errors에 모든 위반 사항, ok=true면 params에 추출된 파라미터.
 */
export function validateComponentSpecHtml(html: string): SpecValidationResult {
  const errors: string[] = [];
  const params: ComponentParam[] = [];
  const seenSlotNames = new Set<string>();
  /** 박스모델 검사용 — 루트 선언과 루트의 직계 자식들 */
  let rootDecls: Map<string, string> | null = null;
  const directChildren: Array<{ tagName: string; decls: Map<string, string>; order: number }> = [];
  // 루트 스타일에서 유도하는 축별 크기 동작 (width/height 명시 → fixed, 아니면 hug)
  const sizing: ComponentSizing = { horizontal: 'hug', vertical: 'hug' };

  let source = html.replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!source) {
    return { ok: false, errors: ['HTML이 비어 있습니다'], params: [], sizing };
  }
  if (source.length > SPEC_HTML_MAX_LENGTH) {
    return {
      ok: false,
      errors: [`HTML이 너무 큽니다 (${source.length}자 > 최대 ${SPEC_HTML_MAX_LENGTH}자)`],
      params: [],
      sizing,
    };
  }
  if (/<!DOCTYPE/i.test(source) || /<(html|head|body|style|script)\b/i.test(source)) {
    errors.push('문서 전체(DOCTYPE/html/head/body)나 <style>/<script> 태그는 허용되지 않습니다. 단일 요소 조각만 등록할 수 있습니다');
  }

  const stack: OpenElement[] = [];
  let rootCount = 0;
  let index = 0;

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(source)) !== null) {
    // 태그 사이 텍스트 처리
    const text = source.slice(index, match.index);
    handleText(text);
    index = match.index + match[0].length;

    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const attrsString = match[3];
    const selfClosed = match[4] === '/' || VOID_TAGS.has(tagName);

    // <svg> 벡터 아이콘: 컨테이너의 자식 leaf로 등록하고, 내부는 별도 스캐너로
    // 화이트리스트 검증한다(내부 태그를 일반 스캐너로 흘리지 않도록 </svg>까지 점프).
    if (!isClosing && tagName === 'svg') {
      handleSvgLeaf(attrsString);
      if (!selfClosed) {
        const end = scanSvgInternals(index); // index = 여는 <svg ...> 태그 바로 뒤
        index = end;
        tagRe.lastIndex = end;
      }
      continue;
    }

    if (isClosing) {
      handleCloseTag(tagName);
    } else {
      handleOpenTag(tagName, attrsString, selfClosed);
    }
  }
  // 마지막 태그 이후 텍스트
  handleText(source.slice(index));

  // 닫히지 않은 태그
  for (const open of stack) {
    errors.push(`닫히지 않은 태그: <${open.tagName}>`);
  }
  if (rootCount === 0 && errors.length === 0) {
    errors.push('요소가 없습니다. 단일 루트 요소가 필요합니다');
  }
  if (rootCount > 1) {
    errors.push(`루트 요소는 1개여야 합니다 (현재 ${rootCount}개)`);
  }

  const warnings = rootDecls ? checkBoxModel(rootDecls, directChildren) : [];

  return {
    ok: errors.length === 0,
    errors,
    params,
    sizing,
    ...(warnings.length > 0 ? { warnings } : {}),
  };

  function handleText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (stack.length === 0) {
      errors.push(`루트 요소 밖의 텍스트는 허용되지 않습니다: "${truncate(trimmed)}"`);
      return;
    }
    const current = stack[stack.length - 1];
    current.hasText = true;
    if (current.slotName !== null) {
      current.slotText.push(trimmed);
    }
  }

  /** 현재 열린 부모가 자식 요소를 받을 수 있는지 검사 + 자식 보유 표시 (일반 태그·svg 공용) */
  function registerChild() {
    const parent = stack[stack.length - 1];
    parent.hasChildElement = true;
    if (parent.slotName !== null) {
      errors.push(`slot 요소(<${parent.tagName} data-sigma-slot="${parent.slotName}">)는 자식 요소를 가질 수 없습니다. 텍스트만 허용됩니다`);
    } else if (TEXT_TAGS.has(parent.tagName)) {
      errors.push(`텍스트 태그 <${parent.tagName}>는 자식 요소를 가질 수 없습니다 (rich text 중첩은 이후 단계). 컨테이너가 필요하면 div/button을 사용하세요`);
    } else if (CONTAINER_TAGS.has(parent.tagName) && !parent.hasFlexDisplay && !parent.flexWarned) {
      errors.push(`<${parent.tagName}> 컨테이너에 display: flex가 없습니다 — 자식 요소를 가진 컨테이너는 display: flex를 명시해야 합니다 (배치는 Auto Layout으로만, 암시적 블록 배치 불가)`);
      parent.flexWarned = true;
    }
  }

  /** svg 여는 태그를 아이콘 leaf로 등록: 루트 불가, slot 불가, 자식 규칙(flex) 유지, 여는 태그 속성 차단 검사 */
  function handleSvgLeaf(attrsString: string) {
    if (stack.length === 0) {
      rootCount++;
      errors.push('svg는 루트 요소로 사용할 수 없습니다 (컴포넌트 루트는 div/button만) — svg는 컨테이너의 자식 아이콘으로 넣으세요');
    } else {
      registerChild();
    }
    if (/(?:^|\s)data-sigma-slot\s*=/i.test(attrsString)) {
      errors.push('svg에는 data-sigma-slot을 붙일 수 없습니다 (svg는 텍스트가 아니라 벡터 아이콘 leaf입니다)');
    }
    validateSvgAttrs(attrsString, 'svg');
  }

  /**
   * 여는 <svg ...> 다음(fromIndex)부터 매칭 </svg>까지 내부 태그를 화이트리스트 검증한다.
   * 중첩 svg는 depth 카운트로 안전 처리. 반환값은 매칭 </svg> 바로 뒤 인덱스.
   * 내부는 일반 스캐너(handleOpenTag/CloseTag)로 흘리지 않으므로 stack에 영향 없음.
   */
  function scanSvgInternals(fromIndex: number): number {
    const innerRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
    innerRe.lastIndex = fromIndex;
    let depth = 1; // 이미 여는 <svg> 안
    let m: RegExpExecArray | null;
    while ((m = innerRe.exec(source)) !== null) {
      const closing = m[1] === '/';
      const name = m[2].toLowerCase();
      const attrs = m[3];
      if (name === 'svg') {
        if (closing) {
          depth--;
          if (depth === 0) return innerRe.lastIndex; // </svg> 뒤
        } else {
          depth++;
          validateSvgAttrs(attrs, 'svg');
        }
        continue;
      }
      if (closing) continue; // 내부 닫는 태그는 검증 대상 아님
      validateSvgTag(name, attrs);
    }
    errors.push('닫히지 않은 <svg> 태그');
    return source.length;
  }

  /** svg 내부 여는 태그 1개를 검증: 허용 목록 통과, 차단 목록/fe* 거부, 그 외 미지원 거부 */
  function validateSvgTag(name: string, attrsString: string) {
    if (SVG_ALLOWED_TAGS.has(name)) {
      validateSvgAttrs(attrsString, name);
      return;
    }
    if (SVG_BLOCKED_TAGS.has(name) || name.startsWith('fe')) {
      errors.push(`svg 내부에 허용되지 않는 요소: <${name}> — 애니메이션/스크립트/필터/외부참조 등은 정적 벡터로 변환되지 않아 차단됩니다`);
      return;
    }
    errors.push(`svg 내부에 알 수 없는 요소: <${name}> (허용: ${Array.from(SVG_ALLOWED_TAGS).join(', ')})`);
  }

  /** svg 태그(루트/내부 공용) 속성 차단 검사: on* 이벤트, href/xlink:href, style 내 url()/expression */
  function validateSvgAttrs(attrsString: string, tagLabel: string) {
    const onMatch = attrsString.match(/(?:^|\s)(on[a-z]+)\s*=/i);
    if (onMatch) {
      errors.push(`svg 이벤트 핸들러 속성은 허용되지 않습니다: ${onMatch[1]} (<${tagLabel}>)`);
    }
    if (/(?:^|\s)(?:xlink:)?href\s*=/i.test(attrsString)) {
      errors.push(`svg의 href/xlink:href는 허용되지 않습니다 (<${tagLabel}>) — 외부/내부 참조·<use>는 이번 단계에서 차단됩니다`);
    }
    const styleMatch = attrsString.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (styleMatch) {
      const v = (styleMatch[1] || styleMatch[2] || '').toLowerCase();
      if (v.includes('url(') || v.includes('expression')) {
        errors.push(`svg style 속성에 url()/expression은 허용되지 않습니다 (<${tagLabel}>)`);
      }
    }
  }

  function handleOpenTag(tagName: string, attrsString: string, selfClosed: boolean) {
    if (!ALLOWED_TAGS.has(tagName)) {
      errors.push(`허용되지 않는 태그: <${tagName}> (허용: ${Array.from(ALLOWED_TAGS).join(', ')})`);
    }
    if (stack.length === 0) {
      rootCount++;
    } else {
      registerChild();
    }

    const { attrs, bareAttrs } = parseAttrs(attrsString);
    for (const bare of bareAttrs) {
      errors.push(`값 없는 속성은 허용되지 않습니다: ${bare}`);
    }

    let slotName: string | null = null;
    let slotDesc: string | null = null;
    for (const name of Object.keys(attrs)) {
      if (name === 'data-sigma-slot') {
        slotName = attrs[name];
      } else if (name === 'data-sigma-desc') {
        slotDesc = attrs[name];
      } else if (name.startsWith('data-sigma-')) {
        if (!SIGMA_ATTRS.has(name)) {
          errors.push(`알 수 없는 data-sigma-* 속성: ${name} (지원: ${Array.from(SIGMA_ATTRS).join(', ')})`);
        }
      } else if (name === 'class') {
        errors.push('class 속성은 아직 지원되지 않습니다 (클래스 기반 CSS는 variant 단계에서 도입). 스타일은 inline style로 작성하세요');
      } else if (!ALLOWED_ATTRS.has(name)) {
        errors.push(`허용되지 않는 속성: ${name} (허용: ${Array.from(ALLOWED_ATTRS).join(', ')}, data-sigma-*)`);
      }
    }

    // <img>는 base64 data URI만 렌더된다. 원격 URL은 Figma 플러그인이 네트워크로
    // 가져올 수 없어 조용히 빈 플레이스홀더 프레임이 되므로 등록 단계에서 거부한다.
    if (tagName === 'img') {
      const src = attrs['src'];
      if (src === undefined || src === '') {
        errors.push('<img>에는 src가 필요합니다 (base64 data URI)');
      } else if (src.indexOf('data:image/') !== 0) {
        errors.push(
          `<img src>는 base64 data URI만 허용됩니다 ("data:image/…") — 원격 URL·파일 경로는 Figma에서 렌더되지 않고 빈 프레임이 됩니다: "${src.slice(0, 40)}${src.length > 40 ? '…' : ''}"`
        );
      }
    }

    const styleProps = attrs['style'] !== undefined
      ? validateStyle(attrs['style'], tagName, slotName !== null)
      : new Set<string>();
    const styleDecls = parseStyleDecls(attrs['style']);

    // 첫 루트 요소의 width/height 명시 여부 → 컴포넌트 크기 동작(sizing)
    if (stack.length === 0 && rootCount === 1) {
      sizing.horizontal = styleProps.has('width') ? 'fixed' : 'hug';
      sizing.vertical = styleProps.has('height') ? 'fixed' : 'hug';
      rootDecls = styleDecls;
    }
    // 루트의 직계 자식 — 박스모델 비교 대상
    if (stack.length === 1 && rootCount === 1) {
      directChildren.push({ tagName, decls: styleDecls, order: directChildren.length + 1 });
    }

    if (slotDesc !== null && slotName === null) {
      errors.push('data-sigma-desc는 data-sigma-slot이 있는 요소에만 붙일 수 있습니다 (파라미터 설명용)');
    }

    // white-space: normal 선언 여부 (wrap — nowrap은 기본 동작이라 no-op)
    const slotWraps = attrs['style'] !== undefined
      && /white-space\s*:\s*normal/i.test(attrs['style']);

    if (slotName !== null) {
      // ellipsis(단일 행 …)와 wrap(다중 행 줄바꿈)은 상호배타
      if (styleProps.has('text-overflow') && slotWraps) {
        errors.push(`slot "${slotName}"에 text-overflow: ellipsis와 white-space: normal을 함께 쓸 수 없습니다 — 단일 행 …처리 또는 다중 행 줄바꿈 중 하나만`);
      }
      // ellipsis/wrap slot은 직계 부모 컨테이너가 고정폭이어야 동작
      // (텍스트를 FILL로 늘리므로 hug 부모에서는 무의미 + Figma 순환 참조 에러)
      if (styleProps.has('text-overflow') || slotWraps) {
        const parent = stack.length > 0 ? stack[stack.length - 1] : null;
        if (!parent || !parent.styleProps.has('width')) {
          const mode = slotWraps ? 'white-space: normal(wrap)' : 'text-overflow: ellipsis';
          errors.push(`${mode} slot("${slotName}")은 직계 부모 컨테이너에 width가 명시되어야 합니다 — 고정폭 안에서만 동작합니다`);
        }
      }
      if (!SLOT_ALLOWED_TAGS.has(tagName)) {
        errors.push(`data-sigma-slot은 텍스트 태그에만 붙일 수 있습니다: <${tagName}> 불가 (허용: ${Array.from(SLOT_ALLOWED_TAGS).join(', ')})`);
      }
      if (!isValidSpecName(slotName)) {
        errors.push(`잘못된 slot 이름: "${slotName}" (규칙: ${SPEC_NAME_RE.source})`);
      } else if (seenSlotNames.has(slotName)) {
        errors.push(`중복된 slot 이름: "${slotName}"`);
      } else {
        seenSlotNames.add(slotName);
      }
      if (stack.length === 0) {
        errors.push('data-sigma-slot은 루트 요소에 붙일 수 없습니다 (루트는 컨테이너 프레임이 됩니다)');
        slotName = null;
      }
      if (selfClosed && slotName !== null) {
        errors.push(`data-sigma-slot은 텍스트를 가진 요소에만 붙일 수 있습니다 (<${tagName}>는 void 태그)`);
        slotName = null;
      }
    }

    if (selfClosed) return;

    stack.push({
      tagName,
      slotName,
      slotDesc,
      slotWraps,
      slotText: [],
      hasChildElement: false,
      hasText: false,
      styleProps,
      styleDecls,
      hasFlexDisplay: styleProps.has('display'),
      flexWarned: false,
    });
  }

  function handleCloseTag(tagName: string) {
    if (stack.length === 0) {
      errors.push(`여는 태그 없는 닫는 태그: </${tagName}>`);
      return;
    }
    const open = stack.pop() as OpenElement;
    if (open.tagName !== tagName) {
      errors.push(`태그 짝이 맞지 않습니다: <${open.tagName}> ... </${tagName}>`);
    }
    if (open.slotName !== null && !open.hasChildElement) {
      const defaultValue = open.slotText.join(' ');
      if (!defaultValue) {
        errors.push(`slot "${open.slotName}" 요소에 기본 텍스트가 없습니다. 기본값으로 쓸 텍스트를 넣으세요`);
      } else {
        const param: ComponentParam = { name: open.slotName, type: 'text', defaultValue };
        if (open.slotDesc && open.slotDesc.trim()) {
          param.description = open.slotDesc.trim();
        }
        if (open.styleProps.has('text-overflow')) {
          param.truncates = true;
        }
        if (open.slotWraps) {
          param.wraps = true;
        }
        params.push(param);
      }
    }

    // 순수 텍스트 요소(TextNode로 변환됨)의 width/height는 변환기가 무시한다.
    // 조용한 무시 대신 거부하고 대안을 안내한다.
    if (
      open.slotName === null &&
      TEXT_TAGS.has(open.tagName) &&
      !open.hasChildElement &&
      open.hasText &&
      (open.styleProps.has('width') || open.styleProps.has('height'))
    ) {
      const framePromoting = Array.from(open.styleProps).some((p) => FRAME_FORCING_PROPS.has(p));
      if (!framePromoting) {
        errors.push(
          `순수 텍스트 요소 <${open.tagName}>의 width/height는 무시됩니다(TextNode로 변환됨) — 크기가 필요하면 부모 컨테이너(div)로 감싸 크기를 주세요`
        );
      }
    }
  }

  function validateStyle(styleStr: string, tagName: string, isSlot: boolean): Set<string> {
    const props = new Set<string>();
    const rules = styleStr.split(';');
    for (const rule of rules) {
      const trimmedRule = rule.trim();
      if (!trimmedRule) continue;
      const colonIndex = trimmedRule.indexOf(':');
      if (colonIndex === -1) {
        errors.push(`<${tagName}> style의 잘못된 선언: "${truncate(trimmedRule)}"`);
        continue;
      }
      const prop = trimmedRule.slice(0, colonIndex).trim().toLowerCase();
      const value = trimmedRule.slice(colonIndex + 1).trim();
      if (!value) {
        errors.push(`<${tagName}> style의 값 없는 속성: "${prop}"`);
        continue;
      }
      props.add(prop);
      if (!ALLOWED_CSS_PROPS.has(prop)) {
        errors.push(`<${tagName}> style의 허용되지 않는 CSS 속성: "${prop}" — 변환이 보장되지 않는 속성은 등록할 수 없습니다`);
        continue;
      }
      if ((prop === 'text-overflow' || prop === 'white-space') && !isSlot) {
        errors.push(`${prop}는 data-sigma-slot 요소에서만 허용됩니다 (<${tagName}>는 slot이 아님)`);
        continue;
      }
      if (isSlot && !SLOT_ALLOWED_CSS_PROPS.has(prop)) {
        errors.push(`slot 요소(<${tagName}>)에는 텍스트 속성만 허용됩니다: "${prop}" 불가 — 배경/패딩/보더/크기는 부모 컨테이너에 두세요 (허용: ${Array.from(SLOT_ALLOWED_CSS_PROPS).join(', ')})`);
        continue;
      }
      const valueError = validateCssValue(prop, value);
      if (valueError) {
        errors.push(`<${tagName}> style의 ${prop}: ${valueError}`);
      }
    }
    return props;
  }
}

function parseAttrs(attrsString: string): { attrs: Record<string, string>; bareAttrs: string[] } {
  const attrs: Record<string, string> = {};
  const bareAttrs: string[] = [];
  // 값 있는 속성 매칭 후 제거 → 남는 토큰은 값 없는(bare) 속성
  const valuedRe = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let rest = attrsString;
  let m: RegExpExecArray | null;

  while ((m = valuedRe.exec(attrsString)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2]
                : m[3] !== undefined ? m[3]
                : m[4] !== undefined ? m[4]
                : '';
    attrs[name] = value;
    rest = rest.replace(m[0], ' ');
  }

  for (const token of rest.split(/\s+/)) {
    const cleaned = token.replace(/\/$/, '').trim();
    if (cleaned) bareAttrs.push(cleaned);
  }

  return { attrs, bareAttrs };
}

function truncate(s: string): string {
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

// ─────────────────────────────────────────────────────────────────────────────
// 박스모델 검사 (경고 — 거부하지 않는다)
//
// 스펙 루트에 height 와 border-width 를 같이 주면 **내용상자는 height − 위아래 border** 다.
// 그런데 자식을 height 그대로 잡는 실수가 잦고, 그 결과는 등록 시점엔 안 보이다가
// 인스턴스마다 child_overflow 로 돌아온다 — 표 셀 스펙 하나로 **한 번에 250건**이 난 적이 있다.
// 사후에는 이미 찍힌 인스턴스를 전부 손봐야 하므로, 등록 때 1건으로 말해 주는 편이 압도적으로 싸다.
// ─────────────────────────────────────────────────────────────────────────────

/** style 속성 원문을 prop → value 로. 값 검증은 validateStyle 이 따로 한다. */
function parseStyleDecls(style: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!style) return out;
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (prop) out.set(prop, value);
  }
  return out;
}

/** "12px" → 12, "0" → 0, 그 밖(%, calc, auto…) → null(판정 보류) */
function pxValue(value: string | undefined): number | null {
  if (value === undefined) return null;
  const t = value.trim();
  if (t === '0') return 0;
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(t);
  return m ? parseFloat(m[1]) : null;
}

/** 1~4개 길이 shorthand → [top, right, bottom, left]. 하나라도 px 가 아니면 null. */
function shorthandSides(value: string | undefined): [number, number, number, number] | null {
  if (value === undefined) return null;
  const parts = value.trim().split(/\s+/);
  const nums = parts.map(pxValue);
  if (nums.some((n) => n === null)) return null;
  const [a, b, c, d] = nums as number[];
  if (parts.length === 1) return [a, a, a, a];
  if (parts.length === 2) return [a, b, a, b];
  if (parts.length === 3) return [a, b, c, b];
  if (parts.length === 4) return [a, b, c, d];
  return null;
}

/** shorthand + per-side 를 합쳐 네 변 값을 낸다(per-side 가 이긴다). 값이 없으면 0. */
function edges(
  decls: Map<string, string>,
  shorthand: string,
  perSide: [string, string, string, string],
): [number, number, number, number] {
  const base = shorthandSides(decls.get(shorthand)) || [0, 0, 0, 0];
  const out: [number, number, number, number] = [base[0], base[1], base[2], base[3]];
  perSide.forEach((prop, i) => {
    const v = pxValue(decls.get(prop));
    if (v !== null) out[i] = v;
  });
  return out;
}

const BOX_TOLERANCE = 0.5;

/**
 * 루트의 내용상자보다 큰 **직계 자식**을 경고로 낸다.
 * 판정은 둘 다 px 로 명시됐을 때만 — 하나라도 hug(미지정)면 넘침을 단정할 수 없어 건너뛴다.
 */
function checkBoxModel(
  rootDecls: Map<string, string>,
  children: Array<{ tagName: string; decls: Map<string, string>; order: number }>,
): string[] {
  const out: string[] = [];
  const rootW = pxValue(rootDecls.get('width'));
  const rootH = pxValue(rootDecls.get('height'));
  if (rootW === null && rootH === null) return out;

  const pad = edges(rootDecls, 'padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
  const bor = edges(rootDecls, 'border-width', ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']);

  const insetX = pad[1] + pad[3] + bor[1] + bor[3];
  const insetY = pad[0] + pad[2] + bor[0] + bor[2];
  const contentW = rootW === null ? null : rootW - insetX;
  const contentH = rootH === null ? null : rootH - insetY;

  const why = (axis: 'width' | 'height', root: number, content: number, inset: number) =>
    `루트 ${axis} ${root}px 에서 border·padding ${inset}px 를 빼면 내용상자는 ${content}px 입니다`;

  for (const child of children) {
    const cw = pxValue(child.decls.get('width'));
    const ch = pxValue(child.decls.get('height'));

    if (contentW !== null && cw !== null && cw > contentW + BOX_TOLERANCE) {
      out.push(
        `${why('width', rootW as number, contentW, insetX)} — ${child.order}번째 자식 <${child.tagName}> 의 width 가 ${cw}px 라 넘칩니다. ` +
        `등록은 되지만 **인스턴스마다 child_overflow 가 납니다**. 자식을 ${contentW}px 로 줄이거나 루트 width 를 ${cw + insetX}px 로 키우세요.`
      );
    }
    if (contentH !== null && ch !== null && ch > contentH + BOX_TOLERANCE) {
      out.push(
        `${why('height', rootH as number, contentH, insetY)} — ${child.order}번째 자식 <${child.tagName}> 의 height 가 ${ch}px 라 넘칩니다. ` +
        `등록은 되지만 **인스턴스마다 child_overflow 가 납니다**. 자식을 ${contentH}px 로 줄이거나 루트 height 를 ${ch + insetY}px 로 키우세요.`
      );
    }
  }
  return out;
}
