// 비교 로직
export { compare } from './core';
export type { Difference, DiffResult } from './core';

// 스냅샷 관리
export {
  saveSnapshot,
  compareWithSnapshot,
  listSnapshots,
  deleteSnapshot,
  clearSnapshots,
} from './snapshots';
export type { Snapshot } from './snapshots';
