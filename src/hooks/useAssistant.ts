// @node: F2.6
// @node: F11.8 (Phase 3A: status, notice, held request, session cache, result hand-off)
// Owns the AbortController for the current AI request and coordinates between the
// client service, the store, and the UI. Same pattern as createIngestionController.
//
// Phase 3A additions (all optional for callers, so Phase 2 callers and tests are unchanged):
// - In mock mode (or when the controller has no status service) a request is built and sent exactly as in Phase 2.
// - In live mode (or when the mode could not be checked) the request is built by the Context Engine, a saved answer is reused
//   when there is one, the first-request notice must be accepted, and a live answer is saved for the session.
// - While the notice is open the typed request is HELD here (memory only). It is discarded on cancel, clear, stop, reset,
//   dispose, a snapshot change, a mode change, a newer send, and when the panel unmounts. It is sent only by `acceptNotice`.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  isAssistantAbortError, requestAssistant, buildAIRequest, buildLiveRequest,
  type BuildLiveRequestOptions, type AIRequest, type AIResult, AssistantError,
} from '../engine/aiAssistant';
import { cacheKey, createAnswerCache, type AnswerCache } from '../engine/aiCache';
import { fetchAIStatus, type AIStatusState } from '../engine/aiStatus';
import { createStore, studioStore, withLog, type Store, type StudioState } from '../store/useStudioStore';
import { beginAIRequest, cancelAIRequest, clearAI, completeAIRequest, failAIRequest, reuseAIAnswer } from '../store/aiActions';
import type { RepoSnapshot, ApiError } from '../types/contracts';

export type SendInput = BuildLiveRequestOptions & {
  snapshot: RepoSnapshot;
  requestId?: string;
  /** "Ask again": skip the saved-answer lookup and replace the entry. */
  bypassCache?: boolean;
  /** The finding's id, so the result hand-off can count fix attempts. */
  findingId?: string;
};

export interface ResultInfo {
  fromCache: boolean;
  findingId?: string;
}
export type ResultHandler = (result: AIResult, request: AIRequest, info: ResultInfo) => void;

export interface AssistantUiState {
  status: AIStatusState;
  /** True while the first-request notice is open and a request is held. */
  noticeOpen: boolean;
}

export interface AssistantActions {
  /** Builds and sends a request. Returns an error message for inline validation, or null when started (or held for the notice). */
  send(input: SendInput): string | null;
  cancel(): void;
  clear(): void;
  /** Phase 3A. Present on every real controller; optional so stubs and Phase 2 callers keep working. */
  ui?: Store<AssistantUiState>;
  refreshStatus?(): Promise<void>;
  acceptNotice?(): void;
  discardHeld?(): void;
  /** Forgets saved answers and any held request (the `reset` command). */
  reset?(): void;
  setResultHandler?(handler: ResultHandler | null): () => void;
}

export interface AssistantServices {
  requestAssistant(request: AIRequest, options: { signal: AbortSignal }): Promise<AIResult>;
  now(): number;
  newId(): string;
  /** Phase 3A. When absent the mode is taken to be mock and nothing else changes. */
  fetchStatus?(): Promise<AIStatusState>;
  cache?: AnswerCache;
}

