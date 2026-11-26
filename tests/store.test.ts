// @node: F1.7
import { describe, expect, it, vi } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import {
  MAX_LOG_ENTRIES,
  applyEvent,
  beginIngestion,
  cancelIngestion,
  completeIngestion,
  createStore,
  describeTarget,
  dismissError,
  failIngestion,
  initialState,
  reset,
  type IngestTarget,
  type StudioState,
} from '../src/store/useStudioStore';
import type { ApiError, IngestEvent } from '../src/types/contracts';

const target: IngestTarget = { owner: 'octo', repo: 'demo', source: 'github' };
const sampleTarget: IngestTarget = { owner: 'sample', repo: 'static-site', source: 'sample', sampleId: 'static-site' };
const snapshot = buildSampleSnapshot('static-site', 1);
const apiError: ApiError = { code: 'not_found', message: 'nope' };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** A state in the middle of a run, and its run id. */
function running(t: IngestTarget = target, opts: { keepSnapshot?: boolean; from?: StudioState } = {}) {
  const state = beginIngestion(opts.from ?? initialState(), t, 100, opts.keepSnapshot ? { keepSnapshot: true } : {});
  return { state, runId: state.ingestion.runId };
}

const stage = (s: IngestEvent & { type: 'stage' }): IngestEvent => s;
const started = (name: 'resolving_ref' | 'fetching_tree' | 'loading_sources'): IngestEvent =>
  stage({ type: 'stage', stage: name, status: 'started' });
const finished = (name: 'resolving_ref' | 'fetching_tree' | 'loading_sources'): IngestEvent =>
  stage({ type: 'stage', stage: name, status: 'finished' });

describe('initialState', () => {
  it('starts on the Start screen with idle ingestion and an empty log', () => {
    const s = initialState();
    expect(s.experience).toBe('start');
    expect(s.snapshot).toBeUndefined();
    expect(s.log).toEqual([]);
    expect(s.ingestion).toMatchObject({ status: 'idle', runId: 0, background: false, notices: [] });
  });

  it('marks only preparing_preview as not available and the rest pending', () => {
    expect(initialState().ingestion.stages).toEqual({
      resolving_ref: 'pending',
      fetching_tree: 'pending',
      classifying: 'pending',
      loading_sources: 'pending',
      preparing_preview: 'not_available',
    });
  });
});

describe('beginIngestion', () => {
  it('moves to Loading, records the target, bumps the run id, and logs', () => {
    const { state } = running();
    expect(state.experience).toBe('loading');
    expect(state.ingestion).toMatchObject({ status: 'running', runId: 1, target, background: false });
    expect(state.log).toHaveLength(1);
    expect(state.log[0]).toMatchObject({ action: 'ingest_started', timestamp: 100, redacted: false });
    expect(state.log[0]!.message).toContain('octo/demo');
  });

  it('is ignored while a run is active (same state object)', () => {
    const { state } = running();
    expect(beginIngestion(state, sampleTarget, 200)).toBe(state);
  });

  it('can start again after a failure, clearing the error and resetting stages', () => {
    const { state, runId } = running();
    const failed = failIngestion(applyEvent(state, runId, started('fetching_tree'), 0), runId, apiError, 150);
    const again = beginIngestion(failed, target, 200);
    expect(again.ingestion.status).toBe('running');
    expect(again.ingestion.runId).toBe(2);
    expect(again.ingestion.error).toBeUndefined();
    expect(again.ingestion.stages.fetching_tree).toBe('pending');
  });

  it('clears an earlier snapshot for a normal run', () => {
    const { state, runId } = running();
    const done = completeIngestion(state, runId, snapshot, 120);
    const next = beginIngestion(done, target, 300);
    expect(next.snapshot).toBeUndefined();
    expect(next.experience).toBe('loading');
  });

  it('with keepSnapshot, stays in Studio and keeps the old snapshot', () => {
    const { state, runId } = running();
    const done = completeIngestion(state, runId, snapshot, 120);
    const next = beginIngestion(done, { ...target, scope: ['src'] }, 300, { keepSnapshot: true });
    expect(next.experience).toBe('studio');
    expect(next.snapshot).toBe(snapshot);
    expect(next.ingestion).toMatchObject({ status: 'running', background: true });
  });

  it('keepSnapshot without a snapshot behaves like a normal run', () => {
    const next = beginIngestion(initialState(), target, 1, { keepSnapshot: true });
    expect(next.experience).toBe('loading');
    expect(next.ingestion.background).toBe(false);
  });
});

