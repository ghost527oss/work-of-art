// @node: F12.10
import { describe, expect, it } from 'vitest';
import { constrainedBySheets, cssRulesOf, unsizedPictures } from '../src/preview/mediaSize';
import type { ElementEntry } from '../src/preview/previewDocument';

const entry = (html: string, tag = 'img', id = 1): { e: ElementEntry; effective: (p: string) => string } => {
  const start = html.indexOf(`<${tag}`);
  const end = html.indexOf('>', start) + 1;
  return { e: { id, path: 'index.html', tag, line: 1, col: 1, startOffset: start, endOffset: end, endLine: 1 }, effective: () => html };
};
const check = (html: string, css: string[] = [], tag = 'img') => { const { e, effective } = entry(html, tag); return unsizedPictures([e], new Set([1]), effective, cssRulesOf(css)).length; };

describe('picture with no size limit (read from the page text)', () => {
  it('is reported when nothing limits it', () => {
    expect(check('<img src="a.png">')).toBe(1);
    expect(check('<img src="a.png" width="100">')).toBe(1);
    expect(check('<img src="a.png" height="100">')).toBe(1);
  });
  it('is fine with a width and a height written down, or a width style', () => {
    expect(check('<img src="a.png" width="100" height="50">')).toBe(0);
    expect(check('<img src="a.png" style="max-width: 100%">')).toBe(0);
    expect(check('<img src="a.png" style="width:50px">')).toBe(0);
  });
  it('is fine when a style rule for the tag, the class, or the id sets a width', () => {
    expect(check('<img src="a.png">', ['img { max-width: 100%; }'])).toBe(0);
    expect(check('<img src="a.png" class="hero big">', ['.big { width: 300px }'])).toBe(0);
    expect(check('<img src="a.png" id="logo">', ['#logo{max-width:90%}'])).toBe(0);
    expect(check('<img src="a.png">', ['.card img { max-width: 100% }'])).toBe(0);
    expect(check('<img src="a.png">', ['@media (max-width: 600px) { img { width: 100% } }'])).toBe(0);
  });
  it('a rule that does not match, or that sets other things, does not limit it', () => {
    expect(check('<img src="a.png" class="hero">', ['.other { width: 300px }', 'img { border: 0 }', 'imgx { width: 1px }', '.hero2 { width: 1px }'])).toBe(1);
  });
  it('only pictures that were not measured are looked at, and only the picture tags', () => {
    const { e, effective } = entry('<img src="a.png">');
    expect(unsizedPictures([e], new Set<number>(), effective, [])).toEqual([]);
    const d = entry('<div class="x">', 'div');
    expect(unsizedPictures([d.e], new Set([1]), d.effective, [])).toEqual([]);
  });
  it('constrainedBySheets matches whole tag names only', () => {
    expect(constrainedBySheets('img', [], undefined, ['imgx { width: 1px }'])).toBe(false);
    expect(constrainedBySheets('img', [], undefined, ['div > img { width: 1px }'])).toBe(true);
  });
  it('a missing file or an odd start tag does not throw', () => {
    expect(() => unsizedPictures([{ id: 1, path: 'x', tag: 'img', line: 1, col: 1, startOffset: 5, endOffset: 2, endLine: 1 }], new Set([1]), () => '<img>', [])).not.toThrow();
    expect(unsizedPictures([{ id: 1, path: 'x', tag: 'img', line: 1, col: 1, startOffset: 0, endOffset: 5, endLine: 1 }], new Set([1]), () => undefined, [])).toEqual([]);
  });
});
