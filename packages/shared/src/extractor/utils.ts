/**
 * 추출기 공통 유틸리티
 */

export function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseSize(value: string): number {
  if (!value || value === 'auto' || value === 'none' || value === 'normal') {
    return 0;
  }
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

export function parseAutoSize(value: string): number | 'auto' {
  if (value === 'auto') return 'auto';
  return parseSize(value);
}

export function parseBorderSpacing(value: string): { x: number; y: number } {
  if (!value || value === 'normal') return { x: 0, y: 0 };
  const parts = value.split(/\s+/);
  const x = parseFloat(parts[0]) || 0;
  const y = parts.length > 1 ? (parseFloat(parts[1]) || 0) : x;
  return { x, y };
}

export function getClassName(element: Element): string {
  const cn = element.className as unknown;
  if (typeof cn === 'object' && cn !== null && 'baseVal' in cn) {
    return (cn as { baseVal: string }).baseVal || '';
  }
  return (cn as string) || '';
}

export function getDirectTextContent(element: HTMLElement): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent?.trim() || '';
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).tagName === 'BR'
    ) {
      text += '\n';
    }
  }
  return text;
}

export function getAttributes(element: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of element.attributes) {
    if (attr.name !== 'class' && attr.name !== 'style') {
      attrs[attr.name] = attr.value;
    }
  }
  return attrs;
}
