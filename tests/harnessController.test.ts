// @node: F4.7
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { createHarnessController, type HarnessController } from '../src/hooks/useHarness';
import { DEFAULT_LAYOUT, type LayoutState } from '../src/store/layoutSlice';
import type { KeyValueStorage } from '../src/store/layoutStorage';
import { createStore, initialState, type Store, type StudioState } from '../src/store/useStudioStore';
import { workProblems } from '../src/store/workSlice';
import { WORK_KEY } from '../src/store/workStorage';
import type { RepoSnapshot } from '../src/types/contracts';

interface Rig {
  studio: Store<StudioState>;
  layout: Store<LayoutState>;
  c: HarnessController;
  cancelAI: ReturnType<typeof vi.fn>;
  data: Map<string, string>;
  writes: string[];
  page: { logRestored: boolean };
}

function rig(opts: { initial?: Partial<StudioState>; data?: Map<string, string>; page?: { logRestored: boolean }; edit?: boolean } = {}): Rig {
  const studio = createStore<StudioState>({ ...initialState(), ...opts.initial });
  const layout = createStore<LayoutState>(opts.edit ? { ...DEFAULT_LAYOUT, openPanel: 'edit' } : DEFAULT_LAYOUT);
  const data = opts.data ?? new Map<string, string>();
  const writes: string[] = [];
  const storage: KeyValueStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { writes.push(k); data.set(k, v); },
    removeItem: (k) => void data.delete(k),
  };
  const cancelAI = vi.fn();
  let n = 0;
  const page = opts.page ?? { logRestored: false };
  const c = createHarnessController(studio, layout, {
    storage, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => 1000 + n, newId: () => `id-${++n}`, cancelAI, page,
  });
  return { studio, layout, c, cancelAI, data, writes, page };
}
const snap = (id: 'fullstack-api' | 'static-site' = 'fullstack-api', at = 1): RepoSnapshot => buildSampleSnapshot(id, at);
function load(r: Rig, s: RepoSnapshot): void {
  r.studio.update((st) => ({ ...st, experience: 'studio', snapshot: s }));
}
const status = (r: Rig) => r.studio.getState().work.run?.status;
const pos = (r: Rig) => r.studio.getState().work.run?.position;
const msgs = (r: Rig) => r.studio.getState().log.map((e) => e.message);
const TICK = 1200;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('submitText', () => {
  it('returns false for ordinary text and changes nothing', () => {
    const r = rig();
    load(r, snap());
    const before = r.studio.getState().work;
    expect(r.c.actions.submitText('explain the login file')).toBe(false);
    expect(r.c.actions.submitText('stop everything right now')).toBe(false);
    expect(r.studio.getState().work).toBe(before);
    expect(r.cancelAI).not.toHaveBeenCalled();
    r.c.dispose();
  });
  it('returns true for commands and refusals', () => {
    const r = rig();
    load(r, snap());
    expect(r.c.actions.submitText('help')).toBe(true);
    expect(r.c.actions.submitText('stop now')).toBe(true);
    const chat = r.studio.getState().work.chat;
    expect(chat.map((x) => x.ok)).toEqual([true, false]);
    expect(chat[1]!.reply).toContain('no argument');
    r.c.dispose();
  });
});

