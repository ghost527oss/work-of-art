// @node: F12.5
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/engine/analyzeProject';
import { parseCommand } from '../src/engine/commands';
import { hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import { scanProject } from '../src/engine/scanProject';
import type { SampleFile } from '../src/engine/ingestPipeline';
import { runCommand, tickRun, type Mode, type WorkCtx } from '../src/store/workActions';
import { idleScan } from '../src/store/scanSlice';
import { understandingDone } from '../src/store/understandingSlice';
import { initialState, type StudioState } from '../src/store/useStudioStore';
import { workProblems } from '../src/store/workSlice';
import { snapshotOf } from './helpers/analyzeFixture';

let n = 0;
const ctx = (mode: Mode = 'automation'): WorkCtx => ({ now: 1000, mode, newId: () => `id-${++n}` });
async function crewState(files: Record<string, SampleFile>): Promise<StudioState> {
  const snapshot = snapshotOf(files);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const base: StudioState = { ...initialState(), experience: 'studio', snapshot, understanding: understandingDone(analysis, {}) };
  const result = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => practiceContent(snapshot, [], p) }, { yieldToMain: async () => undefined });
  return { ...base, scan: { ...idleScan(), status: 'done', runId: 1, snapshotId: snapshot.id, result } };
}
function cmd(s: StudioState, text: string) {
  const p = parseCommand(text);
  if (p.kind !== 'command') throw new Error(text);
  return runCommand(s, { name: p.name, arg: p.arg }, ctx()).state;
}
const tick = (s: StudioState) => { const r = s.work.run!; return tickRun(s, r.id, r.position, ctx()); };
const SOURCE = 'const a = 1;\nif (a > 0 {\n  go();\n}\n';

describe('a syntax fix through the crew, Approve, re-scan, and Undo', () => {
  it('is queued by the crew, applied on Approve, re-scanned clean, and undone to the exact original', async () => {
    let s = cmd(await crewState({ 'lib/a.js': SOURCE }), 'start crew');
    expect(s.scan.result!.findings.map((f) => f.skillId)).toEqual(['scan.frontend.js-syntax']);
    expect(s.scan.result!.findings[0]!.fix).toBe('auto');
    while (!s.work.proposal) { if (s.work.run!.status !== 'running') break; s = tick(s); }
    expect(s.work.proposal).toMatchObject({ source: 'crew', path: 'lib/a.js' });
    expect(s.work.proposal!.diff).toContain('+if (a > 0) {');
    s = cmd(s, 'approve');
    expect(s.work.applied).toHaveLength(1);
    expect(s.scan.result!.findings).toEqual([]);
    expect(practiceContent(s.snapshot!, s.work.applied, 'lib/a.js')).toBe('const a = 1;\nif (a > 0) {\n  go();\n}\n');
    s = cmd(cmd(s, 'pause'), 'undo');
    expect(s.scan.result!.findings.map((f) => f.skillId)).toEqual(['scan.frontend.js-syntax']);
    expect(hashText(practiceContent(s.snapshot!, s.work.applied, 'lib/a.js')!)).toBe(hashText(SOURCE));
    expect(workProblems(s.work)).toEqual([]);
    expect(JSON.stringify([s.log, s.work.chat])).not.toContain('go();');
  });
  it('a finding with no single repair is guided and never proposed', async () => {
    let s = cmd(await crewState({ 'lib/a.js': 'function f() {\n  go();\n' }), 'start crew');
    expect(s.scan.result!.findings[0]!.fix).toBe('guided');
    while (s.work.run!.status === 'running') s = tick(s);
    expect(s.work.proposal).toBeNull();
  });
  it('the existing target-blank fix still works the same way', async () => {
    let s = cmd(await crewState({ 'a.html': '<p>x</p>\n<a href="https://x.test" target="_blank">x</a>\n<p>y</p>\n' }), 'start crew');
    while (!s.work.proposal) s = tick(s);
    expect(s.work.proposal!.diff).toContain('rel="noopener noreferrer"');
  });
});