describe('applyEvent: stage status comes only from events', () => {
  it('walks started to active and finished to done, and stores the detail', () => {
    const { state, runId } = running();
    const a = applyEvent(state, runId, started('resolving_ref'), 0);
    expect(a.ingestion.stages.resolving_ref).toBe('active');
    const b = applyEvent(a, runId, { type: 'stage', stage: 'resolving_ref', status: 'finished', detail: 'Default branch "main".' }, 0);
    expect(b.ingestion.stages.resolving_ref).toBe('done');
    expect(b.ingestion.stageDetails.resolving_ref).toBe('Default branch "main".');
    expect(b.ingestion.stages.fetching_tree).toBe('pending');
  });

  it('records a skipped stage', () => {
    const { state, runId } = running();
    const s = applyEvent(state, runId, { type: 'stage', stage: 'resolving_ref', status: 'skipped' }, 0);
    expect(s.ingestion.stages.resolving_ref).toBe('skipped');
  });

  it('never changes the one stage that does not exist yet', () => {
    const { state, runId } = running();
    for (const name of ['preparing_preview'] as const) {
      const s = applyEvent(state, runId, { type: 'stage', stage: name, status: 'started' }, 0);
      expect(s).toBe(state);
      expect(state.ingestion.stages[name]).toBe('not_available');
    }
  });

  it('stores progress only from progress events, with both numbers', () => {
    const { state, runId } = running();
    expect(state.ingestion.progress).toBeUndefined();
    const s = applyEvent(state, runId, { type: 'progress', stage: 'loading_sources', loaded: 3, total: 10 }, 0);
    expect(s.ingestion.progress).toEqual({ loaded: 3, total: 10 });
  });

  it('ignores result and error events: they never change stage status or finish the run', () => {
    const { state, runId } = running();
    const r = applyEvent(state, runId, { type: 'result', response: { snapshot } }, 0);
    const e = applyEvent(state, runId, { type: 'error', error: apiError }, 0);
    expect(r).toBe(state);
    expect(e).toBe(state);
  });

  it('resets stages, progress, and details on the fallback notice, and records it', () => {
    let { state, runId } = running();
    state = applyEvent(state, runId, { type: 'stage', stage: 'resolving_ref', status: 'finished', detail: 'x' }, 0);
    state = applyEvent(state, runId, started('fetching_tree'), 0);
    state = applyEvent(state, runId, { type: 'progress', stage: 'loading_sources', loaded: 1, total: 2 }, 0);
    const s = applyEvent(state, runId, { type: 'notice', code: 'fallback_in_use', message: 'Using fallback.' }, 555);
    expect(s.ingestion.stages).toEqual(initialState().ingestion.stages);
    expect(s.ingestion.stageDetails).toEqual({});
    expect(s.ingestion.progress).toBeUndefined();
    expect(s.ingestion.notices).toEqual(['Using fallback.']);
    expect(s.log[s.log.length - 1]).toMatchObject({ action: 'ingest_fallback', timestamp: 555, message: 'Using fallback.' });
    expect(s.ingestion.status).toBe('running');
  });

  it('ignores events from a stale run id and events when nothing is running', () => {
    const { state, runId } = running();
    expect(applyEvent(state, runId + 1, started('fetching_tree'), 0)).toBe(state);
    expect(applyEvent(initialState(), 0, started('fetching_tree'), 0)).toEqual(initialState());
    const cancelled = cancelIngestion(state, 5);
    expect(applyEvent(cancelled, runId, started('fetching_tree'), 0)).toBe(cancelled);
  });
});

describe('completeIngestion: done only after the snapshot is supplied', () => {
  it('leaves the run running and the screen on Loading until completeIngestion is called', () => {
    let { state, runId } = running();
    for (const name of ['resolving_ref', 'fetching_tree', 'loading_sources'] as const) {
      state = applyEvent(state, runId, started(name), 0);
      state = applyEvent(state, runId, finished(name), 0);
    }
    expect(state.ingestion.status).toBe('running');
    expect(state.experience).toBe('loading');
    expect(state.snapshot).toBeUndefined();

    const done = completeIngestion(state, runId, snapshot, 900);
    expect(done.ingestion.status).toBe('done');
    expect(done.experience).toBe('studio');
    expect(done.snapshot).toBe(snapshot);
    expect(done.ingestion.error).toBeUndefined();
    expect(done.log[done.log.length - 1]).toMatchObject({ action: 'ingest_completed', timestamp: 900 });
  });

  it('ignores a stale completion after cancel and a new run (late result cannot hijack it)', () => {
    const first = running();
    const cancelled = cancelIngestion(first.state, 110);
    const second = beginIngestion(cancelled, target, 120);
    expect(second.ingestion.runId).toBe(first.runId + 1);
    expect(completeIngestion(second, first.runId, snapshot, 130)).toBe(second);
  });

  it('ignores completion when no run is active', () => {
    const s = initialState();
    expect(completeIngestion(s, 0, snapshot, 1)).toBe(s);
  });

  it('labels samples in the log', () => {
    const { state, runId } = running(sampleTarget);
    const done = completeIngestion(state, runId, snapshot, 5);
    expect(done.log[0]!.message).toContain('sample "static-site"');
    expect(done.log[done.log.length - 1]!.message).toContain('sample "static-site"');
  });
});