describe('timer', () => {
  it('start runs one step per 1,200 ms; pause stops; resume restarts; step runs one', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    expect(status(r)).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(TICK - 1);
    expect(pos(r)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(pos(r)).toBe(1);
    vi.advanceTimersByTime(TICK);
    expect(pos(r)).toBe(2);
    r.c.actions.submitText('pause');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TICK * 10);
    expect(pos(r)).toBe(2);
    r.c.actions.submitText('step');
    expect(pos(r)).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
    r.c.actions.submitText('resume');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(TICK);
    expect(status(r)).toBe('awaiting_decision');
    expect(vi.getTimerCount()).toBe(0);
    r.c.dispose();
  });
  it('at most one timer after every action', () => {
    const r = rig();
    load(r, snap());
    for (const t of ['start', 'pause', 'resume', 'resume', 'pause', 'resume', 'step', 'stop', 'start', 'reset']) {
      r.c.actions.submitText(t);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
      vi.advanceTimersByTime(500);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    }
    r.c.dispose();
  });
  it('after approve the timer restarts only when autoAdvance is true', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 4);
    expect(status(r)).toBe('awaiting_decision');
    r.c.actions.run('approve');
    expect(status(r)).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
    // second run: pause while waiting, then approve
    r.c.actions.stop();
    r.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 4);
    r.c.actions.submitText('pause');
    r.c.actions.run('approve');
    expect(status(r)).toBe('paused');
    expect(vi.getTimerCount()).toBe(0);
    r.c.dispose();
  });
  it('a full run finishes and clears the timer', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    for (let n = 0; n < 12 && status(r) !== 'finished'; n++) {
      vi.advanceTimersByTime(TICK);
      if (r.studio.getState().work.proposal) r.c.actions.run('approve');
    }
    expect(status(r)).toBe('finished');
    expect(vi.getTimerCount()).toBe(0);
    r.c.dispose();
  });
});

describe('stop and reset', () => {
  it('stop cancels AI once and clears the timer; reset also removes the slot', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 2);
    expect(r.data.has(WORK_KEY)).toBe(true);
    r.c.actions.stop();
    expect(r.cancelAI).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(status(r)).toBe('stopped');
    r.c.actions.submitText('reset');
    expect(r.cancelAI).toHaveBeenCalledTimes(2);
    expect(r.data.has(WORK_KEY)).toBe(false);
    expect(r.studio.getState().work.run).toBeNull();
    // the "Work reset." line did not recreate the slot
    expect(r.data.has(WORK_KEY)).toBe(false);
    // the next change saves normally
    r.c.actions.submitText('start');
    expect(r.data.has(WORK_KEY)).toBe(true);
    r.c.dispose();
  });
});

describe('Edit panel', () => {
  it('opening Edit pauses a running run; closing does not resume; commands refuse then accept', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    r.layout.setState({ ...r.layout.getState(), openPanel: 'edit' });
    expect(status(r)).toBe('paused');
    expect(r.studio.getState().work.run?.autoAdvance).toBe(false);
    expect(msgs(r)).toContain('Paused automatically because you opened Edit.');
    expect(vi.getTimerCount()).toBe(0);
    r.c.actions.submitText('resume');
    expect(status(r)).toBe('paused');
    expect(r.studio.getState().work.chat.at(-1)!.reply).toBe('Close the Edit panel first.');
    r.c.actions.submitText('step');
    expect(pos(r)).toBe(0);
    r.layout.setState({ ...r.layout.getState(), openPanel: 'ai' });
    expect(status(r)).toBe('paused');
    r.c.actions.submitText('step');
    expect(pos(r)).toBe(1);
    r.c.actions.submitText('resume');
    expect(status(r)).toBe('running');
    r.c.dispose();
  });
  it('open edit by command pauses like the toolbar button', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    r.c.actions.submitText('open edit');
    expect(r.layout.getState().openPanel).toBe('edit');
    expect(status(r)).toBe('paused');
    r.c.actions.submitText('open chat');
    expect(r.layout.getState().openPanel).toBe('ai');
    r.c.dispose();
  });
  it('start is refused while Edit is open', () => {
    const r = rig({ edit: true });
    load(r, snap());
    r.c.actions.submitText('start');
    expect(r.studio.getState().work.run).toBeNull();
    r.layout.setState({ ...r.layout.getState(), openPanel: 'log' });
    r.c.actions.submitText('start');
    expect(status(r)).toBe('running');
    r.c.dispose();
  });
});

