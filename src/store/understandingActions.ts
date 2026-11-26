// @node: F5.7
// Whole-state understanding actions: slice transitions plus Log entries (paths, counts, and label names only).
import type { AnalysisResult, Label } from '../engine/understandTypes';
import { applyCorrections } from '../engine/understandingView';
import { correctionRefusal, uBegin, uCancel, uClearCorrections, uComplete, uFail, uProgress, uRemoveCorrection, uSetCorrection, type UnderstandingState } from './understandingSlice';
import { withLog, type StudioState } from './useStudioStore';

export function doneMessage(result: AnalysisResult, corrections: Record<string, Label[]> = {}): string {
  const files = applyCorrections(result, corrections);
  const review = files.filter((f) => f.needsReview).length;
  return `${files.length} files sorted, ${review} need review, ${result.edges.length} connections.${result.coverage.partial ? ' Partial result.' : ''}`;
}

function put(state: StudioState, understanding: UnderstandingState): StudioState {
  return understanding === state.understanding ? state : { ...state, understanding };
}

export function beginUnderstanding(state: StudioState, now: number): StudioState {
  if (!state.snapshot) return state;
  const next = put(state, uBegin(state.understanding, state.snapshot.id));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'understanding_started', status: 'info', message: 'Analysis started.' }) };
}

export function progressUnderstanding(state: StudioState, runId: number, done: number, total: number): StudioState {
  return put(state, uProgress(state.understanding, runId, done, total));
}

export function completeUnderstanding(state: StudioState, runId: number, result: AnalysisResult, now: number): StudioState {
  const next = put(state, uComplete(state.understanding, runId, result));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'understanding_done', status: 'info', message: doneMessage(result, next.understanding.corrections) }) };
}

export function failUnderstanding(state: StudioState, runId: number, message: string, now: number): StudioState {
  const next = put(state, uFail(state.understanding, runId, message));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'understanding_failed', status: 'failed', message: 'Analysis failed.' }) };
}

export function cancelUnderstanding(state: StudioState, now: number): StudioState {
  const next = put(state, uCancel(state.understanding));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'understanding_cancelled', status: 'info', message: 'Analysis was cancelled.' }) };
}

/** Returns the new state and a refusal message (null when accepted). */
export function setCorrection(state: StudioState, path: string, labels: readonly Label[], now: number): { state: StudioState; error: string | null } {
  const error = correctionRefusal(state.understanding, path, labels);
  if (error) return { state, error };
  if (labels.length === 0) return { state: removeCorrection(state, path, now), error: null };
  const next = put(state, uSetCorrection(state.understanding, path, labels));
  if (next === state) return { state, error: null };
  const names = next.understanding.corrections[path]!.join(', ');
  return { state: { ...next, ...withLog(next, now, { action: 'label_corrected', status: 'info', message: `Labels set to ${names}.`, affectedPaths: [path] }) }, error: null };
}

export function removeCorrection(state: StudioState, path: string, now: number): StudioState {
  const next = put(state, uRemoveCorrection(state.understanding, path));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'label_reset', status: 'info', message: 'Your label change was removed.', affectedPaths: [path] }) };
}

export function clearCorrections(state: StudioState, now: number): StudioState {
  const n = Object.keys(state.understanding.corrections).length;
  const next = put(state, uClearCorrections(state.understanding));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'labels_cleared', status: 'info', message: `${n} label correction${n === 1 ? '' : 's'} cleared.` }) };
}
