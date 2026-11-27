// @node: F12.12
import { describe, expect, it } from 'vitest';
import { parseInlineStyle } from '../src/edit/inlineStyle';
import { isSafeDeclaration, PROP_ORDER } from '../src/edit/styleModel';
import { hashText } from '../src/engine/diffApply';
import type { Finding } from '../src/engine/scanFindingTypes';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { findingKind, problemKey, recipeDeclarations, recipeFor } from '../src/preview/recipes';

const finding = (kind: string, over: Partial<Finding> = {}, info?: Record<string, string>, limit = 44): Finding => ({
  id: `f-${kind}`, skillId: 'scan.frontend.tap-target', primary: 'frontend', areas: ['frontend'], severity: 'medium', certainty: 'found', fix: 'guided', path: 'index.html', firstLine: 1, lastLine: 1,
  snippet: [], extra: 'x', measure: { kind, value: 10, limit, ...(info ? { info } : {}) }, ...over,
});
const elementsOf = (html: string) => {
  const r = buildStaticPreview({ entryPath: 'index.html', effective: () => html, loaded: new Set(['index.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' });
  if (!r.ok) throw new Error(r.reason);
  return r.elements;
};
const decls = (f: Finding) => { const d = recipeDeclarations(f); if (!Array.isArray(d)) throw new Error(d.reason); return d.map((x) => `${x.prop}: ${x.value}`); };

describe('recipe declarations', () => {
  it('tap target: 44 px both ways, plus inline-block for an inline link', () => {
    expect(decls(finding('tap-target', {}, { display: 'block' }))).toEqual(['min-height: 44px', 'min-width: 44px']);
    expect(decls(finding('tap-target', {}, { display: 'inline' }))).toEqual(['min-height: 44px', 'min-width: 44px', 'display: inline-block']);
  });
  it('small text, picture size, and the three overflow recipes', () => {
    expect(decls(finding('text-small'))).toEqual(['font-size: 14px']);
    expect(decls(finding('media-wide'))).toEqual(['max-width: 100%', 'height: auto']);
    expect(decls(finding('nolimit'))).toEqual(['max-width: 100%', 'height: auto']);
    const o = (extra: string) => ({ skillId: 'scan.frontend.layout-overflow', measure: undefined, extra });
    expect(decls(finding('x', o('Text is wider than its box: content 500 px in a box 300 px wide')))).toEqual(['overflow-wrap: anywhere']);
    expect(decls(finding('x', o('Text is cut off at the bottom: 1')))).toEqual(['height: auto']);
    expect(decls(finding('x', o('The page is wider than the screen: 1')))).toEqual(['max-width: 100%']);
  });
  it('contrast: the first text colour that reaches the minimum on that background', () => {
    const d = decls(finding('contrast', { skillId: 'scan.frontend.contrast' }, { fg: '#aaaaaa', bg: '#ffffff' }, 4.5));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatch(/^color: #[0-9a-f]{6}$/);
    const hex = d[0]!.slice(-6);
    const v = parseInt(hex.slice(0, 2), 16);
    expect(v).toBeLessThan(0xaa);
  });
  it('contrast without usable colours has no recipe, and overlap has none by design', () => {
    expect(recipeDeclarations(finding('contrast', {}, { fg: 'nope', bg: '#ffffff' }))).toEqual({ reason: 'No safe text colour was found for this background.' });
    expect(recipeDeclarations(finding('contrast', {}, undefined))).toMatchObject({ reason: expect.any(String) });
    expect(recipeDeclarations(finding('overlap'))).toEqual({ reason: 'Boxes that overlap need a design choice, so no automatic recipe is offered.' });
    expect(recipeDeclarations(finding('weird'))).toEqual({ reason: 'No recipe is available for this finding.' });
  });
  it('every declaration is safe and the new properties are known to the style model', () => {
    for (const f of [finding('tap-target', {}, { display: 'inline' }), finding('text-small'), finding('media-wide'), finding('contrast', {}, { fg: '#cccccc', bg: '#ffffff' }, 4.5)]) for (const d of recipeDeclarations(f) as Array<{ prop: string; value: string }>) expect(isSafeDeclaration(d), `${d.prop}:${d.value}`).toBe(true);
    for (const p of ['min-height', 'min-width', 'display']) expect(PROP_ORDER).toContain(p);
    expect(isSafeDeclaration({ prop: 'display', value: 'inline-block' })).toBe(true);
    for (const v of ['none', 'block', 'flex', 'inline', 'inline-block; x']) expect(isSafeDeclaration({ prop: 'display', value: v }), v).toBe(false);
  });
});

describe('recipeFor', () => {
  const HTML = '<p>a</p>\n<button class="b">Go</button>\n<p>c</p>\n';
  const f = finding('tap-target', { firstLine: 2, lastLine: 2 }, { display: 'block' });
  it('builds a practice-copy change for an exactly mapped element', () => {
    const r = recipeFor(f, elementsOf(HTML), HTML, hashText(HTML), 'k1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edit.path).toBe('index.html');
    expect(r.edit.baseHash).toBe(hashText(HTML));
    expect(r.edit.newContent).toBe('<p>a</p>\n<button class="b" style="min-width: 44px; min-height: 44px">Go</button>\n<p>c</p>\n');
    expect(r.edit.editKey).toBe('recipe:k1');
    expect(r.edit.title).toBe('Recipe: make this tap target 44 px (button, line 2)');
  });
  it('merges into a simple existing style attribute', () => {
    const html = '<button style="color: red">Go</button>\n';
    const r = recipeFor(finding('text-small'), elementsOf(html), html, hashText(html), 'k');
    expect(r.ok && parseInlineStyle(r.edit.newContent.match(/style="([^"]*)"/)![1]!)).toEqual([{ prop: 'color', value: 'red' }, { prop: 'font-size', value: '14px' }]);
  });
  it('refuses with the plain reason when the page changed, the style is complex, or the element is not found', () => {
    expect(recipeFor(f, elementsOf(HTML), HTML, 'different', 'k')).toEqual({ ok: false, reason: 'The page changed after the preview was built; reload the preview.' });
    const complex = '<button style="background: url(x.png)">Go</button>\n';
    expect(recipeFor(finding('text-small'), elementsOf(complex), complex, hashText(complex), 'k')).toEqual({ ok: false, reason: "This element's style is too complex to rewrite safely." });
    expect(recipeFor(finding('text-small', { firstLine: 9, lastLine: 9 }), elementsOf(HTML), HTML, hashText(HTML), 'k')).toMatchObject({ ok: false });
    expect(recipeFor(f, elementsOf(HTML), undefined, hashText(HTML), 'k')).toMatchObject({ ok: false });
  });
  it('refuses a page that is not plain HTML and an element marked not mappable', () => {
    const els = elementsOf(HTML).map((e) => ({ ...e, mappable: false, reason: 'This element is inside an SVG.' }));
    expect(recipeFor(f, els, HTML, hashText(HTML), 'k')).toEqual({ ok: false, reason: 'This element is inside an SVG.' });
    const jsx = elementsOf(HTML).map((e) => ({ ...e, path: 'App.jsx' }));
    expect(recipeFor({ ...f, path: 'App.jsx' }, jsx, HTML, hashText(HTML), 'k')).toEqual({ ok: false, reason: 'Only plain HTML pages can be written to the practice copy.' });
  });
  it('refuses when the element already has these styles, and for overlap', () => {
    const html = '<button style="font-size: 14px">Go</button>\n';
    expect(recipeFor(finding('text-small'), elementsOf(html), html, hashText(html), 'k')).toEqual({ ok: false, reason: 'This element already has these styles.' });
    expect(recipeFor(finding('overlap'), elementsOf(HTML), HTML, hashText(HTML), 'k')).toMatchObject({ ok: false, reason: expect.stringContaining('design choice') });
  });
});

describe('keys', () => {
  it('a problem key is the check, the place, and the kind (stable when a style is added on the same line)', () => {
    const a = finding('tap-target', { firstLine: 3 });
    expect(problemKey(a)).toBe('scan.frontend.tap-target|index.html|3|tap-target');
    expect(findingKind({ skillId: 'x', extra: 'Text is cut off at the bottom: 2' })).toBe('overflow-text-cut');
    expect(findingKind({ skillId: 'x', extra: 'hello' })).toBe('unknown');
  });
});
