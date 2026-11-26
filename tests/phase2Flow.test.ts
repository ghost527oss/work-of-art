// @node: F9.10
// The full Phase 2 store-level test (design section 14): load, analyse, scan, measured finding, crew fix,
// practice change, Edit pad style change, undo and redo, the Journal at three levels, and the three exports.
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { applyUnifiedDiff, hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import { scanProject } from '../src/engine/scanProject';
import { mergedFindings } from '../src/engine/scanView';
import { buildJournalMarkdown } from '../src/export/journalExport';
import { buildLogJson, buildLogMarkdown } from '../src/export/logExport';
import { buildPatch, planPatchExport } from '../src/export/patchExport';
import { journalInputOf } from '../src/hooks/useJournal';
import { buildJournal, createJournalMemo } from '../src/journal/journalModel';
import { BANNED } from '../src/journal/lessonRules';
import { detectPreviewMode } from '../src/preview/previewMode';
import { idleScan } from '../src/store/scanSlice';
import { understandingDone } from '../src/store/understandingSlice';
import { initialState, type StudioState } from '../src/store/useStudioStore';
import { applyUserEdit, runCommand, tickRun, type WorkCtx } from '../src/store/workActions';
import { buildRecord, WorkRecordSchema } from '../src/store/workStorage';
import type { RepoSnapshot } from '../src/types/contracts';
import { snapshotOf } from './helpers/analyzeFixture';
import { applyHunks } from './helpers/applyHunks';

const SECRET = 'ghp_' + 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2';
const SENTINELS = [SECRET, 'SNIPPET_SENTINEL', 'SETTING_VALUE_SENTINEL', 'CMD_SENTINEL', 'ENV_VALUE_SENTINEL'];

const FIXTURE = {
  'index.html': '<!doctype html>\n<html>\n<body>\n<img src="a.png">\n<a href="https://x.test" target="_blank">x</a>\n<button class="b"></button>\n<script src="app.js"></script>\n</body>\n</html>\n',
  'app.js': "fetch('/api/items').then((r) => r.json()); // SNIPPET_SENTINEL\nwindow.addEventListener('resize', () => {});\n",
  'server.js': `const express = require('express');\nconst app = express();\nconst key = "${SECRET}";\nconst port = process.env.PORT || 'SETTING_VALUE_SENTINEL';\napp.post('/api/items', (req, res) => { res.send(req.body.name); });\napp.listen(port);\n`,
  'package.json': '{"name":"fixture","scripts":{"dev":"node server.js --token=CMD_SENTINEL"},"dependencies":{"express":"^4"}}\n',
  '.env': 'API_KEY=ENV_VALUE_SENTINEL\n',
};

let idN = 0;
const ctx = (mode: WorkCtx['mode'] = 'automation'): WorkCtx => ({ now: 5000 + idN, mode, newId: () => `id-${++idN}` });
const cmd = (s: StudioState, name: string, arg?: string, mode: WorkCtx['mode'] = 'automation') => runCommand(s, { name: name as never, arg: arg as never }, ctx(mode)).state;
const tick = (s: StudioState) => tickRun(s, s.work.run!.id, s.work.run!.position, ctx());
const effective = (s: StudioState) => (p: string) => practiceContent(s.snapshot!, s.work.applied, p);

async function loaded(snapshot: RepoSnapshot): Promise<StudioState> {
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const scan = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => practiceContent(snapshot, [], p) }, { yieldToMain: async () => undefined });
  const d = detectPreviewMode(snapshot);
  const s0 = initialState();
  return {
    ...s0, experience: 'studio', snapshot, understanding: understandingDone(analysis, {}),
    scan: { ...idleScan(), status: 'done', runId: 1, result: scan },
    preview: { ...s0.preview, mode: d.mode, reason: d.reason, entryPath: d.entryPath },
  };
}

function injectMeasured(s: StudioState, path: string): StudioState {
  const f = { id: 'm1', skillId: 'scan.frontend.layout-overflow', primary: 'frontend' as const, areas: ['frontend' as const], severity: 'low' as const, certainty: 'found' as const, fix: 'explanation' as const, path, firstLine: 3, lastLine: 3, snippet: ['SNIPPET_SENTINEL'], extra: 'Measured at 375 px wide.' };
  return { ...s, preview: { ...s.preview, layout: { status: 'done', widths: [375], findings: [f], contentKey: 'k', partialReasons: [] } } };
}

/** Earlier-spec invariants that must hold at every point. */
function invariants(s: StudioState) {
  expect(s.work.applied.length + s.work.undone.length).toBeLessThanOrEqual(50);
  expect(s.log.length).toBeLessThanOrEqual(500);
  // every History entry still applies in order and gives the practice copy
  const byPath = new Map<string, string>();
  for (const e of s.work.applied) {
    const base = byPath.get(e.path) ?? s.snapshot!.files.find((f) => f.path === e.path)!.content!;
    const r = applyUnifiedDiff(base, e.diff);
    expect(r.ok).toBe(true);
    if (r.ok) byPath.set(e.path, r.text);
  }
  for (const [p, t] of byPath) expect(effective(s)(p)).toBe(t);
  // a stale tick is ignored (same object)
  if (s.work.run) expect(tickRun(s, 'not-the-run', 0, ctx())).toBe(s);
}

function noLeaks(text: string, where: string) {
  for (const x of SENTINELS) expect(text, `${where} leaks ${x.slice(0, 12)}`).not.toContain(x);
  for (const b of BANNED) expect(text.toLowerCase(), `${where} has "${b}"`).not.toContain(b);
}

