// @node: F6.6
// Whole-state scan actions: slice transitions plus Log entries (counts and titles only).
import type { ScanResult } from '../engine/scanFindingTypes';
import { sBegin, sCancel, sComplete, sFail, sProgress, sRefresh, type ScanState } from './scanSlice';
import { withLog, type StudioState } from './useStudioStore';
import { CHECK_COUNT } from '../engine/scanProject';

function put(state: StudioState, scan: ScanState): StudioState {
  return scan === state.scan ? state : { ...state, scan };
}

export function doneMessage(result: ScanResult): string {
  return `${result.findings.length} findings from ${CHECK_COUNT} checks over ${result.coverage.filesScanned} files.${result.partial ? ' Partial result.' : ''}`;
}

export function beginScan(state: StudioState, now: number): StudioState {
  if (!state.snapshot || state.understanding.status !== 'done') return state;
  const next = put(state, sBegin(state.scan, state.snapshot.id));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'scan_started', status: 'info', message: 'Scan started.' }) };
}

export function progressScan(state: StudioState, runId: number, done: number, total: number): StudioState {
  return put(state, sProgress(state.scan, runId, done, total));
}

export function completeScan(state: StudioState, runId: number, result: ScanResult, now: number): StudioState {
  const next = put(state, sComplete(state.scan, runId, result));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'scan_done', status: 'info', message: doneMessage(result) }) };
}

export function failScan(state: StudioState, runId: number, message: string, now: number): StudioState {
  const next = put(state, sFail(state.scan, runId, message));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'scan_failed', status: 'failed', message: 'Scan failed.' }) };
}

export function cancelScan(state: StudioState, now: number): StudioState {
  const next = put(state, sCancel(state.scan));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'scan_cancelled', status: 'info', message: 'Scan was cancelled.' }) };
}

export function refreshScan(state: StudioState, result: ScanResult): StudioState {
  return put(state, sRefresh(state.scan, result));
}
