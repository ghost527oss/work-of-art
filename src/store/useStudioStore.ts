// @node: F1.7
// @node: F4.5 (adds the `work` field)
// @node: F5.7 (adds `understanding` and the classifying stage actions)
// Shared application state for the experience stage, the ingestion run, the loaded
// snapshot, and the session log. State changes are pure functions; the store is a small
// subscribe/update container read with `useSyncExternalStore`.
//
// This module never performs network calls or starts timers. Components call the
// ingestion service (see `useIngestion`) and dispatch the results here.
//
// Rules enforced here:
//  - Stage status changes only inside `applyEvent`, driven by real events.
//  - `done` and the move to Studio happen only in `completeIngestion`, which the caller
//    invokes after the snapshot has been validated.
//  - Actions that come from async work carry a `runId`. A stale run (cancelled or
//    replaced) can never change the state of a newer one.
import { useSyncExternalStore } from 'react';
import {
  NOT_YET_AVAILABLE_STAGES,
  type ApiError,
  type IngestEvent,
  type IngestStage,
  type RepoSnapshot,
  type SessionLogEntry,
} from '../types/contracts';

import { idleAI, type AIState } from './aiSlice';
import { idleUnderstanding, type UnderstandingState } from './understandingSlice';
import { idleWork, type WorkState } from './workSlice';

export type ExperienceStage = 'start' | 'loading' | 'studio';
export type IngestionStatus = 'idle' | 'running' | 'failed' | 'done';
export type StageStatus = 'pending' | 'active' | 'done' | 'skipped' | 'failed' | 'not_available';

export interface IngestTarget {
  owner: string;
  repo: string;
  ref?: string;
  scope?: string[];
  source: 'github' | 'sample';
  sampleId?: string;
}

export interface IngestionState {
  status: IngestionStatus;
  /** Incremented by every `beginIngestion`. Async results must quote the id they started with. */
  runId: number;
  target?: IngestTarget;
  /** True when the run replaces an already loaded snapshot (scoped reload). The old one stays visible. */
  background: boolean;
  stages: Record<IngestStage, StageStatus>;
  stageDetails: Partial<Record<IngestStage, string>>;
  /** Present only when both numbers are known. */
  progress?: { loaded: number; total: number };
  /** Set only while the `classifying` stage is active and both numbers are known. */
  classifyProgress?: { done: number; total: number };
  notices: string[];
  error?: ApiError;
}

export interface StudioState {
  experience: ExperienceStage;
  ingestion: IngestionState;
  snapshot?: RepoSnapshot;
  ai: AIState;
  work: WorkState;
  understanding: UnderstandingState;
  log: SessionLogEntry[];
  logSeq: number;
}

export const MAX_LOG_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshStages(): Record<IngestStage, StageStatus> {
  return {
    resolving_ref: 'pending',
    fetching_tree: 'pending',
    classifying: 'pending',
    loading_sources: 'pending',
    preparing_preview: NOT_YET_AVAILABLE_STAGES.includes('preparing_preview') ? 'not_available' : 'pending',
  };
}

function idleIngestion(runId: number): IngestionState {
  return { status: 'idle', runId, background: false, stages: freshStages(), stageDetails: {}, notices: [] };
}

export function initialState(): StudioState {
  return { experience: 'start', ingestion: idleIngestion(0), ai: idleAI(), work: idleWork(), understanding: idleUnderstanding(), log: [], logSeq: 0 };
}

export function describeTarget(target: IngestTarget): string {
  if (target.source === 'sample') return `sample "${target.sampleId ?? target.repo}"`;
  return `${target.owner}/${target.repo}${target.ref ? `@${target.ref}` : ''}`;
}

/** @internal Exported for aiActions.ts only. Do not use elsewhere. */
export function withLog(
  state: StudioState,
  now: number,
  entry: { action: string; status: SessionLogEntry['status']; message: string; affectedPaths?: string[] },
): Pick<StudioState, 'log' | 'logSeq'> {
  const logSeq = state.logSeq + 1;
  const next: SessionLogEntry = {
    id: `log-${logSeq}`,
    timestamp: now,
    action: entry.action,
    status: entry.status,
    affectedPaths: entry.affectedPaths ?? [],
    message: entry.message,
    redacted: false,
  };
  const log = [...state.log, next];
  return { log: log.length > MAX_LOG_ENTRIES ? log.slice(log.length - MAX_LOG_ENTRIES) : log, logSeq };
}