describe('failIngestion', () => {
  it('marks the run failed, keeps the error, and turns active stages into failed', () => {
    let { state, runId } = running();
    state = applyEvent(state, runId, finished('resolving_ref'), 0);
    state = applyEvent(state, runId, started('fetching_tree'), 0);
    const failed = failIngestion(state, runId, apiError, 700);
    expect(failed.ingestion.status).toBe('failed');
    expect(failed.ingestion.error).toEqual(apiError);
    expect(failed.ingestion.stages.fetching_tree).toBe('failed');
    expect(failed.ingestion.stages.resolving_ref).toBe('done');
    expect(failed.experience).toBe('loading');
    expect(failed.snapshot).toBeUndefined();
    expect(failed.log[failed.log.length - 1]).toMatchObject({ action: 'ingest_failed', status: 'failed' });
  });

  it('keeps Studio and the old snapshot when a background run fails', () => {
    const first = running();
    const done = completeIngestion(first.state, first.runId, snapshot, 1);
    const bg = running(target, { from: done, keepSnapshot: true });
    const failed = failIngestion(bg.state, bg.runId, apiError, 2);
    expect(failed.experience).toBe('studio');
    expect(failed.snapshot).toBe(snapshot);
    expect(failed.ingestion).toMatchObject({ status: 'failed', error: apiError });
  });

  it('ignores a stale or inactive failure', () => {
    const { state, runId } = running();
    expect(failIngestion(state, runId + 5, apiError, 1)).toBe(state);
    const s = initialState();
    expect(failIngestion(s, 0, apiError, 1)).toBe(s);
  });
});

describe('cancelIngestion', () => {
  it('returns to Start, discards partial data, and logs the cancellation', () => {
    let { state, runId } = running();
    state = applyEvent(state, runId, started('loading_sources'), 0);
    state = applyEvent(state, runId, { type: 'progress', stage: 'loading_sources', loaded: 2, total: 9 }, 0);
    const c = cancelIngestion(state, 300);
    expect(c.experience).toBe('start');
    expect(c.snapshot).toBeUndefined();
    expect(c.ingestion.status).toBe('idle');
    expect(c.ingestion.progress).toBeUndefined();
    expect(c.ingestion.stages).toEqual(initialState().ingestion.stages);
    expect(c.ingestion.error).toBeUndefined();
    expect(c.log[c.log.length - 1]).toMatchObject({ action: 'ingest_cancelled', timestamp: 300 });
  });

  it('keeps the old snapshot and Studio when a background run is cancelled', () => {
    const first = running();
    const done = completeIngestion(first.state, first.runId, snapshot, 1);
    const bg = running(target, { from: done, keepSnapshot: true });
    const c = cancelIngestion(bg.state, 5);
    expect(c.experience).toBe('studio');
    expect(c.snapshot).toBe(snapshot);
    expect(c.ingestion.status).toBe('done');
    expect(c.ingestion.background).toBe(false);
  });

  it('is a no-op when nothing is running', () => {
    const s = initialState();
    expect(cancelIngestion(s, 1)).toBe(s);
    const done = completeIngestion(running().state, 1, snapshot, 2);
    expect(cancelIngestion(done, 3)).toBe(done);
  });

  it('keeps the run id so a late result from the cancelled run is recognisably stale', () => {
    const { state, runId } = running();
    expect(cancelIngestion(state, 1).ingestion.runId).toBe(runId);
  });
});

