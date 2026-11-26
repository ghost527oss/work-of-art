// @node: F9.6
import { describe, expect, it } from 'vitest';
import { applyUnifiedDiff, reverseUnifiedDiff } from '../src/engine/diffApply';
import { buildUnifiedDiff } from '../src/export/unifiedDiff';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { applyHunks } from './helpers/applyHunks';

/** Independent header counter: every @@ header must match the lines that follow it. */
function checkHeaders(diff: string) {
  const lines = diff.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(lines[i]!);
    if (!m) continue;
    const want = { old: m[2] === undefined ? 1 : Number(m[2]), neu: m[4] === undefined ? 1 : Number(m[4]) };
    let old = 0, neu = 0;
    for (let j = i + 1; j < lines.length && !lines[j]!.startsWith('@@') && lines[j] !== ''; j++) {
      const c = lines[j]![0];
      if (c === ' ') { old++; neu++; } else if (c === '-') old++; else if (c === '+') neu++;
    }
    expect({ old, neu }).toEqual(want);
  }
}

function roundTrip(oldText: string, newText: string) {
  const d = buildUnifiedDiff('f.txt', oldText, newText);
  expect(d).not.toBeNull();
  checkHeaders(d!);
  const a = applyUnifiedDiff(oldText, d!);
  expect(a).toEqual({ ok: true, text: newText });
  expect(applyHunks(oldText, d!)).toBe(newText);
  const rev = reverseUnifiedDiff(d!);
  expect(rev).not.toBeNull();
  expect(applyUnifiedDiff(newText, rev!)).toEqual({ ok: true, text: oldText });
  return d!;
}

const lines = (n: number, f = (i: number) => `line ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

describe('buildUnifiedDiff', () => {
  it('returns null for equal texts', () => {
    expect(buildUnifiedDiff('f', 'a\n', 'a\n')).toBeNull();
  });

  it('one change', () => {
    const d = roundTrip(lines(10), lines(10).replace('line 5\n', 'five\n'));
    expect(d.match(/^@@/gm)).toHaveLength(1);
    expect(d).toContain('@@ -2,7 +2,7 @@');
  });

  it('two changes far apart give two hunks', () => {
    const neu = lines(40).replace('line 3\n', 'three\n').replace('line 35\n', 'thirty-five\n');
    expect(roundTrip(lines(40), neu).match(/^@@/gm)).toHaveLength(2);
  });

  it('changes 6 lines apart merge into one hunk; 7 apart do not', () => {
    const near = lines(30).replace('line 10\n', 'x\n').replace('line 17\n', 'y\n');
    expect(roundTrip(lines(30), near).match(/^@@/gm)).toHaveLength(1);
    const far = lines(30).replace('line 10\n', 'x\n').replace('line 18\n', 'y\n');
    expect(roundTrip(lines(30), far).match(/^@@/gm)).toHaveLength(2);
  });

  it('first line and last line', () => {
    expect(roundTrip(lines(8), lines(8).replace('line 1\n', 'one\n'))).toContain('@@ -1,4 +1,4 @@');
    expect(roundTrip(lines(8), lines(8).replace('line 8\n', 'eight\n'))).toContain('@@ -5,4 +5,4 @@');
  });

  it('no final newline: the marker is written on the right side', () => {
    const d = roundTrip('a\nb\n', 'a\nb\nc');
    expect(d).toContain('+c\n\\ No newline at end of file\n');
    const d2 = roundTrip('a\nb', 'a\nb\n');
    expect(d2).toContain('-b\n\\ No newline at end of file\n+b\n');
    roundTrip('a\nb', 'a\nc');
  });

  it('CRLF files keep their line endings', () => {
    const old = 'a\r\nb\r\nc\r\n';
    const d = roundTrip(old, 'a\r\nX\r\nc\r\n');
    expect(d).toContain('-b\r\n+X\r\n');
  });

  it('empty old file and empty new file', () => {
    expect(roundTrip('', 'a\nb\n')).toContain('@@ -0,0 +1,2 @@');
    expect(roundTrip('a\nb\n', '')).toContain('@@ -1,2 +0,0 @@');
  });

  it('2,000 changed lines and the work-limit fallback still apply', () => {
    const old = lines(5000);
    roundTrip(old, lines(5000, (i) => (i % 2 === 0 && i < 4000 ? `c${i}` : `line ${i}`)));
    const d = buildUnifiedDiff('f.txt', lines(50), lines(50, (i) => (i % 7 === 0 ? `z${i}` : `line ${i}`)), 3, 5)!;
    expect(applyUnifiedDiff(lines(50), d)).toEqual({ ok: true, text: lines(50, (i) => (i % 7 === 0 ? `z${i}` : `line ${i}`)) });
    expect(d.match(/^@@/gm)).toHaveLength(1);
  });

  it('design 10.4 worked example: the button style edit', () => {
    const snap = buildSampleSnapshot('static-site', 1);
    const old = snap.files.find((f) => f.path === 'index.html')!.content!;
    const neu = old.replace('<button id="order" class="btn">', '<button id="order" class="btn" style="width: 200px">');
    const d = buildUnifiedDiff('index.html', old, neu)!;
    expect(`diff --git a/index.html b/index.html\n${d}`).toBe(`diff --git a/index.html b/index.html
--- a/index.html
+++ b/index.html
@@ -10,7 +10,7 @@
     <main>
       <img src="img/logo.png" />
       <p>Fresh bread every morning.</p>
-      <button id="order" class="btn">Order now</button>
+      <button id="order" class="btn" style="width: 200px">Order now</button>
       <p id="message"></p>
     </main>
     <script src="js/app.js"></script>
`);
    const two = neu.replace('<!doctype html>', '<!DOCTYPE html>');
    roundTrip(old, two);
    expect(buildUnifiedDiff('index.html', old, two)!.match(/^@@/gm)).toHaveLength(2);
  });
});
