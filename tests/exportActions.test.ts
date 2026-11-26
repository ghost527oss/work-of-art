// @node: F9.7
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { hashText } from '../src/engine/diffApply';
import { buildUnifiedDiff } from '../src/export/unifiedDiff';
import { createExporter } from '../src/hooks/useJournal';
import { logJournalExport, logLogExport, logPatchExport } from '../src/store/exportActions';
import { createStore, initialState, withLog, type StudioState } from '../src/store/useStudioStore';

const base = (): StudioState => ({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1) });

describe('export Log entries', () => {
  it('hold counts or the level only', () => {
    const s = base();
    expect(logPatchExport(s, 5, 2, 3).log.at(-1)).toMatchObject({ action: 'export_patch', status: 'info', message: 'Exported patch: 2 files, 3 hunks.' });
    expect(logLogExport(s, 5, 'json', 7).log.at(-1)!.message).toBe('Exported log (json): 7 entries.');
    expect(logJournalExport(s, 5, 'deeper').log.at(-1)!.message).toBe('Exported journal (deeper).');
  });
});

describe('createExporter', () => {
  function setup(ok: boolean) {
    let s = base();
    const html = s.snapshot!.files.find((f) => f.path === 'index.html')!.content!;
    const after = html.replace('Order now', 'Order today');
    s = { ...s, work: { ...s.work, applied: [{ id: 'h1', path: 'index.html', title: 't', at: 1, diff: buildUnifiedDiff('index.html', html, after)!, beforeHash: hashText(html), afterHash: hashText(after) }] } };
    s = { ...s, ...withLog(s, 1, { action: 'x', status: 'info', message: 'm' }) };
    const store = createStore(s);
    const got: Array<{ name: string; text: string }> = [];
    const ex = createExporter(store, { download: (name, text) => { got.push({ name, text }); return ok; }, dispose: () => undefined }, () => Date.UTC(2026, 10, 24));
    return { store, got, ex };
  }

  it('writes the Log entry only after a successful download', () => {
    const { store, got, ex } = setup(true);
    const name = ex.exportPatch(new Set(['index.html']));
    expect(name).toMatch(/^patchbay-.*-20261124\.patch$/);
    expect(got[0]!.text.startsWith('diff --git a/index.html b/index.html\n')).toBe(true);
    expect(store.getState().log.at(-1)!.message).toBe('Exported patch: 1 files, 1 hunks.');
    expect(ex.exportLog('md')).toMatch(/-log\.md$/);
    expect(store.getState().log.at(-1)!.action).toBe('export_log');
  });

  it('a refused download writes nothing (same state object)', () => {
    const { store, ex } = setup(false);
    const before = store.getState();
    expect(ex.exportPatch(new Set(['index.html']))).toBe(false);
    expect(ex.exportLog('json')).toBe(false);
    expect(store.getState()).toBe(before);
  });

  it('nothing selected exports nothing', () => {
    const { store, got, ex } = setup(true);
    const before = store.getState();
    expect(ex.exportPatch(new Set())).toBe(false);
    expect(got).toEqual([]);
    expect(store.getState()).toBe(before);
  });
});
