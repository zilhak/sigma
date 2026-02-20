/**
 * SVG 처리 유틸리티
 *
 * SVG 요소의 computed styles를 인라인 속성으로 적용하여 직렬화하는 로직.
 * Figma createNodeFromSvg() API는 CSS 클래스 스타일을 해석하지 못하므로
 * computed styles를 직접 SVG 속성으로 변환해야 함.
 */

/**
 * computed length 값을 SVG 속성 값으로 변환
 * "10px" -> "10"
 */
export function parseComputedLength(value: string): string {
  if (!value || value === 'auto' || value === 'none') {
    return '0';
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return '0';
  }
  return String(num);
}

/**
 * 개별 SVG 요소에 computed styles 적용
 */
export function applySvgComputedStyles(original: SVGElement, clone: SVGElement): void {
  const computed = window.getComputedStyle(original);

  // 색상 관련 속성
  const fill = computed.fill;
  if (fill && fill !== 'none' && fill !== '') {
    clone.setAttribute('fill', fill);
  }

  const stroke = computed.stroke;
  if (stroke && stroke !== 'none' && stroke !== '') {
    clone.setAttribute('stroke', stroke);
  }

  const strokeWidth = computed.strokeWidth;
  if (strokeWidth && strokeWidth !== '0' && strokeWidth !== '0px') {
    clone.setAttribute('stroke-width', strokeWidth);
  }

  // 불투명도
  const opacity = computed.opacity;
  if (opacity && opacity !== '1') {
    clone.setAttribute('opacity', opacity);
  }

  const fillOpacity = computed.fillOpacity;
  if (fillOpacity && fillOpacity !== '1') {
    clone.setAttribute('fill-opacity', fillOpacity);
  }

  const strokeOpacity = computed.strokeOpacity;
  if (strokeOpacity && strokeOpacity !== '1') {
    clone.setAttribute('stroke-opacity', strokeOpacity);
  }

  // 기하학적 속성
  const tagName = original.tagName.toLowerCase();

  if (tagName === 'circle') {
    if (computed.cx) clone.setAttribute('cx', parseComputedLength(computed.cx));
    if (computed.cy) clone.setAttribute('cy', parseComputedLength(computed.cy));
    if (computed.r) clone.setAttribute('r', parseComputedLength(computed.r));
  }

  if (tagName === 'ellipse') {
    if (computed.cx) clone.setAttribute('cx', parseComputedLength(computed.cx));
    if (computed.cy) clone.setAttribute('cy', parseComputedLength(computed.cy));
    if (computed.rx) clone.setAttribute('rx', parseComputedLength(computed.rx));
    if (computed.ry) clone.setAttribute('ry', parseComputedLength(computed.ry));
  }

  if (tagName === 'rect') {
    if (computed.x) clone.setAttribute('x', parseComputedLength(computed.x));
    if (computed.y) clone.setAttribute('y', parseComputedLength(computed.y));
    if (computed.width && computed.width !== 'auto') clone.setAttribute('width', parseComputedLength(computed.width));
    if (computed.height && computed.height !== 'auto') clone.setAttribute('height', parseComputedLength(computed.height));
    if (computed.rx) clone.setAttribute('rx', parseComputedLength(computed.rx));
    if (computed.ry) clone.setAttribute('ry', parseComputedLength(computed.ry));
  }

  // transform 속성
  const transform = computed.transform;
  if (transform && transform !== 'none') {
    clone.setAttribute('transform', transform);
  }

  // visibility
  if (computed.visibility === 'hidden') {
    clone.setAttribute('visibility', 'hidden');
  }

  // display (none인 경우 visibility로 처리)
  if (computed.display === 'none') {
    clone.setAttribute('visibility', 'hidden');
  }
}

/**
 * SVG 요소의 computed styles를 인라인 속성으로 적용하여 직렬화
 */
export function serializeSvgWithComputedStyles(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originalElements = svg.querySelectorAll('*');
  const cloneElements = clone.querySelectorAll('*');

  // viewBox / width / height가 없는 SVG 보정
  // ReactFlow 등 CSS로만 크기를 지정하는 SVG는 이 속성이 없어
  // Figma createNodeFromSvg()가 좌표계를 잘못 해석함
  const rect = svg.getBoundingClientRect();
  if (!clone.getAttribute('viewBox') && rect.width > 0 && rect.height > 0) {
    clone.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  }
  if (!clone.getAttribute('width') && rect.width > 0) {
    clone.setAttribute('width', String(rect.width));
  }
  if (!clone.getAttribute('height') && rect.height > 0) {
    clone.setAttribute('height', String(rect.height));
  }

  // 루트 SVG 요소에도 스타일 적용
  applySvgComputedStyles(svg, clone);

  // 모든 자식 요소에 스타일 적용
  cloneElements.forEach((cloneEl, index) => {
    const originalEl = originalElements[index];
    if (originalEl && cloneEl) {
      applySvgComputedStyles(originalEl as SVGElement, cloneEl as SVGElement);
    }
  });

  return clone.outerHTML;
}
