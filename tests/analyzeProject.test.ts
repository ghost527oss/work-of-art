// @node: F5.6
import { describe, expect, it } from 'vitest';
import { analyzeProject, AnalysisAbortError } from '../src/engine/analyzeProject';
import { UNDERSTANDING_LIMITS } from '../src/config/understandingLimits';
import { snapshotOf, fast } from './helpers/analyzeFixture';

const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`src/f${String(i).padStart(5, '0')}.js`, `export const a${i} = ${i};\n`]));

describe('analyzeProject', () => {
  it('reports progress in batches of 40 and yields between them', async () => {
    const snap = snapshotOf(many(130));
    const seen: Array<[number, number]> = [];
    let yields = 0;
    await analyzeProject(snap, { onProgress: (p) => seen.push([p.done, p.total]), yieldToMain: async () => { yields++; } });
    expect(seen.slice(0, 4)).toEqual([[40, 130], [80, 130], [120, 130], [130, 130]]);
    expect(yields).toBe(4);
    expect(seen.at(-1)).toEqual([130, 130]);
  });
  it('is stopped by an abort and leaves no result', async () => {
    const snap = snapshotOf(many(130));
    const ac = new AbortController();
    const p = analyzeProject(snap, { signal: ac.signal, yieldToMain: async () => { ac.abort(); } });
    await expect(p).rejects.toBeInstanceOf(AnalysisAbortError);
    await expect(analyzeProject(snap, { signal: ac.signal, yieldToMain: async () => undefined })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('the time limit marks the result Partial and lists unanalysed files as Needs Review', async () => {
    const snap = snapshotOf(many(130));
    let t = 0;
    const r = await analyzeProject(snap, { yieldToMain: async () => undefined, now: () => (t += 4000) });
    expect(r.coverage.partial).toBe(true);
    expect(r.coverage.partialReasons[0]).toMatch(/^Time limit \(8 seconds\) reached: \d+ files were not analysed\.$/);
    const f = r.files.find((x) => x.evidence.some((e) => e.description === 'Not analysed: time limit.'));
    expect(f?.needsReview).toBe(true);
    expect(r.coverage.notAnalysed).toBeGreaterThan(0);
  });
  it('the file scan limit marks the result Partial with the amount missing', async () => {
    const n = UNDERSTANDING_LIMITS.maxScannedFiles + 7;
    const r = await analyzeProject(snapshotOf(many(n)), fast);
    expect(r.coverage.partialReasons).toContain('File scan limit (2,000) reached: 7 files were not scanned for connections.');
    expect(r.coverage.scanned).toBe(2000);
  });
  it('a result is not partial when nothing was limited, and never changes the snapshot', async () => {
    const snap = snapshotOf({ 'a.js': "fetch('/x')" });
    const before = JSON.stringify(snap);
    const r = await analyzeProject(snap, fast);
    expect(r.coverage.partial).toBe(false);
    expect(r.coverage.partialReasons).toEqual([]);
    expect(JSON.stringify(snap)).toBe(before);
    expect(r.snapshotId).toBe(snap.id);
    expect(r.skillbookVersion).toBe(1);
  });
  it('a result holds no file content', async () => {
    const r = await analyzeProject(snapshotOf({ 'a.js': "const SECRET_LINE_XYZ = 'visible only in the source';\nfetch('/x');\n" }), fast);
    expect(JSON.stringify(r)).not.toContain('SECRET_LINE_XYZ');
  });
});
