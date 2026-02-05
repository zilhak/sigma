/**
 * Sigma Diff Standalone - IIFE Entry Point
 *
 * esbuild로 빌드되어 self-contained IIFE JS 파일로 출력됩니다.
 * Playwright에서 page.addScriptTag({ path }) 로 inject하여 사용합니다.
 *
 * ⚠️ 주의: extractor.standalone.js가 먼저 로드되어야 합니다.
 *   snapshot()에서 CSS 선택자로 요소를 추출할 때 window.__sigma__.extract()를 사용합니다.
 *
 * 사용법:
 *   await page.addScriptTag({ path: '/path/to/extractor.standalone.js' });
 *   await page.addScriptTag({ path: '/path/to/diff.standalone.js' });
 *   const snapId = await page.evaluate(() => window.__sigma_diff__.snapshot('.btn'));
 *   // ... 페이지 변경 ...
 *   const diff = await page.evaluate((id) => window.__sigma_diff__.compareWithSnapshot(id, '.btn'), snapId);
 */
import { extractElement } from './extractor/core';
import type { ExtractedNode } from './types';
import {
  compare,
  saveSnapshot,
  compareWithSnapshot,
  listSnapshots,
  deleteSnapshot,
  clearSnapshots,
} from './diff/core';
import type { DiffResult, Difference } from './diff/core';

declare global {
  interface Window {
    __sigma_diff__?: SigmaDiffAPI;
  }
}

interface SigmaDiffAPI {
  compare: (nodeA: ExtractedNode, nodeB: ExtractedNode) => DiffResult;
  snapshot: (selectorOrNode: string | ExtractedNode) => string | null;
  compareWithSnapshot: (
    snapshotId: string,
    selectorOrNode: string | ExtractedNode
  ) => DiffResult | null;
  listSnapshots: () => Array<{ id: string; selector: string; timestamp: number }>;
  deleteSnapshot: (id: string) => boolean;
  clearSnapshots: () => void;
  version: string;
}

// 추출 함수 래퍼
function extractFn(el: HTMLElement | SVGElement): ExtractedNode | null {
  return extractElement(el);
}

if (!window.__sigma_diff__) {
  window.__sigma_diff__ = {
    /**
     * 두 ExtractedNode 비교
     */
    compare,

    /**
     * 현재 상태를 스냅샷으로 저장
     * @param selectorOrNode - CSS 선택자 또는 ExtractedNode
     * @returns 스냅샷 ID (null이면 요소를 찾지 못함)
     */
    snapshot(selectorOrNode: string | ExtractedNode): string | null {
      return saveSnapshot(selectorOrNode, extractFn);
    },

    /**
     * 이전 스냅샷과 현재 상태 비교
     * @param snapshotId - 스냅샷 ID
     * @param selectorOrNode - CSS 선택자 또는 ExtractedNode
     */
    compareWithSnapshot(
      snapshotId: string,
      selectorOrNode: string | ExtractedNode
    ): DiffResult | null {
      return compareWithSnapshot(snapshotId, selectorOrNode, extractFn);
    },

    /**
     * 저장된 스냅샷 목록 조회
     */
    listSnapshots,

    /**
     * 특정 스냅샷 삭제
     */
    deleteSnapshot,

    /**
     * 모든 스냅샷 삭제
     */
    clearSnapshots,

    version: '1.0.0',
  };

  console.log(
    '[Sigma] Diff script v1.0.0 loaded. APIs: compare, snapshot, compareWithSnapshot, listSnapshots'
  );
}
