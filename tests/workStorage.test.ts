// @node: F4.6
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { parseCommand } from '../src/engine/commands';
import type { KeyValueStorage } from '../src/store/layoutStorage';
import { DISCARD_MESSAGE, restoreWork, runCommand, tickRun, type Mode, type WorkCtx } from '../src/store/workActions';
import {
  buildRecord, clearWorkSlot, loadWork, repoKeyOf, replacedMessage, saveWork, trimRecord, WORK_KEY, TRIMMED_MESSAGE,
  recordBytes, type WorkRecord,
} from '../src/store/workStorage';
import { initialState, type StudioState } from '../src/store/useStudioStore';

let idN = 0;
const ctx = (mode: Mode = 'automation', now = 5000): WorkCtx => ({ now, mode, newId: () => `id-${++idN}` });
const snapshot = buildSampleSnapshot('fullstack-api', 1);
const base = (): StudioState => ({ ...initialState(), experience: 'studio', snapshot });
function cmd(s: StudioState, text: string): StudioState {
  const p = parseCommand(text);
  if (p.kind !== 'command') throw new Error(text);
  return runCommand(s, { name: p.name, arg: p.arg }, ctx()).state;
}
function tick(s: StudioState): StudioState {
  const r = s.work.run!;
  return tickRun(s, r.id, r.position, ctx());
}
/** A state with one applied change, one undone change, and a waiting proposal. */
function richState(): StudioState {
  let s = cmd(base(), 'start');
  for (let i = 0; i < 4; i++) s = tick(s);
  s = cmd(s, 'approve');
  s = cmd(cmd(s, 'pause'), 'undo');
  return s;
}
function mem(initial?: string): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(WORK_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
function record(): WorkRecord {
  const r = buildRecord(richState(), 9000);
  if (!r) throw new Error('no record');
  return r;
}

describe('load, save, clear', () => {
  it('round-trips a valid record', () => {
    const st = mem();
    const r = record();
    expect(saveWork(st, r)).toBe(true);
    expect(loadWork(st)).toEqual(r);
    clearWorkSlot(st);
    expect(loadWork(st)).toBeNull();
  });
  const bad = (name: string, mutate: (r: Record<string, unknown>) => unknown) =>
    it(`rejects: ${name}`, () => {
      const r = JSON.parse(JSON.stringify(record())) as Record<string, unknown>;
      const text = JSON.stringify(mutate(r));
      expect(loadWork(mem(text))).toBeNull();
    });
  bad('wrong version', (r) => ({ ...r, version: 2 }));
  bad('unknown field', (r) => ({ ...r, extra: 1 }));
  bad('unknown field in a step', (r) => { (r.run as { steps: object[] }).steps[0] = { kind: 'info', title: 't', x: 1 }; return r; });
  bad('steps over 8', (r) => { (r.run as { steps: object[] }).steps = Array.from({ length: 9 }, () => ({ kind: 'info', title: 't' })); return r; });
  bad('diff over 2,000 characters', (r) => ({ ...r, proposal: { id: 'p', path: 'a', title: 't', diff: 'x'.repeat(2001) } }));
  bad('more than 50 history entries', (r) => {
    const e = { id: 'h', path: 'a', title: 't', at: 1, diff: 'd', beforeHash: '00000000', afterHash: '11111111' };
    return { ...r, applied: Array.from({ length: 51 }, () => e), undone: [] };
  });
  bad('applied plus undone over 50', (r) => {
    const e = { id: 'h', path: 'a', title: 't', at: 1, diff: 'd', beforeHash: '00000000', afterHash: '11111111' };
    return { ...r, applied: Array.from({ length: 30 }, () => e), undone: Array.from({ length: 21 }, () => e) };
  });
  bad('more than 200 log entries', (r) => ({ ...r, log: Array.from({ length: 201 }, (_, i) => ({ id: `l${i}`, timestamp: 1, action: 'a', status: 'info', affectedPaths: [], message: 'm', redacted: false })) }));
  bad('bad hash', (r) => { (r.applied as Array<{ afterHash: string }>)[0] ??= { afterHash: 'x' } as never; return { ...r, applied: [{ id: 'h', path: 'a', title: 't', at: 1, diff: 'd', beforeHash: 'ZZ', afterHash: 'a' }] }; });
  it('rejects missing, bad JSON, over 256 KB, and no storage', () => {
    expect(loadWork(mem())).toBeNull();
    expect(loadWork(mem('{nope'))).toBeNull();
    expect(loadWork(mem(' '.repeat(256 * 1024 + 1)))).toBeNull();
    expect(loadWork(undefined)).toBeNull();
    expect(loadWork(mem('null'))).toBeNull();
  });
  it('blocked, throwing, and full storage never throw', () => {
    const throwing: KeyValueStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };
    expect(loadWork(throwing)).toBeNull();
    expect(saveWork(throwing, record())).toBe(false);
    expect(() => clearWorkSlot(throwing)).not.toThrow();
    expect(saveWork(undefined, record())).toBe(false);
    expect(() => clearWorkSlot(undefined)).not.toThrow();
  });
  it('clear works when removeItem is missing', () => {
    const data = new Map<string, string>();
    const st: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    saveWork(st, record());
    clearWorkSlot(st);
    expect(loadWork(st)).toBeNull();
  });
});

