// @node: F12.8
import { describe, expect, it } from 'vitest';
import { BUDGETS } from '../src/config/budgets';
import { runIngestion } from '../src/engine/ingestPipeline';
import { assertCoverageConsistent, RepoSnapshotSchema, type RepoSnapshot } from '../src/types/contracts';
import { fakeGithub, image, REAL_1X1_PNG } from './helpers/tinyImages';

const KB = 1024;
const PAGE = (imgs: string[]) => `<!doctype html><html><body>${imgs.map((s) => `<img src="${s}" alt="">`).join('')}</body></html>`;

async function ingest(files: Record<string, string | Uint8Array<ArrayBuffer>>, extra: { sizes?: Record<string, number>; raw?: (p: string) => Response | undefined; budgets?: typeof BUDGETS } = {}) {
  const gh = fakeGithub({ files, ...(extra.sizes ? { sizes: extra.sizes } : {}) }, extra.raw ? { raw: extra.raw } : {});
  const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: extra.budgets ?? BUDGETS, now: () => 1000 });
  return { snapshot, rawCalls: gh.rawCalls };
}
const entry = (s: RepoSnapshot, p: string) => s.inventory.entries.find((e) => e.path === p)!;

describe('the picture pass of ingestion', () => {
  it('loads a small referenced picture, keeps it apart from the text files, and labels it', async () => {
    const { snapshot } = await ingest({ 'index.html': PAGE(['img/dot.png']), 'img/dot.png': REAL_1X1_PNG });
    expect(snapshot.media).toHaveLength(1);
    expect(snapshot.media![0]).toMatchObject({ path: 'img/dot.png', mime: 'image/png', bytes: REAL_1X1_PNG.length });
    expect(snapshot.files.map((f) => f.path)).toEqual(['index.html']);
    expect(entry(snapshot, 'img/dot.png')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'media_loaded' });
    expect(entry(snapshot, 'img/dot.png').reason).toMatch(/^Loaded for the preview only/);
    expect(snapshot.coverage).toMatchObject({ loadedMediaFiles: 1, loadedMediaBytes: REAL_1X1_PNG.length });
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(true);
    expect(snapshot.coverage.totalLoadedBytes).toBe(new TextEncoder().encode(PAGE(['img/dot.png'])).length);
    expect(RepoSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
  });
  it('an unreferenced picture is not downloaded and stays excluded as media', async () => {
    const { snapshot, rawCalls } = await ingest({ 'index.html': PAGE(['a.png']), 'a.png': image('png'), 'unused.png': image('png') });
    expect(rawCalls).not.toContain('unused.png');
    expect(entry(snapshot, 'unused.png')).toMatchObject({ reasonCode: 'excluded_media' });
    expect(snapshot.media!.map((m) => m.path)).toEqual(['a.png']);
  });
  it('a repository with no pictures has no media field and old-shape coverage', async () => {
    const { snapshot } = await ingest({ 'index.html': '<p>x</p>' });
    expect(snapshot.media).toBeUndefined();
    expect(snapshot.coverage.loadedMediaFiles).toBeUndefined();
  });
  it('exactly 150 KB loads; one byte more is never downloaded (the tree size is checked first)', async () => {
    const at = await ingest({ 'index.html': PAGE(['a.png']), 'a.png': image('png', 150 * KB) });
    expect(entry(at.snapshot, 'a.png').reasonCode).toBe('media_loaded');
    const over = await ingest({ 'index.html': PAGE(['a.png']), 'a.png': image('png', 150 * KB + 1) });
    expect(entry(over.snapshot, 'a.png')).toMatchObject({ reasonCode: 'media_too_large', loadStatus: 'skipped' });
    expect(entry(over.snapshot, 'a.png').reason).toMatch(/153,601 bytes, above the 153,600 bytes picture limit/);
    expect(over.rawCalls).not.toContain('a.png');
    expect(over.snapshot.media).toBeUndefined();
  });
  it('when the tree size lies, reading stops at the cap and the picture is labelled too large', async () => {
    const { snapshot, rawCalls } = await ingest({ 'index.html': PAGE(['a.png']), 'a.png': image('png', 400 * KB) }, { sizes: { 'a.png': 10 } });
    expect(rawCalls).toContain('a.png');
    expect(entry(snapshot, 'a.png').reasonCode).toBe('media_too_large');
    expect(snapshot.media).toBeUndefined();
  });
  it('a text file named .png and a JPEG named .png are not real pictures', async () => {
    const { snapshot } = await ingest({ 'index.html': PAGE(['t.png', 'j.png', 'e.png']), 't.png': '<html>hi</html>', 'j.png': image('jpeg'), 'e.png': '' });
    for (const p of ['t.png', 'j.png', 'e.png']) expect(entry(snapshot, p), p).toMatchObject({ reasonCode: 'media_failed' });
    expect(entry(snapshot, 't.png').reason).toMatch(/Not a real picture/);
    expect(snapshot.media).toBeUndefined();
  });
  it('the 1 MB total cap: seven 140 KB pictures load and the eighth is over budget', async () => {
    const names = Array.from({ length: 8 }, (_, i) => `p${i}.png`);
    const files: Record<string, string | Uint8Array<ArrayBuffer>> = { 'index.html': PAGE(names) };
    for (const n of names) files[n] = image('png', 140 * KB);
    const { snapshot } = await ingest(files);
    expect(snapshot.media).toHaveLength(7);
    expect(entry(snapshot, 'p7.png').reasonCode).toBe('media_budget_reached');
    expect(snapshot.media!.reduce((n, m) => n + m.bytes, 0)).toBeLessThanOrEqual(1024 * KB);
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/1 picture not loaded because the picture budget was reached/);
  });
  it('the planned total cap stops the extra pictures before they are downloaded', async () => {
    const names = Array.from({ length: 8 }, (_, i) => `p${i}.png`);
    const files: Record<string, string | Uint8Array<ArrayBuffer>> = { 'index.html': PAGE(names) };
    for (const n of names) files[n] = image('png', 140 * KB);
    const { rawCalls } = await ingest(files);
    expect(rawCalls.filter((p) => p.endsWith('.png'))).toHaveLength(7);
  });
  it('the download-time total cap still holds when the tree sizes are wrong', async () => {
    const names = Array.from({ length: 8 }, (_, i) => `p${i}.png`);
    const files: Record<string, string | Uint8Array<ArrayBuffer>> = { 'index.html': PAGE(names) };
    const sizes: Record<string, number> = {};
    for (const n of names) { files[n] = image('png', 140 * KB); sizes[n] = 100; }
    const { snapshot } = await ingest(files, { sizes });
    expect(snapshot.media).toHaveLength(7);
    expect(snapshot.media!.reduce((n, m) => n + m.bytes, 0)).toBeLessThanOrEqual(1024 * KB);
    expect(snapshot.inventory.entries.filter((e) => e.reasonCode === 'media_budget_reached')).toHaveLength(1);
  });
  it('the 30-picture cap: 31 tiny pictures give 30 loaded and one over budget', async () => {
    const names = Array.from({ length: 31 }, (_, i) => `q${String(i).padStart(2, '0')}.gif`);
    const files: Record<string, string | Uint8Array<ArrayBuffer>> = { 'index.html': PAGE(names) };
    for (const n of names) files[n] = image('gif', 40);
    const { snapshot } = await ingest(files);
    expect(snapshot.media).toHaveLength(30);
    expect(entry(snapshot, 'q30.gif').reasonCode).toBe('media_budget_reached');
  });
  it('memory: 30 pictures at the caps hold at most about 1.4 MB of text', async () => {
    const names = Array.from({ length: 30 }, (_, i) => `m${i}.png`);
    const files: Record<string, string | Uint8Array<ArrayBuffer>> = { 'index.html': PAGE(names) };
    for (const n of names) files[n] = image('png', 34 * KB);
    const { snapshot } = await ingest(files);
    expect(snapshot.media!.length).toBe(30);
    const held = snapshot.media!.reduce((n, m) => n + m.base64.length, 0);
    expect(held).toBeLessThan(1.4 * 1024 * KB);
  });
  it('uses pictures from stylesheets and a path with .. cannot leave the repository', async () => {
    const { snapshot, rawCalls } = await ingest({
      'index.html': '<link rel="stylesheet" href="css/s.css"><img src="../../outside.png">',
      'css/s.css': '.a{background:url(../img/bg.png)}', 'img/bg.png': image('png'), 'outside.png': image('png'),
    });
    expect(snapshot.media!.map((m) => m.path)).toEqual(['img/bg.png']);
    expect(rawCalls).not.toContain('outside.png');
  });
  it('honours the scope: a picture outside the chosen folders is not loaded', async () => {
    const gh = fakeGithub({ files: { 'index.html': PAGE(['site/a.png', 'other/b.png']), 'site/a.png': image('png'), 'other/b.png': image('png') } });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r', scope: ['site'] }, { fetch: gh.fetch, budgets: BUDGETS, now: () => 1000 });
    expect(snapshot.media!.map((m) => m.path)).toEqual(['site/a.png']);
    expect(gh.rawCalls).not.toContain('other/b.png');
  });
  it('a failed or rate-limited download is labelled and the text files are unaffected', async () => {
    const { snapshot } = await ingest({ 'index.html': PAGE(['a.png', 'b.png']), 'a.png': image('png'), 'b.png': image('png') }, { raw: (p) => (p === 'a.png' ? new Response('', { status: 500 }) : p === 'b.png' ? new Response('', { status: 429, headers: { 'retry-after': '30' } }) : undefined) });
    expect(entry(snapshot, 'a.png')).toMatchObject({ reasonCode: 'media_failed' });
    expect(entry(snapshot, 'b.png')).toMatchObject({ reasonCode: 'media_failed' });
    expect(snapshot.files.map((f) => f.path)).toEqual(['index.html']);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(true);
  });
  it('an abort during the picture pass ends the run as an abort', async () => {
    const ac = new AbortController();
    const gh = fakeGithub({ files: { 'index.html': PAGE(['a.png']), 'a.png': image('png') } }, { raw: (p) => { if (p === 'a.png') { ac.abort(); return new Response(new ReadableStream({ start() { /* never ends */ } })); } return undefined; } });
    await expect(runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: BUDGETS, signal: ac.signal, now: () => 1000 })).rejects.toBeDefined();
  });
  it('the deadline reached before the picture pass labels pictures instead of fetching them', async () => {
    const gh = fakeGithub({ files: { 'index.html': PAGE(['a.png']), 'a.png': image('png') } });
    // The clock jumps past the deadline as soon as the page text has been fetched.
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: { ...BUDGETS, totalDeadlineMs: 5000 }, now: () => (gh.rawCalls.includes('index.html') ? 10_000 : 0) });
    expect(entry(snapshot, 'a.png')).toMatchObject({ reasonCode: 'media_failed' });
    expect(gh.rawCalls).not.toContain('a.png');
  });
  it('the contract: tampered media is caught by the consistency check', async () => {
    const { snapshot } = await ingest({ 'index.html': PAGE(['a.png']), 'a.png': image('png') });
    expect(() => assertCoverageConsistent({ ...snapshot, media: [] })).toThrow(/media/);
    expect(() => assertCoverageConsistent({ ...snapshot, media: [{ ...snapshot.media![0]!, bytes: snapshot.media![0]!.bytes + 1 }] })).toThrow(/bytes/);
    expect(RepoSnapshotSchema.safeParse({ ...snapshot, media: [{ ...snapshot.media![0]!, mime: 'image/svg+xml' }] }).success).toBe(false);
    expect(RepoSnapshotSchema.safeParse({ ...snapshot, media: [{ ...snapshot.media![0]!, base64: '<script>' }] }).success).toBe(false);
    expect(RepoSnapshotSchema.safeParse({ ...snapshot, media: [{ ...snapshot.media![0]!, extra: 1 }] }).success).toBe(false);
  });
});
