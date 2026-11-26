// @node: F5.9
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { CORRECTIONS_KEY, clearCorrectionsSlot, loadCorrectionsFor, saveCorrections } from '../src/store/correctionsStorage';
import type { KeyValueStorage } from '../src/store/layoutStorage';

const snap = buildSampleSnapshot('fullstack-api', 1);
function mem(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(CORRECTIONS_KEY, initial);
  const st: KeyValueStorage & { data: Map<string, string> } = { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  return st;
}

describe('saved corrections', () => {
  it('round-trips and drops paths that are not in the inventory', () => {
    const st = mem();
    expect(saveCorrections(st, snap, { 'README.md': ['backend'], 'gone.js': ['frontend'] }, 1)).toBe(true);
    expect(loadCorrectionsFor(st, snap)).toEqual({ 'README.md': ['backend'] });
  });
  it('the saved text has only paths and label names', () => {
    const st = mem();
    saveCorrections(st, snap, { 'README.md': ['backend', 'tests'] }, 1);
    const rec = JSON.parse(st.data.get(CORRECTIONS_KEY)!);
    expect(Object.keys(rec).sort()).toEqual(['corrections', 'repoKey', 'savedAt', 'version']);
    expect(rec.corrections).toEqual({ 'README.md': ['backend', 'tests'] });
  });
  it('a different repository restores nothing and leaves the slot', () => {
    const st = mem();
    saveCorrections(st, snap, { 'README.md': ['backend'] }, 1);
    const text = st.data.get(CORRECTIONS_KEY);
    expect(loadCorrectionsFor(st, buildSampleSnapshot('static-site', 1))).toEqual({});
    expect(st.data.get(CORRECTIONS_KEY)).toBe(text);
  });
  const bad = (name: string, text: string) => it(`ignores: ${name}`, () => expect(loadCorrectionsFor(mem(text), snap)).toEqual({}));
  bad('bad JSON', '{x');
  bad('wrong version', JSON.stringify({ version: 2, repoKey: 'x', savedAt: 1, corrections: {} }));
  bad('unknown field', JSON.stringify({ version: 1, repoKey: 'x', savedAt: 1, corrections: {}, extra: 1 }));
  bad('unknown label', JSON.stringify({ version: 1, repoKey: 'sample:sample/fullstack-api@sample', savedAt: 1, corrections: { 'README.md': ['unknown'] } }));
  bad('too many labels', JSON.stringify({ version: 1, repoKey: 'x', savedAt: 1, corrections: { a: Array(10).fill('backend') } }));
  bad('over 64 KB', ' '.repeat(64 * 1024 + 1));
  it('more than 500 corrections is rejected', () => {
    const c = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`p${i}`, ['backend']]));
    expect(loadCorrectionsFor(mem(JSON.stringify({ version: 1, repoKey: 'sample:sample/fullstack-api@sample', savedAt: 1, corrections: c })), snap)).toEqual({});
  });
  it('blocked and throwing storage never throw', () => {
    const t: KeyValueStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); }, removeItem: () => { throw new Error('z'); } };
    expect(loadCorrectionsFor(t, snap)).toEqual({});
    expect(saveCorrections(t, snap, { a: ['backend'] }, 1)).toBe(false);
    expect(() => clearCorrectionsSlot(t)).not.toThrow();
    expect(loadCorrectionsFor(undefined, snap)).toEqual({});
  });
  it('clear removes the slot', () => {
    const st = mem();
    saveCorrections(st, snap, { 'README.md': ['backend'] }, 1);
    clearCorrectionsSlot(st);
    expect(st.data.has(CORRECTIONS_KEY)).toBe(false);
  });
});