describe('dismissError', () => {
  it('clears a failed background run and keeps the snapshot and Studio', () => {
    const first = running();
    const done = completeIngestion(first.state, first.runId, snapshot, 1);
    const bg = running(target, { from: done, keepSnapshot: true });
    const failed = failIngestion(bg.state, bg.runId, apiError, 2);
    const dismissed = dismissError(failed);
    expect(dismissed.experience).toBe('studio');
    expect(dismissed.snapshot).toBe(snapshot);
    expect(dismissed.ingestion).toMatchObject({ status: 'done', background: false });
    expect(dismissed.ingestion.error).toBeUndefined();
  });

  it('does nothing for a failed first load, a running run, or an idle state', () => {
    const { state, runId } = running();
    const failed = failIngestion(state, runId, apiError, 2);
    expect(dismissError(failed)).toBe(failed);
    expect(dismissError(state)).toBe(state);
    const idle = initialState();
    expect(dismissError(idle)).toBe(idle);
  });
});

describe('reset', () => {
  it('returns to Start and clears the snapshot but keeps the log', () => {
    const { state, runId } = running();
    const done = completeIngestion(state, runId, snapshot, 5);
    const r = reset(done);
    expect(r.experience).toBe('start');
    expect(r.snapshot).toBeUndefined();
    expect(r.ingestion.status).toBe('idle');
    expect(r.log).toEqual(done.log);
  });
});

describe('session log', () => {
  it('is capped at the maximum, keeps the newest entries, and has unique increasing ids', () => {
    let s = initialState();
    for (let i = 0; i < MAX_LOG_ENTRIES + 100; i++) {
      s = beginIngestion(s, target, i);
      s = cancelIngestion(s, i);
    }
    expect(s.log).toHaveLength(MAX_LOG_ENTRIES);
    const seqs = s.log.map((e) => Number(e.id.replace('log-', '')));
    expect(new Set(seqs).size).toBe(MAX_LOG_ENTRIES);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(seqs[seqs.length - 1]).toBe((MAX_LOG_ENTRIES + 100) * 2);
  });

  it('never marks entries as unredacted-secret carriers: redacted is false and paths are empty for ingestion events', () => {
    const { state } = running();
    expect(state.log.every((e) => e.redacted === false && e.affectedPaths.length === 0)).toBe(true);
  });
});

describe('purity', () => {
  it('never mutates the state it is given', () => {
    let s = deepFreeze(initialState());
    const run = () => {
      s = deepFreeze(beginIngestion(s, target, 1));
      const id = s.ingestion.runId;
      s = deepFreeze(applyEvent(s, id, started('resolving_ref'), 2));
      s = deepFreeze(applyEvent(s, id, { type: 'progress', stage: 'loading_sources', loaded: 1, total: 2 }, 3));
      s = deepFreeze(applyEvent(s, id, { type: 'notice', code: 'fallback_in_use', message: 'm' }, 4));
      s = deepFreeze(failIngestion(s, id, apiError, 5));
      s = deepFreeze(beginIngestion(s, target, 6));
      s = deepFreeze(completeIngestion(s, s.ingestion.runId, snapshot, 7));
      s = deepFreeze(beginIngestion(s, target, 8, { keepSnapshot: true }));
      s = deepFreeze(cancelIngestion(s, 9));
      s = deepFreeze(reset(s));
    };
    expect(run).not.toThrow();
    expect(s.experience).toBe('start');
  });
});

describe('describeTarget', () => {
  it('formats github and sample targets', () => {
    expect(describeTarget(target)).toBe('octo/demo');
    expect(describeTarget({ ...target, ref: 'dev' })).toBe('octo/demo@dev');
    expect(describeTarget(sampleTarget)).toBe('sample "static-site"');
  });
});

describe('createStore', () => {
  it('notifies subscribers on change, not when the same state is set again', () => {
    const store = createStore({ n: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    const same = store.getState();
    store.setState(same);
    expect(listener).not.toHaveBeenCalled();
    store.update((s) => ({ n: s.n + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().n).toBe(1);
  });

  it('stops notifying after unsubscribe and supports several listeners', () => {
    const store = createStore(0);
    const a = vi.fn();
    const b = vi.fn();
    const offA = store.subscribe(a);
    store.subscribe(b);
    store.setState(1);
    offA();
    store.setState(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('survives a listener that unsubscribes during notification', () => {
    const store = createStore(0);
    const calls: string[] = [];
    const offFirst = store.subscribe(() => {
      calls.push('first');
      offFirst();
    });
    store.subscribe(() => calls.push('second'));
    store.setState(1);
    store.setState(2);
    expect(calls).toEqual(['first', 'second', 'second']);
  });
});
