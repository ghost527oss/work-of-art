// @node: F11.6
import { describe, expect, it } from 'vitest';
import { AI_LIMITS } from '../src/config/aiLimits';
import { AI_LIVE } from '../src/config/aiLive';
import { buildContext, connectionFacts, normalizeEol } from '../src/engine/contextEngine';
import type { Edge } from '../src/engine/understandTypes';
import { analyze, snapshotOf } from './helpers/analyzeFixture';

const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1} some page text`).join('\n');
const snap = (files: Record<string, string>) => snapshotOf(files);
const ctx = (r: ReturnType<typeof buildContext>) => { if (!r.ok) throw new Error(r.message); return r.context; };

describe('paths', () => {
  const s = snap({ 'a.js': 'x', 'b.js': 'y' });
  it('keeps the chosen paths, de-duplicated, with the finding file first', () => {
    const c = ctx(buildContext({ snapshot: s, paths: ['b.js', 'a.js', 'b.js'], includeContent: false, finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 1 } }));
    expect(c.selectedPaths).toEqual(['a.js', 'b.js']);
    expect(c.skillId).toBe('scan.frontend.img-alt');
  });
  it('refuses an unknown path, a file that is not loaded or only partly loaded, and more than 10 paths', () => {
    expect(buildContext({ snapshot: s, paths: ['nope.js'], includeContent: false })).toEqual({ ok: false, message: '"nope.js" is not in the loaded snapshot.' });
    const t = { ...s, files: s.files.map((f) => (f.path === 'a.js' ? { ...f, loadStatus: 'truncated' as const, truncated: true } : f)) };
    const r = buildContext({ snapshot: t, paths: ['a.js'], includeContent: false });
    expect(r.ok).toBe(false);
    const u = { ...s, files: s.files.map((f) => (f.path === 'b.js' ? { ...f, loadStatus: 'indexed_not_loaded' as const } : f)) };
    expect(buildContext({ snapshot: u, paths: ['b.js'], includeContent: false }).ok).toBe(false);
    const many = Array.from({ length: 11 }, (_, i) => `f${i}.js`);
    expect(buildContext({ snapshot: snap(Object.fromEntries(many.map((p) => [p, 'x']))), paths: many, includeContent: false })).toEqual({ ok: false, message: 'Select at most 10 files.' });
  });
  it('no paths is fine (a general question)', () => {
    const c = ctx(buildContext({ snapshot: s, paths: [], includeContent: true }));
    expect(c.selectedPaths).toEqual([]);
    expect(c.sourceContext).toBeUndefined();
  });
});

describe('snippets only when the contents box is ticked', () => {
  const s = snap({ 'a.js': lines(100) });
  const finding = { path: 'a.js', skillId: 'scan.frontend.layout-overflow', firstLine: 50 };
  it('box off: no snippet even when a finding is chosen, but paths, skill id, and facts remain', () => {
    const edges: Edge[] = [{ id: 'e1', kind: 'calls_api', from: 'a.js', target: '/api/x', certainty: 'confirmed', line: 3 }];
    const c = ctx(buildContext({ snapshot: s, paths: [], finding, includeContent: false, edges }));
    expect(c.sourceContext).toBeUndefined();
    expect(c.selectedPaths).toEqual(['a.js']);
    expect(c.skillId).toBe('scan.frontend.layout-overflow');
    expect(c.connections).toEqual(['a.js calls /api/x (confirmed, line 3)']);
  });
  it('box on: a snippet is added', () => {
    expect(ctx(buildContext({ snapshot: s, paths: [], finding, includeContent: true })).sourceContext).toHaveLength(1);
  });
});

describe('windows', () => {
  it('a file of at most 2 KB is sent whole, without a startLine', () => {
    const small = lines(5);
    const c = ctx(buildContext({ snapshot: snap({ 'a.js': small }), paths: ['a.js'], includeContent: true }));
    expect(c.sourceContext).toEqual([{ filePath: 'a.js', content: small }]);
    expect(c.notes).toEqual([]);
  });
  it('a larger file with a finding: 15 lines either side of the first line, with the right startLine', () => {
    const c = ctx(buildContext({ snapshot: snap({ 'a.js': lines(100) }), paths: [], finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 50 }, includeContent: true }));
    const item = c.sourceContext![0]!;
    expect(item.startLine).toBe(35);
    const got = item.content.split('\n');
    expect(got).toHaveLength(31);
    expect(got[0]).toBe('line 35 some page text');
    expect(got[30]).toBe('line 65 some page text');
    expect(c.notes).toContain('Only lines 35 to 65 of "a.js" were included.');
  });
  it('clips at the start and end of the file', () => {
    const near = ctx(buildContext({ snapshot: snap({ 'a.js': lines(100) }), paths: [], finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 2 }, includeContent: true }));
    expect(near.sourceContext![0]!.startLine).toBe(1);
    expect(near.sourceContext![0]!.content.split('\n')).toHaveLength(17);
    const far = ctx(buildContext({ snapshot: snap({ 'a.js': lines(100) }), paths: [], finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 100 }, includeContent: true }));
    expect(far.sourceContext![0]!.startLine).toBe(85);
    expect(far.sourceContext![0]!.content.split('\n')).toHaveLength(16);
  });
  it('a focus line past the end of the file is clamped', () => {
    const c = ctx(buildContext({ snapshot: snap({ 'a.js': lines(100) }), paths: [], finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 999 }, includeContent: true }));
    expect(c.sourceContext![0]!.startLine).toBe(85);
  });
  it('with no finding: the first 60 lines, labelled as the start of the file', () => {
    const c = ctx(buildContext({ snapshot: snap({ 'a.js': lines(200) }), paths: ['a.js'], includeContent: true }));
    expect(c.sourceContext![0]!.startLine).toBe(1);
    expect(c.sourceContext![0]!.content.split('\n')).toHaveLength(AI_LIVE.headLines);
    expect(c.notes).toContain('Only the first 60 lines of "a.js" were included (the start of the file).');
  });
  it('a finding in a different file does not centre the window on another file', () => {
    const c = ctx(buildContext({ snapshot: snap({ 'a.js': lines(100), 'b.js': lines(100) }), paths: ['b.js'], finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 50 }, includeContent: true }));
    expect(c.sourceContext!.find((s) => s.filePath === 'a.js')!.startLine).toBe(35);
    expect(c.sourceContext!.find((s) => s.filePath === 'b.js')!.startLine).toBe(1);
  });
  it('very long lines keep a window at or under 6 KB and 80 lines, and the focus line stays inside', () => {
    const long = Array.from({ length: 100 }, (_, i) => `L${i + 1} ${'y'.repeat(300)}`).join('\n');
    const c = ctx(buildContext({ snapshot: snap({ 'a.js': long }), paths: [], finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 50 }, includeContent: true }));
    const item = c.sourceContext![0]!;
    expect(new TextEncoder().encode(item.content).length).toBeLessThanOrEqual(AI_LIVE.windowMaxBytes);
    expect(item.content.split('\n').length).toBeLessThanOrEqual(AI_LIVE.windowMaxLines);
    const first = item.startLine!;
    expect(first).toBeLessThanOrEqual(50);
    expect(first + item.content.split('\n').length - 1).toBeGreaterThanOrEqual(50);
  });
  it('at most 5 files get snippets, with a note, never silently', () => {
    const files = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`f${i}.js`, 'x']));
    const c = ctx(buildContext({ snapshot: snap(files), paths: Object.keys(files), includeContent: true }));
    expect(c.sourceContext).toHaveLength(AI_LIMITS.maxContextFiles);
    expect(c.notes).toContain('Snippets were sent for the first 5 files only.');
    expect(c.selectedPaths).toHaveLength(7);
  });
  it('the result fits the Phase 2 request limits', () => {
    const files = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.js`, lines(300)]));
    const c = ctx(buildContext({ snapshot: snap(files), paths: Object.keys(files), includeContent: true }));
    const total = c.sourceContext!.reduce((n, s) => n + new TextEncoder().encode(s.content).length, 0);
    expect(total).toBeLessThanOrEqual(AI_LIMITS.maxContextTotalBytes);
    for (const s of c.sourceContext!) expect(new TextEncoder().encode(s.content).length).toBeLessThanOrEqual(AI_LIMITS.maxContextFileBytes);
  });
});

