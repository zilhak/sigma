/**
 * 텍스트 병합 로직
 *
 * 인라인 텍스트 태그(span, strong, em 등)만으로 구성된 요소를
 * 개별 노드로 분리하지 않고 하나의 텍스트로 병합하는 로직.
 */
import { isIconFontElement } from './icons';

/**
 * 순수 텍스트 포매팅용 인라인 태그 목록
 * 시각적 스타일 없이 텍스트만 꾸미는 태그들
 */
const INLINE_TEXT_TAGS = new Set([
  'span', 'strong', 'em', 'b', 'i', 'a', 'br', 'code', 'small',
  'sub', 'sup', 'mark', 'abbr', 'cite', 'q', 'time', 'kbd', 'var', 'samp',
]);

/**
 * 요소의 모든 자식이 순수 인라인 텍스트 콘텐츠인지 확인
 * true이면 자식을 개별 노드로 분리하지 않고 텍스트로 병합 가능
 */
export function isAllInlineTextContent(element: HTMLElement): boolean {
  for (const child of element.children) {
    const tag = child.tagName.toLowerCase();
    if (!INLINE_TEXT_TAGS.has(tag)) return false;

    // 인라인 태그라도 시각적 스타일(배경, 테두리, 패딩)이 있으면 병합하지 않음
    if (tag !== 'br') {
      // 아이콘 폰트 요소는 인라인 텍스트가 아님
      if (isIconFontElement(child)) return false;

      // textContent가 비어있는데 시각적 크기가 있으면 병합 금지
      // (아이콘 폰트 외에도, 커스텀 아이콘이나 장식 요소를 보호)
      if (!child.textContent?.trim() && child.getBoundingClientRect().width > 0) {
        return false;
      }

      const style = window.getComputedStyle(child);

      // flex/grid 컨테이너는 내부 레이아웃(justifyContent 등)이 시각적 정렬에 영향 → 병합 금지
      const displayVal = style.display;
      if (displayVal === 'flex' || displayVal === 'inline-flex' ||
          displayVal === 'grid' || displayVal === 'inline-grid') {
        return false;
      }

      const bgColor = style.backgroundColor;
      // transparent나 rgba(0,0,0,0)이 아닌 배경색이 있으면 시각적 요소
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        return false;
      }
      if (parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderBottomWidth) > 0) {
        return false;
      }
      if (parseFloat(style.paddingTop) > 2 || parseFloat(style.paddingBottom) > 2) {
        return false;
      }
    }

    // 재귀: 자식의 자식도 인라인이어야 함
    if (child.children.length > 0 && !isAllInlineTextContent(child as HTMLElement)) {
      return false;
    }
  }
  return true;
}

/**
 * 요소의 전체 인라인 콘텐츠를 순서대로 하나의 텍스트로 병합
 * text node, <br>, inline element 텍스트를 DOM 순서 그대로 수집
 */
export function getFullInlineTextContent(element: HTMLElement): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) text += t;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'BR') {
        text += '\n';
      } else {
        // 인라인 자식 재귀
        text += getFullInlineTextContent(el);
      }
    }
  }
  return text;
}
