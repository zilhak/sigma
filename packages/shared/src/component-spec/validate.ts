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
  'font-size', 'font-weight', 'line-height', 'letter-spacing',
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
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'opacity',
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

  return { ok: errors.length === 0, errors, params, sizing };

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

  function handleOpenTag(tagName: string, attrsString: string, selfClosed: boolean) {
    if (!ALLOWED_TAGS.has(tagName)) {
      errors.push(`허용되지 않는 태그: <${tagName}> (허용: ${Array.from(ALLOWED_TAGS).join(', ')})`);
    }
    if (stack.length === 0) {
      rootCount++;
    } else {
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

    const styleProps = attrs['style'] !== undefined
      ? validateStyle(attrs['style'], tagName, slotName !== null)
      : new Set<string>();

    // 첫 루트 요소의 width/height 명시 여부 → 컴포넌트 크기 동작(sizing)
    if (stack.length === 0 && rootCount === 1) {
      sizing.horizontal = styleProps.has('width') ? 'fixed' : 'hug';
      sizing.vertical = styleProps.has('height') ? 'fixed' : 'hug';
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
