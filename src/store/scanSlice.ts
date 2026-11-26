// @node: F6.6
// Pure state for the scan: the run status and the derived result. Refused transitions return the SAME object.
// Imports only types, so useStudioStore can import `idleScan` without a cycle.
import type { ScanResult } from '../engine/scanFindingTypes';

export interface ScanState {
  status: 'idle' | 'running' | 'done' | 'failed';
  runId: number;
  snapshotId?: string;
  progress?: { done: number; total: number };
  result?: ScanResult;
  error?: string;
}

export function idleScan(): ScanState {
  return { status: 'idle', runId: 0 };
}

export function sBegin(s: ScanState, snapshotId: string): ScanState {
  if (s.status === 'running') return s;
  return { status: 'running', runId: s.runId + 1, snapshotId, progress: { done: 0, total: 0 } };
}

export function sProgress(s: ScanState, runId: number, done: number, total: number): ScanState {
  if (s.status !== 'running' || s.runId !== runId) return s;
  return { ...s, progress: { done, total } };
}

export function sComplete(s: ScanState, runId: number, result: ScanResult): ScanState {
  if (s.status !== 'running' || s.runId !== runId) return s;
  return { status: 'done', runId, snapshotId: s.snapshotId, result };
}

export function sFail(s: ScanState, runId: number, message: string): ScanState {
  if (s.status !== 'running' || s.runId !== runId) return s;
  return { status: 'failed', runId, snapshotId: s.snapshotId, error: message.slice(0, 200) };
}

export function sCancel(s: ScanState): ScanState {
  return s.status === 'running' ? { status: 'idle', runId: s.runId } : s;
}

/** Replaces the result after an incremental re-check. A no-op unless the scan is done. */
export function sRefresh(s: ScanState, result: ScanResult): ScanState {
  return s.status === 'done' && s.result ? { ...s, result } : s;
}

export function sClear(): ScanState {
  return idleScan();
}
