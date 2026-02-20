/**
 * Sigma Diff Core
 *
 * ExtractedNode 비교 로직.
 * 두 추출 결과의 구조적 차이를 분석합니다.
 */

import type { ExtractedNode, RGBA } from '../types';

// ============================================================
// Types
// ============================================================

export interface Difference {
  path: string;
  type: 'added' | 'removed' | 'changed' | 'structure';
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface DiffResult {
  equal: boolean;
  differences: Difference[];
  summary: {
    added: number;
    removed: number;
    changed: number;
    structure: number;
  };
}

// ============================================================
// Diff Logic
// ============================================================

/**
 * 두 ExtractedNode의 구조적 차이를 비교
 */
export function compare(nodeA: ExtractedNode, nodeB: ExtractedNode): DiffResult {
  const differences: Difference[] = [];
  compareNodes(nodeA, nodeB, '', differences);

  const summary = {
    added: differences.filter((d) => d.type === 'added').length,
    removed: differences.filter((d) => d.type === 'removed').length,
    changed: differences.filter((d) => d.type === 'changed').length,
    structure: differences.filter((d) => d.type === 'structure').length,
  };

  return {
    equal: differences.length === 0,
    differences,
    summary,
  };
}

function compareNodes(
  a: ExtractedNode,
  b: ExtractedNode,
  path: string,
  diffs: Difference[]
): void {
  const nodePath = path || `<${a.tagName}>`;

  // 태그 변경
  if (a.tagName !== b.tagName) {
    diffs.push({
      path: nodePath,
      type: 'structure',
      description: `태그 변경: <${a.tagName}> → <${b.tagName}>`,
      oldValue: a.tagName,
      newValue: b.tagName,
    });
  }

  // 텍스트 변경
  if (a.textContent !== b.textContent) {
    diffs.push({
      path: nodePath,
      type: 'changed',
      description: `텍스트 변경`,
      oldValue: a.textContent.slice(0, 100),
      newValue: b.textContent.slice(0, 100),
    });
  }

  // 클래스 변경
  if (a.className !== b.className) {
    diffs.push({
      path: nodePath,
      type: 'changed',
      description: `클래스 변경`,
      oldValue: a.className,
      newValue: b.className,
    });
  }

  // 스타일 비교
  compareStyles(a.styles, b.styles, nodePath, diffs);

  // 크기 변경
  compareBoundingRect(a, b, nodePath, diffs);

  // 속성 비교
  compareAttributes(a.attributes, b.attributes, nodePath, diffs);

  // 자식 노드 비교
  compareChildren(a.children, b.children, nodePath, diffs);
}

function compareStyles(
  a: ExtractedNode['styles'],
  b: ExtractedNode['styles'],
  path: string,
  diffs: Difference[]
): void {
  const styleKeys: (keyof ExtractedNode['styles'])[] = [
    'display',
    'position',
    'flexDirection',
    'justifyContent',
    'alignItems',
    'gap',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'backgroundColor',
    'color',
    'fontSize',
    'fontFamily',
    'fontWeight',
    'borderTopWidth',
    'borderTopLeftRadius',
    'opacity',
    'boxShadow',
  ];

  for (const key of styleKeys) {
    const valA = a[key];
    const valB = b[key];

    if (!isEqual(valA, valB)) {
      diffs.push({
        path: `${path}.styles.${key}`,
        type: 'changed',
        description: `스타일 변경: ${key}`,
        oldValue: formatStyleValue(valA),
        newValue: formatStyleValue(valB),
      });
    }
  }
}

function compareBoundingRect(
  a: ExtractedNode,
  b: ExtractedNode,
  path: string,
  diffs: Difference[]
): void {
  const rectA = a.boundingRect;
  const rectB = b.boundingRect;

  const widthDiff = Math.abs(rectA.width - rectB.width);
  const heightDiff = Math.abs(rectA.height - rectB.height);

  // 1px 이상 차이 시 보고
  if (widthDiff > 1 || heightDiff > 1) {
    diffs.push({
      path: `${path}.size`,
      type: 'changed',
      description: `크기 변경: ${Math.round(rectA.width)}×${Math.round(rectA.height)} → ${Math.round(rectB.width)}×${Math.round(rectB.height)}`,
      oldValue: { width: Math.round(rectA.width), height: Math.round(rectA.height) },
      newValue: { width: Math.round(rectB.width), height: Math.round(rectB.height) },
    });
  }

  const xDiff = Math.abs(rectA.x - rectB.x);
  const yDiff = Math.abs(rectA.y - rectB.y);

  if (xDiff > 1 || yDiff > 1) {
    diffs.push({
      path: `${path}.position`,
      type: 'changed',
      description: `위치 변경: (${Math.round(rectA.x)}, ${Math.round(rectA.y)}) → (${Math.round(rectB.x)}, ${Math.round(rectB.y)})`,
      oldValue: { x: Math.round(rectA.x), y: Math.round(rectA.y) },
      newValue: { x: Math.round(rectB.x), y: Math.round(rectB.y) },
    });
  }
}

function compareAttributes(
  a: Record<string, string>,
  b: Record<string, string>,
  path: string,
  diffs: Difference[]
): void {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    if (key === 'style' || key === 'class') continue; // 스타일/클래스는 별도 비교

    if (!(key in a)) {
      diffs.push({
        path: `${path}[${key}]`,
        type: 'added',
        description: `속성 추가: ${key}="${b[key]}"`,
        newValue: b[key],
      });
    } else if (!(key in b)) {
      diffs.push({
        path: `${path}[${key}]`,
        type: 'removed',
        description: `속성 제거: ${key}`,
        oldValue: a[key],
      });
    } else if (a[key] !== b[key]) {
      diffs.push({
        path: `${path}[${key}]`,
        type: 'changed',
        description: `속성 변경: ${key}`,
        oldValue: a[key],
        newValue: b[key],
      });
    }
  }
}

