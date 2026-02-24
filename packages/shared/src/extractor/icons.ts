/**
 * 아이콘 폰트 감지 및 이미지 캡처
 *
 * Font Awesome, Material Icons, Bootstrap Icons 등
 * CSS ::before/::after pseudo-element로 글리프를 렌더링하는 아이콘 폰트 요소를 감지하고,
 * canvas를 사용하여 이미지로 캡처합니다.
 */

/** 알려진 아이콘 폰트 클래스 패턴 */
const ICON_CLASS_PATTERN = /\b(fa[bsrl]?|fa-|icon-|material-icons|bi-|glyphicon|argo-icon|mdi-|ri-|ti-|feather-)/;

/** 알려진 아이콘 폰트 패밀리 */
const ICON_FONT_FAMILIES = /font\s*awesome|material\s*icons|bootstrap\s*icons|glyphicons|icomoon|remixicon|tabler/i;

/**
 * 요소가 아이콘 폰트로 사용되는지 감지
 *
 * 감지 기준:
 * 1. 알려진 아이콘 폰트 클래스 패턴 (fa, icon-, material-icons 등)
 * 2. font-family가 알려진 아이콘 폰트
 * 3. textContent가 비어있고 ::before에 content가 있음
 */
export function isIconFontElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'i' && tag !== 'span') return false;

  // 1. 클래스명 패턴 매칭
  const className = typeof element.className === 'string' ? element.className : '';
  if (ICON_CLASS_PATTERN.test(className)) return true;

  // 2. font-family가 아이콘 폰트
  const style = window.getComputedStyle(element);
  if (ICON_FONT_FAMILIES.test(style.fontFamily)) return true;

  // 3. textContent 비어있고 ::before에 content가 있으면 아이콘 폰트
  if (!element.textContent?.trim()) {
    const beforeStyle = window.getComputedStyle(element, '::before');
    const content = beforeStyle.getPropertyValue('content');
    if (content && content !== 'none' && content !== 'normal' && content !== '""') {
      return true;
    }
  }

  return false;
}

/**
 * 아이콘 폰트 요소를 canvas에 렌더링하여 이미지 데이터 URL로 변환
 *
 * ::before pseudo-element의 content와 font-family를 사용하여
 * 2x 스케일 canvas에 렌더링합니다.
 */
export function captureIconAsImage(element: Element): string | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  const style = window.getComputedStyle(element);
  const beforeStyle = window.getComputedStyle(element, '::before');

  // content에서 글리프 문자 추출
  let char = '';
  const content = beforeStyle.getPropertyValue('content');
  if (content && content !== 'none' && content !== 'normal') {
    char = content.replace(/['"]/g, '');
  }
  // Material Icons 리거처 방식: textContent가 아이콘 이름
  if (!char) char = element.textContent || '';
  if (!char) return null;

  const fontSize = parseFloat(style.fontSize) || 16;
  const scale = 2; // retina 대응
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(rect.width * scale);
  canvas.height = Math.ceil(rect.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  // pseudo-element의 fontFamily를 우선 사용 (아이콘 폰트가 ::before에 적용되므로)
  const fontFamily = beforeStyle.fontFamily || style.fontFamily;
  ctx.font = `${style.fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(char, rect.width / 2, rect.height / 2);

  return canvas.toDataURL('image/png');
}
