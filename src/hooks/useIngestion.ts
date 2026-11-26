// @node: F1.7
// @node: F5.8 (the classifying stage runs inside the loading run)
// @node: F10.4 (restore: start a saved target as a foreground load)
// Owns the AbortController for the current ingestion run, calls the ingestion service,
// and dispatches the results to the store. Components call these actions; they never
// touch the network or the controller themselves.
//
// The logic lives in `createIngestionController`, a plain function with injectable store
// and services, so cancel, restart, and dispose behavior can be tested without a DOM.
// `useIngestion` is a thin React wrapper around it.
import { useEffect, useMemo } from 'react';
import { IngestError, isAbortError } from '../engine/githubSource';
import { ingestRepository, ingestSample } from '../engine/repoFetcher';
import { parseRepoInput } from '../engine/repoUrl';
import { isSampleId, type SampleId } from '../data/sampleRepos';
import {
  applyEvent,
  beginClassifying,
  beginIngestion,
  classifyProgressed,
  finishClassifying,
  withLog,
  cancelIngestion,
  completeIngestion,
  dismissError,
  failIngestion,
  reset,
  studioStore,
  type IngestTarget,
  type Store,
  type StudioState,
} from '../store/useStudioStore';
import type { ApiError, IngestEvent, RepoRequest, RepoSnapshot } from '../types/contracts';
import { AnalysisAbortError, analyzeProject, type AnalyzeOptions } from '../engine/analyzeProject';
import type { AnalysisResult, Label } from '../engine/understandTypes';
import { browserStorage } from '../store/layoutStorage';
import { loadCorrectionsFor } from '../store/correctionsStorage';
import { understandingDone, understandingFailed } from '../store/understandingSlice';
import { doneMessage } from '../store/understandingActions';
import { toIngestTarget, validateTarget, type SessionTarget } from '../store/sessionRecord';

export interface IngestionActions {
  /** Parses and validates the text, then starts a run. Returns an error message, or null when a run started. */
  submitInput(text: string): string | null;
  startSample(id: string): void;
  /** Reloads the current repository, loading content only from the given top-level folders. */
  loadFolders(folders: string[]): void;
  retry(): void;
  cancel(): void;
  dismissError(): void;
  backToStart(): void;
  /** 2G. Validates a saved session target like the Start screen does and starts it as a foreground load. Returns an error message, or null when a run started. */
  restore(target: SessionTarget): string | null;
}

export interface IngestionServices {
  ingestRepository(request: RepoRequest, options: { signal: AbortSignal; onEvent: (e: IngestEvent) => void }): Promise<RepoSnapshot>;
  ingestSample(id: SampleId, options: { signal: AbortSignal; onEvent: (e: IngestEvent) => void }): Promise<RepoSnapshot>;
  now(): number;
  /** Optional. When missing, the classifying stage is skipped and loading behaves as before. */
  analyze?(snapshot: RepoSnapshot, options: AnalyzeOptions): Promise<AnalysisResult>;
  /** Optional. Never throws. */
  loadCorrections?(snapshot: RepoSnapshot): Record<string, Label[]>;
}

const defaultServices: IngestionServices = {
  ingestRepository,
  ingestSample,
  now: () => Date.now(),
  analyze: analyzeProject,
  loadCorrections: (snapshot) => loadCorrectionsFor(browserStorage(), snapshot),
};

export interface IngestionController {
  actions: IngestionActions;
  /** Cancels any run in flight and updates the store. Safe to call repeatedly; the controller stays usable. */
  dispose(): void;
}

function toApiError(error: unknown): ApiError {
  return error instanceof IngestError
    ? error.toApiError()
    : { code: 'upstream_failure', message: 'Unexpected error while loading the repository.' };
}