function compareChildren(
  a: ExtractedNode[],
  b: ExtractedNode[],
  path: string,
  diffs: Difference[]
): void {
  const maxLen = Math.max(a.length, b.length);

  if (a.length !== b.length) {
    diffs.push({
      path: `${path}.children`,
      type: 'structure',
      description: `자식 노드 수 변경: ${a.length} → ${b.length}`,
      oldValue: a.length,
      newValue: b.length,
    });
  }

  for (let i = 0; i < maxLen; i++) {
    const childPath = `${path} > [${i}]`;

    if (i >= a.length) {
      diffs.push({
        path: childPath,
        type: 'added',
        description: `자식 노드 추가: <${b[i].tagName}>`,
        newValue: `<${b[i].tagName}>`,
      });
    } else if (i >= b.length) {
      diffs.push({
        path: childPath,
        type: 'removed',
        description: `자식 노드 제거: <${a[i].tagName}>`,
        oldValue: `<${a[i].tagName}>`,
      });
    } else {
      compareNodes(a[i], b[i], childPath, diffs);
    }
  }
}

// ============================================================
// Helpers
// ============================================================

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  // RGBA 비교
  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    if ('r' in objA && 'g' in objA && 'b' in objA && 'a' in objA) {
      const rgbaA = objA as unknown as RGBA;
      const rgbaB = objB as unknown as RGBA;
      return (
        Math.abs(rgbaA.r - rgbaB.r) < 0.01 &&
        Math.abs(rgbaA.g - rgbaB.g) < 0.01 &&
        Math.abs(rgbaA.b - rgbaB.b) < 0.01 &&
        Math.abs(rgbaA.a - rgbaB.a) < 0.01
      );
    }
  }

  // 숫자 비교 (소수점 오차 허용)
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.5;
  }

  return false;
}

function formatStyleValue(val: unknown): string {
  if (val === null || val === undefined) return 'none';
  if (typeof val === 'object' && 'r' in (val as Record<string, unknown>)) {
    const rgba = val as RGBA;
    return `rgba(${Math.round(rgba.r * 255)}, ${Math.round(rgba.g * 255)}, ${Math.round(rgba.b * 255)}, ${rgba.a})`;
  }
  return String(val);
}
