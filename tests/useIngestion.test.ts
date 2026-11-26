// @node: F1.7
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { IngestError } from '../src/engine/githubSource';
import { createIngestionController, type IngestionServices } from '../src/hooks/useIngestion';
import { createStore, initialState, type Store, type StudioState } from '../src/store/useStudioStore';
import type { IngestEvent, RepoRequest, RepoSnapshot } from '../src/types/contracts';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Call {
  kind: 'repo' | 'sample';
  request?: RepoRequest;
  sampleId?: string;
  signal: AbortSignal;
  onEvent: (e: IngestEvent) => void;
  result: Deferred<RepoSnapshot>;
}

function setup() {
  const store: Store<StudioState> = createStore(initialState());
  const calls: Call[] = [];
  let clock = 1000;
  const services: IngestionServices = {
    ingestRepository(request, options) {
      const result = deferred<RepoSnapshot>();
      calls.push({ kind: 'repo', request, ...options, result });
      return result.promise;
    },
    ingestSample(id, options) {
      const result = deferred<RepoSnapshot>();
      calls.push({ kind: 'sample', sampleId: id, ...options, result });
      return result.promise;
    },
    now: () => ++clock,
  };
  const controller = createIngestionController(store, services);
  return { store, calls, controller, actions: controller.actions };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const githubSnapshot = (): RepoSnapshot => ({ ...buildSampleSnapshot('static-site', 1), source: 'github', owner: 'octo', name: 'demo', ref: 'main' });

// ---------------------------------------------------------------------------

describe('submitInput', () => {
  it('returns the validation message for bad input and starts nothing', () => {
    const { store, calls, actions } = setup();
    for (const bad of ['', 'not a url', 'https://gitlab.com/o/r']) {
      expect(actions.submitInput(bad), bad).toMatch(/github\.com\/owner\/repo|repository URL/i);
    }
    expect(calls).toHaveLength(0);
    expect(store.getState().ingestion.status).toBe('idle');
    expect(store.getState().experience).toBe('start');
  });

  it('starts a run for valid input, passing exactly owner and repo', () => {
    const { store, calls, actions } = setup();
    expect(actions.submitInput('https://github.com/octo/demo')).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.request).toEqual({ owner: 'octo', repo: 'demo' });
    expect(store.getState()).toMatchObject({ experience: 'loading', ingestion: { status: 'running', runId: 1 } });
  });

  it('passes a ref from a /tree/ URL', () => {
    const { calls, actions } = setup();
    actions.submitInput('https://github.com/octo/demo/tree/feature/x');
    expect(calls[0]!.request).toEqual({ owner: 'octo', repo: 'demo', ref: 'feature/x' });
  });

  it('ignores a second submit while a run is active', () => {
    const { calls, actions } = setup();
    actions.submitInput('octo/demo');
    expect(actions.submitInput('octo/other')).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe('a successful run', () => {
  it('applies events as they arrive and moves to Studio only after the result', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/demo');
    const call = calls[0]!;
    call.onEvent({ type: 'stage', stage: 'resolving_ref', status: 'started' });
    expect(store.getState().ingestion.stages.resolving_ref).toBe('active');
    call.onEvent({ type: 'progress', stage: 'loading_sources', loaded: 2, total: 5 });
    expect(store.getState().ingestion.progress).toEqual({ loaded: 2, total: 5 });
    expect(store.getState().experience).toBe('loading');

    call.result.resolve(githubSnapshot());
    await flush();
    const s = store.getState();
    expect(s.experience).toBe('studio');
    expect(s.ingestion.status).toBe('done');
    expect(s.snapshot?.name).toBe('demo');
  });

  it('uses the injected clock for log timestamps', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/demo');
    calls[0]!.result.resolve(githubSnapshot());
    await flush();
    const stamps = store.getState().log.map((e) => e.timestamp);
    expect(stamps.every((t) => t > 1000)).toBe(true);
  });
});

describe('cancel and restart', () => {
  it('aborts the request, returns to Start, and ignores a late result', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/demo');
    const call = calls[0]!;
    actions.cancel();
    expect(call.signal.aborted).toBe(true);
    expect(store.getState()).toMatchObject({ experience: 'start', ingestion: { status: 'idle' } });
    expect(store.getState().snapshot).toBeUndefined();

    call.result.resolve(githubSnapshot()); // arrives too late
    await flush();
    expect(store.getState().experience).toBe('start');
    expect(store.getState().snapshot).toBeUndefined();
  });

  it('treats the AbortError of a cancelled run as a cancel, not a failure', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/demo');
    actions.cancel();
    calls[0]!.result.reject(new DOMException('aborted', 'AbortError'));
    await flush();
    expect(store.getState().ingestion.status).toBe('idle');
    expect(store.getState().ingestion.error).toBeUndefined();
  });

  it('a cancelled run can never overwrite the next run, even if it finishes later', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/first');
    actions.cancel();
    actions.submitInput('octo/second');
    expect(calls).toHaveLength(2);
    expect(store.getState().ingestion.runId).toBe(2);

    calls[1]!.result.resolve({ ...githubSnapshot(), name: 'second' });
    await flush();
    calls[0]!.result.resolve({ ...githubSnapshot(), name: 'first' }); // stale, late
    await flush();
    expect(store.getState().snapshot?.name).toBe('second');
  });

  it('a stale failure cannot fail the next run', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/first');
    actions.cancel();
    actions.submitInput('octo/second');
    calls[0]!.result.reject(new IngestError('timeout', 'late'));
    await flush();
    expect(store.getState().ingestion.status).toBe('running');
    expect(store.getState().ingestion.error).toBeUndefined();
  });
});

