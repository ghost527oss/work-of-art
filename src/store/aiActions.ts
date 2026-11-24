// @node: F2.6
// Whole-state AI actions: slice transitions + session-log entries.
// Imports withLog and store types from useStudioStore, but useStudioStore
// imports only idleAI from aiSlice — no import cycle.
import { type AIResult, type ApiError } from '../types/contracts';
import { aiBegin, aiCancel, aiClear, aiComplete, aiFail, type AISummary } from './aiSlice';
import { type Store, type StudioState, withLog } from './useStudioStore';

export function beginAIRequest(
  state: StudioState,
  requestId: string,
  summary: AISummary,
  now: number,
): StudioState {
  const next = aiBegin(state.ai, requestId, summary);
  if (next === state.ai) return state; // already pending
  const taskLabel = `${summary.taskType}, ${summary.selectedCount} file${summary.selectedCount === 1 ? '' : 's'} selected${summary.includesContent ? ', contents included' : ''}.`;
  return {
    ...state,
    ai: next,
    ...withLog(state, now, {
      action: 'ai_request',
      status: 'info',
      message: `AI request: ${taskLabel}`,
      affectedPaths: [],
    }),
  };
}

export function completeAIRequest(
  state: StudioState,
  requestId: string,
  result: AIResult,
  now: number,
): StudioState {
  const next = aiComplete(state.ai, requestId, result);
  if (next === state.ai) return state;
  return {
    ...state,
    ai: next,
    ...withLog(state, now, {
      action: 'ai_response',
      status: 'info',
      message: `AI response: ${result.response.type} (${result.mode}).`,
      affectedPaths: [],
    }),
  };
}

export function failAIRequest(
  state: StudioState,
  requestId: string,
  error: ApiError,
  now: number,
): StudioState {
  const next = aiFail(state.ai, requestId, error);
  if (next === state.ai) return state;
  return {
    ...state,
    ai: next,
    ...withLog(state, now, {
      action: 'ai_failed',
      status: 'failed',
      message: `AI request failed: ${error.code}.`,
      affectedPaths: [],
    }),
  };
}

export function cancelAIRequest(state: StudioState, now: number): StudioState {
  const next = aiCancel(state.ai);
  if (next === state.ai) return state;
  return {
    ...state,
    ai: next,
    ...withLog(state, now, {
      action: 'ai_cancelled',
      status: 'info',
      message: 'AI request cancelled.',
      affectedPaths: [],
    }),
  };
}

/** Clears the AI slice when the snapshot changes. No log entry. */
export function clearAI(state: StudioState): StudioState {
  return { ...state, ai: aiClear() };
}

/** Subscribe to the store and cancel any pending AI request when the snapshot or stage changes. */
export function setupAIClearListener(store: Store<StudioState>): () => void {
  let lastSnapshot = store.getState().snapshot;
  return store.subscribe(() => {
    const s = store.getState();
    if (s.snapshot !== lastSnapshot) {
      lastSnapshot = s.snapshot;
      if (s.ai.status === 'pending') {
        store.update((cur) => clearAI(cur));
      }
    }
  });
}
