// @node: F4.1
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyUnifiedDiff, hashText, reverseUnifiedDiff } from '../src/engine/diffApply';
import { buildInsertDiff } from '../src/engine/unifiedDiff';
import { applyDiff, isError } from './helpers/applyDiff';

const INSERT = '// PRACTICE: note';
const zero = (path = 'a.ts', line = INSERT) => `--- a/${path}\n+++ b/${path}\n@@ -0,0 +1 @@\n+${line}\n`;

function ok(content: string, diff: string): string {
  const r = applyUnifiedDiff(content, diff);
  if (!r.ok) throw new Error(r.reason);
  return r.text;
}

const FIXTURES: Record<string, string> = {
  empty: '',
  oneLineNoNl: 'one',
  oneLine: 'one\n',
  lf: 'a\nb\nc\nd\ne\nf\n',
  crlf: 'a\r\nb\r\nc\r\n',
  noFinalNewline: 'a\nb\nc',
  blankLines: '\n\nx\n\n',
};

describe('applyUnifiedDiff: zero-context insert at top', () => {
  it('empty file', () => expect(ok('', zero())).toBe(`${INSERT}\n`));
  it('one-line file', () => expect(ok('one\n', zero())).toBe(`${INSERT}\none\n`));
  it('one-line file without newline', () => expect(ok('one', zero())).toBe(`${INSERT}\none`));
  it('CRLF file gets CRLF on the inserted line', () => expect(ok('a\r\nb\r\n', zero())).toBe(`${INSERT}\r\na\r\nb\r\n`));
  it('file with no final newline stays without one', () => expect(ok('a\nb', zero())).toBe(`${INSERT}\na\nb`));
});

describe('applyUnifiedDiff: agrees with the independent oracle', () => {
  for (const [name, content] of Object.entries(FIXTURES)) {
    if (name === 'crlf') continue; // the oracle always writes "\n"
    it(`buildInsertDiff on ${name}`, () => {
      const { diff } = buildInsertDiff({ path: 'a.ts', content, comment: INSERT });
      const oracle = applyDiff(content, diff);
      expect(isError(oracle)).toBe(false);
      if (isError(oracle)) return;
      expect(ok(content, diff)).toBe(oracle.output);
    });
  }
  it('buildInsertDiff on CRLF applies with CRLF', () => {
    const content = FIXTURES.crlf!;
    const { diff } = buildInsertDiff({ path: 'a.ts', content, comment: INSERT });
    expect(ok(content, diff)).toBe(`${INSERT}\r\n${content}`);
  });
});

describe('applyUnifiedDiff: multi-hunk and changes', () => {
  const content = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n';
  const diff = '--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n l1\n-l2\n+L2\n@@ -6,3 +6,3 @@\n l6\n-l7\n+L7\n l8\n';
  it('applies two hunks', () => expect(ok(content, diff)).toBe('l1\nL2\nl3\nl4\nl5\nl6\nL7\nl8\n'));
  it('appends after the last line with a zero-count hunk', () => {
    expect(ok('a\n', '--- a/f\n+++ b/f\n@@ -1,0 +2 @@\n+z\n')).toBe('a\nz\n');
  });
  it('appending to a file without final newline adds the missing newline to the old last line', () => {
    expect(ok('a', '--- a/f\n+++ b/f\n@@ -1,0 +2 @@\n+z\n')).toBe('a\nz\n');
  });
  it('accepts git-style leading lines', () => {
    expect(ok('a\n', `diff --git a/f b/f\nindex 1..2 100644\n${zero('f', 'x')}`)).toBe('x\na\n');
  });
});

describe('applyUnifiedDiff: rejections', () => {
  const content = 'l1\nl2\nl3\nl4\n';
  const rejects = (name: string, c: string, d: string) =>
    it(name, () => {
      const r = applyUnifiedDiff(c, d);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    });
  rejects('overlapping hunks', content, '--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n l1\n-l2\n+x\n@@ -2,2 +2,2 @@\n-l2\n+y\n l3\n');
  rejects('out of order hunks', content, '--- a/f\n+++ b/f\n@@ -3,1 +3,1 @@\n-l3\n+x\n@@ -1,1 +1,1 @@\n-l1\n+y\n');
  rejects('count too big', content, '--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n l1\n-l2\n+x\n');
  rejects('count too small', content, '--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n l1\n-l2\n+x\n');
  rejects('context mismatch', content, '--- a/f\n+++ b/f\n@@ -1,2 +1,3 @@\n zz\n+x\n l2\n');
  rejects('removed line mismatch', content, '--- a/f\n+++ b/f\n@@ -1,1 +0,0 @@\n-nope\n');
  rejects('different names', content, '--- a/f\n+++ b/g\n@@ -0,0 +1 @@\n+x\n');
  rejects('text before first hunk', content, '--- a/f\n+++ b/f\nhello\n@@ -0,0 +1 @@\n+x\n');
  rejects('two files', content, `${zero('f')}${zero('g')}`);
  rejects('reaches past end', content, '--- a/f\n+++ b/f\n@@ -4,2 +4,2 @@\n l4\n-l5\n+x\n');
  rejects('no hunks', content, '--- a/f\n+++ b/f\n');
  rejects('empty diff', content, '');
  it('returns no partial result when a later hunk fails', () => {
    const r = applyUnifiedDiff(content, '--- a/f\n+++ b/f\n@@ -0,0 +1 @@\n+x\n@@ -3,1 +4,1 @@\n-bad\n+y\n');
    expect(r).toEqual({ ok: false, reason: expect.any(String) });
    expect('text' in r).toBe(false);
  });
});