describe('restore gate and saving', () => {
  const otherRecord = (s: RepoSnapshot) => {
    const r = rig();
    load(r, s);
    r.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 4);
    r.c.dispose();
    return r.data.get(WORK_KEY)!;
  };
  it('never saves before the restore step ran; a matching slot is restored once', () => {
    const s = snap();
    const saved = otherRecord(s);
    expect(JSON.parse(saved).run.status).toBe('awaiting_decision');
    const data = new Map([[WORK_KEY, saved]]);
    const r = rig({ data });
    load(r, s);
    expect(r.writes).toEqual([]);
    expect(status(r)).toBe('awaiting_decision');
    expect(r.studio.getState().work.run?.autoAdvance).toBe(false);
    expect(r.studio.getState().work.proposal).not.toBeNull();
    const restoredLines = msgs(r).filter((m) => m.startsWith('Saved work restored'));
    expect(restoredLines).toHaveLength(1);
    r.c.dispose();
  });
  it('a slot for another repository is kept until the first change, then replaced with a Log line', () => {
    const other = snap('static-site', 5);
    const saved = otherRecord(other);
    const data = new Map([[WORK_KEY, saved]]);
    const r = rig({ data });
    load(r, snap('fullstack-api', 6));
    expect(r.writes).toEqual([]);
    expect(r.data.get(WORK_KEY)).toBe(saved);
    expect(r.studio.getState().work.run).toBeNull();
    r.c.actions.submitText('help');
    expect(r.writes).toEqual([]);
    r.c.actions.submitText('start');
    expect(r.writes.length).toBeGreaterThan(0);
    expect(msgs(r)).toContain('Saved work for sample/static-site was replaced.');
    expect(JSON.parse(r.data.get(WORK_KEY)!).repoKey).toBe('sample:sample/fullstack-api@sample');
    r.c.dispose();
  });
  it('Back to Start clears work, keeps the slot; loading again restores without a second log copy', () => {
    const s = snap();
    const r = rig();
    load(r, s);
    r.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 4);
    r.c.actions.submitText('pause');
    r.c.actions.run('approve');
    const logBefore = r.studio.getState().log.length;
    const slot = r.data.get(WORK_KEY)!;
    r.studio.update((st) => ({ ...st, experience: 'start', snapshot: undefined, work: { run: null, proposal: null, applied: [], undone: [], chat: [], runSeq: 0 } }));
    expect(r.data.get(WORK_KEY)).toBe(slot);
    expect(vi.getTimerCount()).toBe(0);
    load(r, s);
    const st = r.studio.getState();
    expect(st.work.applied).toHaveLength(1);
    expect(st.work.run?.status).toBe('paused');
    expect(st.log.length).toBe(logBefore + 1);
    expect(msgs(r).filter((m) => m === 'Practice run (no AI) started with 8 steps.' || m.startsWith('Practice run (no AI) started'))).toHaveLength(1);
    r.c.dispose();
  });
  it('the log is restored once per page load across controllers', () => {
    const s = snap();
    const first = rig();
    load(first, s);
    first.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 4);
    first.c.dispose();
    const page = { logRestored: false };
    const data = first.data;
    const a = rig({ data, page });
    load(a, s);
    const lenA = a.studio.getState().log.length;
    expect(lenA).toBeGreaterThan(2);
    a.c.dispose();
    const b = rig({ data, page });
    load(b, s);
    expect(b.studio.getState().log.every((e) => !e.message.startsWith('Practice run (no AI) started'))).toBe(true);
    b.c.dispose();
  });
  it('a changed file discards the saved work and keeps the log', () => {
    const s = snap();
    const saved = (() => {
      const r = rig();
      load(r, s);
      r.c.actions.submitText('start');
      vi.advanceTimersByTime(TICK * 4);
      r.c.actions.submitText('pause');
      r.c.actions.run('approve');
      r.c.dispose();
      return r.data.get(WORK_KEY)!;
    })();
    const path = JSON.parse(saved).applied[0].path as string;
    const changed = { ...s, files: s.files.map((f) => (f.path === path ? { ...f, content: `${f.content}\nmore\n` } : f)) };
    const r = rig({ data: new Map([[WORK_KEY, saved]]) });
    load(r, changed);
    expect(r.studio.getState().work.applied).toEqual([]);
    expect(msgs(r).at(-1)).toBe('Saved changes did not match the loaded files, so they were not restored.');
    r.c.dispose();
  });
  it('blocked storage still works in memory', () => {
    const studio = createStore<StudioState>(initialState());
    const layout = createStore<LayoutState>(DEFAULT_LAYOUT);
    const bad: KeyValueStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } };
    const c = createHarnessController(studio, layout, {
      storage: bad, setTimer: (f, m) => setTimeout(f, m), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      now: () => 1, newId: (() => { let n = 0; return () => `i${++n}`; })(), cancelAI: () => undefined, page: { logRestored: false },
    });
    studio.update((s) => ({ ...s, experience: 'studio', snapshot: snap() }));
    expect(() => c.actions.submitText('start')).not.toThrow();
    vi.advanceTimersByTime(TICK * 2);
    expect(studio.getState().work.run?.position).toBe(2);
    c.dispose();
  });
  it('a scoped reload (new snapshot object) goes through restore again', () => {
    const r = rig();
    load(r, snap('fullstack-api', 1));
    r.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 4);
    r.c.actions.submitText('pause');
    r.c.actions.run('approve');
    r.studio.update((st) => ({ ...st, snapshot: snap('fullstack-api', 2), work: { run: null, proposal: null, applied: [], undone: [], chat: [], runSeq: 0 } }));
    expect(r.studio.getState().work.applied).toHaveLength(1);
    r.c.dispose();
  });
});

