// @node: F6.3
import { describe, expect, it } from 'vitest';
import { applyUnifiedDiff } from '../src/engine/diffApply';
import { buildFixProposal, buildTargetBlankFix, FIX_NOTE } from '../src/engine/scanFix';
import { scanFile } from '../src/engine/scanProject';
import { analyzeProject } from '../src/engine/analyzeProject';
import { snapshotOf } from './helpers/analyzeFixture';

async function setup(files: Record<string, string>) {
  const snapshot = snapshotOf(files);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const inputs = { analysis, corrections: {} };
  const recheck = (p: string, t: string) => scanFile(inputs, p, t);
  return { recheck, findingsOf: (p: string) => recheck(p, files[p]!).filter((f) => f.skillId === 'scan.security.target-blank') };
}

describe('the automatic fix', () => {
  it('adds rel when it is missing and the fix applies, re-checks clean, and reverses exactly', async () => {
    const text = '<p>a</p>\n<a href="https://x.test" target="_blank">x</a>\n<p>b</p>\n';
    const s = await setup({ 'a.html': text });
    const f = s.findingsOf('a.html')[0]!;
    const r = buildFixProposal(f, text, s.recheck);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diff).toContain('+<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>');
    expect(r.diff).toContain('@@ -1,3 +1,3 @@');
    const after = applyUnifiedDiff(text, r.diff);
    expect(after.ok && after.text).toContain('rel="noopener noreferrer"');
    expect(r.diff.length).toBeLessThanOrEqual(2000);
  });
  it('adds the two words to an existing rel and keeps the other words', () => {
    const t = '<a target="_blank" rel="nofollow" href="x">x</a>\n';
    const diff = buildTargetBlankFix(t, { path: 'a.html', firstLine: 1, lastLine: 1 })!;
    expect(diff).toContain('+<a target="_blank" rel="nofollow noopener noreferrer" href="x">x</a>');
  });
  it('keeps CRLF line endings and handles a file with no final newline', () => {
    const crlf = '<p>a</p>\r\n<a target="_blank" href="x">x</a>\r\n';
    const d1 = buildTargetBlankFix(crlf, { path: 'a.html', firstLine: 2, lastLine: 2 })!;
    const a1 = applyUnifiedDiff(crlf, d1);
    expect(a1.ok && a1.text).toBe('<p>a</p>\r\n<a target="_blank" rel="noopener noreferrer" href="x">x</a>\r\n');
    const nonl = '<p>a</p>\n<a target="_blank" href="x">x</a>';
    const d2 = buildTargetBlankFix(nonl, { path: 'a.html', firstLine: 2, lastLine: 2 })!;
    const a2 = applyUnifiedDiff(nonl, d2);
    expect(a2.ok && a2.text).toBe('<p>a</p>\n<a target="_blank" rel="noopener noreferrer" href="x">x</a>');
  });
  it('a dynamic rel or an unreadable tag gives no fix and the finding stays Guided', async () => {
    const t = '<a target="_blank" rel={r} href="x">x</a>\n';
    expect(buildTargetBlankFix(t, { path: 'a.jsx', firstLine: 1, lastLine: 1 })).toBeNull();
    const s = await setup({ 'a.html': '<a href="x" target="_blank">x</a>\n' });
    const f = s.findingsOf('a.html')[0]!;
    const bad = buildFixProposal(f, '<p>changed</p>\n', s.recheck);
    expect(bad.ok).toBe(false);
    expect(FIX_NOTE).toBe('A safe automatic fix could not be built here.');
  });
  it('refuses when the diff would contain a secret, or when the check is not the auto one', async () => {
    const token = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    const text = `<!-- ${token} -->\n<a href="x" target="_blank">x</a>\n`;
    const s = await setup({ 'a.html': text });
    const f = s.findingsOf('a.html')[0]!;
    const r = buildFixProposal(f, text, s.recheck);
    expect(r).toEqual({ ok: false, reason: 'The change contains a likely secret.' });
    expect(buildFixProposal({ ...f, skillId: 'scan.frontend.img-alt' }, text, s.recheck).ok).toBe(false);
  });
});