describe('reverseUnifiedDiff', () => {
  for (const [name, content] of Object.entries(FIXTURES)) {
    it(`apply then reverse restores ${name}`, () => {
      const { diff } = buildInsertDiff({ path: 'a.ts', content, comment: INSERT });
      const after = ok(content, diff);
      const rev = reverseUnifiedDiff(diff);
      expect(rev).not.toBeNull();
      expect(ok(after, rev!)).toBe(content);
    });
    it(`zero-context apply then reverse restores ${name}`, () => {
      const after = ok(content, zero());
      expect(ok(after, reverseUnifiedDiff(zero())!)).toBe(content);
    });
  }
  it('reversing twice gives the original text', () => {
    for (const content of Object.values(FIXTURES)) {
      const { diff } = buildInsertDiff({ path: 'a.ts', content, comment: INSERT });
      expect(reverseUnifiedDiff(reverseUnifiedDiff(diff)!)).toBe(diff);
    }
    const multi = '--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n l1\n-l2\n+L2\n@@ -6,3 +6,3 @@\n l6\n-l7\n+L7\n l8\n';
    expect(reverseUnifiedDiff(reverseUnifiedDiff(multi)!)).toBe(multi);
  });
  it('reverses a multi-hunk change', () => {
    const c = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n';
    const d = '--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n l1\n-l2\n+L2\n@@ -6,3 +6,3 @@\n l6\n-l7\n+L7\n l8\n';
    expect(ok(ok(c, d), reverseUnifiedDiff(d)!)).toBe(c);
  });
  it('returns null for unreadable diffs', () => expect(reverseUnifiedDiff('nonsense')).toBeNull());
});

describe('hashText', () => {
  it('is 8 lowercase hex digits and stable', () => {
    for (const t of ['', 'a', 'hello\n', 'x'.repeat(1_000_000), '\u{1F600}']) {
      const h = hashText(t);
      expect(h).toMatch(/^[0-9a-f]{8}$/);
      expect(hashText(t)).toBe(h);
    }
  });
  it('matches the known FNV-1a values', () => {
    expect(hashText('')).toBe('811c9dc5');
    expect(hashText('a')).toBe('e40c292c');
  });
  it('differs for a one-character change', () => {
    expect(hashText('hello world')).not.toBe(hashText('hello worle'));
    expect(hashText('ab')).not.toBe(hashText('ba'));
  });
});

describe('robustness', () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  }
  it('fuzz: 500 random diffs and contents never throw', () => {
    const r = rng(42);
    const pieces = ['--- a/f', '+++ b/f', '@@ -0,0 +1 @@', '@@ -1,2 +1,2 @@', '@@ -x @@', ' ctx', '-del', '+add', '\\ No newline at end of file', '', 'junk', '\r', '@@ -99999999999,1 +1 @@'];
    const words = ['a', 'b', '\n', '\r\n', 'ctx', 'del', ''];
    for (let i = 0; i < 500; i++) {
      let d = '';
      const n = Math.floor(r() * 10);
      for (let j = 0; j < n; j++) d += pieces[Math.floor(r() * pieces.length)] + '\n';
      let c = '';
      const m = Math.floor(r() * 8);
      for (let j = 0; j < m; j++) c += words[Math.floor(r() * words.length)];
      const res = applyUnifiedDiff(c, d);
      expect(typeof res.ok).toBe('boolean');
      reverseUnifiedDiff(d);
    }
  });
  it('handles a 20 KB file in under 1 second', () => {
    const content = Array.from({ length: 1000 }, (_, i) => `line number ${i}`).join('\n') + '\n';
    expect(content.length).toBeGreaterThan(14_000);
    const big = content + 'x'.repeat(6000) + '\n';
    const { diff } = buildInsertDiff({ path: 'a.ts', content: big, comment: INSERT });
    const t = Date.now();
    const out = ok(big, diff);
    const back = ok(out, reverseUnifiedDiff(diff)!);
    hashText(big);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(back).toBe(big);
  });
  it('imports nothing from React, stores, or the network', () => {
    const src = readFileSync('src/engine/diffApply.ts', 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/);
  });
});
