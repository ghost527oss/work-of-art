// @node: F2.6
// Pure AI slice transitions. Operates only on AIState; imports nothing from useStudioStore.
import type { ApiError, AIResult } from '../types/contracts';

export type AIStatus = 'idle' | 'pending' | 'done' | 'failed';

/** Summary stored in the log and state: counts only, never instruction text or file content. */
export interface AISummary {
  taskType: string;
  selectedCount: number;
  includesContent: boolean;
}

export interface AIState {
  status: AIStatus;
  requestId?: string;
  summary?: AISummary;
  result?: AIResult;
  error?: ApiError;
}

export function idleAI(): AIState {
  return { status: 'idle' };
}

/** Starts a pending request. No-op if a request is already pending. */
export function aiBegin(state: AIState, requestId: string, summary: AISummary): AIState {
  if (state.status === 'pending') return state;
  return { status: 'pending', requestId, summary };
}

/** Records a successful result. No-op if requestId does not match the pending one. */
export function aiComplete(state: AIState, requestId: string, result: AIResult): AIState {
  if (state.status !== 'pending' || state.requestId !== requestId) return state;
  return { status: 'done', requestId, summary: state.summary, result };
}

/** Records a failed request. No-op if requestId does not match the pending one. */
export function aiFail(state: AIState, requestId: string, error: ApiError): AIState {
  if (state.status !== 'pending' || state.requestId !== requestId) return state;
  return { status: 'failed', requestId, summary: state.summary, error };
}

/** Cancels a pending request. No-op when nothing is pending. */
export function aiCancel(state: AIState): AIState {
  if (state.status !== 'pending') return state;
  return idleAI();
}

/** Returns to idle unconditionally, without a log entry. Used when the snapshot changes. */
export function aiClear(): AIState {
  return idleAI();
}
