// @node: F10.8
// Rapid actions (requirements section 6, item 9): seeded random sequences over the Phase 2 controls,
// a simulated refresh every 50 actions, invariants after every step, restorable state compared after
// every refresh, and the session-record write bound.
import { describe, expect, it } from 'vitest';
import { hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import { redact } from '../src/engine/redact';
import { buildPatch, planPatchExport } from '../src/export/patchExport';
import { buildLogJson } from '../src/export/logExport';
import { closePanel, setCollapsed, toggleWidth, togglePanel, type PanelId } from '../src/store/layoutSlice';
import { SESSION_KEY, SessionRecordSchema } from '../src/store/sessionRecord';
import { openDomain, openSkeleton, backToSkeleton, backToStudio } from '../src/store/shellView';
import { applyUserEdit, tickRun } from '../src/store/workActions';
import { WORK_KEY, WorkRecordSchema, repoKeyOf } from '../src/store/workStorage';
import { makePage, network, openSample, refresh, type Page } from './helpers/sessionHarness';
import { recordingStorage } from './helpers/sessionFakes';

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;

function restorable(p: Page) {
  const s = p.studio.getState();
  if (s.experience !== 'studio' || !s.snapshot) return { experience: s.experience };
  const run = s.work.run && s.work.run.kind === 'practice' ? { status: s.work.run.status === 'running' ? 'paused' : s.work.run.status, position: s.work.run.position } : null;
  const paths = [...new Set(s.work.applied.map((e) => e.path))].sort();
  return {
    experience: s.experience,
    repo: `${s.snapshot.owner}/${s.snapshot.name}`,
    screen: p.shell.getState(),
    layout: p.layout.getState(),
    width: s.preview.width,
    mode: s.preview.chosenBy === 'user' ? s.preview.mode : 'auto',
    applied: s.work.applied.map((e) => e.id),
    undone: s.work.undone.map((e) => e.id),
    copies: paths.map((x) => practiceContent(s.snapshot!, s.work.applied, x)),
    corrections: s.understanding.corrections,
    run,
    proposal: s.work.proposal && s.work.proposal.source === 'practice' ? s.work.proposal.id : null,
    log: s.log.slice(-200).map((e) => redact(e.message).text),
  };
}

function invariants(p: Page) {
  const s = p.studio.getState();
  expect(s.work.applied.length + s.work.undone.length).toBeLessThanOrEqual(50);
  expect(s.log.length).toBeLessThanOrEqual(500);
  if (s.work.proposal) expect(s.work.run?.status === 'awaiting_decision' || s.work.run === null || s.work.run.status === 'paused').toBe(true);
  if (s.work.run) expect(tickRun(s, 'stale-run', 0, { now: 0, mode: 'automation', newId: () => 'x' })).toBe(s);
  const rec = p.storage.data.get(SESSION_KEY);
  if (rec) expect(SessionRecordSchema.safeParse(JSON.parse(rec)).success).toBe(true);
  const work = p.storage.data.get(WORK_KEY);
  if (work) expect(WorkRecordSchema.safeParse(JSON.parse(work)).success).toBe(true);
  if (s.snapshot) for (const e of s.work.applied) expect(practiceContent(s.snapshot, s.work.applied, e.path)).not.toBeUndefined();
}

type Act = (p: Page, r: () => number) => void | Promise<void>;
const PANELS: PanelId[] = ['edit', 'ai', 'log', 'history', 'journal'];
const ACTIONS: Record<string, Act> = {
  panel: (p, r) => p.layout.update((l) => togglePanel(l, pick(r, PANELS))),
  collapse: (p, r) => p.layout.update((l) => setCollapsed(l, r() < 0.5)),
  width: (p) => p.layout.update(toggleWidth),
  close: (p) => p.layout.update(closePanel),
  skeleton: (p) => p.shell.update(openSkeleton),
  domain: (p, r) => p.shell.update((v) => openDomain(v, pick(r, ['frontend', 'backend', 'security', 'api_data'] as const))),
  backSk: (p) => p.shell.update(backToSkeleton),
  backStudio: (p) => p.shell.update(backToStudio),
  command: (p, r) => { p.harness.actions.submitText(pick(r, ['start', 'pause', 'resume', 'step', 'undo', 'redo', 'stop', 'status', 'help', 'start crew'])); },
  approve: (p) => p.harness.actions.run('approve'),
  reject: (p) => p.harness.actions.run('reject'),
  stopBar: (p) => p.harness.actions.stop(),
  time: (p) => p.advance(1300),
  scan: async (p) => { p.scan.actions.ensure(); await p.settle(4); },
  rescan: async (p) => { p.scan.actions.run(); await p.settle(4); },
  sbWidth: (p, r) => p.preview.actions.setWidth(pick(r, [375, 768, 1024, 0] as const)),
  sbMode: (p, r) => p.preview.actions.setMode(pick(r, ['static', 'workbench', 'source'] as const)),
  sbPage: (p, r) => p.preview.actions.setEntry(pick(r, ['index.html', 'about.html', 'client/index.html'])),
  sbScripts: (p, r) => p.preview.actions.setScripts(r() < 0.5),
  edit: (p, r) => {
    const s = p.studio.getState();
    if (!s.snapshot) return;
    const page = s.snapshot.files.find((f) => typeof f.content === 'string' && /\.html?$/.test(f.path));
    if (!page) return;
    const cur = practiceContent(s.snapshot, s.work.applied, page.path);
    if (cur === undefined) return;
    const next = cur.replace(/<p(?=[ >])/, `<p data-w="${Math.floor(r() * 9)}"`);
    p.studio.update((st) => applyUserEdit(st, { path: page.path, baseHash: hashText(cur), newContent: next, editKey: `edit:${page.path}:k${Math.floor(r() * 2)}`, title: 'Style' }, { now: p.now(), mode: 'self_editing', newId: () => `u${Math.floor(r() * 1e9)}` }).state);
  },
  label: (p, r) => { const s = p.studio.getState(); const f = s.snapshot?.files[0]; if (f) p.understanding.actions.setLabels(f.path, [pick(r, ['frontend', 'backend', 'assets'] as const)]); },
  exports: (p) => {
    const s = p.studio.getState();
    if (!s.snapshot) return;
    const plan = planPatchExport(s.snapshot, s.work.applied, (x) => practiceContent(s.snapshot!, s.work.applied, x), s.edit.previewOnly.length);
    buildPatch(plan, new Set(plan.files.map((f) => f.path)));
    buildLogJson(s, new Date(0));
  },
  backToStart: (p) => p.sessionCtl.actions.backToStart(),
  reset: (p) => p.sessionCtl.actions.resetSession(),
  sample: async (p, r) => { if (p.studio.getState().experience === 'start') await openSample(p, pick(r, ['static-site', 'react-frontend', 'fullstack-api'])); },
};
const WEIGHTS: Array<[string, number]> = Object.keys(ACTIONS).map((k) => [k, k === 'reset' || k === 'backToStart' ? 1 : k === 'sample' ? 6 : 4]);
const TOTAL = WEIGHTS.reduce((n, [, w]) => n + w, 0);
const choose = (r: () => number) => { let x = r() * TOTAL; for (const [k, w] of WEIGHTS) { x -= w; if (x < 0) return k; } return WEIGHTS[0]![0]; };

async function runSeed(seed: number, count: number) {
  const r = rng(seed);
  const storage = recordingStorage();
  const net = network();
  let p = makePage(storage, net);
  await openSample(p, 'static-site');
  let refreshes = 0;
  let logChecked = 0;
  let studioCompared = 0;
  for (let i = 1; i <= count; i++) {
    const name = choose(r);
    await ACTIONS[name]!(p, r);
    await p.settle(1);
    invariants(p);
    if (i % 50 === 0) {
      await p.settle();
      const before = restorable(p);
      // 2B restores the Log only from its own slot for this repository. While another repository's real work
      // holds the slot, Log lines alone never replace it (2E-1 rule), so this repository's Log is not saved yet.
      const snapNow = p.studio.getState().snapshot;
      const slot = storage.data.get(WORK_KEY);
      const slotIsOurs = !!snapNow && !!slot && JSON.parse(slot).repoKey === repoKeyOf(snapNow);
      p = await refresh(p, storage, net);
      refreshes++;
      if (p.shell.getState().screen !== 'studio') { p.scan.actions.ensure(); await p.settle(); }
      const after = restorable(p);
      if (before.experience !== 'studio') {
        expect(after.experience).toBe('start'); // Back to Start or Reset forgot the session
      } else {
        studioCompared++;
        const { log: lb, ...b } = before as Exclude<typeof before, { experience: string; repo?: undefined }> & { log: string[] };
        const { log: la, ...a } = after as typeof before & { log: string[] };
        expect(a, `seed ${seed} action ${i}`).toEqual(b);
        if (slotIsOurs) { expect(la.slice(0, lb.length)).toEqual(lb); logChecked++; }
        expect(p.studio.getState().preview.scripts).toBe(false);
      }
      invariants(p);
    }
  }
  // the session record is written only when its content changes
  const ws = storage.writes.filter((w) => w.key === SESSION_KEY).map((w) => { const { savedAt: _s, ...body } = JSON.parse(w.value); return JSON.stringify(body); });
  let sameInARow = 0;
  for (let i = 1; i < ws.length; i++) if (ws[i] === ws[i - 1]) sameInARow++;
  // a repeat is allowed only after a refresh, Back to Start, Reset, or a load (the writer starts fresh)
  expect(sameInARow).toBeLessThanOrEqual(refreshes + count / 10);
  expect(ws.length).toBeLessThan(count + refreshes + 1);
  p.dispose();
  return { writes: ws.length, refreshes, logChecked, studioCompared };
}

describe('rapid actions with refreshes', () => {
  for (const seed of [11, 2024, 777]) {
    it(`seed ${seed}: 1,000 actions, a refresh every 50`, async () => {
      const r = await runSeed(seed, 1000);
      expect(r.refreshes).toBe(20);
      expect(r.logChecked).toBeGreaterThan(0);
      expect(r.studioCompared).toBeGreaterThanOrEqual(8);
      console.log(`seed ${seed}: ${JSON.stringify(r)}`);
    }, 240_000);
  }
});
