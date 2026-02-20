/**
 * Sigma Diff Snapshots
 *
 * 스냅샷 저장 및 비교 기능.
 * ExtractedNode의 상태를 스냅샷으로 저장하고,
 * 이후 변경 사항을 비교할 수 있습니다.
 */

import type { ExtractedNode } from '../types';
import { compare } from './core';
import type { DiffResult } from './core';

// ============================================================
// Types
// ============================================================

export interface Snapshot {
  id: string;
  selector: string;
  timestamp: number;
  node: ExtractedNode;
}

// ============================================================
// Internal Storage
// ============================================================

const snapshots = new Map<string, Snapshot>();
let snapshotCounter = 0;

// ============================================================
// Snapshot API
// ============================================================

/**
 * 현재 상태를 스냅샷으로 저장
 * @param selectorOrNode - CSS 선택자 또는 ExtractedNode
 * @param extractFn - 요소를 ExtractedNode로 변환하는 함수 (standalone에서 주입)
 */
export function saveSnapshot(
  selectorOrNode: string | ExtractedNode,
  extractFn?: (el: HTMLElement | SVGElement) => ExtractedNode | null
): string | null {
  let node: ExtractedNode | null = null;
  let selector = '';

  if (typeof selectorOrNode === 'string') {
    selector = selectorOrNode;
    if (extractFn) {
      const el = document.querySelector(selectorOrNode) as HTMLElement | null;
      if (!el) return null;
      node = extractFn(el);
    }
  } else {
    node = selectorOrNode;
    selector = selectorOrNode.className
      ? `.${selectorOrNode.className.split(' ')[0]}`
      : `<${selectorOrNode.tagName}>`;
  }

  if (!node) return null;

  const id = `snap-${++snapshotCounter}-${Date.now()}`;
  snapshots.set(id, {
    id,
    selector,
    timestamp: Date.now(),
    node,
  });

  return id;
}

/**
 * 스냅샷과 현재 상태 비교
 */
export function compareWithSnapshot(
  snapshotId: string,
  selectorOrNode: string | ExtractedNode,
  extractFn?: (el: HTMLElement | SVGElement) => ExtractedNode | null
): DiffResult | null {
  const snap = snapshots.get(snapshotId);
  if (!snap) return null;

  let currentNode: ExtractedNode | null = null;

  if (typeof selectorOrNode === 'string') {
    if (extractFn) {
      const el = document.querySelector(selectorOrNode) as HTMLElement | null;
      if (!el) return null;
      currentNode = extractFn(el);
    }
  } else {
    currentNode = selectorOrNode;
  }

  if (!currentNode) return null;

  return compare(snap.node, currentNode);
}

/**
 * 저장된 스냅샷 목록
 */
export function listSnapshots(): Array<{ id: string; selector: string; timestamp: number }> {
  return Array.from(snapshots.values()).map(({ id, selector, timestamp }) => ({
    id,
    selector,
    timestamp,
  }));
}

/**
 * 스냅샷 삭제
 */
export function deleteSnapshot(id: string): boolean {
  return snapshots.delete(id);
}

/**
 * 모든 스냅샷 삭제
 */
export function clearSnapshots(): void {
  snapshots.clear();
  snapshotCounter = 0;
}
