// @node: F6.7
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { parseCommand } from '../src/engine/commands';
import { buildCrewScript, narrate } from '../src/engine/crewScript';
import { practiceContent } from '../src/engine/practiceScript';
import { crewStartState, workerSlots } from '../src/engine/scanView';
import { scanProject } from '../src/engine/scanProject';
import type { SampleFile } from '../src/engine/ingestPipeline';
import { enterSelfEditing, runCommand, tickRun, type Mode, type WorkCtx } from '../src/store/workActions';
import { idleScan } from '../src/store/scanSlice';
import { understandingDone } from '../src/store/understandingSlice';
import { initialState, type StudioState } from '../src/store/useStudioStore';
import { workProblems } from '../src/store/workSlice';
import type { RepoSnapshot } from '../src/types/contracts';
import { snapshotOf } from './helpers/analyzeFixture';

let n = 0;
const ctx = (mode: Mode = 'automation'): WorkCtx => ({ now: 1000, mode, newId: () => `id-${++n}` });
async function crewState(snapshot: RepoSnapshot): Promise<StudioState> {
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const base: StudioState = { ...initialState(), experience: 'studio', snapshot, understanding: understandingDone(analysis, {}) };
  const result = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => practiceContent(snapshot, [], p) }, { yieldToMain: async () => undefined });
  return { ...base, scan: { ...idleScan(), status: 'done', runId: 1, snapshotId: snapshot.id, result } };
}
const fx = (files: Record<string, SampleFile>) => crewState(snapshotOf(files));
function cmd(s: StudioState, text: string, mode: Mode = 'automation') {
  const p = parseCommand(text);
  if (p.kind !== 'command') throw new Error(text);
  return runCommand(s, { name: p.name, arg: p.arg }, ctx(mode));
}
const tick = (s: StudioState) => { const r = s.work.run!; return tickRun(s, r.id, r.position, ctx()); };
const AUTO = { 'a.html': '<p>x</p>\n<a href="https://x.test" target="_blank">x</a>\n<p>y</p>\n' };

describe('start crew', () => {
  it('the typed command and the button share one rule set', async () => {
    const s = await fx(AUTO);
    expect(crewStartState(s, false)).toEqual({ enabled: true, reason: null });
    const r = cmd(s, 'start crew');
    expect(r.state.work.run).toMatchObject({ kind: 'crew', status: 'running', position: 0 });
    expect(r.state.work.chat.at(-1)!.reply).toBe('Skeleton Crew run started.');
    expect(r.state.log.at(-1)!.message).toMatch(/^Skeleton Crew run started with \d+ steps\.$/);
  });
  it('refusals: no scan, active run, Self-editing, no snapshot', async () => {
    const s = await fx(AUTO);
    const noScan = { ...s, scan: idleScan() };
    expect(crewStartState(noScan, false).reason).toBe('Open Skeleton Crew and wait for the scan first.');
    expect(cmd(noScan, 'start crew').state.work.chat.at(-1)!.reply).toBe('Open Skeleton Crew and wait for the scan first.');
    expect(cmd(s, 'start crew', 'self_editing').state.work.chat.at(-1)!.reply).toBe('Close the Edit panel first.');
    const run = cmd(s, 'start crew').state;
    expect(cmd(run, 'start crew').state.work.chat.at(-1)!.reply).toBe('A run is already active. Type stop first.');
    expect(cmd(initialState(), 'start crew').state.work.chat.at(-1)!.reply).toBe('Load a repository first.');
    expect(crewStartState(initialState(), false).enabled).toBe(false);
  });
  it('start, start practice, and start with another word', async () => {
    const s = await fx(AUTO);
    expect(parseCommand('start')).toEqual({ kind: 'command', name: 'start' });
    expect(parseCommand('start practice')).toEqual({ kind: 'command', name: 'start', arg: 'practice' });
    expect(parseCommand('start banana')).toEqual({ kind: 'refused', reply: 'Use: start, start practice, or start crew.' });
    expect(cmd(s, 'start practice').state.work.run!.kind).toBe('practice');
    expect(cmd(s, 'start').state.work.run!.kind).toBe('practice');
  });
});

