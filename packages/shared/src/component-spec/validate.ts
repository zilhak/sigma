/**
 * 컴포넌트 스펙 HTML 검증기
 *
 * 원칙: "표현력은 전부 기존 언어(HTML/CSS)에서 빌리고, 우리가 발명하는 것은 최소한의 표식뿐."
 * 변환기가 손실 없이 Figma로 옮길 수 있다고 보장된 부분집합만 통과시킨다.
 * 벗어나면 조용히 근사하지 않고 **등록을 거부**하며 위반 항목을 구체적으로 알려준다.
 *
 * 주의: 이 검증기는 서버(등록 시점)용 경량 스캐너다. 실제 Figma 변환은
 * figma-plugin의 html-parser가 수행한다. 화이트리스트는 html-parser의
 * applyStyleProperty가 지원하는 속성 집합과 일치해야 한다.
 */

import type { ComponentParam, SpecValidationResult } from './types';

/** alias / 파라미터 이름 규칙 */
export const SPEC_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** 스펙 HTML 최대 크기 (bytes 아님, 문자 수) */
export const SPEC_HTML_MAX_LENGTH = 50000;

/** 허용 태그 (컨테이너/텍스트 계열만 — 폼·미디어·svg는 이후 단계) */
export const ALLOWED_TAGS = new Set([
  'div', 'span', 'p',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'b', 'i',
  'button', 'a',
  'img', 'br',
]);

/** 자기 종료(void) 태그 */
const VOID_TAGS = new Set(['br', 'img']);

/**
 * 허용 CSS 속성 (kebab-case) — html-parser.ts applyStyleProperty 지원 집합.
 * 여기 없는 속성이 스펙에 들어오면 등록 거부.
 */
export const ALLOWED_CSS_PROPS = new Set([
  'width', 'height',
  'background-color', 'background', 'color', 'opacity',
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
  'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
  'flex-wrap', 'flex-grow', 'flex-shrink', 'align-self',
  'overflow', 'position',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-radius',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'box-shadow',
]);

/** 허용 HTML 속성 (style, data-sigma-* 외에는 최소한만) */
const ALLOWED_ATTRS = new Set(['style', 'src', 'alt', 'href']);

/** data-sigma-* 주석 어휘 (MVP: slot만) */
const SIGMA_ATTRS = new Set(['data-sigma-slot']);

/**
 * slot을 붙일 수 있는 태그 — 변환기(node-creator isTextOnlyElement)가
 * TextNode로 변환하는 텍스트 태그와 교집합.
 */
export const SLOT_ALLOWED_TAGS = new Set([
  'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong', 'em', 'b', 'i',
]);

/**
 * slot 요소에 허용되는 CSS 속성 — 텍스트 속성만.
 * 배경/패딩/보더/flex가 있으면 변환기가 요소를 프레임으로 감싸
 * "slot = 단일 TextNode" 보장이 깨지므로 거부한다 (그런 장식은 부모 컨테이너에).
 */
export const SLOT_ALLOWED_CSS_PROPS = new Set([
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
  'color', 'opacity', 'width', 'height',
]);

export function isValidSpecName(name: string): boolean {
  return SPEC_NAME_RE.test(name);
}

interface OpenElement {
  tagName: string;
  /** data-sigma-slot 값 (slot 요소인 경우) */
  slotName: string | null;
  /** slot 요소의 텍스트 조각 */
  slotText: string[];
  /** 자식 요소를 가졌는지 (slot leaf 검증용) */
  hasChildElement: boolean;
}

/**
 * 스펙 HTML을 검증하고 파라미터를 추출한다.
 * 반환: ok=false면 errors에 모든 위반 사항, ok=true면 params에 추출된 파라미터.
 */
export function validateComponentSpecHtml(html: string): SpecValidationResult {
  const errors: string[] = [];
  const params: ComponentParam[] = [];
  const seenSlotNames = new Set<string>();

  let source = html.replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!source) {
    return { ok: false, errors: ['HTML이 비어 있습니다'], params: [] };
  }
  if (source.length > SPEC_HTML_MAX_LENGTH) {
    return {
      ok: false,
      errors: [`HTML이 너무 큽니다 (${source.length}자 > 최대 ${SPEC_HTML_MAX_LENGTH}자)`],
      params: [],
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

  return { ok: errors.length === 0, errors, params };

  function handleText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (stack.length === 0) {
      errors.push(`루트 요소 밖의 텍스트는 허용되지 않습니다: "${truncate(trimmed)}"`);
      return;
    }
    const current = stack[stack.length - 1];
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
      }
    }

    const { attrs, bareAttrs } = parseAttrs(attrsString);
    for (const bare of bareAttrs) {
      errors.push(`값 없는 속성은 허용되지 않습니다: ${bare}`);
    }

    let slotName: string | null = null;
    for (const name of Object.keys(attrs)) {
      if (name === 'data-sigma-slot') {
        slotName = attrs[name];
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

    if (attrs['style'] !== undefined) {
      validateStyle(attrs['style'], tagName, slotName !== null);
    }

    if (slotName !== null) {
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

    stack.push({ tagName, slotName, slotText: [], hasChildElement: false });
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
        params.push({ name: open.slotName, type: 'text', defaultValue });
      }
    }
  }

  function validateStyle(styleStr: string, tagName: string, isSlot: boolean) {
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
      if (!ALLOWED_CSS_PROPS.has(prop)) {
        errors.push(`<${tagName}> style의 허용되지 않는 CSS 속성: "${prop}" — 변환이 보장되지 않는 속성은 등록할 수 없습니다`);
      } else if (isSlot && !SLOT_ALLOWED_CSS_PROPS.has(prop)) {
        errors.push(`slot 요소(<${tagName}>)에는 텍스트 속성만 허용됩니다: "${prop}" 불가 — 배경/패딩/보더 등 장식은 부모 컨테이너에 두세요 (허용: ${Array.from(SLOT_ALLOWED_CSS_PROPS).join(', ')})`);
      }
    }
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
