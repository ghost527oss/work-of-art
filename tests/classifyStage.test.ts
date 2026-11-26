// @node: F5.8
import { describe, expect, it, vi } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { AnalysisAbortError } from '../src/engine/analyzeProject';
import { createIngestionController, type IngestionServices } from '../src/hooks/useIngestion';
import { createStore, initialState, type StudioState } from '../src/store/useStudioStore';
import { analyzeProject } from '../src/engine/analyzeProject';

const snap = buildSampleSnapshot('fullstack-api', 1);
const base = (over: Partial<IngestionServices> = {}): IngestionServices => ({
  ingestRepository: async () => snap, ingestSample: async () => snap, now: () => 5, ...over,
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const startSample = (store = createStore<StudioState>(initialState()), services = base()) => {
  const c = createIngestionController(store, services);
  c.actions.startSample('fullstack-api');
  return { store, c };
};

describe('the classifying stage', () => {
  it('without analyze the stage is skipped and loading behaves as before', async () => {
    const { store } = startSample();
    await flush();
    const s = store.getState();
    expect(s.ingestion.stages.classifying).toBe('skipped');
    expect(s.experience).toBe('studio');
    expect(s.understanding.status).toBe('idle');
  });
  it('with analyze: active with progress, then done, and ONE completion carries snapshot, result, and corrections', async () => {
    const seen: string[] = [];
    const store = createStore<StudioState>(initialState());
    store.subscribe(() => {
      const s = store.getState();
      seen.push(`${s.ingestion.stages.classifying}|${s.experience}|${s.snapshot ? 'snap' : 'nosnap'}|${s.understanding.status}`);
    });
    const corrections = { 'README.md': ['backend' as const] };
    const analyze = vi.fn(async (sn: typeof snap, o: { onProgress?: (p: { done: number; total: number }) => void }) => {
      o.onProgress?.({ done: 3, total: 9 });
      expect(store.getState().ingestion.classifyProgress).toEqual({ done: 3, total: 9 });
      return analyzeProject(sn, { yieldToMain: async () => undefined });
    });
    startSample(store, base({ analyze, loadCorrections: () => corrections }));
    await flush(); await flush();
    const s = store.getState();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(s.ingestion.stages.classifying).toBe('done');
    expect(s.ingestion.classifyProgress).toBeUndefined();
    expect(s.understanding.status).toBe('done');
    expect(s.understanding.corrections).toEqual(corrections);
    expect(s.log.some((e) => e.action === 'understanding_done')).toBe(true);
    // The Studio never opens with a snapshot but a missing result.
    expect(seen.filter((x) => x.includes('studio|snap'))).toEqual(expect.arrayContaining([]));
    for (const row of seen) if (row.includes('|studio|snap|')) expect(row.endsWith('|done')).toBe(true);
  });
  it('an analysis failure never fails loading: stage failed, Studio opens with the failure message', async () => {
    const { store } = startSample(undefined, base({ analyze: async () => { throw new Error('boom'); } }));
    await flush(); await flush();
    const s = store.getState();
    expect(s.ingestion.stages.classifying).toBe('failed');
    expect(s.experience).toBe('studio');
    expect(s.ingestion.status).toBe('done');
    expect(s.understanding).toMatchObject({ status: 'failed', error: 'The analysis could not finish.' });
  });
  it('Cancel during the stage aborts the analysis and leaves no result', async () => {
    let signal!: AbortSignal;
    const store = createStore<StudioState>(initialState());
    const c = createIngestionController(store, base({
      analyze: (_sn, o) => new Promise((_res, rej) => { signal = o.signal!; o.signal!.addEventListener('abort', () => rej(new AnalysisAbortError())); }),
    }));
    c.actions.startSample('fullstack-api');
    await flush();
    expect(store.getState().ingestion.stages.classifying).toBe('active');
    c.actions.cancel();
    await flush();
    expect(signal.aborted).toBe(true);
    const s = store.getState();
    expect(s.experience).toBe('start');
    expect(s.understanding.result).toBeUndefined();
  });
  it('a throwing corrections loader does not stop loading', async () => {
    const { store } = startSample(undefined, base({ analyze: (sn, o) => analyzeProject(sn, { ...o, yieldToMain: async () => undefined }), loadCorrections: () => { throw new Error('x'); } }));
    await flush(); await flush();
    expect(store.getState().understanding.corrections).toEqual({});
    expect(store.getState().understanding.status).toBe('done');
  });
});
