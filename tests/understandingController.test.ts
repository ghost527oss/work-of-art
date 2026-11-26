// @node: F5.9
import { describe, expect, it, vi } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { AnalysisAbortError, analyzeProject } from '../src/engine/analyzeProject';
import { createUnderstandingController } from '../src/hooks/useUnderstanding';
import type { KeyValueStorage } from '../src/store/layoutStorage';
import { CORRECTIONS_KEY } from '../src/store/correctionsStorage';
import { idleUnderstanding, understandingDone } from '../src/store/understandingSlice';
import { beginIngestion, completeIngestion, createStore, initialState, reset, type StudioState } from '../src/store/useStudioStore';

const snap = buildSampleSnapshot('fullstack-api', 1);
const flush = () => new Promise((r) => setTimeout(r, 0));
function setup(analyze = (s: typeof snap, o: object) => analyzeProject(s, { ...o, yieldToMain: async () => undefined })) {
  const data = new Map<string, string>();
  const writes: string[] = [];
  const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { writes.push(k); data.set(k, v); }, removeItem: (k) => void data.delete(k) };
  const store = createStore<StudioState>({ ...initialState(), experience: 'studio', snapshot: snap });
  const c = createUnderstandingController(store, { storage, now: () => 1, analyze: analyze as never });
  return { store, c, data, writes };
}

describe('understanding controller', () => {
  it('run re-analyses, shows progress, and stores the result', async () => {
    const { store, c } = setup();
    c.actions.run();
    expect(store.getState().understanding.status).toBe('running');
    await flush(); await flush();
    expect(store.getState().understanding.status).toBe('done');
    c.dispose();
  });
  it('run is ignored while running or without a snapshot', () => {
    const analyze = vi.fn(() => new Promise<never>(() => undefined));
    const { store, c } = setup(analyze as never);
    c.actions.run(); c.actions.run();
    expect(analyze).toHaveBeenCalledTimes(1);
    const empty = createStore<StudioState>(initialState());
    const c2 = createUnderstandingController(empty, { storage: undefined, now: () => 1, analyze: analyze as never });
    c2.actions.run();
    expect(empty.getState().understanding.status).toBe('idle');
    void store; c.dispose(); c2.dispose();
  });
  it('cancel aborts the run, leaves no result, and a late result is ignored', async () => {
    let finish!: () => void;
    const analyze = (s: typeof snap, o: { signal: AbortSignal }) => new Promise((res, rej) => {
      finish = () => res(analyzeProject(s, { yieldToMain: async () => undefined }));
      o.signal.addEventListener('abort', () => rej(new AnalysisAbortError()));
    });
    const { store, c } = setup(analyze as never);
    c.actions.run();
    c.actions.cancel();
    expect(store.getState().understanding).toMatchObject({ status: 'idle' });
    expect(store.getState().understanding.result).toBeUndefined();
    finish();
    await flush();
    expect(store.getState().understanding.status).toBe('idle');
    c.dispose();
  });
  it('a failing analysis shows failed with a short message', async () => {
    const { store, c } = setup((async () => { throw new Error('boom'); }) as never);
    c.actions.run();
    await flush();
    expect(store.getState().understanding).toMatchObject({ status: 'failed', error: 'The analysis could not finish.' });
    c.dispose();
  });
  it('replacing the snapshot aborts a running re-analysis', async () => {
    let aborted = false;
    const analyze = (_s: unknown, o: { signal: AbortSignal }) => new Promise((_r, rej) => o.signal.addEventListener('abort', () => { aborted = true; rej(new AnalysisAbortError()); }));
    const { store, c } = setup(analyze as never);
    c.actions.run();
    store.update((s) => reset(s));
    expect(aborted).toBe(true);
    c.dispose();
  });
  it('saves only after a user change; loading never writes; Back to Start keeps the slot; clear removes it', () => {
    const { store, c, data, writes } = setup();
    const target = { owner: 'sample', repo: 'x', source: 'sample' as const, sampleId: 'x' };
    store.update((s) => reset(s));
    let s = beginIngestion(store.getState(), target, 1);
    store.setState(completeIngestion(s, s.ingestion.runId, snap, 2, { ...understandingDone({ snapshotId: snap.id, skillbookVersion: 1, files: [], edges: [], externals: [], coverage: { fileEntries: 0, read: 0, pathOnly: 0, ignored: 0, scanned: 0, notScanned: {}, aliasImportsNotFollowed: 0, djangoUrlFilesSeen: false, partial: false, partialReasons: [], notAnalysed: 0 } }, { 'README.md': ['backend'] }) }));
    expect(writes).toEqual([]);
    expect(c.actions.setLabels('a.js', ['frontend'])).toBeNull();
    expect(writes).toEqual([CORRECTIONS_KEY]);
    expect(JSON.parse(data.get(CORRECTIONS_KEY)!).corrections).toEqual({ 'README.md': ['backend'], 'a.js': ['frontend'] });
    store.update((x) => reset(x));
    expect(data.has(CORRECTIONS_KEY)).toBe(true);
    expect(writes).toHaveLength(1);
    s = beginIngestion(store.getState(), target, 3);
    store.setState(completeIngestion(s, s.ingestion.runId, snap, 4, { ...idleUnderstanding(), corrections: { 'README.md': ['backend'] } }));
    c.actions.clearCorrections();
    expect(data.has(CORRECTIONS_KEY)).toBe(false);
    c.dispose();
  });
  it('refuses at 500 and reports the message', () => {
    const { store, c } = setup();
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`p${i}`, ['backend' as const]]));
    store.update((s) => ({ ...s, understanding: { ...s.understanding, corrections: many } }));
    expect(c.actions.setLabels('new', ['backend'])).toBe('Correction limit reached (500). Remove one to add another.');
    c.dispose();
  });
  it('dispose aborts, unsubscribes, and later calls do nothing', () => {
    const { store, c, writes } = setup();
    c.dispose();
    c.actions.setLabels('x', ['backend']);
    c.actions.run();
    expect(store.getState().understanding.corrections).toEqual({});
    expect(writes).toEqual([]);
  });
});
