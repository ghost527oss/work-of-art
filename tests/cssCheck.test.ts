// @node: F12.3
import { describe, expect, it } from 'vitest';
import { checkCssFile, checkCssText, splitCssRules } from '../src/engine/checks/cssCheck';
import { dropsRulesWith, keepsAll } from './helpers/fakeCssProbe';

describe('splitCssRules', () => {
  it('splits rules, at-rules, comments, and strings', () => {
    const css = '@charset "utf-8";\n@import url("x.css");\n/* a { */\nbody { color: red; content: "}"; }\n@media (min-width: 1px) {\n  a { b: c }\n}\n@font-face { src: url(x) }\n';
    const r = splitCssRules(css);
    expect(r.braceProblems).toEqual([]);
    expect(r.items.map((i) => [i.kind, i.startLine])).toEqual([['line-at', 1], ['line-at', 2], ['rule', 4], ['block-at', 5], ['block-at', 8]]);
  });
  it('finds a missing and an extra closing brace with the line', () => {
    expect(splitCssRules('a { b: c;\n\nd { e: f }\n').braceProblems).toEqual([{ line: 1, kind: 'unclosed_open' }]);
    expect(splitCssRules('a { b: c }\n}\n').braceProblems).toEqual([{ line: 2, kind: 'extra_close' }]);
  });
  it('odd input does not throw', () => {
    for (const t of ['{', '}', '"', '/*', '@', '{'.repeat(10000), 'a{'.repeat(2000)]) expect(() => splitCssRules(t)).not.toThrow();
  });
});

describe('CSS check', () => {
  it('a rule the probe drops gives one "Possible invalid CSS" at its first line, selector cut and redacted', () => {
    const r = checkCssText('a { color: red }\n\n.very-long-selector-name-that-goes-on-and-on-forever > .child { colr: red BAD }\n', dropsRulesWith('BAD'));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ skillId: 'scan.frontend.css-possible-invalid', line: 3 });
    expect(r.issues[0]!.extra).toContain('.very-long-selector-name-that-goes-on');
    expect(r.issues[0]!.extra).not.toContain('forever');
    const s = checkCssText('.AKIAABCDEFGHIJKLMNOP { x: BAD }', dropsRulesWith('BAD'));
    expect(s.issues[0]!.extra).not.toContain('AKIA');
  });
  it('@import and @charset lines are never probed', () => {
    expect(checkCssText('@import "x.css";\n@charset "utf-8";\n', dropsRulesWith('import', 'charset', 'x'))).toEqual({ issues: [], notChecked: [] });
  });
  it('with no probe the possible-invalid check is not checked; the brace check still runs', () => {
    expect(checkCssText('a { b: c }', null)).toEqual({ issues: [], notChecked: ['no_probe'] });
    const r = checkCssText('a { b: c', null);
    expect(r.issues.map((i) => i.skillId)).toEqual(['scan.frontend.css-braces']);
  });
  it('brace problems stop the probe (rules cannot be told apart)', () => {
    const r = checkCssText('a { b: BAD;\n c { d: e }\n', dropsRulesWith('BAD'));
    expect(r.issues.map((i) => i.skillId)).toEqual(['scan.frontend.css-braces']);
  });
  it('a throwing probe counts as kept', () => {
    expect(checkCssText('a { b: c }', () => { throw new Error('x'); }).issues).toEqual([]);
  });
  it('at most 500 rules probed and 20 findings per file', () => {
    let calls = 0;
    checkCssText('a{b:c}\n'.repeat(800), () => { calls++; return true; });
    expect(calls).toBe(500);
    expect(checkCssText('a{b:BAD}\n'.repeat(100), dropsRulesWith('BAD')).issues).toHaveLength(20);
  });
  it('.css files and <style> blocks inside HTML are both covered, with file line numbers', () => {
    expect(checkCssFile('s.css', 'a { b: BAD }', dropsRulesWith('BAD')).issues[0]).toMatchObject({ line: 1 });
    const html = '<html>\n<head>\n<style>\na { b: c }\nd { e: BAD }\n</style>\n</head></html>';
    expect(checkCssFile('p.html', html, dropsRulesWith('BAD')).issues[0]).toMatchObject({ line: 5 });
    expect(checkCssFile('p.html', '<style>a { b: c;</style>', keepsAll).issues[0]).toMatchObject({ skillId: 'scan.frontend.css-braces', line: 1 });
  });
  it('template blocks, minified css, other types, and big files are skipped', () => {
    expect(checkCssFile('p.html', '<style>a { b: {{ x }} }</style>', dropsRulesWith('x')).notChecked).toEqual(['template']);
    expect(checkCssFile('a.min.css', 'a{', null)).toEqual({ issues: [], notChecked: [] });
    expect(checkCssFile('a.js', 'a{', null)).toEqual({ issues: [], notChecked: [] });
    expect(checkCssFile('a.css', 'a{b:c}'.repeat(40000), keepsAll).notChecked).toEqual(['too_large']);
  });
});