describe('rapid repeats', () => {
  it('50 repeats of approve, reject, stop leave one consistent state', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    vi.advanceTimersByTime(TICK * 4);
    for (let n = 0; n < 50; n++) r.c.actions.run('approve');
    expect(r.studio.getState().work.applied).toHaveLength(1);
    expect(workProblems(r.studio.getState().work)).toEqual([]);
    for (let n = 0; n < 50; n++) r.c.actions.run('reject');
    expect(r.studio.getState().work.applied).toHaveLength(1);
    for (let n = 0; n < 50; n++) r.c.actions.stop();
    expect(status(r)).toBe('stopped');
    expect(workProblems(r.studio.getState().work)).toEqual([]);
    expect(r.studio.getState().work.chat.length).toBeLessThanOrEqual(20);
    expect(vi.getTimerCount()).toBe(0);
    r.c.dispose();
  });
});

describe('dispose', () => {
  it('clears the timer, unsubscribes both stores, and later changes do nothing', () => {
    const r = rig();
    load(r, snap());
    r.c.actions.submitText('start');
    expect(vi.getTimerCount()).toBe(1);
    r.c.dispose();
    expect(vi.getTimerCount()).toBe(0);
    const writes = r.writes.length;
    vi.advanceTimersByTime(TICK * 5);
    expect(pos(r)).toBe(0);
    r.studio.update((s) => ({ ...s, logSeq: s.logSeq + 1 }));
    r.layout.setState({ ...r.layout.getState(), openPanel: 'edit' });
    expect(status(r)).toBe('running');
    expect(r.writes.length).toBe(writes);
    expect(r.c.actions.submitText('pause')).toBe(false);
    r.c.actions.run('stop');
    expect(status(r)).toBe('running');
  });
});

describe('source rules', () => {
  it('imports no fetch, aiAssistant, mockAssistant, or useAssistant module', () => {
    const src = readFileSync('src/hooks/useHarness.ts', 'utf8');
    expect(src).not.toMatch(/fetch\(|from '\.\.\/engine\/aiAssistant'|mockAssistant|from '\.\/useAssistant'/);
  });
});

describe('another repository slot and Log-only changes (2E-1)', () => {
  it('Log lines written while loading do not replace another repository slot; real work does', () => {
    vi.useFakeTimers();
    const first = rig();
    load(first, snap('static-site', 5));
    first.c.actions.submitText('start');
    first.c.dispose();
    const saved = first.data.get(WORK_KEY)!;
    const r = rig({ data: new Map([[WORK_KEY, saved]]) });
    load(r, snap('fullstack-api', 6));
    r.studio.update((s) => ({ ...s, log: [...s.log, { id: 'x1', timestamp: 1, action: 'preview_mode', status: 'info', affectedPaths: [], message: 'Preview mode: Live Static Preview.', redacted: false }], logSeq: s.logSeq + 1 }));
    expect(r.data.get(WORK_KEY)).toBe(saved);
    r.c.actions.submitText('start');
    expect(JSON.parse(r.data.get(WORK_KEY)!).repoKey).toBe('sample:sample/fullstack-api@sample');
    r.c.dispose();
  });
});
