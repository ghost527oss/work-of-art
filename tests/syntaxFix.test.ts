// @node: F12.5
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAcorn } from '../src/engine/checks/acornLoader';
import { analyzeProject } from '../src/engine/analyzeProject';
import { applyUnifiedDiff, reverseUnifiedDiff } from '../src/engine/diffApply';
import { proposeSyntaxFix } from '../src/engine/checks/syntaxFix';
import { buildFixProposal } from '../src/engine/scanFix';
import { scanFile } from '../src/engine/scanProject';
import { snapshotOf } from './helpers/analyzeFixture';
import type { Finding } from '../src/engine/scanFindingTypes';

beforeAll(async () => { await loadAcorn(); });

async function setup(files: Record<string, string>) {
  const snapshot = snapshotOf(files);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const inputs = { analysis, corrections: {} };
  const recheck = (p: string, t: string) => scanFile(inputs, p, t);
  return { recheck, first: (p: string, skill: string) => recheck(p, files[p]!).find((f) => f.skillId === skill) };
}

async function fixOf(path: string, text: string, skill = 'scan.frontend.js-syntax') {
  const s = await setup({ [path]: text });
  const f = s.first(path, skill);
  if (!f) throw new Error('no finding');
  return { r: buildFixProposal(f, text, s.recheck), f };
}

