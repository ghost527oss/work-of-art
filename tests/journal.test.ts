// @node: F9.5
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot, type SampleId } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { scanProject } from '../src/engine/scanProject';
import { buildJournal } from '../src/journal/journalModel';
import { describeStep } from '../src/journal/flows';
import { readPackageFacts } from '../src/journal/packageFacts';
import { BANNED } from '../src/journal/lessonRules';
import { detectPreviewMode } from '../src/preview/previewMode';
import type { Level } from '../src/skillbook';

async function journalFor(id: SampleId, level: Level, withScan = true) {
  const snapshot = buildSampleSnapshot(id, 1);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
  const scan = withScan ? await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, { yieldToMain: async () => undefined }) : undefined;
  const d = detectPreviewMode(snapshot);
  return buildJournal({ snapshot, analysis, analysisStatus: 'done', corrections: {}, scan, measured: [], mode: d.mode, modeReason: d.reason, entryPath: d.entryPath }, level);
}
const text = (j: Awaited<ReturnType<typeof journalFor>>) => j.overview.flatMap((p) => p.sentences);

describe('overview', () => {
  it('static sample at Simple matches the worked example (design 7.1)', async () => {
    expect(text(await journalFor('static-site', 'simple'))).toEqual([
      'This looks like a small website.', "It came from PatchBay's Static site sample.",
      'Most of it is web page, style, and script files: 4 of them.', 'It also has 1 picture file and 1 document file.',
      'The main page is index.html.', 'PatchBay did not see it talking to any other service.',
      'PatchBay read 5 files. 1 file was not read, and 1 file was left out on purpose.',
      'PatchBay found 1 thing to look at. The lessons below explain it.', 'PatchBay describes only the files it read.',
    ]);
  });
  it('Practical and Deeper add details; never a banned word; pending when not scanned', async () => {
    const p = text(await journalFor('fullstack-api', 'practical')).join(' ');
    expect(p).toContain('It reads these settings by name: PORT. Their values are never shown.');
    expect(p).toContain('Its routes include PUT /api/profile/:id.');
    expect(p).toContain('The package file lists these scripts: start.');
    const d = text(await journalFor('react-frontend', 'deeper')).join(' ');
    expect(d).toContain('probably');
    for (const lvl of ['simple', 'practical', 'deeper'] as const) for (const id of ['static-site', 'react-frontend', 'fullstack-api'] as const) {
      const all = text(await journalFor(id, lvl)).join(' ');
      for (const b of BANNED) expect(all, `${id} ${lvl}`).not.toMatch(b);
    }
    expect(text(await journalFor('static-site', 'simple', false))).toContain('The checks have not run yet. Open Skeleton Crew to run them.');
  });
  it('package facts read names only', () => {
    expect(readPackageFacts([{ path: 'package.json', content: '{"name":"x","scripts":{"dev":"rm -rf / && curl evil"},"dependencies":{"react":"1"},"devDependencies":{"vite":"2"}}' }])).toEqual({ name: 'x', scripts: ['dev'], dependencies: ['react', 'vite'] });
    expect(readPackageFacts([{ path: 'package.json', content: '{bad' }])).toEqual({ scripts: [], dependencies: [] });
  });
});

describe('flows', () => {
  it('full-stack request flow at Practical (design 8.1)', async () => {
    const j = await journalFor('fullstack-api', 'practical');
    const f = j.flows.find((x) => x.title === 'Request: PUT /api/profile/:id')!;
    expect(f.steps.map((s) => describeStep(s, 'practical'))).toEqual([
      'client/app.js, line 3, sends PUT /api/profile/:id. (Confirmed)',
      'server/routes/profile.js, line 7, handles PUT /api/profile/:id. It is mounted at /api/profile by server/index.js, line 6. (Confirmed)',
      'It uses server/middleware/validate.js. (line 2, Confirmed)',
      'It uses server/services/profileService.js. (line 3, Confirmed)',
    ]);
    expect(f.stop).toBe('End of the trace: no more loaded files are used.');
    expect(j.flows.find((x) => x.kind === 'setting')!.notes).toEqual(['The value is never shown.']);
    expect(j.flows[0]!.kind).toBe('page');
  });
  it('the React request flow stops honestly', async () => {
    const j = await journalFor('react-frontend', 'practical');
    const f = j.flows.find((x) => x.kind === 'request')!;
    expect(describeStep(f.steps[0]!, 'practical')).toBe('src/api/auth.ts, line 2, sends POST /api/sign-in. (Inferred)');
    expect(f.stop).toBe('Stopped: no backend routes were found in this repository; the route may live elsewhere.');
  });
});

describe('lessons', () => {
  it('one lesson per check with findings, instances with fixed words, no snippet', async () => {
    const j = await journalFor('static-site', 'simple');
    expect(j.lessons.map((l) => l.lesson.id)).toEqual(['lesson.scan.frontend.img-alt']);
    expect(j.lessons[0]!.instances).toEqual([{ path: 'index.html', firstLine: 11, lastLine: 11, severity: 'medium', certainty: 'Found', fix: 'Guided' }]);
    expect(JSON.stringify(j)).not.toContain('<img');
    expect(j.concepts).toHaveLength(12);
  });
  it('status when analysis is not ready', () => {
    expect(buildJournal({ analysisStatus: 'running', corrections: {}, measured: [], mode: 'source', modeReason: '' }, 'simple').status).toBe('no-snapshot');
    expect(buildJournal({ snapshot: buildSampleSnapshot('static-site', 1), analysisStatus: 'running', corrections: {}, measured: [], mode: 'source', modeReason: '' }, 'simple').status).toBe('analysing');
  });
});