async function pipeline(snapshot: RepoSnapshot, editPath: string) {
  let s = await loaded(snapshot);
  invariants(s);
  const findingsAtStart = mergedFindings(s).length;

  // a measured finding, as 2E-1 would add it
  s = injectMeasured(s, editPath);
  expect(mergedFindings(s).length).toBe(findingsAtStart + 1);

  // crew: start, wait for a proposal, approve when there is an automatic fix
  s = cmd(s, 'start', 'crew');
  let guard = 0;
  while (s.work.run && !s.work.proposal && guard++ < 200) s = tick(s);
  let crewFixed = false;
  if (s.work.proposal) { s = cmd(s, 'approve'); crewFixed = true; }
  invariants(s);
  while (s.work.run && s.work.run.status === 'running' && !s.work.proposal && guard++ < 400) s = tick(s);
  if (s.work.proposal) s = cmd(s, 'reject');
  if (s.work.run) s = cmd(s, 'stop');
  invariants(s);

  // practice: start, step to the proposal, approve, finish
  s = cmd(s, 'start');
  guard = 0;
  while (s.work.run && !s.work.proposal && guard++ < 50) s = tick(s);
  expect(s.work.proposal).not.toBeNull();
  s = cmd(s, 'approve');
  while (s.work.run && guard++ < 100) { if (s.work.run.status !== 'running') break; s = tick(s); }
  if (s.work.run) s = cmd(s, 'stop');
  invariants(s);

  // Edit pad style change through applyUserEdit
  const before = effective(s)(editPath)!;
  const after = before.replace('<button class="b">', '<button class="b" style="width: 200px">').replace('<button id="order" class="btn">', '<button id="order" class="btn" style="width: 200px">');
  expect(after).not.toBe(before);
  const r = applyUserEdit(s, { path: editPath, baseHash: hashText(before), newContent: after, editKey: `edit:${editPath}:abc`, title: 'Style: button' }, ctx('self_editing'));
  expect(r.recorded).toBe(true);
  s = r.state;
  expect(effective(s)(editPath)).toBe(after);

  // undo and redo
  const appliedBefore = s.work.applied;
  s = cmd(s, 'undo');
  expect(effective(s)(editPath)).toBe(before);
  s = cmd(s, 'redo');
  expect(s.work.applied.map((e) => e.id)).toEqual(appliedBefore.map((e) => e.id));
  expect(effective(s)(editPath)).toBe(after);
  invariants(s);
  return { s, crewFixed };
}

describe('full Phase 2 flow', () => {
  for (const [name, snap, editPath] of [
    ['fixture project', () => snapshotOf(FIXTURE), 'index.html'],
    ['static sample', () => buildSampleSnapshot('static-site', 1), 'index.html'],
  ] as const) {
    it(`${name}: History, practice copy, Journal, and exports agree; nothing leaks`, async () => {
      const { s, crewFixed } = await pipeline(snap(), editPath);
      if (name === 'fixture project') expect(crewFixed).toBe(true);

      // Journal at all three levels: same structure, different text, no leak
      const memo = createJournalMemo();
      const input = journalInputOf(s);
      const models = (['simple', 'practical', 'deeper'] as const).map((l) => memo(input, l));
      expect(memo(input, 'deeper')).toBe(models[2]);
      expect(new Set(models.map((m) => m.lessons.map((l) => l.lesson.id).join()))).toHaveProperty('size', 1);
      expect(models[0]!.lessons.some((l) => l.lesson.id === 'lesson.scan.frontend.layout-overflow')).toBe(true);
      for (const m of models) {
        expect(m.status).toBe('ready');
        const md = buildJournalMarkdown(m, s.snapshot!);
        noLeaks(md, `journal ${m.level}`);
        noLeaks(JSON.stringify(m.overview) + JSON.stringify(m.flows) + JSON.stringify(m.lessons.map((l) => l.instances)), `model ${m.level}`);
      }
      expect(buildJournal(input, 'simple')).toEqual(models[0]);

      // Log exports
      const now = new Date(Date.UTC(2026, 10, 24));
      noLeaks(buildLogMarkdown(s, now), 'log md');
      noLeaks(buildLogJson(s, now), 'log json');
      const json = JSON.parse(buildLogJson(s, now));
      expect(json.summary.changesApplied).toBe(s.work.applied.length);
      expect(json.changes.map((c: { id: string }) => c.id)).toEqual([...s.work.applied, ...s.work.undone].map((e) => e.id));

      // Patch: every included file applies to its original and gives the practice copy
      const plan = planPatchExport(s.snapshot!, s.work.applied, effective(s), s.edit.previewOnly.length);
      const all = new Set(plan.files.map((f) => f.path));
      const patch = buildPatch(plan, all);
      expect(patch.files).toBeGreaterThan(0);
      for (const f of plan.files) {
        if (!f.patch) continue;
        const orig = s.snapshot!.files.find((x) => x.path === f.path)!.content!;
        expect(applyHunks(orig, f.patch)).toBe(effective(s)(f.path));
      }
      expect(plan.files.find((f) => f.path === editPath)!.origins).toContain('user');
      expect(plan.files.some((f) => f.origins.includes('practice') && !f.defaultSelected)).toBe(true);
      expect(patch.text).not.toContain(SECRET);

      // The saved 2B record round-trips
      const rec = buildRecord(s, 9);
      expect(rec).not.toBeNull();
      const back = WorkRecordSchema.safeParse(JSON.parse(JSON.stringify(rec)));
      expect(back.success).toBe(true);
      if (back.success) expect(back.data.applied.map((e) => e.id)).toEqual(s.work.applied.map((e) => e.id));
    });
  }
});