describe('buildRecord', () => {
  it('returns null without a snapshot', () => expect(buildRecord(initialState(), 1)).toBeNull());
  it('writes only allowed fields and leaks nothing private', () => {
    const SENT = 'SENTINEL-INSTRUCTION-xyzzy';
    let s = richState();
    s = { ...s, ai: { status: 'idle', summary: { taskType: SENT, selectedCount: 1, includesContent: true } } };
    s = { ...s, work: { ...s.work, chat: [{ id: 1, command: 'x', reply: SENT, ok: true }] } };
    const text = JSON.stringify(buildRecord(s, 1));
    expect(text).not.toContain(SENT);
    expect(text).not.toMatch(/ghp_/);
    for (const f of snapshot.files) for (const line of (f.content ?? '').split('\n')) if (line.trim().length > 15) expect(text).not.toContain(line.trim());
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['applied', 'log', 'proposal', 'repoKey', 'run', 'savedAt', 'undone', 'version']);
  });
  it('stores a running run as paused with autoAdvance false', () => {
    const s = cmd(base(), 'start');
    expect(s.work.run!.status).toBe('running');
    expect(buildRecord(s, 1)!.run).toMatchObject({ status: 'paused', autoAdvance: false });
  });
  it('keeps the last 200 log entries', () => {
    let s = base();
    s = { ...s, log: Array.from({ length: 300 }, (_, i) => ({ id: `l${i}`, timestamp: i, action: 'a', status: 'info' as const, affectedPaths: [], message: `m${i}`, redacted: false })) };
    const r = buildRecord(s, 1)!;
    expect(r.log).toHaveLength(200);
    expect(r.log[0]!.message).toBe('m100');
  });
  it('repoKeyOf', () => expect(repoKeyOf(snapshot)).toBe('sample:sample/fullstack-api@sample'));
  it('replacedMessage names the old repository only', () => {
    expect(replacedMessage('github:octo/cat@main')).toBe('Saved work for octo/cat was replaced.');
  });
});

