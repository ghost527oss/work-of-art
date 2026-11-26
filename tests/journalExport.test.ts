// @node: F9.5
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { scanProject } from '../src/engine/scanProject';
import type { Edge } from '../src/engine/understandTypes';
import { buildJournalMarkdown } from '../src/export/journalExport';
import { buildJournal, createJournalMemo, type JournalInput } from '../src/journal/journalModel';
import { detectPreviewMode } from '../src/preview/previewMode';
import { snapshotOf } from './helpers/analyzeFixture';

const fast = { yieldToMain: async () => undefined };
async function inputFor(snapshot: ReturnType<typeof buildSampleSnapshot>, withScan = true): Promise<JournalInput> {
  const analysis = await analyzeProject(snapshot, fast);
  const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
  const scan = withScan ? await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, fast) : undefined;
  const d = detectPreviewMode(snapshot);
  return { snapshot, analysis, analysisStatus: 'done', corrections: {}, scan, measured: [], mode: d.mode, modeReason: d.reason, entryPath: d.entryPath };
}

describe('Journal export', () => {
  it('sections in order, the identity line, the level, the offline sentence; deterministic', async () => {
    const input = await inputFor(buildSampleSnapshot('static-site', 1));
    const m = buildJournal(input, 'simple');
    const md = buildJournalMarkdown(m, input.snapshot!);
    const heads = md.split('\n').filter((l) => /^#{1,2} /.test(l));
    expect(heads[0]).toMatch(/^# PatchBay journal: /);
    expect(heads.slice(1).filter((h) => h !== '## Related concepts')).toEqual(['## Application overview', '## How things flow', '## Lessons from your project', '## Notes']);
    expect(heads).toContain('## Related concepts');
    expect(buildJournalMarkdown(m, input.snapshot!, new Date(Date.UTC(2026, 10, 24)))).toContain('Exported: 2026-11-24T00:00:00.000Z');
    expect(md).toContain('Level: Simple');
    expect(md).toContain('Built offline by PatchBay from the files it read.');
    expect(md).toMatch(/- index\.html, lines 11 to 11: high|- index\.html, lines 11 to 11: /);
    expect(buildJournalMarkdown(buildJournal(input, 'simple'), input.snapshot!)).toBe(md);
    expect(md).not.toMatch(/^@@|^\+\+\+ |^--- a\//m); // no diff
  });

  it('cuts at a section boundary above 200 KB with "Shortened to fit."', async () => {
    const input = await inputFor(buildSampleSnapshot('static-site', 1));
    const m = buildJournal(input, 'deeper');
    const huge = { ...m, lessons: Array.from({ length: 4000 }, (_, i) => ({ ...m.lessons[0]!, lesson: { ...m.lessons[0]!.lesson, title: `Lesson ${i}` } })) };
    const md = buildJournalMarkdown(huge, input.snapshot!);
    expect(md.length).toBeLessThanOrEqual(200 * 1024 + 100);
    expect(md.trimEnd().endsWith('Shortened to fit.')).toBe(true);
    expect(md).toContain('## How things flow');
  });
});

describe('Journal model', () => {
  it('memo: same inputs give the same object; any change gives a new one', async () => {
    const input = await inputFor(buildSampleSnapshot('fullstack-api', 1));
    const memo = createJournalMemo();
    const a = memo(input, 'simple');
    expect(memo({ ...input }, 'simple')).toBe(a);
    expect(memo({ ...input, corrections: {} }, 'simple')).not.toBe(a);
    expect(memo(input, 'deeper')).not.toBe(a);
  });

  it('a measured finding shows its width; the secret lesson never shows a value', async () => {
    const SECRET = 'ghp_' + 'K'.repeat(36);
    const snap = snapshotOf({ 'index.html': '<p>x</p>\n', 'server.js': `const t = "${SECRET}";\n` }) as ReturnType<typeof buildSampleSnapshot>;
    const input = await inputFor(snap);
    const measured = [{ id: 'm', skillId: 'scan.frontend.layout-overflow', primary: 'frontend' as const, areas: ['frontend' as const], severity: 'low' as const, certainty: 'found' as const, fix: 'explanation' as const, path: 'index.html', firstLine: 1, lastLine: 1, snippet: [], extra: 'Measured at 375 px wide.' }];
    const m = buildJournal({ ...input, measured }, 'practical');
    const overflow = m.lessons.find((l) => l.lesson.id === 'lesson.scan.frontend.layout-overflow')!;
    expect(overflow.instances[0]!.extra).toBe('Measured at 375 px wide.');
    expect(m.lessons.some((l) => l.lesson.id === 'lesson.scan.security.hardcoded-secret')).toBe(true);
    expect(JSON.stringify(m)).not.toContain(SECRET);
    expect(buildJournalMarkdown(m, snap)).not.toContain(SECRET);
  });

  it('lessons are ordered by highest severity then id; at most 5 instances with a more count', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 7; i++) files[`p${i}.html`] = '<img src="a.png">\n';
    files['x.js'] = 'eval(location.hash);\n';
    const input = await inputFor(snapshotOf(files) as never);
    const m = buildJournal(input, 'simple');
    const img = m.lessons.find((l) => l.lesson.id === 'lesson.scan.frontend.img-alt')!;
    expect(img.instances).toHaveLength(5);
    expect(img.more).toBe(2);
    const order = m.lessons.filter((l) => l.lesson.kind === 'check').map((l) => l.instances[0]!.severity);
    const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    expect([...order].sort((a, b) => rank[a]! - rank[b]!)).toEqual(order);
  });

  it('same structure at the three levels; builds in under 500 ms for 2,000 files and 5,000 connections', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) files[`src/f${i}.js`] = `import x from './f${(i + 1) % 2000}.js';\n`;
    const snap = snapshotOf(files);
    const analysis = await analyzeProject(snap, fast);
    const extra: Edge[] = Array.from({ length: 5000 }, (_, i) => ({ id: `x${i}`, kind: 'calls_api', from: `src/f${i % 2000}.js`, target: `GET /a${i}`, certainty: 'broken', line: 1 }));
    const input: JournalInput = { snapshot: snap, analysis: { ...analysis, edges: [...analysis.edges, ...extra] }, analysisStatus: 'done', corrections: {}, measured: [], mode: 'source', modeReason: '' };
    const t = performance.now();
    const s = buildJournal(input, 'simple');
    expect(performance.now() - t).toBeLessThan(500);
    const d = buildJournal(input, 'deeper');
    expect(d.flows.map((f) => f.id)).toEqual(s.flows.map((f) => f.id));
    expect(d.lessons.length).toBe(s.lessons.length);
  });

  it('states: no snapshot, analysing, failed', () => {
    const base: JournalInput = { analysisStatus: 'idle', corrections: {}, measured: [], mode: 'source', modeReason: '' };
    expect(buildJournal(base, 'simple').status).toBe('no-snapshot');
    const snap = buildSampleSnapshot('static-site', 1);
    expect(buildJournal({ ...base, snapshot: snap, analysisStatus: 'running' }, 'simple').status).toBe('analysing');
    expect(buildJournal({ ...base, snapshot: snap, analysisStatus: 'failed' }, 'simple').status).toBe('failed');
    expect(buildJournal(base, 'simple').concepts).toHaveLength(12);
  });
});