export function createIngestionController(
  store: Store<StudioState> = studioStore,
  services: IngestionServices = defaultServices,
): IngestionController {
  let current: AbortController | null = null;

  function run(target: IngestTarget, keepSnapshot: boolean): void {
    const before = store.getState().ingestion;
    if (before.status === 'running') return; // rapid repeated submits are ignored
    current?.abort();

    store.update((s) => beginIngestion(s, target, services.now(), { keepSnapshot }));
    const runId = store.getState().ingestion.runId;
    if (runId === before.runId) return;

    const controller = new AbortController();
    current = controller;
    const onEvent = (event: IngestEvent): void => {
      store.update((s) => applyEvent(s, runId, event, services.now()));
    };

    void (async () => {
      try {
        let snapshot: RepoSnapshot;
        if (target.source === 'sample') {
          snapshot = await services.ingestSample(target.sampleId as SampleId, { signal: controller.signal, onEvent });
        } else {
          const request: RepoRequest = {
            owner: target.owner,
            repo: target.repo,
            ...(target.ref ? { ref: target.ref } : {}),
            ...(target.scope ? { scope: target.scope } : {}),
          };
          snapshot = await services.ingestRepository(request, { signal: controller.signal, onEvent });
        }
        await classifyAndComplete(snapshot, runId, controller.signal);
      } catch (error) {
        if (isAbortError(error)) return; // a cancel or dispose action already updated the state
        store.update((s) => failIngestion(s, runId, toApiError(error), services.now()));
      } finally {
        if (current === controller) current = null;
      }
    })();
  }

  /** The classifying stage, then ONE completion update carrying the snapshot, the result, and the corrections. */
  async function classifyAndComplete(snapshot: RepoSnapshot, runId: number, signal: AbortSignal): Promise<void> {
    if (!services.analyze) {
      store.update((s) => finishClassifying(s, runId, 'skipped'));
      store.update((s) => completeIngestion(s, runId, snapshot, services.now()));
      return;
    }
    store.update((s) => beginClassifying(s, runId));
    let corrections: Record<string, Label[]> = {};
    try {
      corrections = services.loadCorrections?.(snapshot) ?? {};
    } catch {
      corrections = {};
    }
    try {
      const result = await services.analyze(snapshot, {
        signal,
        onProgress: (p) => store.update((s) => classifyProgressed(s, runId, p.done, p.total)),
      });
      if (signal.aborted) throw new AnalysisAbortError();
      store.update((s) => finishClassifying(s, runId, 'done'));
      const now = services.now();
      store.update((s) => {
        const next = completeIngestion(s, runId, snapshot, now, understandingDone(result, corrections));
        return next === s ? s : { ...next, ...withLog(next, now, { action: 'understanding_done', status: 'info', message: doneMessage(result, corrections) }) };
      });
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw error;
      store.update((s) => finishClassifying(s, runId, 'failed'));
      const now = services.now();
      store.update((s) => {
        const next = completeIngestion(s, runId, snapshot, now, understandingFailed('The analysis could not finish.', corrections));
        return next === s ? s : { ...next, ...withLog(next, now, { action: 'understanding_failed', status: 'failed', message: 'Analysis failed.' }) };
      });
    }
  }

  const actions: IngestionActions = {
    submitInput(text) {
      const parsed = parseRepoInput(text);
      if (!parsed.ok) return parsed.message;
      run({ ...parsed.value, source: 'github' }, false);
      return null;
    },
    startSample(id) {
      if (!isSampleId(id)) return;
      run({ owner: 'sample', repo: id, source: 'sample', sampleId: id }, false);
    },
    loadFolders(folders) {
      const snapshot = store.getState().snapshot;
      if (!snapshot || snapshot.source !== 'github' || folders.length === 0) return;
      run({ owner: snapshot.owner, repo: snapshot.name, ref: snapshot.ref, scope: folders, source: 'github' }, true);
    },
    retry() {
      const { ingestion } = store.getState();
      if (ingestion.status !== 'failed' || !ingestion.target) return;
      run(ingestion.target, ingestion.background);
    },
    cancel() {
      current?.abort();
      store.update((s) => cancelIngestion(s, services.now()));
    },
    dismissError() {
      store.update((s) => dismissError(s));
    },
    backToStart() {
      current?.abort();
      store.update((s) => reset(s));
    },
    restore(target) {
      const problem = validateTarget(target);
      if (problem) return problem;
      run(toIngestTarget(target), false);
      return null;
    },
  };

  return {
    actions,
    dispose() {
      current?.abort();
      current = null;
      // Without this, aborting would leave the store showing a run that will never finish.
      store.update((s) => cancelIngestion(s, services.now()));
    },
  };
}

export function useIngestion(): IngestionActions {
  const controller = useMemo(() => createIngestionController(), []);
  useEffect(() => () => controller.dispose(), [controller]);
  return controller.actions;
}
