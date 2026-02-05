/**
 * Sigma Discovery Core
 *
 * 페이지 내 DOM 요소 탐색 및 구조 분석 유틸리티.
 * Chrome Extension의 injected.ts에서 검증된 로직을 공유 모듈로 추출.
 */

// ============================================================
// Types
// ============================================================

export interface ElementInfo {
  tagName: string;
  id: string;
  className: string;
  width: number;
  height: number;
  x: number;
  y: number;
  textContent: string;
  selector: string;
}

export interface ContainerOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  fromElement?: Element | string;
}

export interface PageStructure {
  title: string;
  url: string;
  viewport: { width: number; height: number };
  forms: ElementInfo[];
  images: ElementInfo[];
  buttons: ElementInfo[];
  links: number;
  mainContent: ElementInfo | null;
}

// ============================================================
// Internal Helpers
// ============================================================

export function generateSelector(el: Element): string {
  if (el.id) return '#' + el.id;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
    if (classes) return el.tagName.toLowerCase() + '.' + classes;
  }
  return el.tagName.toLowerCase();
}

export function getElementInfo(el: Element): ElementInfo {
  const rect = el.getBoundingClientRect();
  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    className: (typeof el.className === 'string' ? el.className : '').slice(0, 100),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    textContent: (el.textContent || '').slice(0, 50).trim(),
    selector: generateSelector(el),
  };
}

// ============================================================
// Discovery API Functions
// ============================================================

/**
 * alt 속성으로 이미지 찾기
 */
export function findByAlt(altText: string): ElementInfo | null {
  const img =
    document.querySelector('img[alt="' + altText + '"]') ||
    document.querySelector('img[alt*="' + altText + '"]');
  return img ? getElementInfo(img) : null;
}

/**
 * 텍스트 내용으로 요소 찾기 (가장 깊은 매칭 요소 반환)
 */
export function findByText(text: string, tagName?: string): ElementInfo | null {
  const selector = tagName || '*';
  const elements = document.querySelectorAll(selector);
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.textContent && el.textContent.includes(text)) {
      const children = el.querySelectorAll('*');
      for (let j = children.length - 1; j >= 0; j--) {
        const child = children[j];
        if (child.textContent && child.textContent.trim() === text) {
          return getElementInfo(child);
        }
      }
      if (el.childNodes.length <= 3) {
        return getElementInfo(el);
      }
    }
  }
  return null;
}

/**
 * form 요소 찾기
 */
export function findForm(action?: string): ElementInfo | null {
  let form: HTMLFormElement | null = null;
  if (action) {
    form = document.querySelector('form[action*="' + action + '"]');
  }
  if (!form) {
    form = document.querySelector('form');
  }
  return form ? getElementInfo(form) : null;
}

/**
 * 조건에 맞는 컨테이너 찾기 (부모 방향 탐색)
 */
export function findContainer(options: ContainerOptions): ElementInfo | null {
  const minWidth = options.minWidth || 0;
  const minHeight = options.minHeight || 0;
  const maxWidth = options.maxWidth || Infinity;
  const maxHeight = options.maxHeight || Infinity;

  let startEl: Element | null = null;
  if (typeof options.fromElement === 'string') {
    startEl = document.querySelector(options.fromElement);
  } else if (options.fromElement instanceof Element) {
    startEl = options.fromElement;
  } else {
    startEl = document.body.firstElementChild;
  }

  if (!startEl) return null;

  let current: Element | null = startEl;
  while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
    const rect = current.getBoundingClientRect();
    if (
      rect.width >= minWidth &&
      rect.height >= minHeight &&
      rect.width <= maxWidth &&
      rect.height <= maxHeight
    ) {
      return getElementInfo(current);
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * 셀렉터로 요소 정보 조회
 */
export function queryElementInfo(selector: string): ElementInfo | null {
  const el = document.querySelector(selector);
  return el ? getElementInfo(el) : null;
}

/**
 * 페이지 구조 요약
 */
export function getPageStructure(): PageStructure {
  const forms = Array.from(document.querySelectorAll('form')).slice(0, 5).map(getElementInfo);
  const images = Array.from(document.querySelectorAll('img[alt]')).slice(0, 10).map(getElementInfo);
  const buttons = Array.from(
    document.querySelectorAll('button, input[type="submit"], [role="button"]')
  )
    .slice(0, 10)
    .map(getElementInfo);
  const links = document.querySelectorAll('a').length;

  let mainContent: ElementInfo | null = null;
  const main = document.querySelector('main, article, [role="main"]');
  if (main) {
    mainContent = getElementInfo(main);
  } else {
    const candidates = document.querySelectorAll('div');
    let maxArea = 0;
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (
        area > maxArea &&
        rect.width > 300 &&
        rect.height > 200 &&
        rect.width < window.innerWidth * 0.95
      ) {
        maxArea = area;
        mainContent = getElementInfo(el);
      }
    }
  }

  return {
    title: document.title,
    url: window.location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    forms,
    images,
    buttons,
    links,
    mainContent,
  };
}