const defaultServices: AssistantServices = {
  requestAssistant,
  now: () => Date.now(),
  newId: () => `ai-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
  fetchStatus: () => fetchAIStatus(),
};

export interface AssistantController {
  actions: AssistantActions;
  dispose(): void;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof Error && 'code' in error) {
    const ae = error as AssistantError;
    return ae.resetAt !== undefined ? { code: ae.code, message: ae.message, resetAt: ae.resetAt }
      : { code: ae.code, message: ae.message };
  }
  return { code: 'upstream_failure', message: 'An unexpected error occurred.' };
}

interface Held {
  request: AIRequest;
  input: SendInput;
  key: string | undefined;
  /** The store's snapshot when the request was held. The request is sent only if it is still the current one. */
  storeSnapshot: StudioState['snapshot'];
}

export function createAssistantController(
  store: Store<StudioState> = studioStore,
  services: AssistantServices = defaultServices,
): AssistantController {
  let current: AbortController | null = null;
  let currentId: string | null = null;
  let unsub: (() => void) | null = null;
  // Bumped by dispose(). A status answer that arrives for an older epoch is ignored (React StrictMode runs effects twice).
  let epoch = 0;
  let accepted = false;
  let held: Held | null = null;
  let unsubHeld: (() => void) | null = null;
  let handler: ResultHandler | null = null;
  const cache = services.cache ?? createAnswerCache();
  const ui = createStore<AssistantUiState>({ status: services.fetchStatus ? { kind: 'checking' } : { kind: 'mock' }, noticeOpen: false });

  function releaseSub(): void {
    unsub?.();
    unsub = null;
  }

  function discardHeld(): void {
    held = null;
    unsubHeld?.();
    unsubHeld = null;
    if (ui.getState().noticeOpen) ui.update((s) => ({ ...s, noticeOpen: false }));
  }

  function cancel(logIt = true): void {
    current?.abort();
    current = null;
    currentId = null;
    releaseSub();
    discardHeld();
    if (logIt) store.update((s) => cancelAIRequest(s, services.now()));
  }

  // Subscribe to the store and abort if the pending request changes externally
  // (e.g. the snapshot was replaced, Back to Start, or dispose was called).
  function watchRun(id: string): void {
    releaseSub();
    unsub = store.subscribe(() => {
      const ai = store.getState().ai;
      if (ai.requestId !== id || ai.status !== 'pending') {
        // The request was cancelled from outside (snapshot change, etc.)
        current?.abort();
        current = null;
        currentId = null;
        releaseSub();
      }
    });
  }

  // A new or cleared repository ends the session cache and any held request.
  function subscribeSnapshot(): () => void {
    let lastSnapshot = store.getState().snapshot;
    return store.subscribe(() => {
      const snap = store.getState().snapshot;
      if (snap !== lastSnapshot) {
        lastSnapshot = snap;
        cache.clear();
        discardHeld();
      }
    });
  }
  let unsubSnapshot: (() => void) | null = subscribeSnapshot();

  function modeNow(): 'mock' | 'live' | 'unknown' {
    const k = ui.getState().status.kind;
    return k === 'mock' ? 'mock' : k === 'live' ? 'live' : 'unknown';
  }

  function hand(result: AIResult, request: AIRequest, info: ResultInfo): void {
    if (!handler) return;
    try {
      handler(result, request, info);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      store.update((s) => ({ ...s, ...withLog(s, services.now(), {
        action: 'ai_handoff_failed', status: 'failed', message: `The AI answer could not be handed on (${name}).`, affectedPaths: [],
      }) }));
    }
  }

  function start(request: AIRequest, input: SendInput, key: string | undefined): void {
    const id = request.requestId;
    current?.abort();
    const controller = new AbortController();
    current = controller;
    currentId = id;

    const summary = {
      taskType: input.taskType,
      selectedCount: request.selectedPaths.length,
      includesContent: input.includeContent && request.selectedPaths.length > 0,
    };
    store.update((s) => beginAIRequest(s, id, summary, services.now()));
    watchRun(id);

    void (async () => {
      try {
        const result = await services.requestAssistant(request, { signal: controller.signal });
        if (currentId === id) {
          store.update((s) => completeAIRequest(s, id, result, services.now()));
          releaseSub();
          current = null;
          currentId = null;
          if (key !== undefined && result.mode === 'live') cache.put(key, result);
          hand(result, request, { fromCache: false, ...(input.findingId !== undefined ? { findingId: input.findingId } : {}) });
        }
      } catch (error) {
        if (isAssistantAbortError(error)) return; // cancel/dispose already updated state
        if (currentId === id) {
          store.update((s) => failAIRequest(s, id, toApiError(error), services.now()));
          releaseSub();
          current = null;
          currentId = null;
        }
      }
    })();
  }

  const actions: AssistantActions = {
    send(input) {
      if (store.getState().ai.status === 'pending') return null; // ignore while pending
      const mode = modeNow();
      const id = input.requestId ?? services.newId();
      const built = mode === 'mock'
        ? buildAIRequest(input.snapshot, input, id)
        : buildLiveRequest(input.snapshot, input, id);
      if (!built.ok) return built.message;
      const request = built.request;
      const key = mode === 'live' ? cacheKey('live', request) : undefined;

      // A saved answer costs nothing: no notice and no request.
      if (key !== undefined && !input.bypassCache) {
        const hit = cache.get(key);
        if (hit) {
          const answer: AIResult = { ...hit, requestId: id };
          const summary = { taskType: input.taskType, selectedCount: request.selectedPaths.length, includesContent: input.includeContent && request.selectedPaths.length > 0 };
          store.update((s) => reuseAIAnswer(s, id, summary, answer, services.now()));
          hand(answer, request, { fromCache: true, ...(input.findingId !== undefined ? { findingId: input.findingId } : {}) });
          return null;
        }
      }

      // The first live request of the page session waits for the notice.
      if (mode !== 'mock' && !accepted) {
        discardHeld();
        held = { request, input, key, storeSnapshot: store.getState().snapshot };
        ui.update((s) => ({ ...s, noticeOpen: true }));
        unsubHeld = store.subscribe(() => {
          if (held && store.getState().snapshot !== held.storeSnapshot) discardHeld();
        });
        return null;
      }

      discardHeld();
      start(request, input, key);
      return null;
    },

    cancel() {
      cancel(true);
    },

    clear() {
      cancel(false);
      store.update((s) => clearAI(s));
    },

    ui,

    async refreshStatus() {
      // React StrictMode disposes and re-runs the effect that calls this: re-attach the snapshot watcher.
      if (!unsubSnapshot) unsubSnapshot = subscribeSnapshot();
      if (!services.fetchStatus) return;
      const mine = epoch;
      const before = ui.getState().status.kind;
      const next = await services.fetchStatus();
      if (mine !== epoch) return;
      ui.update((s) => ({ ...s, status: next }));
      const modeChanged = (before === 'mock' || before === 'live') && next.kind !== before;
      if (modeChanged) {
        cache.clear();
        discardHeld();
      }
    },

    acceptNotice() {
      accepted = true;
      const h = held;
      discardHeld();
      if (!h) return;
      // Send only the request that was held for this repository, and only if nothing else is running.
      if (store.getState().snapshot !== h.storeSnapshot || store.getState().ai.status === 'pending') return;
      start(h.request, h.input, h.key);
    },

    discardHeld() {
      discardHeld();
    },

    reset() {
      cache.clear();
      discardHeld();
    },

    setResultHandler(next) {
      handler = next;
      return () => { if (handler === next) handler = null; };
    },
  };

  return {
    actions,
    dispose() {
      epoch++;
      cancel(true);
      unsubSnapshot?.();
      unsubSnapshot = null;
      handler = null;
      cache.clear();
    },
  };
}

export function useAssistant(): AssistantActions {
  const controller = useMemo(() => createAssistantController(), []);
  useEffect(() => {
    void controller.actions.refreshStatus?.();
    return () => controller.dispose();
  }, [controller]);
  return controller.actions;
}

const FALLBACK_UI: Store<AssistantUiState> = createStore<AssistantUiState>({ status: { kind: 'mock' }, noticeOpen: false });

/** Reads the mode status and notice flag. Stubs without a `ui` store behave as mock mode. */
export function useAssistantUi(actions: AssistantActions): AssistantUiState {
  const store = actions.ui ?? FALLBACK_UI;
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