describe('syntax fix: realistic cases', () => {
  it('adds the missing ) in an if', async () => {
    const text = 'const a = 1;\nif (a > 0 {\n  go();\n}\n';
    const { r } = await fixOf('a.js', text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = applyUnifiedDiff(text, r.diff);
    expect(after.ok && after.text).toBe('const a = 1;\nif (a > 0) {\n  go();\n}\n');
    expect(r.title).toBe('Add ) near line 2 of a.js');
  });
  it('adds a missing comma between object entries and a missing ] before ;', async () => {
    const c = await fixOf('a.js', 'const o = {\n  a: 1\n  b: 2,\n};\n');
    expect(c.r.ok).toBe(true);
    if (c.r.ok) expect(applyUnifiedDiff('const o = {\n  a: 1\n  b: 2,\n};\n', c.r.diff)).toMatchObject({ ok: true, text: 'const o = {\n  a: 1,\n  b: 2,\n};\n' });
    const b = await fixOf('a.js', 'const a = [1, 2;\nuse(a);\n');
    expect(b.r.ok).toBe(true);
    if (b.r.ok) expect(applyUnifiedDiff('const a = [1, 2;\nuse(a);\n', b.r.diff)).toMatchObject({ ok: true, text: 'const a = [1, 2];\nuse(a);\n' });
  });
  it('an unterminated string with one clear place gets its quote', async () => {
    const text = 'const a = "hello\nuse(a);\n';
    const { r } = await fixOf('a.js', text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(applyUnifiedDiff(text, r.diff)).toMatchObject({ text: 'const a = "hello"\nuse(a);\n' });
  });
  it('a nested HTML span closed late gets its closing tag', async () => {
    const text = '<div>\n<span>\ntext\n</div>\n';
    const { r } = await fixOf('p.html', text, 'scan.frontend.html-structure');
    expect(r.ok).toBe(true);
    if (r.ok) expect(applyUnifiedDiff(text, r.diff)).toMatchObject({ ok: true, text: '<div>\n<span>\ntext\n</span></div>\n' });
  });
  it('a fix inside an inline script maps back to the right place', async () => {
    const text = '<p>a</p>\n<script>\nif (x > 1 {\n  go();\n}\n</script>\n';
    const { r } = await fixOf('p.html', text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(applyUnifiedDiff(text, r.diff)).toMatchObject({ text: '<p>a</p>\n<script>\nif (x > 1) {\n  go();\n}\n</script>\n' });
  });
});

describe('syntax fix: refusals', () => {
  it('a missing } at the end of the file gets no fix', async () => {
    const { r } = await fixOf('a.js', 'function f() {\n  go();\n');
    expect(r).toMatchObject({ ok: false });
  });
  it('an unclosed string with two possible places gets no fix', async () => {
    const { r } = await fixOf('a.js', 'const a = "hello;\nuse(a);\n');
    expect(r.ok).toBe(false);
  });
  it('a mistake with no passing candidate gets no fix', async () => {
    expect((await fixOf('a.js', 'const a = ;\n')).r.ok).toBe(false);
    expect((await fixOf('a.js', 'var 1a = 3;\n')).r.ok).toBe(false);
  });
  it('a long closing tag (over 8 characters) gets no fix', async () => {
    const { r } = await fixOf('p.html', '<div>\n<section>\ntext\n</div>\n', 'scan.frontend.html-structure');
    expect(r.ok).toBe(false);
  });
  it('a line with a likely secret gets no fix', async () => {
    const { r } = await fixOf('a.js', 'const k = "AKIAABCDEFGHIJKLMNOP"; if (x > 1 {\n  go();\n}\n');
    expect(r).toMatchObject({ ok: false });
  });
  it('an unclosed or stray HTML tag stays guided', async () => {
    const s = await setup({ 'p.html': '<div>\n<p>x</p>\n' });
    const f = s.first('p.html', 'scan.frontend.html-structure')!;
    expect(buildFixProposal(f, '<div>\n<p>x</p>\n', s.recheck).ok).toBe(false);
  });
  it('proposeSyntaxFix never throws on odd text', () => {
    for (const t of ['', '(', '\u0000', '"'.repeat(5000)]) expect(() => proposeSyntaxFix({ skillId: 'scan.frontend.js-syntax', path: 'a.js', firstLine: 1 }, t)).not.toThrow();
  });
});

describe('syntax fix: more than one mistake in a file', () => {
  it('JavaScript with two mistakes gets no automatic fix (no repair makes the whole file read cleanly)', async () => {
    const { r } = await fixOf('a.js', 'if (a > 1 {\n  go();\n}\nvar = ;\n');
    expect(r.ok).toBe(false);
  });
  it('HTML: fixing one late-closed tag is accepted even though another one remains (not damage)', async () => {
    const text = '<div>\n<b>\na\n</div>\n<div>\n<i>\nb\n</div>\n';
    const { r, f } = await fixOf('p.html', text, 'scan.frontend.html-structure');
    expect(f.firstLine).toBe(2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(applyUnifiedDiff(text, r.diff)).toMatchObject({ text: '<div>\n<b>\na\n</b></div>\n<div>\n<i>\nb\n</div>\n' });
  });
});

describe('syntax fix: the recheck rule itself (stubbed recheck)', () => {
  const text = 'const a = 1;\nif (a > 0 {\n  go();\n}\n';
  const finding = (over: Partial<Finding> = {}): Finding => ({ id: 'f', skillId: 'scan.frontend.js-syntax', primary: 'frontend', areas: ['frontend'], severity: 'high', certainty: 'found', fix: 'auto', path: 'a.js', firstLine: 2, lastLine: 2, snippet: [], ...over });
  const found = (skillId: string, firstLine: number): Finding => finding({ skillId, firstLine, lastLine: firstLine });
  it('a later finding of the same skill after the fix is progress, not damage', () => {
    const recheck = (_p: string, t: string) => (t === text ? [found('scan.frontend.js-syntax', 2)] : [found('scan.frontend.js-syntax', 4)]);
    expect(buildFixProposal(finding(), text, recheck).ok).toBe(true);
  });
  it('a new finding of another skill after the fix refuses it', () => {
    const recheck = (_p: string, t: string) => (t === text ? [found('scan.frontend.js-syntax', 2)] : [found('scan.frontend.balance', 4)]);
    expect(buildFixProposal(finding(), text, recheck)).toEqual({ ok: false, reason: 'The change would cause a new finding.' });
  });
  it('the same mistake still reported at the same line refuses it', () => {
    const recheck = () => [found('scan.frontend.js-syntax', 2)];
    expect(buildFixProposal(finding(), text, recheck)).toEqual({ ok: false, reason: 'The check would still report this spot.' });
  });
});

// A small seeded random generator so the property test is the same on every run.
function rng(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
const SNIPPETS = [
  'function add(a, b) {\n  return a + b;\n}\nconst r = add(1, 2);\n',
  'const items = [1, 2, 3].map((n) => n * 2);\nconsole.log(items);\n',
  'const o = { a: 1, b: [1, 2], c: { d: 3 } };\nif (o.a > 0) {\n  go(o);\n}\n',
  'document.getElementById("x").addEventListener("click", () => {\n  run(1, 2);\n});\n',
  'for (let i = 0; i < 3; i++) {\n  total += i;\n}\n',
];

describe('syntax fix: seeded random mistakes (property)', () => {
  it('an accepted fix always passes its own recheck, changes at most 8 characters, and reverses exactly', async () => {
    const rand = rng(12345);
    let accepted = 0;
    let cases = 0;
    for (let n = 0; n < 220; n++) {
      const base = SNIPPETS[Math.floor(rand() * SNIPPETS.length)]!;
      const positions = [...base].map((c, i) => (')]},;:'.includes(c) ? i : -1)).filter((i) => i >= 0);
      const cut = positions[Math.floor(rand() * positions.length)]!;
      const text = base.slice(0, cut) + base.slice(cut + 1);
      const s = await setup({ 'a.js': text });
      const f = s.first('a.js', 'scan.frontend.js-syntax');
      if (!f) continue; // the deletion left valid code
      cases++;
      const r = buildFixProposal(f, text, s.recheck);
      if (!r.ok) continue;
      accepted++;
      const after = applyUnifiedDiff(text, r.diff);
      expect(after.ok).toBe(true);
      if (!after.ok) continue;
      expect(Math.abs(after.text.length - text.length)).toBeLessThanOrEqual(8);
      const again = s.recheck('a.js', after.text).find((x) => x.skillId === f.skillId && x.firstLine === f.firstLine);
      expect(again).toBeUndefined();
      const back = reverseUnifiedDiff(r.diff);
      expect(back).not.toBeNull();
      expect(applyUnifiedDiff(after.text, back!)).toMatchObject({ ok: true, text });
    }
    expect(cases).toBeGreaterThanOrEqual(150);
    expect(accepted).toBeGreaterThan(10);
  });
});
