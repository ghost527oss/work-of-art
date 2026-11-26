// @node: F5.7
// Pure state for the project understanding: the run status, the derived result, and the
// user's label corrections. Every refused transition returns the SAME object.
// Imports only types, so useStudioStore can import `idleUnderstanding` without a cycle.
import { UNDERSTANDING_LIMITS } from '../config/understandingLimits';
import type { AnalysisResult, Label } from '../engine/understandTypes';

export type UnderstandingStatus = 'idle' | 'running' | 'done' | 'failed';

export interface UnderstandingState {
  status: UnderstandingStatus;
  runId: number;
  snapshotId?: string;
  progress?: { done: number; total: number };
  result?: AnalysisResult;
  error?: string;
  corrections: Record<string, Label[]>;
}

export const SELECTABLE_LABELS: readonly Label[] = ['frontend', 'backend', 'shared', 'api_data', 'assets', 'configuration', 'tests', 'documentation', 'infrastructure'];
export const LIMIT_MESSAGE = `Correction limit reached (${UNDERSTANDING_LIMITS.maxCorrections}). Remove one to add another.`;

export function idleUnderstanding(): UnderstandingState {
  return { status: 'idle', runId: 0, corrections: {} };
}

export function understandingDone(result: AnalysisResult, corrections: Record<string, Label[]> = {}): UnderstandingState {
  return { status: 'done', runId: 0, snapshotId: result.snapshotId, result, corrections };
}

export function understandingFailed(message: string, corrections: Record<string, Label[]> = {}): UnderstandingState {
  return { status: 'failed', runId: 0, error: message.slice(0, 200), corrections };
}

export function uBegin(s: UnderstandingState, snapshotId: string): UnderstandingState {
  if (s.status === 'running') return s;
  return { status: 'running', runId: s.runId + 1, snapshotId, progress: { done: 0, total: 0 }, corrections: s.corrections };
}

export function uProgress(s: UnderstandingState, runId: number, done: number, total: number): UnderstandingState {
  if (s.status !== 'running' || s.runId !== runId) return s;
  return { ...s, progress: { done, total } };
}

export function uComplete(s: UnderstandingState, runId: number, result: AnalysisResult): UnderstandingState {
  if (s.status !== 'running' || s.runId !== runId) return s;
  return { status: 'done', runId, snapshotId: result.snapshotId, result, corrections: s.corrections };
}

export function uFail(s: UnderstandingState, runId: number, message: string): UnderstandingState {
  if (s.status !== 'running' || s.runId !== runId) return s;
  return { status: 'failed', runId, snapshotId: s.snapshotId, error: message.slice(0, 200), corrections: s.corrections };
}

/** A cancelled re-analysis leaves no result and goes back to idle. */
export function uCancel(s: UnderstandingState): UnderstandingState {
  if (s.status !== 'running') return s;
  return { status: 'idle', runId: s.runId, corrections: s.corrections };
}

export function isValidLabelSet(labels: readonly Label[]): boolean {
  return labels.length >= 1 && labels.length <= SELECTABLE_LABELS.length && new Set(labels).size === labels.length && labels.every((l) => SELECTABLE_LABELS.includes(l));
}

/** Null when allowed, otherwise the reason. An empty set means "remove the correction". */
export function correctionRefusal(s: UnderstandingState, path: string, labels: readonly Label[]): string | null {
  if (labels.length === 0) return null;
  if (!isValidLabelSet(labels)) return 'Choose at least one label from the list.';
  if (path.length > 250) return 'This file path is too long to save a correction for.';
  if (!(path in s.corrections) && Object.keys(s.corrections).length >= UNDERSTANDING_LIMITS.maxCorrections) return LIMIT_MESSAGE;
  return null;
}

export function uSetCorrection(s: UnderstandingState, path: string, labels: readonly Label[]): UnderstandingState {
  if (labels.length === 0) return uRemoveCorrection(s, path);
  if (correctionRefusal(s, path, labels) !== null) return s;
  const sorted = SELECTABLE_LABELS.filter((l) => labels.includes(l));
  const old = s.corrections[path];
  if (old && old.length === sorted.length && old.every((l, i) => l === sorted[i])) return s;
  return { ...s, corrections: { ...s.corrections, [path]: sorted } };
}

export function uRemoveCorrection(s: UnderstandingState, path: string): UnderstandingState {
  if (!(path in s.corrections)) return s;
  const { [path]: _gone, ...rest } = s.corrections;
  void _gone;
  return { ...s, corrections: rest };
}

export function uClearCorrections(s: UnderstandingState): UnderstandingState {
  return Object.keys(s.corrections).length === 0 ? s : { ...s, corrections: {} };
}
