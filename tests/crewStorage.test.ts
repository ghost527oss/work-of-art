// @node: F6.8
import { describe, expect, it } from 'vitest';
import { buildRecord, historyHasSecret, WorkRecordSchema } from '../src/store/workStorage';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { buildCrewScript } from '../src/engine/crewScript';
import { scanProject } from '../src/engine/scanProject';
import { runCommand, tickRun } from '../src/store/workActions';
import { idleScan } from '../src/store/scanSlice';
import { understandingDone } from '../src/store/understandingSlice';
import { initialState, type StudioState } from '../src/store/useStudioStore';
import { createHarnessController } from '../src/hooks/useHarness';
import { createStore } from '../src/store/useStudioStore';
import { DEFAULT_LAYOUT, type LayoutState } from '../src/store/layoutSlice';
import { snapshotOf } from './helpers/analyzeFixture';
import { practiceContent } from '../src/engine/practiceScript';
import { WORK_KEY } from '../src/store/workStorage';
import { vi } from 'vitest';

let n = 0;
const ctx = () => ({ now: 1, mode: 'automation' as const, newId: () => `i${++n}` });
async function state(files: Record<string, string>): Promise<StudioState> {
  const snapshot = snapshotOf(files);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const result = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => practiceContent(snapshot, [], p) }, { yieldToMain: async () => undefined });
  return { ...initialState(), experience: 'studio', snapshot, understanding: understandingDone(analysis, {}), scan: { ...idleScan(), status: 'done', runId: 1, result } };
}
const AUTO = { 'a.html': '<a href="https://x.test" target="_blank">x</a>\n' };
const start = (s: StudioState) => runCommand(s, { name: 'start', arg: 'crew' }, ctx()).state;

describe('what is saved from a crew run', () => {
  it('a crew run and a crew proposal are saved as null', async () => {
    let s = start(await state(AUTO));
    expect(buildRecord(s, 1)!.run).toBeNull();
    while (!s.work.proposal) s = tickRun(s, s.work.run!.id, s.work.run!.position, ctx());
    const rec = buildRecord(s, 1)!;
    expect(rec.run).toBeNull();
    expect(rec.proposal).toBeNull();
  });
  it('an applied crew fix is saved in History with context lines and its area, and the schema accepts it', async () => {
    let s = start(await state({ 'a.html': '<p>one</p>\n<p>two</p>\n<a href="x" target="_blank">x</a>\n<p>three</p>\n' }));
    while (!s.work.proposal) s = tickRun(s, s.work.run!.id, s.work.run!.position, ctx());
    s = runCommand(s, { name: 'approve' }, ctx()).state;
    const rec = buildRecord(s, 1)!;
    expect(rec.applied[0]!.diff).toContain(' <p>two</p>');
    expect(rec.applied[0]!.area).toBe('security');
    expect(WorkRecordSchema.safeParse(JSON.parse(JSON.stringify(rec))).success).toBe(true);
    expect(JSON.stringify(rec)).not.toContain('"snippet"');
  });
  it('history that contains a likely secret is detected', async () => {
    const s = await state(AUTO);
    const e = { id: 'h', path: 'a.html', title: 't', at: 1, diff: '+ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', beforeHash: '00000000', afterHash: '11111111' };
    expect(historyHasSecret({ ...s, work: { ...s.work, applied: [e] } })).toBe(true);
    expect(historyHasSecret(s)).toBe(false);
  });
});

describe('harness changes', () => {
  it('a secret in History skips the save with one Log line; the in-memory change still works', async () => {
    vi.useFakeTimers();
    const s0 = await state(AUTO);
    const studio = createStore<StudioState>({ ...s0, snapshot: undefined, experience: 'start' });
    const layout = createStore<LayoutState>(DEFAULT_LAYOUT);
    const data = new Map<string, string>();
    const c = createHarnessController(studio, layout, {
      storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) },
      setTimer: (f, m) => setTimeout(f, m), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => 5, newId: () => `x${++n}`, cancelAI: () => undefined, page: { logRestored: false },
    });
    studio.setState({ ...s0 });
    const e = { id: 'h', path: 'a.html', title: 't', at: 1, diff: '+ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', beforeHash: '00000000', afterHash: '11111111' };
    studio.update((st) => ({ ...st, work: { ...st.work, applied: [e] } }));
    expect(studio.getState().log.at(-1)!.message).toBe('Saved work was not updated: a change contains a likely secret.');
    expect(data.get(WORK_KEY) ?? '').not.toContain('ghp_');
    c.dispose();
    vi.useRealTimers();
  });
  it('the crew tick is 1.0 second and the practice tick 1.2 seconds', async () => {
    vi.useFakeTimers();
    const s0 = await state(AUTO);
    const studio = createStore<StudioState>(s0);
    const layout = createStore<LayoutState>(DEFAULT_LAYOUT);
    const c = createHarnessController(studio, layout, {
      storage: undefined, setTimer: (f, m) => setTimeout(f, m), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => 5, newId: () => `y${++n}`, cancelAI: () => undefined, page: { logRestored: true },
    });
    c.actions.run('start', 'crew');
    vi.advanceTimersByTime(999);
    expect(studio.getState().work.run!.position).toBe(0);
    vi.advanceTimersByTime(1);
    expect(studio.getState().work.run!.position).toBe(1);
    c.actions.stop();
    c.actions.run('start', 'practice');
    vi.advanceTimersByTime(1199);
    expect(studio.getState().work.run!.position).toBe(0);
    vi.advanceTimersByTime(1);
    expect(studio.getState().work.run!.position).toBe(1);
    c.dispose();
    vi.useRealTimers();
  });
  it('the 12-per-area script is the same data the run uses', async () => {
    const s = await state(AUTO);
    expect(start(s).work.run!.steps).toEqual(buildCrewScript(s.scan.result!, undefined, undefined, false));
    void buildSampleSnapshot;
  });
});
