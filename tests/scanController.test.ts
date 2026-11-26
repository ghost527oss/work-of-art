// @node: F6.9
import { describe, expect, it, vi } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { ScanAbortError, scanProject } from '../src/engine/scanProject';
import { createScanController, isScanStale } from '../src/hooks/useScan';
import { understandingDone } from '../src/store/understandingSlice';
import { createStore, initialState, reset, type StudioState } from '../src/store/useStudioStore';

const snap = buildSampleSnapshot('static-site', 1);
const analysis = await analyzeProject(snap, { yieldToMain: async () => undefined });
const flush = () => new Promise((r) => setTimeout(r, 0));
const ready = (): StudioState => ({ ...initialState(), experience: 'studio', snapshot: snap, understanding: understandingDone(analysis, {}) });
function setup(scan = (i: never, o: never) => scanProject(i, { ...(o as object), yieldToMain: async () => undefined })) {
  const store = createStore<StudioState>(ready());
  const c = createScanController(store, { now: () => 1, scan: scan as never });
  return { store, c };
}

describe('scan controller', () => {
  it('ensure starts a scan once the analysis is done and keeps the result', async () => {
    const { store, c } = setup();
    c.actions.ensure(); c.actions.ensure();
    expect(store.getState().scan.status).toBe('running');
    await flush(); await flush();
    expect(store.getState().scan.status).toBe('done');
    expect(store.getState().scan.result!.findings).toHaveLength(1);
    const before = store.getState().scan;
    c.actions.ensure();
    expect(store.getState().scan).toBe(before);
    c.dispose();
  });
  it('does not start without a finished analysis', () => {
    const store = createStore<StudioState>({ ...ready(), understanding: { ...ready().understanding, status: 'idle' } });
    const scan = vi.fn();
    const c = createScanController(store, { now: () => 1, scan: scan as never });
    c.actions.ensure();
    expect(scan).not.toHaveBeenCalled();
    c.dispose();
  });
  it('cancel aborts and leaves no result; ensure then waits for Scan again', async () => {
    let finish!: () => void;
    const slow = (i: never, o: { signal: AbortSignal }) => new Promise((res, rej) => { finish = () => res(scanProject(i, {})); o.signal.addEventListener('abort', () => rej(new ScanAbortError())); });
    const { store, c } = setup(slow as never);
    c.actions.ensure();
    c.actions.cancel();
    expect(store.getState().scan).toMatchObject({ status: 'idle' });
    finish();
    await flush();
    expect(store.getState().scan.result).toBeUndefined();
    c.actions.ensure();
    expect(store.getState().scan.status).toBe('idle');
    c.actions.run();
    expect(store.getState().scan.status).toBe('running');
    c.dispose();
  });
  it('a failing scan shows failed; replacing the snapshot aborts a running scan', async () => {
    const bad = setup((async () => { throw new Error('boom'); }) as never);
    bad.c.actions.ensure();
    await flush();
    expect(bad.store.getState().scan).toMatchObject({ status: 'failed', error: 'The scan could not finish.' });
    bad.c.dispose();
    let aborted = false;
    const hang = (_i: never, o: { signal: AbortSignal }) => new Promise((_r, rej) => o.signal.addEventListener('abort', () => { aborted = true; rej(new ScanAbortError()); }));
    const s = setup(hang as never);
    s.c.actions.ensure();
    s.store.update((st) => reset(st));
    expect(aborted).toBe(true);
    s.c.dispose();
  });
  it('is stale when the labels changed since the scan', async () => {
    const { store, c } = setup();
    c.actions.ensure();
    await flush(); await flush();
    expect(isScanStale(store.getState())).toBe(false);
    store.update((s) => ({ ...s, understanding: { ...s.understanding, corrections: { 'index.html': ['backend'] } } }));
    expect(isScanStale(store.getState())).toBe(true);
    c.dispose();
  });
  it('dispose aborts and later calls do nothing', () => {
    const { store, c } = setup();
    c.dispose();
    c.actions.run();
    expect(store.getState().scan.status).toBe('idle');
  });
});