describe('the crew script', () => {
  it('full-stack sample: intro, four area steps, the one finding, finish (7 steps, no proposal)', async () => {
    const s = await crewState(buildSampleSnapshot('fullstack-api', 1));
    const steps = buildCrewScript(s.scan.result!);
    expect(steps.map((x) => x.kind)).toEqual(['info', 'area', 'area', 'finding', 'area', 'area', 'finish']);
    expect(steps[1]!.area).toBe('frontend');
    expect(steps[3]!.area).toBe('backend');
  });
  it('an auto finding adds propose and verify steps; no findings gives the empty script', async () => {
    const s = await fx(AUTO);
    expect(buildCrewScript(s.scan.result!).map((x) => x.kind)).toEqual(['info', 'area', 'area', 'area', 'finding', 'propose', 'verify', 'area', 'finish']);
    const none = await fx({ 'a.html': '<p>x</p>\n' });
    const steps = buildCrewScript(none.scan.result!);
    expect(steps).toHaveLength(6);
    expect(steps.at(-1)!.title).toContain('No findings to go through.');
  });
  it('12 findings per area and 150 steps at most, saying how many were left out', async () => {
    const imgs = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}.html`, '<img src="a">\n']));
    const s = await fx(imgs);
    const steps = buildCrewScript(s.scan.result!);
    expect(steps.filter((x) => x.kind === 'finding')).toHaveLength(12);
    expect(steps.find((x) => x.title.startsWith('Frontend crew'))!.title).toBe('Frontend crew: 8 more findings are listed on the area screen but not narrated.');
    expect(steps.length).toBeLessThanOrEqual(150);
  });
  it('narration has three plain sentences and no code', async () => {
    const s = await fx({ 'a.html': '<img src="SECRETISH">\n' });
    const text = narrate(s.scan.result!.findings[0]!);
    expect(text).toMatch(/^Checking Image without a text description in a\.html, line 1\. Problem: .+ Plan: .+/);
    expect(text).not.toContain('<img');
    expect(text).not.toContain('SECRETISH');
  });
});

describe('running the crew', () => {
  it('walks every step, narrates to the Log, proposes the fix, applies it on approval, verifies, and finishes', async () => {
    let s = cmd(await fx(AUTO), 'start crew').state;
    const total = s.work.run!.steps.length;
    while (s.work.run!.status === 'running') {
      s = tick(s);
      if (s.work.proposal) break;
    }
    expect(s.work.run!.status).toBe('awaiting_decision');
    expect(s.work.proposal).toMatchObject({ source: 'crew', path: 'a.html' });
    expect(s.work.proposal!.diff).toContain('rel="noopener noreferrer"');
    expect(s.log.some((e) => e.action === 'crew_security' && e.message.startsWith('Checking Link opening a new tab without protection in a.html, line 2.'))).toBe(true);
    expect(workerSlots(s).find((w) => w.area === 'security')!.status).toBe('Waiting for your decision');
    const approved = cmd(s, 'approve').state;
    expect(approved.work.applied[0]).toMatchObject({ path: 'a.html', area: 'security' });
    expect(approved.scan.result!.findings).toEqual([]);
    s = approved;
    while (s.work.run!.status === 'running') s = tick(s);
    expect(s.work.run!.status).toBe('finished');
    expect(s.work.run!.position).toBe(total);
    expect(s.log.some((e) => e.status === 'verified')).toBe(true);
    expect(s.log.at(-1)!.message).toBe('Skeleton Crew finished: 1 findings narrated, 1 fixes approved, 0 rejected.');
    expect(workProblems(s.work)).toEqual([]);
    expect(JSON.stringify([s.log, s.work.chat])).not.toContain('<a href');
  });
  it('reject changes nothing and the verify step says nothing to verify; undo and redo re-check', async () => {
    let s = cmd(await fx(AUTO), 'start crew').state;
    while (!s.work.proposal) s = tick(s);
    s = cmd(s, 'reject').state;
    expect(s.work.applied).toEqual([]);
    s = tick(s);
    expect(s.log.at(-1)!.message).toContain('Nothing to verify for a.html');
    // approve in a second run, then undo and redo
    s = cmd(cmd(s, 'stop').state, 'start crew').state;
    while (!s.work.proposal) s = tick(s);
    s = cmd(cmd(s, 'approve').state, 'pause').state;
    expect(s.scan.result!.findings).toEqual([]);
    s = cmd(s, 'undo').state;
    expect(s.scan.result!.findings.map((f) => f.skillId)).toEqual(['scan.security.target-blank']);
    s = cmd(s, 'redo').state;
    expect(s.scan.result!.findings).toEqual([]);
  });
  it('stop writes the summary; stale ticks change nothing; Edit pauses a crew run', async () => {
    let s = cmd(await fx(AUTO), 'start crew').state;
    s = tick(tick(s));
    const stopped = cmd(s, 'stop').state;
    expect(stopped.log.at(-1)!.message).toMatch(/^Skeleton Crew stopped: 0 findings narrated, 0 fixes approved, 0 rejected\.$/);
    expect(tickRun(s, 'old', 0, ctx())).toBe(s);
    const paused = enterSelfEditing(s, ctx());
    expect(paused.work.run).toMatchObject({ status: 'paused', autoAdvance: false });
  });
  it('a finding that is already gone is narrated as gone, and a failed auto fix is not proposed', async () => {
    const base = await fx(AUTO);
    let s = cmd({ ...base, scan: { ...base.scan, result: { ...base.scan.result!, findings: base.scan.result!.findings.map((f) => ({ ...f })) } } }, 'start crew').state;
    s = { ...s, scan: { ...s.scan, result: { ...s.scan.result!, findings: [] } } };
    while (s.work.run!.status === 'running') s = tick(s);
    expect(s.log.some((e) => e.message === 'This finding is already gone.')).toBe(true);
    expect(s.log.some((e) => e.message === 'A safe automatic fix could not be built here.')).toBe(true);
    expect(s.work.proposal).toBeNull();
  });
  it('guided and explanation findings never produce a proposal', async () => {
    let s = cmd(await fx({ 'a.html': '<img src="a">\n<button></button>\n' }), 'start crew').state;
    while (s.work.run!.status === 'running') s = tick(s);
    expect(s.work.proposal).toBeNull();
    expect(s.work.applied).toEqual([]);
    expect(s.work.run!.status).toBe('finished');
  });
});