describe('trimRecord', () => {
  const pad = (n: number) => 'x'.repeat(n);
  const bigLog = (n: number, size: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, timestamp: i, action: 'a', status: 'info' as const, affectedPaths: [], message: pad(size), redacted: false }));
  const entry = (i: number) => ({ id: `h${i}`, path: 'a', title: 't', at: i, diff: pad(1900), beforeHash: '00000000', afterHash: '11111111' });
  it('does nothing when it fits', () => {
    const r = record();
    expect(trimRecord(r)).toEqual({ record: r, trimmed: false, tooBig: false });
  });
  it('drops the oldest log entries first', () => {
    const r: WorkRecord = { ...record(), log: bigLog(200, 5000) };
    const t = trimRecord(r, 400_000 / 2 + 1000);
    expect(t.trimmed).toBe(true);
    expect(t.tooBig).toBe(false);
    expect(t.record.log.length).toBeLessThan(200);
    expect(t.record.log.at(-1)!.id).toBe('l199');
    expect(t.record.undone).toEqual(r.undone);
    expect(TRIMMED_MESSAGE).toBe('Saved work was trimmed.');
  });
  it('then drops the oldest undone changes and never an applied one', () => {
    const r: WorkRecord = { ...record(), log: [], applied: [entry(1), entry(2)], undone: [entry(3), entry(4), entry(5)] };
    const limit = recordBytes({ ...r, undone: [entry(5)] }) + 10;
    const t = trimRecord(r, limit);
    expect(t.record.undone.map((e) => e.id)).toEqual(['h5']);
    expect(t.record.applied).toEqual(r.applied);
    expect(t.tooBig).toBe(false);
  });
  it('reports tooBig when applied changes alone do not fit', () => {
    const r: WorkRecord = { ...record(), log: [], undone: [], applied: [entry(1), entry(2)] };
    const t = trimRecord(r, 1000);
    expect(t.tooBig).toBe(true);
    expect(t.record.applied).toHaveLength(2);
  });
});

describe('restoreWork', () => {
  const rec = () => record();
  it('restores history, proposal, run (paused), and log once', () => {
    const s0 = base();
    const r = rec();
    const s = restoreWork(s0, r, ctx(), { restoreLog: true });
    expect(s.work.applied).toEqual(r.applied);
    expect(s.work.undone).toEqual(r.undone);
    expect(s.work.run).toMatchObject({ status: 'paused', autoAdvance: false });
    expect(s.log.length).toBeGreaterThan(r.log.length);
    expect(new Set(s.log.map((e) => e.id)).size).toBe(s.log.length);
    expect(s.log.at(-1)!.message).toContain('Saved work restored');
    // restored log comes first, before entries already in memory
    const pre: StudioState = { ...base(), log: [{ id: 'log-1', timestamp: 1, action: 'a', status: 'info', affectedPaths: [], message: 'ALREADY', redacted: false }], logSeq: 1 };
    const s2 = restoreWork(pre, r, ctx(), { restoreLog: true });
    const idx = s2.log.findIndex((e) => e.message === 'ALREADY');
    expect(idx).toBe(r.log.length);
    expect(new Set(s2.log.map((e) => e.id)).size).toBe(s2.log.length);
  });
  it('does not restore the log when restoreLog is false', () => {
    const r = rec();
    const s = restoreWork(base(), r, ctx(), { restoreLog: false });
    expect(s.work.applied).toHaveLength(r.applied.length);
    expect(s.log.map((e) => e.message)).toEqual([expect.stringContaining('Saved work restored')]);
  });
  it('a waiting proposal comes back awaiting_decision with autoAdvance false', () => {
    let s = cmd(base(), 'start');
    for (let i = 0; i < 4; i++) s = tick(s);
    const r = buildRecord(s, 1)!;
    const out = restoreWork(base(), r, ctx(), { restoreLog: false });
    expect(out.work.run).toMatchObject({ status: 'awaiting_decision', autoAdvance: false });
    expect(out.work.proposal).toEqual(s.work.proposal);
  });
  it('a different key restores nothing', () => {
    const r = { ...rec(), repoKey: 'github:other/repo@main' };
    const s0 = base();
    expect(restoreWork(s0, r, ctx(), { restoreLog: true })).toBe(s0);
  });
  it('a changed file discards history, run, and proposal, keeps the log, and says so', () => {
    const r = rec();
    const path = r.undone[0]!.path;
    const changed: StudioState = {
      ...base(),
      snapshot: { ...snapshot, files: snapshot.files.map((f) => (f.path === path ? { ...f, content: `${f.content}\nextra\n` } : f)) },
    };
    const s = restoreWork(changed, r, ctx(), { restoreLog: true });
    expect(s.work.applied).toEqual([]);
    expect(s.work.run).toBeNull();
    expect(s.work.proposal).toBeNull();
    expect(s.log.at(-1)!.message).toBe(DISCARD_MESSAGE);
    expect(s.log.length).toBe(r.log.length + 1);
  });
  it('a missing file does the same', () => {
    const r = rec();
    const path = r.undone[0]!.path;
    const gone: StudioState = { ...base(), snapshot: { ...snapshot, files: snapshot.files.filter((f) => f.path !== path) } };
    const s = restoreWork(gone, r, ctx(), { restoreLog: false });
    expect(s.work.applied).toEqual([]);
    expect(s.log.at(-1)!.message).toBe(DISCARD_MESSAGE);
  });
  it('a waiting proposal on a missing file is discarded', () => {
    let s = cmd(base(), 'start');
    for (let i = 0; i < 4; i++) s = tick(s);
    const r = buildRecord(s, 1)!;
    const path = r.proposal!.path;
    const gone: StudioState = { ...base(), snapshot: { ...snapshot, files: snapshot.files.filter((f) => f.path !== path) } };
    const out = restoreWork(gone, r, ctx(), { restoreLog: false });
    expect(out.work.proposal).toBeNull();
    expect(out.log.at(-1)!.message).toBe(DISCARD_MESSAGE);
  });
  it('does nothing extra for a record with only a log, and never overwrites live work', () => {
    const r: WorkRecord = { ...rec(), run: null, proposal: null, applied: [], undone: [] };
    const out = restoreWork(base(), r, ctx(), { restoreLog: true });
    expect(out.work).toEqual(base().work);
    expect(out.log).toHaveLength(r.log.length);
    const live = cmd(base(), 'start');
    const out2 = restoreWork(live, rec(), ctx(), { restoreLog: false });
    expect(out2.work).toBe(live.work);
  });
});

