// @node: F2.6
// @node: F11.8 (Phase 3A: fromCache, per-finding fix-attempt counts)
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
  /** Phase 3A: true when `result` is a saved answer from earlier in this session (no request was sent). */
  fromCache?: boolean;
  /** Phase 3A: AI change proposals queued per finding, for the 3-attempt cap. Cleared with the slice on a new snapshot. */
  attempts?: Readonly<Record<string, number>>;
  /** Phase 3A: a plain sentence about what happened to a patch the AI proposed ("Queued for your approval" or the reason it was not). Not saved. */
  proposalNote?: string;
}

/** The fields that survive a request ending: only the attempt counts. */
function kept(state: AIState): Pick<AIState, 'attempts'> {
  return state.attempts !== undefined ? { attempts: state.attempts } : {};
}

export function idleAI(): AIState {
  return { status: 'idle' };
}

/** Starts a pending request. No-op if a request is already pending. */
export function aiBegin(state: AIState, requestId: string, summary: AISummary): AIState {
  if (state.status === 'pending') return state;
  return { status: 'pending', requestId, summary, ...kept(state) };
}

/** Records a successful result. No-op if requestId does not match the pending one. */
export function aiComplete(state: AIState, requestId: string, result: AIResult): AIState {
  if (state.status !== 'pending' || state.requestId !== requestId) return state;
  return { status: 'done', requestId, summary: state.summary, result, ...kept(state) };
}

/** Records a failed request. No-op if requestId does not match the pending one. */
export function aiFail(state: AIState, requestId: string, error: ApiError): AIState {
  if (state.status !== 'pending' || state.requestId !== requestId) return state;
  return { status: 'failed', requestId, summary: state.summary, error, ...kept(state) };
}

/** Cancels a pending request. No-op when nothing is pending. */
export function aiCancel(state: AIState): AIState {
  if (state.status !== 'pending') return state;
  return { ...idleAI(), ...kept(state) };
}

/** Returns to idle unconditionally, without a log entry. Used when the snapshot changes. */
export function aiClear(): AIState {
  return idleAI();
}

/** Shows a saved answer without a request. Refused while a request is pending. */
export function aiReuse(state: AIState, requestId: string, summary: AISummary, result: AIResult): AIState {
  if (state.status === 'pending') return state;
  return { status: 'done', requestId, summary, result, fromCache: true, ...kept(state) };
}

/** Counts one more AI change proposal for a finding. */
export function aiCountAttempt(state: AIState, findingKey: string): AIState {
  const n = (state.attempts?.[findingKey] ?? 0) + 1;
  return { ...state, attempts: { ...(state.attempts ?? {}), [findingKey]: n } };
}

/** Sets the plain note about the proposed patch. Only while an answer is showing. */
export function aiSetProposalNote(state: AIState, note: string): AIState {
  if (state.status !== 'done') return state;
  return { ...state, proposalNote: note };
}