describe('dispose (component unmount)', () => {
  it('aborts the request and leaves the store idle on Start, not stuck on "running"', async () => {
    const { store, calls, controller, actions } = setup();
    actions.submitInput('octo/demo');
    controller.dispose();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(store.getState().ingestion.status).toBe('idle');
    expect(store.getState().experience).toBe('start');

    calls[0]!.result.resolve(githubSnapshot());
    await flush();
    expect(store.getState().snapshot).toBeUndefined();
  });

  it('is a no-op when nothing is running, and the controller stays usable afterwards', () => {
    const { store, calls, controller, actions } = setup();
    controller.dispose();
    controller.dispose();
    expect(store.getState()).toEqual(initialState());
    actions.submitInput('octo/demo');
    expect(calls).toHaveLength(1);
    expect(store.getState().ingestion.status).toBe('running');
  });

  it('keeps the old snapshot when a background reload is disposed', async () => {
    const { store, calls, controller, actions } = setup();
    actions.submitInput('octo/demo');
    calls[0]!.result.resolve(githubSnapshot());
    await flush();
    actions.loadFolders(['src']);
    controller.dispose();
    expect(store.getState().experience).toBe('studio');
    expect(store.getState().snapshot?.name).toBe('demo');
    expect(store.getState().ingestion.status).toBe('done');
  });
});

describe('failures and retry', () => {
  it('records an IngestError with its code and message', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/demo');
    calls[0]!.result.reject(new IngestError('not_found', 'nope'));
    await flush();
    expect(store.getState().ingestion).toMatchObject({ status: 'failed', error: { code: 'not_found', message: 'nope' } });
    expect(store.getState().experience).toBe('loading');
  });

  it('keeps the reset time of a rate limit', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/demo');
    calls[0]!.result.reject(new IngestError('rate_limited', 'slow down', '2030-01-01T00:00:00.000Z'));
    await flush();
    expect(store.getState().ingestion.error?.resetAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('hides the message of an unexpected error', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('octo/demo');
    calls[0]!.result.reject(new Error('internal detail with /secret/path'));
    await flush();
    const error = store.getState().ingestion.error;
    expect(error?.code).toBe('upstream_failure');
    expect(error?.message).not.toMatch(/secret|internal/);
  });

  it('retry starts a new run for the same target', async () => {
    const { store, calls, actions } = setup();
    actions.submitInput('https://github.com/octo/demo/tree/dev');
    calls[0]!.result.reject(new IngestError('upstream_failure', 'boom'));
    await flush();
    actions.retry();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.request).toEqual({ owner: 'octo', repo: 'demo', ref: 'dev' });
    expect(store.getState().ingestion).toMatchObject({ status: 'running', runId: 2 });
    expect(store.getState().ingestion.error).toBeUndefined();
    calls[1]!.result.resolve(githubSnapshot());
    await flush();
    expect(store.getState().experience).toBe('studio');
  });

  it('retry does nothing unless the last run failed', () => {
    const { calls, actions } = setup();
    actions.retry();
    actions.submitInput('octo/demo');
    actions.retry();
    expect(calls).toHaveLength(1);
  });
});

describe('samples', () => {
  it('starts a known sample through the sample service, not the repository service', () => {
    const { store, calls, actions } = setup();
    actions.startSample('static-site');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'sample', sampleId: 'static-site' });
    expect(store.getState().ingestion.target).toMatchObject({ source: 'sample', sampleId: 'static-site' });
  });

  it('ignores an unknown sample id', () => {
    const { calls, actions } = setup();
    actions.startSample('nope');
    expect(calls).toHaveLength(0);
  });

  it('a failed repository load never starts a sample by itself', async () => {
    const { calls, actions } = setup();
    actions.submitInput('octo/demo');
    calls[0]!.result.reject(new IngestError('upstream_failure', 'boom'));
    await flush();
    expect(calls.filter((c) => c.kind === 'sample')).toHaveLength(0);
  });
});

