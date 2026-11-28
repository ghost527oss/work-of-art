// @node: F12.13
import { describe, expect, it } from 'vitest';
import { BUDGETS } from '../src/config/budgets';
import { runIngestion } from '../src/engine/ingestPipeline';
import { buildContext } from '../src/engine/contextEngine';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { fakeGithub, image } from './helpers/tinyImages';

const MARK = 0xa5;
const markedPng = () => { const b = image('png', 4096, MARK); return b; };
const MARK_B64 = btoa(String.fromCharCode(MARK).repeat(60));

describe('picture bytes never leave the Sandbox', () => {
  it('the bytes live only in snapshot.media: not in files, the inventory, coverage text, or warnings', async () => {
    const gh = fakeGithub({ files: { 'index.html': '<img src="a.png"><img src="big.png">', 'a.png': markedPng(), 'big.png': image('png', 300 * 1024, MARK) } });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: BUDGETS, now: () => 1 });
    expect(snapshot.media).toHaveLength(1);
    const { media, ...rest } = snapshot;
    void media;
    const outside = JSON.stringify(rest);
    expect(outside).not.toContain(MARK_B64.slice(0, 40));
    expect(snapshot.files.every((f) => !(f.content ?? '').includes('\u00a5'))).toBe(true);
    expect(snapshot.files.map((f) => f.path)).toEqual(['index.html']);
  });
  it('the Context Engine (what an AI is sent) cannot reach a picture: not by path, not by content', async () => {
    const gh = fakeGithub({ files: { 'index.html': '<img src="a.png">', 'a.png': markedPng() } });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: BUDGETS, now: () => 1 });
    const ctx = buildContext({ snapshot, paths: ['a.png', 'index.html'], includeContent: true, finding: undefined, analysis: undefined as never, work: { applied: [] } as never } as never);
    const text = JSON.stringify(ctx);
    expect(text).not.toContain(MARK_B64.slice(0, 40));
    expect(text).not.toContain('data:image');
  });
  it('the preview document holds picture bytes only as a data address in an img, and a hostile name cannot add markup', async () => {
    const gh = fakeGithub({ files: { 'index.html': '<img src="a.png">', 'a.png': markedPng() } });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: BUDGETS, now: () => 1 });
    const m = snapshot.media!.find((x) => x.path === 'a.png')!;
    const r = buildStaticPreview({ entryPath: 'index.html', effective: (p) => snapshot.files.find((f) => f.path === p)?.content, loaded: new Set(['index.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a', media: (p) => (p === 'a.png' ? m : undefined) });
    if (!r.ok) throw new Error(r.reason);
    expect(r.html).toContain(`<img src="data:image/png;base64,${m.base64}"`);
    expect(r.html.split(m.base64).length - 1).toBe(1);
  });
  it('hostile picture sets are handled within the caps with plain labels', async () => {
    const files: Record<string, string | Uint8Array<ArrayBuffer>> = { 'index.html': '<img src="../x.png"><img src="text.png"><img src="/etc/passwd.png"><img src="two.png"><img src="big.png">', 'text.png': 'not a picture', 'two.png': image('png', 10), 'big.png': image('png', 200 * 1024), 'x.png': image('png') };
    const gh = fakeGithub({ files });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: BUDGETS, now: () => 1 });
    expect(snapshot.media!.map((m) => m.path)).toEqual(['two.png']);
    const reasons = Object.fromEntries(snapshot.inventory.entries.filter((e) => e.path.endsWith('.png')).map((e) => [e.path, e.reasonCode]));
    expect(reasons).toMatchObject({ 'text.png': 'media_failed', 'two.png': 'media_loaded', 'big.png': 'media_too_large', 'x.png': 'excluded_media' });
    expect(gh.rawCalls).not.toContain('big.png');
    expect(gh.rawCalls).not.toContain('../x.png');
  });
});
