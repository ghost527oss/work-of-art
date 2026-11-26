// @node: F9.6
import { describe, expect, it } from 'vitest';
import { diffLines, type Op } from '../src/export/diffLines';

/** Applies an edit script to `a` and returns the new array (an independent check of the script). */
function play(a: string[], b: string[], ops: Op[]): string[] {
  const out: string[] = [];
  let ia = 0;
  for (const o of ops) {
    if (o.kind === 'equal') { expect(a[o.a]).toBe(b[o.b]); out.push(a[o.a]!); ia = o.a + 1; }
    else if (o.kind === 'delete') { expect(o.a).toBe(ia); ia = o.a + 1; }
    else out.push(b[o.b]!);
  }
  expect(ia).toBe(a.length);
  return out;
}
const edits = (ops: Op[]) => ops.filter((o) => o.kind !== 'equal').length;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe('diffLines', () => {
  const cases: Array<[string, string[], string[], number]> = [
    ['identical', ['a', 'b'], ['a', 'b'], 0],
    ['one changed', ['a', 'b', 'c'], ['a', 'x', 'c'], 2],
    ['inserted', ['a', 'c'], ['a', 'b', 'c'], 1],
    ['deleted', ['a', 'b', 'c'], ['a', 'c'], 1],
    ['swapped', ['a', 'b'], ['b', 'a'], 2],
    ['all changed', ['a', 'b'], ['x', 'y'], 4],
    ['empty to some', [], ['a', 'b'], 2],
    ['some to empty', ['a', 'b'], [], 2],
  ];
  for (const [name, a, b, n] of cases) {
    it(`minimal script: ${name}`, () => {
      const ops = diffLines(a, b);
      expect(play(a, b, ops)).toEqual(b);
      expect(edits(ops)).toBe(n);
    });
  }

  it('seeded fuzz: 1,000 random pairs replay exactly', () => {
    const r = rng(42);
    const pick = () => ['a', 'b', 'c', 'd', 'e'][Math.floor(r() * 5)]!;
    for (let i = 0; i < 1000; i++) {
      const a = Array.from({ length: Math.floor(r() * 12) }, pick);
      const b = Array.from({ length: Math.floor(r() * 12) }, pick);
      expect(play(a, b, diffLines(a, b))).toEqual(b);
    }
  });

  it('the work limit forces the single-edit fallback, which is still correct', () => {
    const a = ['k', 'a1', 'a2', 'a3', 'k2'];
    const b = ['k', 'b1', 'a2', 'b3', 'k2'];
    const ops = diffLines(a, b, 1);
    expect(play(a, b, ops)).toEqual(b);
    // fallback: the whole changed middle is deleted and inserted
    expect(ops.filter((o) => o.kind === 'delete').length).toBe(3);
    expect(ops.filter((o) => o.kind === 'insert').length).toBe(3);
  });

  it('compares line endings exactly', () => {
    expect(edits(diffLines(['a\n'], ['a\r\n']))).toBe(2);
  });

  it('20,000 lines with 2,000 changed finish in under 2 seconds', () => {
    const a = Array.from({ length: 20000 }, (_, i) => `line ${i}\n`);
    const b = a.map((l, i) => (i % 10 === 0 ? `changed ${i}\n` : l));
    const t = performance.now();
    const ops = diffLines(a, b);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(play(a, b, ops)).toEqual(b);
  });
});

describe('diffLines memory', () => {
  it('a full 20,000-line rewrite stays bounded (falls back under the work limit, no huge trace)', () => {
    const a = Array.from({ length: 20000 }, (_, i) => `a${i}\n`);
    const b = Array.from({ length: 20000 }, (_, i) => `b${i}\n`);
    const before = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
    const ops = diffLines(a, b);
    const after = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
    expect(play(a, b, ops)).toEqual(b);
    expect((after - before) / 1024 / 1024).toBeLessThan(200);
  });
});
