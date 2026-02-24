/**
 * 요소 가시성 판단
 */

export function isElementVisible(element: HTMLElement | SVGElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName !== 'body' && tagName !== 'html') {
    if (rect.width === 0 || rect.height === 0) return false;
  }

  // 접근성 hidden 패턴: clip:rect(0,0,0,0)
  if (style.clip === 'rect(0px, 0px, 0px, 0px)') return false;

  // 접근성 hidden 패턴: clipPath:inset(50%)
  if (style.clipPath === 'inset(50%)') return false;

  // 화면 밖 배치 패턴 (-9999px)
  if (style.position === 'absolute' || style.position === 'fixed') {
    if (rect.right < -5000 || rect.bottom < -5000) return false;
  }

  return true;
}
