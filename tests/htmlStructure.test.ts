// @node: F12.3
import { describe, expect, it } from 'vitest';
import { checkHtml } from '../src/engine/checks/htmlStructure';

const run = (html: string, path = 'p.html') => checkHtml(path, html);
const lines = (html: string) => run(html).issues.map((i) => [i.skillId.replace('scan.frontend.', ''), i.line]);

describe('HTML structure check', () => {
  it('a clean page, optional closers, and void tags give no finding', () => {
    const ok = '<!doctype html>\n<html><head><title>t</title><meta charset="utf-8"><link rel="stylesheet" href="a.css"></head>\n<body>\n<ul><li>a<li>b</ul>\n<p>one<p>two\n<table><tr><td>1<td>2</table>\n<img src="a.png"><br><input type="text">\n<select><option>a<option>b</select>\n</body></html>\n';
    expect(run(ok).issues).toEqual([]);
  });
  it('an unclosed div is reported at its start line', () => {
    expect(lines('<body>\n<div>\n<p>x</p>\n</body>')).toEqual([['html-structure', 2]]);
    expect(run('<div>\n<p>x</p>\n').issues[0]!.extra).toBe('The <div> on line 1 is never closed.');
  });
  it('a stray closing tag is reported at the closing tag', () => {
    expect(lines('<p>a</p>\n</span>\n')).toEqual([['html-structure', 2]]);
    expect(run('</div>').issues[0]!.extra).toContain('has no opening <div>');
  });
  it('a tag closed late is reported at its start line (nested cases)', () => {
    expect(lines('<div>\n<span>\ntext\n</div>\n')).toEqual([['html-structure', 2]]);
    expect(run('<div><span>a</div>').issues[0]!.extra).toBe('The <span> on line 1 is closed late, by the </div> that closes an outer tag.');
    expect(lines('<div>\n<section>\n<b>x\n</div>\n')).toEqual([['html-structure', 2], ['html-structure', 3]].reverse());
  });
  it('raw-text elements are not parsed as tags', () => {
    expect(run('<script>var a = "<div>"; if (a < 2) {}</script><style>a > b {}</style><textarea><b></textarea><title>a<b</title>').issues).toEqual([]);
  });
  it('a repeated id is reported at the second use, exactly and case-sensitively', () => {
    const r = run('<div id="a"></div>\n<p id="b"></p>\n<div id="a"></div>\n<div id="A"></div>');
    expect(r.issues.map((i) => [i.skillId, i.line])).toEqual([['scan.frontend.html-id-duplicate', 3]]);
    expect(r.issues[0]!.extra).toBe('The id "a" is used again (first on line 1).');
  });
  it('an id that looks like a secret is not copied', () => {
    const r = run('<i id="AKIAABCDEFGHIJKLMNOP"></i><i id="AKIAABCDEFGHIJKLMNOP"></i>');
    expect(r.issues[0]!.extra).toContain('an id');
    expect(r.issues[0]!.extra).not.toContain('AKIA');
  });
  it('an img without src and a stylesheet link without href are reported', () => {
    expect(lines('<img alt="x">\n<link rel="stylesheet">\n<link rel="icon">')).toEqual([['html-attr-missing', 1], ['html-attr-missing', 2]]);
  });
  it('template files are skipped, other types ignored, big files not read', () => {
    expect(run('<div>{{ x }}').notChecked).toEqual(['template']);
    expect(run('<div>{% if %}').issues).toEqual([]);
    expect(run('<div>', 'a.jsx')).toEqual({ issues: [], notChecked: [] });
    expect(run('<p>' + 'a'.repeat(300 * 1024 + 1)).notChecked).toEqual(['too_large']);
  });
  it('at most 10 findings per file', () => {
    expect(run('<div>'.repeat(40)).issues).toHaveLength(10);
  });
  it('odd input does not throw', () => {
    for (const t of ['<', '</', '<div', '<<<<', '\u0000<p>', '<div>'.repeat(5000)]) expect(() => run(t)).not.toThrow();
  });
});
