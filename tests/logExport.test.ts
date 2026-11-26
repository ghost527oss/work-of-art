// @node: F9.7
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { buildLogJson, buildLogMarkdown } from '../src/export/logExport';
import { exportFileName } from '../src/export/exportName';
import { BANNED } from '../src/journal/lessonRules';
import { initialState, withLog, type StudioState } from '../src/store/useStudioStore';

const SECRET = 'ghp_' + 'B'.repeat(36);
const NOW = new Date('2026-11-24T10:00:00.000Z');

function fixture(): StudioState {
  let s: StudioState = { ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1) };
  s = { ...s, ...withLog(s, 1000, { action: 'ingest_completed', status: 'info', message: 'Loaded 5 files | done.', affectedPaths: ['index.html'] }) };
  s = { ...s, ...withLog(s, 2000, { action: 'note', status: 'info', message: `token ${SECRET} seen` }) };
  s = {
    ...s,
    work: { ...s.work, applied: [{ id: 'h1', path: 'index.html', title: 'Add alt text', at: 3000, diff: '--- a/index.html\n+++ b/index.html\n@@ -1 +1 @@\n-SNIPPET_SENTINEL\n+DIFF_BODY_SENTINEL\n', beforeHash: '', afterHash: '' }], undone: [] },
  };
  return s;
}

describe('log export', () => {
  it('Markdown layout, summary, changes table with no diff, log table, hidden note', () => {
    const md = buildLogMarkdown(fixture(), NOW);
    const lines = md.split('\n');
    expect(lines.slice(0, 4)).toEqual(['# PatchBay session log: sample-static-site'.replace('sample-static-site', fixture().snapshot!.name), `Repository: sample ${fixture().snapshot!.owner}/${fixture().snapshot!.name} @ ${fixture().snapshot!.ref}`, 'Exported: 2026-11-24T10:00:00.000Z', '']);
    expect(md).toContain('## Summary\n- Files read: 0. Sorted by path only: 0. Left out on purpose: 0.\n- Findings: not scanned. Scan: not run.\n- Changes applied: 1. Undone: 0. Preview-only changes: 0.');
    expect(md).toContain('| 1970-01-01T00:00:03.000Z | applied | Add alt text | index.html |');
    expect(md).toContain('| 1970-01-01T00:00:01.000Z | ingest_completed | info | Loaded 5 files \\| done. | index.html |');
    expect(md).not.toContain(SECRET);
    expect(md).not.toContain('SNIPPET_SENTINEL');
    expect(md).not.toContain('DIFF_BODY_SENTINEL');
    expect(md.trimEnd().endsWith('1 values were hidden.')).toBe(true);
    for (const b of BANNED) expect(md.toLowerCase()).not.toContain(b);
  });

  it('JSON keys in order, two-space indentation, trailing newline', () => {
    const js = buildLogJson(fixture(), NOW);
    expect(js.endsWith('}\n')).toBe(true);
    expect(js.split('\n')[1]).toBe('  "version": 1,');
    const o = JSON.parse(js);
    expect(Object.keys(o)).toEqual(['version', 'exportedAt', 'repository', 'summary', 'changes', 'log', 'note']);
    expect(Object.keys(o.changes[0])).toEqual(['id', 'title', 'path', 'at', 'state']);
    expect(Object.keys(o.log[0])).toEqual(['id', 'timestamp', 'action', 'status', 'affectedPaths', 'message']);
    expect(js).not.toContain(SECRET);
    expect(js).not.toContain('DIFF_BODY_SENTINEL');
    expect(o.note).toBe('1 values were hidden.');
  });

  it('an empty log gives a valid file with an empty table', () => {
    const s = { ...initialState(), snapshot: buildSampleSnapshot('static-site', 1) };
    const md = buildLogMarkdown(s, NOW);
    expect(md.trimEnd().endsWith('| --- | --- | --- | --- | --- |')).toBe(true);
    expect(JSON.parse(buildLogJson(s, NOW)).log).toEqual([]);
  });
});

describe('exportFileName', () => {
  const d = new Date('2026-03-07T00:00:00Z');
  it('lower-cases, replaces odd characters, adds the date and kind', () => {
    expect(exportFileName({ owner: 'Ghost', name: 'My Repo!', ref: 'feat/x' }, undefined, 'patch', d)).toBe('patchbay-ghost-my-repo--feat-x-20260307.patch');
    expect(exportFileName({ owner: 'o', name: 'r', ref: 'main' }, 'log', 'json', d)).toBe('patchbay-o-r-main-20260307-log.json');
  });
  it('cuts to 100 characters, never empty, never a leading dot', () => {
    const n = exportFileName({ owner: 'o'.repeat(200), name: 'r', ref: 'm' }, 'journal-simple', 'md', d);
    expect(n.length).toBeLessThanOrEqual(100);
    expect(n.endsWith('.md')).toBe(true);
    expect(n.startsWith('patchbay-')).toBe(true);
  });
});