describe('line endings and redaction', () => {
  it('CRLF text gives the same snippet as LF text, and no carriage return is ever sent', () => {
    const lf = lines(100);
    const crlf = lf.replace(/\n/g, '\r\n');
    const f = { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 50 };
    const a = ctx(buildContext({ snapshot: snap({ 'a.js': lf }), paths: [], finding: f, includeContent: true }));
    const b = ctx(buildContext({ snapshot: snap({ 'a.js': crlf }), paths: [], finding: f, includeContent: true }));
    expect(b.sourceContext).toEqual(a.sourceContext);
    expect(JSON.stringify(b)).not.toContain('\\r');
    expect(normalizeEol('a\r\nb\r\n')).toBe('a\nb\n');
    expect(normalizeEol('a\nb')).toBe('a\nb');
    const small = ctx(buildContext({ snapshot: snap({ 'a.js': 'a\r\nb\r\n' }), paths: ['a.js'], includeContent: true }));
    expect(small.sourceContext![0]!.content).toBe('a\nb\n');
  });
  it('redacts a secret in a snippet and says so', () => {
    const key = 'AKIAABCDEFGHIJKLMNOP';
    const c = ctx(buildContext({ snapshot: snap({ 'a.js': `const k = "${key}";\nrest` }), paths: ['a.js'], includeContent: true }));
    expect(JSON.stringify(c)).not.toContain(key);
    expect(c.sourceContext![0]!.content).toContain('[REDACTED:');
    expect(c.notes).toContain('1 likely secret was redacted from the snippets.');
  });
});

