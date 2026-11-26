// @node: F9.6
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import { buildUnifiedDiff } from '../src/export/unifiedDiff';
import { buildPatch, EXCLUDE, originOf, originsOf, planPatchExport } from '../src/export/patchExport';
import { JOURNAL_LIMITS } from '../src/config/journalLimits';
import type { HistoryEntry } from '../src/store/workSlice';
import type { RepoSnapshot } from '../src/types/contracts';
import { applyHunks } from './helpers/applyHunks';

let n = 0;
function entry(path: string, before: string, after: string, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id: `h${++n}`, path, title: `Change ${n}`, at: 1000 + n, diff: buildUnifiedDiff(path, before, after)!, beforeHash: hashText(before), afterHash: hashText(after), ...extra };
}
const deepFreeze = <T>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const contentOf = (s: RepoSnapshot, p: string) => s.files.find((f) => f.path === p)!.content!;
const plan = (s: RepoSnapshot, applied: HistoryEntry[], previewOnly = 0) => planPatchExport(s, applied, (p) => practiceContent(s, applied, p), previewOnly);

describe('origins', () => {
  it('edit key is user, PRACTICE: insert is practice, anything else is crew', () => {
    expect(originOf({ editKey: 'edit:index.html:abc', diff: '' })).toBe('user');
    expect(originOf({ diff: '--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+// PRACTICE: hi\n' })).toBe('practice');
    expect(originOf({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n' })).toBe('crew');
    expect(originsOf([{ diff: '+// PRACTICE: x' }, { editKey: 'edit:a:b', diff: '' }, { diff: '' }])).toEqual(['user', 'crew', 'practice']);
  });
});

describe('planPatchExport and buildPatch', () => {
  const snap = deepFreeze(buildSampleSnapshot('static-site', 1));
  const html = contentOf(snap, 'index.html');
  const css = contentOf(snap, 'css/styles.css');

  it('several entries on one file give one combined diff from the original to the final text', () => {
    const s1 = html.replace('class="btn">', 'class="btn" style="width: 200px">');
    const s2 = s1.replace('<!doctype html>', '<!DOCTYPE html>');
    const applied = deepFreeze([entry('index.html', html, s1, { editKey: 'edit:index.html:1' }), entry('index.html', s1, s2)]);
    const p = plan(snap, applied);
    expect(p.files).toHaveLength(1);
    const f = p.files[0]!;
    expect(f.patch).toBe(buildUnifiedDiff('index.html', html, s2));
    expect(f).toMatchObject({ origins: ['user', 'crew'], changes: 2, hunks: 2, added: 2, removed: 2, defaultSelected: true });
    expect(applyHunks(html, f.patch!)).toBe(s2);
  });

  it('a practice change is unchecked by default; files are in path order', () => {
    const pr = '/* PRACTICE: try */\n' + css;
    const s1 = html.replace('Order now', 'Order today');
    const p = plan(snap, [entry('index.html', html, s1), entry('css/styles.css', css, pr)]);
    expect(p.files.map((f) => [f.path, f.defaultSelected, f.origins])).toEqual([['css/styles.css', false, ['practice']], ['index.html', true, ['crew']]]);
    const out = buildPatch(p, new Set(['css/styles.css', 'index.html']));
    expect(out.files).toBe(2);
    expect(out.text.indexOf('diff --git a/css/styles.css b/css/styles.css')).toBe(0);
    expect(out.text).toContain('diff --git a/index.html b/index.html\n--- a/index.html');
    expect(buildPatch(p, new Set(['index.html'])).text).not.toContain('styles.css');
  });

  it('exclusions: partly read, special path, no net change, unverifiable, secret', () => {
    const files = [
      ...snap.files,
      { path: 'big.txt', size: 10, loadStatus: 'loaded', truncated: true, content: 'a\n' },
      { path: 'odd name.txt', size: 2, loadStatus: 'loaded', content: 'a\n' },
      { path: 'cfg.js', size: 2, loadStatus: 'loaded', content: 'x\n' },
    ] as unknown as RepoSnapshot['files'];
    const s2 = { ...snap, files } as RepoSnapshot;
    const secret = 'ghp_' + 'A'.repeat(36);
    const s1 = html.replace('Order now', 'Order today');
    const applied = [
      entry('big.txt', 'a\n', 'b\n'),
      entry('odd name.txt', 'a\n', 'b\n'),
      entry('index.html', html, s1), entry('index.html', s1, html),
      entry('cfg.js', 'x\n', `x\nconst t = "${secret}";\n`),
    ];
    const p = plan(s2, applied);
    const reason = Object.fromEntries(p.files.map((f) => [f.path, f.excluded]));
    expect(reason).toEqual({ 'big.txt': EXCLUDE.partial, 'cfg.js': EXCLUDE.secret, 'index.html': EXCLUDE.none, 'odd name.txt': EXCLUDE.path });
    expect(p.files.every((f) => !f.defaultSelected && !f.patch)).toBe(true);
    expect(JSON.stringify(p)).not.toContain(secret);
  });

  it('undone entries and Preview Only changes are not included; the Preview Only count is reported', () => {
    const p = plan(snap, [], 3);
    expect(p).toEqual({ files: [], previewOnlyCount: 3 });
    expect(buildPatch(p, new Set()).files).toBe(0);
  });

  it('stops at 512 KB and lists the rest with the size reason', () => {
    const big = 'x'.repeat(300 * 1024) + '\n';
    const files = [{ path: 'a.txt', size: 2, loadStatus: 'loaded', content: 'a\n' }, { path: 'b.txt', size: 2, loadStatus: 'loaded', content: 'b\n' }] as unknown as RepoSnapshot['files'];
    const s = { ...snap, files } as RepoSnapshot;
    const applied = [entry('a.txt', 'a\n', big), entry('b.txt', 'b\n', big)];
    const p = plan(s, applied);
    const out = buildPatch(p, new Set(['a.txt', 'b.txt']));
    expect(out.files).toBe(1);
    expect(out.sizeExcluded).toEqual(['b.txt']);
    expect(out.text.length).toBeLessThanOrEqual(JOURNAL_LIMITS.patchBytes);
    // R7.6: after the limit is reached, a later small file is excluded too
    const files3 = [...files, { path: 'c.txt', size: 2, loadStatus: 'loaded', content: 'c\n' }] as unknown as RepoSnapshot['files'];
    const s3 = { ...snap, files: files3 } as RepoSnapshot;
    const big2 = 'y'.repeat(400 * 1024) + '\n';
    const p3 = plan(s3, [entry('a.txt', 'a\n', big2), entry('b.txt', 'b\n', big2), entry('c.txt', 'c\n', 'd\n')]);
    expect(buildPatch(p3, new Set(['a.txt', 'b.txt', 'c.txt'])).sizeExcluded).toEqual(['b.txt', 'c.txt']);
    // the cap counts bytes: 300 K three-byte characters do not fit
    const wide = '\u20ac'.repeat(200 * 1024) + '\n';
    const p4 = plan(s, [entry('a.txt', 'a\n', wide)]);
    expect(buildPatch(p4, new Set(['a.txt'])).sizeExcluded).toEqual(['a.txt']);
  });

  it('never mutates the snapshot or the History (frozen inputs)', () => {
    const s1 = html.replace('Order now', 'Order today');
    const applied = deepFreeze([entry('index.html', html, s1)]);
    expect(() => buildPatch(plan(snap, applied), new Set(['index.html']))).not.toThrow();
  });
});

describe('the independent applier is strict', () => {
  it('throws on a corrupted context line', () => {
    const d = buildUnifiedDiff('f', 'a\nb\nc\n', 'a\nX\nc\n')!;
    expect(() => applyHunks('a\nb\nZ\n', d)).toThrow(/mismatch/);
  });
});
