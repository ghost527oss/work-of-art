// @node: F9.6
// The patch self-check: when applying the combined diff does not give exactly the final text, the file is excluded.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/engine/diffApply', async (orig) => {
  const real = await orig<typeof import('../src/engine/diffApply')>();
  return { ...real, applyUnifiedDiff: (c: string, d: string) => { const r = real.applyUnifiedDiff(c, d); return r.ok ? { ok: true, text: r.text + 'corrupted' } : r; } };
});

describe('patch self-check', () => {
  it('a diff that does not reproduce the final text is excluded with the verify reason', async () => {
    const { planPatchExport, EXCLUDE } = await import('../src/export/patchExport');
    const { buildUnifiedDiff } = await import('../src/export/unifiedDiff');
    const snap = { id: 's', source: 'sample', owner: 'o', name: 'n', ref: 'r', files: [{ path: 'a.txt', size: 2, loadStatus: 'loaded', content: 'a\n' }], inventory: { entries: [] } } as never;
    const entry = { id: 'h1', path: 'a.txt', title: 't', at: 1, diff: buildUnifiedDiff('a.txt', 'a\n', 'b\n')!, beforeHash: '', afterHash: '' };
    const p = planPatchExport(snap, [entry], () => 'b\n', 0);
    expect(p.files[0]).toMatchObject({ excluded: EXCLUDE.verify, defaultSelected: false });
    expect(p.files[0]!.patch).toBeUndefined();
  });
});