describe('connection facts', () => {
  const e = (over: Partial<Edge> & Pick<Edge, 'id' | 'kind' | 'from' | 'target'>): Edge => ({ certainty: 'confirmed', line: 1, ...over });
  const set = new Set(['a.js']);
  it('only edges that touch the selected files; confirmed first, then by line; at most 3', () => {
    const edges: Edge[] = [
      e({ id: '1', kind: 'imports', from: 'a.js', target: './b', targetPath: 'b.js', certainty: 'inferred', line: 1 }),
      e({ id: '2', kind: 'calls_api', from: 'a.js', target: '/api/x', line: 9 }),
      e({ id: '3', kind: 'calls_api', from: 'a.js', target: '/api/y', line: 4 }),
      e({ id: '4', kind: 'reads_config', from: 'z.js', target: 'PORT' }),
      e({ id: '5', kind: 'imports', from: 'c.js', target: './a', targetPath: 'a.js', line: 2 }),
    ];
    expect(connectionFacts(edges, set)).toEqual([
      'c.js imports a.js (confirmed, line 2)',
      'a.js calls /api/y (confirmed, line 4)',
      'a.js calls /api/x (confirmed, line 9)',
    ]);
  });
  it('each kind has a plain phrase', () => {
    const k = (kind: Edge['kind']) => connectionFacts([e({ id: '1', kind, from: 'a.js', target: 'T', targetPath: kind === 'imports' || kind === 'loads' ? 'b.js' : undefined })], set)[0];
    expect(k('imports')).toBe('a.js imports b.js (confirmed, line 1)');
    expect(k('loads')).toBe('a.js loads b.js (confirmed, line 1)');
    expect(k('defines_route')).toBe('a.js defines the route T (confirmed, line 1)');
    expect(k('calls_api')).toBe('a.js calls T (confirmed, line 1)');
    expect(k('calls_external')).toBe('a.js calls the outside address T (confirmed, line 1)');
    expect(k('reads_config')).toBe('a.js reads the setting T (confirmed, line 1)');
  });
  it('is empty for no edges, and each fact is at most 200 characters and redacted', () => {
    expect(connectionFacts([], set)).toEqual([]);
    const long = connectionFacts([e({ id: '1', kind: 'calls_api', from: 'a.js', target: '/api/' + 'q'.repeat(400) })], set)[0]!;
    expect(long.length).toBeLessThanOrEqual(200);
    const key = 'AKIAABCDEFGHIJKLMNOP';
    expect(connectionFacts([e({ id: '1', kind: 'calls_external', from: 'a.js', target: `https://x.test/?k=${key}` })], set).join('')).not.toContain(key);
  });
  it('real analysis: facts hold paths and addresses, never source text', async () => {
    const files = {
      'index.html': '<html><body><script src="app.js"></script></body></html>',
      'app.js': 'fetch("/api/profile");\n// SENTINEL_SOURCE_TEXT_9\nconst secretWord = "SENTINEL_BODY_7";',
      'server.js': 'const express = require("express");\nconst app = express();\napp.get("/api/profile", (req, res) => res.json({}));',
    };
    const analysis = await analyze(files);
    const c = ctx(buildContext({ snapshot: snapshotOf(files), paths: ['app.js'], includeContent: false, edges: analysis.edges }));
    expect(c.connections!.length).toBeGreaterThan(0);
    const text = c.connections!.join('\n');
    expect(text).toContain('app.js');
    expect(text).not.toContain('SENTINEL_');
    for (const line of c.connections!) expect(line).toMatch(/\((confirmed|inferred|broken), line \d+\)$/);
  });
});

describe('purity', () => {
  it('is deterministic and does not change its input', () => {
    const s = snap({ 'a.js': lines(100) });
    const frozen = JSON.stringify(s);
    const input = { snapshot: s, paths: ['a.js'], includeContent: true, finding: { path: 'a.js', skillId: 'scan.frontend.img-alt', firstLine: 40 } };
    expect(JSON.stringify(buildContext(input))).toBe(JSON.stringify(buildContext(input)));
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