describe('tampered saved data and server text (review findings)', () => {
  it('a hand-edited proposal diff is discarded', () => {
    let s = cmd(base(), 'start');
    for (let i = 0; i < 4; i++) s = tick(s);
    const r = buildRecord(s, 1)!;
    const evil = { ...r, proposal: { ...r.proposal!, diff: '--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+EVIL\n' } };
    const out = restoreWork(base(), evil, ctx(), { restoreLog: false });
    expect(out.work.proposal).toBeNull();
    expect(out.log.at(-1)!.message).toBe(DISCARD_MESSAGE);
  });
  it('a hand-edited run script is discarded', () => {
    const s = cmd(base(), 'start');
    const r = buildRecord(s, 1)!;
    const evil = { ...r, run: { ...r.run!, steps: r.run!.steps.map((x, i) => (i === 0 ? { ...x, title: 'Injected' } : x)) } };
    const out = restoreWork(base(), evil, ctx(), { restoreLog: false });
    expect(out.work.run).toBeNull();
    expect(out.log.at(-1)!.message).toBe(DISCARD_MESSAGE);
  });
  it('secret-looking text in a Log message is redacted in the saved record', () => {
    const s: StudioState = { ...base(), log: [{ id: 'l1', timestamp: 1, action: 'ingest_failed', status: 'failed', affectedPaths: [], message: `bad token ghp_${'a'.repeat(36)}`, redacted: false }] };
    expect(JSON.stringify(buildRecord(s, 1))).not.toMatch(/ghp_a{36}/);
  });
});

describe('imports', () => {
  it('workStorage imports nothing from React or the network', () => {
    const src = readFileSync('src/store/workStorage.ts', 'utf8');
    expect(src).not.toMatch(/from 'react|fetch\(|XMLHttpRequest/);
  });
});