function isCurrentRun(state: StudioState, runId: number): boolean {
  return state.ingestion.status === 'running' && state.ingestion.runId === runId;
}

// ---------------------------------------------------------------------------
// Pure actions
// ---------------------------------------------------------------------------

/**
 * Starts an ingestion run. Ignored (same state returned) while a run is already
 * active, so rapid repeated submits cannot start two runs. With `keepSnapshot`, the
 * current snapshot and the Studio screen stay in place until the new one validates.
 */
export function beginIngestion(
  state: StudioState,
  target: IngestTarget,
  now: number,
  options: { keepSnapshot?: boolean } = {},
): StudioState {
  if (state.ingestion.status === 'running') return state;
  const background = options.keepSnapshot === true && state.snapshot !== undefined;
  const base: StudioState = background ? state : { ...state, snapshot: undefined, ai: idleAI(), work: idleWork(), understanding: idleUnderstanding() };
  return {
    ...base,
    experience: background ? 'studio' : 'loading',
    ingestion: {
      status: 'running',
      runId: state.ingestion.runId + 1,
      target,
      background,
      stages: freshStages(),
      stageDetails: {},
      notices: [],
    },
    ...withLog(state, now, { action: 'ingest_started', status: 'info', message: `Loading ${describeTarget(target)}.` }),
  };
}

/** Applies one pipeline event. `result` and `error` events never change state: completion goes through the other actions. */
export function applyEvent(state: StudioState, runId: number, event: IngestEvent, now: number = Date.now()): StudioState {
  if (!isCurrentRun(state, runId)) return state;
  const ing = state.ingestion;

  switch (event.type) {
    case 'stage': {
      if (ing.stages[event.stage] === 'not_available') return state;
      const status: StageStatus =
        event.status === 'started' ? 'active' : event.status === 'finished' ? 'done' : 'skipped';
      const stageDetails = event.detail === undefined ? ing.stageDetails : { ...ing.stageDetails, [event.stage]: event.detail };
      return { ...state, ingestion: { ...ing, stages: { ...ing.stages, [event.stage]: status }, stageDetails } };
    }
    case 'progress':
      return { ...state, ingestion: { ...ing, progress: { loaded: event.loaded, total: event.total } } };
    case 'notice': {
      // The fallback restarts the pipeline from the beginning: earlier stage statuses no longer apply.
      const { progress: _dropped, ...rest } = ing;
      void _dropped;
      return {
        ...state,
        ingestion: { ...rest, stages: freshStages(), stageDetails: {}, notices: [...ing.notices, event.message] },
        ...withLog(state, now, { action: 'ingest_fallback', status: 'info', message: event.message }),
      };
    }
    default:
      return state;
  }
}

/** Stores a validated snapshot and moves to Studio. The only way `status` becomes `done`. */
export function completeIngestion(state: StudioState, runId: number, snapshot: RepoSnapshot, now: number, understanding?: UnderstandingState): StudioState {
  if (!isCurrentRun(state, runId)) return state;
  const { error: _error, progress: _progress, classifyProgress: _cp, ...ing } = state.ingestion;
  void _error;
  void _progress;
  void _cp;
  const target = state.ingestion.target;
  const label = target ? describeTarget(target) : `${snapshot.owner}/${snapshot.name}`;
  return {
    ...state,
    experience: 'studio',
    snapshot,
    ai: idleAI(),
    work: idleWork(),
    understanding: understanding ?? idleUnderstanding(),
    ingestion: { ...ing, status: 'done', background: false },
    ...withLog(state, now, {
      action: 'ingest_completed',
      status: 'info',
      message: `Loaded ${label}: ${snapshot.coverage.indexedPaths} paths indexed, ${snapshot.coverage.loadedSourceFiles} files loaded.`,
    }),
  };
}

