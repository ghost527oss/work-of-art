// @node: F2.6
// Owns the AbortController for the current AI request and coordinates between the
// client service, the store, and the UI. Same pattern as createIngestionController.
import { useEffect, useMemo } from 'react';
import { isAssistantAbortError, requestAssistant, buildAIRequest, type BuildAIRequestOptions, type AIRequest, type AIResult, AssistantError } from '../engine/aiAssistant';
import { studioStore, type Store, type StudioState } from '../store/useStudioStore';
import { beginAIRequest, cancelAIRequest, clearAI, completeAIRequest, failAIRequest } from '../store/aiActions';
import type { RepoSnapshot, ApiError } from '../types/contracts';

export interface AssistantActions {
  /** Builds and sends a request. Returns an error message for inline validation, or null when started. */
  send(input: Omit<BuildAIRequestOptions, never> & { snapshot: RepoSnapshot; requestId?: string }): string | null;
  cancel(): void;
  clear(): void;
}

export interface AssistantServices {
  requestAssistant(request: AIRequest, options: { signal: AbortSignal }): Promise<AIResult>;
  now(): number;
  newId(): string;
}

const defaultServices: AssistantServices = {
  requestAssistant,
  now: () => Date.now(),
  newId: () => `ai-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
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

export function createAssistantController(
  store: Store<StudioState> = studioStore,
  services: AssistantServices = defaultServices,
): AssistantController {
  let current: AbortController | null = null;
  let currentId: string | null = null;
  let unsub: (() => void) | null = null;

  function releaseSub(): void {
    unsub?.();
    unsub = null;
  }

  function cancel(logIt = true): void {
    current?.abort();
    current = null;
    currentId = null;
    releaseSub();
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

  const actions: AssistantActions = {
    send({ snapshot, requestId, ...opts }) {
      if (store.getState().ai.status === 'pending') return null; // ignore while pending

      // Build the request
      const id = requestId ?? services.newId();
      const built = buildAIRequest(snapshot, opts, id);
      if (!built.ok) return built.message;

      current?.abort();
      const controller = new AbortController();
      current = controller;
      currentId = id;

      const summary = {
        taskType: opts.taskType,
        selectedCount: opts.selectedPaths.length,
        includesContent: opts.includeContent && opts.selectedPaths.length > 0,
      };
      store.update((s) => beginAIRequest(s, id, summary, services.now()));
      watchRun(id);

      void (async () => {
        try {
          const result = await services.requestAssistant(built.request, { signal: controller.signal });
          if (currentId === id) {
            store.update((s) => completeAIRequest(s, id, result, services.now()));
            releaseSub();
            current = null;
            currentId = null;
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

      return null;
    },
    cancel() {
      cancel(true);
    },
    clear() {
      cancel(false);
      store.update((s) => clearAI(s));
    },
  };

  return {
    actions,
    dispose() {
      cancel(true);
    },
  };
}

export function useAssistant(): AssistantActions {
  const controller = useMemo(() => createAssistantController(), []);
  useEffect(() => () => controller.dispose(), [controller]);
  return controller.actions;
}