describe('scoped reload (loadFolders)', () => {
  async function loaded() {
    const ctx = setup();
    ctx.actions.submitInput('octo/demo');
    ctx.calls[0]!.result.resolve(githubSnapshot());
    await flush();
    return ctx;
  }

  it('requests the loaded repository again with its resolved ref and the chosen folders', async () => {
    const { calls, actions, store } = await loaded();
    actions.loadFolders(['src', 'docs']);
    expect(calls[1]!.request).toEqual({ owner: 'octo', repo: 'demo', ref: 'main', scope: ['src', 'docs'] });
    expect(store.getState()).toMatchObject({ experience: 'studio', ingestion: { status: 'running', background: true } });
    expect(store.getState().snapshot?.name).toBe('demo');
  });

  it('keeps the old snapshot if the reload is cancelled or fails', async () => {
    const { calls, actions, store } = await loaded();
    actions.loadFolders(['src']);
    actions.cancel();
    expect(store.getState().snapshot?.name).toBe('demo');
    expect(store.getState().ingestion.status).toBe('done');

    actions.loadFolders(['src']);
    calls[2]!.result.reject(new IngestError('timeout', 'slow'));
    await flush();
    expect(store.getState().ingestion.status).toBe('failed');
    expect(store.getState().snapshot?.name).toBe('demo');
    expect(store.getState().experience).toBe('studio');
  });

  it('can retry and dismiss a failed reload', async () => {
    const { calls, actions, store } = await loaded();
    actions.loadFolders(['src']);
    calls[1]!.result.reject(new IngestError('timeout', 'slow'));
    await flush();
    actions.retry();
    expect(calls[2]!.request).toMatchObject({ scope: ['src'] });
    calls[2]!.result.reject(new IngestError('timeout', 'slow again'));
    await flush();
    actions.dismissError();
    expect(store.getState().ingestion.status).toBe('done');
    expect(store.getState().ingestion.error).toBeUndefined();
    expect(store.getState().snapshot?.name).toBe('demo');
  });

  it('does nothing without a snapshot, with no folders, or for a sample', async () => {
    const empty = setup();
    empty.actions.loadFolders(['src']);
    expect(empty.calls).toHaveLength(0);

    const { calls, actions } = await loaded();
    actions.loadFolders([]);
    expect(calls).toHaveLength(1);

    const sample = setup();
    sample.actions.startSample('static-site');
    sample.calls[0]!.result.resolve(buildSampleSnapshot('static-site', 1));
    await flush();
    sample.actions.loadFolders(['css']);
    expect(sample.calls).toHaveLength(1);
  });
});

describe('backToStart', () => {
  it('aborts a run in flight and clears the snapshot', async () => {
    const { calls, actions, store } = setup();
    actions.submitInput('octo/demo');
    actions.backToStart();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(store.getState().experience).toBe('start');
    calls[0]!.result.resolve(githubSnapshot());
    await flush();
    expect(store.getState().snapshot).toBeUndefined();
  });

  it('returns to Start from Studio', async () => {
    const { calls, actions, store } = setup();
    actions.submitInput('octo/demo');
    calls[0]!.result.resolve(githubSnapshot());
    await flush();
    actions.backToStart();
    expect(store.getState().experience).toBe('start');
    expect(store.getState().snapshot).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2G (@node: F10.4): restore(target)
// ---------------------------------------------------------------------------
describe('restore (2G)', () => {
  it('a valid GitHub or sample target starts a foreground load; an invalid one starts nothing', async () => {
    const { store, calls, actions } = setup();
    expect(actions.restore({ source: 'github', owner: 'octo', repo: 'demo', ref: 'main', scope: ['src'] })).toBeNull();
    expect(store.getState().ingestion).toMatchObject({ status: 'running', background: false, target: { owner: 'octo', repo: 'demo', ref: 'main', scope: ['src'], source: 'github' } });
    await flush();
    expect(calls.length).toBeGreaterThan(0);
    const { store: s2, actions: a2 } = setup();
    expect(a2.restore({ source: 'sample', owner: 'sample', repo: 'static-site', sampleId: 'static-site' })).toBeNull();
    expect(s2.getState().ingestion.target).toMatchObject({ source: 'sample', sampleId: 'static-site' });
    for (const bad of [{ source: 'github', owner: 'bad owner', repo: 'x' }, { source: 'github', owner: 'o', repo: 'r', scope: ['a/../b'] }, { source: 'sample', owner: 'sample', repo: 'nope', sampleId: 'nope' }]) {
      const { store: s3, actions: a3 } = setup();
      expect(a3.restore(bad as never)).toBe('The saved repository address is not valid.');
      expect(s3.getState().ingestion.status).toBe('idle');
    }
  });
});