/** Records a failed run. Active stages become `failed`. A background run keeps Studio and the old snapshot. */
export function failIngestion(state: StudioState, runId: number, error: ApiError, now: number): StudioState {
  if (!isCurrentRun(state, runId)) return state;
  const stages = { ...state.ingestion.stages };
  for (const stage of Object.keys(stages) as IngestStage[]) {
    if (stages[stage] === 'active') stages[stage] = 'failed';
  }
  return {
    ...state,
    ingestion: { ...state.ingestion, status: 'failed', stages, error },
    ...withLog(state, now, { action: 'ingest_failed', status: 'failed', message: `${error.code}: ${error.message}` }),
  };
}

/** Cancels the running ingestion and discards partial data. No-op when nothing is running. */
export function cancelIngestion(state: StudioState, now: number): StudioState {
  if (state.ingestion.status !== 'running') return state;
  const label = state.ingestion.target ? describeTarget(state.ingestion.target) : 'the repository';
  const log = withLog(state, now, { action: 'ingest_cancelled', status: 'info', message: `Cancelled loading ${label}.` });
  if (state.ingestion.background && state.snapshot) {
    return { ...state, experience: 'studio', ingestion: { ...idleIngestion(state.ingestion.runId), status: 'done' }, ...log };
  }
  return { ...state, experience: 'start', snapshot: undefined, ai: idleAI(), work: idleWork(), understanding: idleUnderstanding(), ingestion: idleIngestion(state.ingestion.runId), ...log };
}

/**
 * Dismisses the error of a failed background run (scoped reload) and keeps the current
 * snapshot. Does nothing for any other state: a failed first load goes back via `reset`.
 */
export function dismissError(state: StudioState): StudioState {
  if (state.ingestion.status !== 'failed' || !state.ingestion.background || !state.snapshot) return state;
  return { ...state, experience: 'studio', ingestion: { ...idleIngestion(state.ingestion.runId), status: 'done' } };
}

/** Returns to the Start screen and clears the snapshot. The session log is kept. */
export function reset(state: StudioState): StudioState {
  return { ...state, experience: 'start', snapshot: undefined, ai: idleAI(), work: idleWork(), understanding: idleUnderstanding(), ingestion: idleIngestion(state.ingestion.runId) };
}

// ---------------------------------------------------------------------------
// The client-owned `classifying` stage (sub-phase 2C)
// ---------------------------------------------------------------------------

/** Marks `classifying` active and clears its progress. Ignored for a stale run. */
export function beginClassifying(state: StudioState, runId: number): StudioState {
  if (!isCurrentRun(state, runId)) return state;
  const { classifyProgress: _cp, ...ing } = state.ingestion;
  void _cp;
  return { ...state, ingestion: { ...ing, stages: { ...ing.stages, classifying: 'active' } } };
}

export function classifyProgressed(state: StudioState, runId: number, done: number, total: number): StudioState {
  if (!isCurrentRun(state, runId) || state.ingestion.stages.classifying !== 'active') return state;
  return { ...state, ingestion: { ...state.ingestion, classifyProgress: { done, total } } };
}

/** Sets the stage status only. It never fails the run. */
export function finishClassifying(state: StudioState, runId: number, status: 'done' | 'failed' | 'skipped'): StudioState {
  if (!isCurrentRun(state, runId)) return state;
  const { classifyProgress: _cp, ...ing } = state.ingestion;
  void _cp;
  return { ...state, ingestion: { ...ing, stages: { ...ing.stages, classifying: status } } };
}

// ---------------------------------------------------------------------------
// Store container and hook
// ---------------------------------------------------------------------------

export interface Store<S> {
  getState(): S;
  /** Replaces the state. Listeners run only when the reference changes. */
  setState(next: S): void;
  update(fn: (state: S) => S): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  const store: Store<S> = {
    getState: () => state,
    setState(next) {
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    update(fn) {
      store.setState(fn(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

export const studioStore: Store<StudioState> = createStore(initialState());

/** Reads a slice of the state. The selector must return a primitive or an existing reference, never a fresh object. */
export function useStudioStore<T>(selector: (state: StudioState) => T): T {
  return useSyncExternalStore(
    studioStore.subscribe,
    () => selector(studioStore.getState()),
    () => selector(studioStore.getState()),
  );
}
