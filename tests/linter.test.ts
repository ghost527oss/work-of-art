// @node: F12.10
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateLint } from '../src/preview/linter';
import { box, resetIds } from './helpers/lintFixtures';

beforeEach(resetIds);
const tags = (m: Record<number, string>) => (id: number) => m[id];
const run = (ms: ReturnType<typeof box>[], width = 375, entry: Record<number, string> = {}) => evaluateLint(ms, width, tags(entry));
const kinds = (o: ReturnType<typeof run>) => o.results.map((r) => `${r.kind}@${r.id}`);

describe('tap target', () => {
  it('reports a small button at phone and tablet widths, with the smaller side as the value', () => {
    const o = run([box({ tag: 'button', width: 32, height: 40 })]);
    expect(o.results).toMatchObject([{ kind: 'tap-target', value: 32, limit: 44, confidence: 'high', aux: [32, 40] }]);
    expect(run([box({ tag: 'button', width: 32, height: 40 })], 768).results).toHaveLength(1);
    expect(run([box({ tag: 'button', width: 32, height: 40 })], 1024).results).toEqual([]);
  });
  it('44 px is enough; a link, input, select, textarea, and summary count', () => {
    expect(run([box({ tag: 'a', width: 44, height: 44 })]).results).toEqual([]);
    for (const tag of ['a', 'input', 'select', 'textarea', 'summary']) { resetIds(); expect(kinds(run([box({ tag, width: 20, height: 20 })])), tag).toEqual(['tap-target@1']); }
  });
  it('skipped: hidden, disabled, a link without href, a hidden input, an inline link in text, zero-size', () => {
    const ms = [
      box({ tag: 'button', width: 10, height: 10, display: 'none' }), box({ tag: 'button', width: 10, height: 10, visibility: 'hidden' }),
      box({ tag: 'button', width: 10, height: 10, opacity: 0 }), box({ tag: 'button', width: 10, height: 10, disabled: true }),
      box({ tag: 'a', width: 10, height: 10, hasHref: false }), box({ tag: 'input', width: 10, height: 10, inputType: 'hidden' }),
      box({ tag: 'a', width: 40, height: 14, inlineInText: true }), box({ tag: 'button', width: 0, height: 0 }),
    ];
    expect(run(ms).results).toEqual([]);
  });
  it('a role="button" element is reported with medium confidence', () => {
    expect(run([box({ tag: 'div', roleButton: true, width: 20, height: 20 })]).results[0]).toMatchObject({ kind: 'tap-target', confidence: 'medium' });
  });
});

describe('small text', () => {
  it('reports text under 12 px at phone and tablet widths only', () => {
    expect(run([box({ hasText: true, fontSize: 11 })]).results).toMatchObject([{ kind: 'text-small', value: 11, limit: 12, confidence: 'high' }]);
    expect(run([box({ hasText: true, fontSize: 12 })]).results).toEqual([]);
    expect(run([box({ hasText: true, fontSize: 11 })], 1024).results).toEqual([]);
    expect(run([box({ hasText: false, fontSize: 8 })]).results).toEqual([]);
  });
  it('small, sub, and sup get medium confidence', () => {
    for (const tag of ['small', 'sub', 'sup']) { resetIds(); expect(run([box({ tag, hasText: true, fontSize: 10 })]).results[0]!.confidence, tag).toBe('medium'); }
  });
  it('hidden text is skipped', () => {
    expect(run([box({ hasText: true, fontSize: 8, display: 'none' })]).results).toEqual([]);
  });
});

describe('contrast', () => {
  it('reports low contrast on a solid background and passes good contrast', () => {
    const o = run([box({ hasText: true, color: 'rgb(170, 170, 170)' }), box({ hasText: true, color: 'rgb(0, 0, 0)' })]);
    expect(o.results).toMatchObject([{ id: 1, kind: 'contrast', limit: 4.5, confidence: 'high' }]);
    expect(o.results[0]!.value).toBeCloseTo(2.3, 1);
  });
  it('contrast is checked at every width', () => {
    expect(run([box({ hasText: true, color: 'rgb(170, 170, 170)' })], 1024).results).toHaveLength(1);
  });
  it('large text needs only 3 to 1', () => {
    const grey = 'rgb(140, 140, 140)'; // about 3.4 to 1 on white
    expect(run([box({ hasText: true, color: grey, fontSize: 16 })]).results).toHaveLength(1);
    expect(run([box({ hasText: true, color: grey, fontSize: 24 })]).results).toEqual([]);
    expect(run([box({ hasText: true, color: grey, fontSize: 19, bold: true })]).results).toEqual([]);
  });
  it('a see-through text colour is blended first and gets medium confidence', () => {
    const o = run([box({ hasText: true, color: 'rgba(0, 0, 0, 0.3)' })]);
    expect(o.results[0]).toMatchObject({ kind: 'contrast', confidence: 'medium' });
    expect(run([box({ hasText: true, color: 'rgba(0, 0, 0, 0)' })]).results).toEqual([]); // invisible text is not judged
  });
  it('a gradient or picture behind, a see-through layer, and an unparsed colour are "can\'t measure" and never reported', () => {
    const ms = [
      box({ hasText: true, color: 'rgb(200, 200, 200)', bg: { unknown: 'picture' } }),
      box({ hasText: true, color: 'rgb(200, 200, 200)', bg: { unknown: 'see_through' } }),
      box({ hasText: true, color: 'color(srgb 1 1 1)', bg: { color: 'rgb(255, 255, 255)' } }),
      box({ hasText: true, color: 'rgb(200, 200, 200)', bg: { color: 'oklch(1 0 0)' } }),
      box({ hasText: true, color: 'rgb(200, 200, 200)', bg: { color: 'rgba(255, 255, 255, 0.5)' } }),
    ];
    const o = run(ms);
    expect(o.results).toEqual([]);
    expect(o.cantMeasure).toEqual({ picture: [1], see_through: [2], unparsed: [3, 4, 5] });
  });
  it('disabled controls and hidden text are skipped', () => {
    expect(run([box({ hasText: true, color: 'rgb(200, 200, 200)', disabled: true }), box({ hasText: true, color: 'rgb(200, 200, 200)', display: 'none' })]).results).toEqual([]);
  });
});

describe('picture wider than its box (a real, loaded picture)', () => {
  const img = (over: Partial<NonNullable<ReturnType<typeof box>['img']>> = {}, m: Partial<ReturnType<typeof box>> = {}) =>
    box({ tag: 'img', width: 800, img: { naturalWidth: 800, naturalHeight: 600, complete: true, local: true, parentClientWidth: 375, ...over }, ...m });
  it('reports a picture wider than its container: high for a local picture, medium for an outside one', () => {
    expect(run([img()], 375, { 1: 'img' }).results).toMatchObject([{ kind: 'media-wide', value: 800, limit: 375, confidence: 'high' }]);
    resetIds();
    expect(run([img({ local: false })], 375, { 1: 'img' }).results[0]!.confidence).toBe('medium');
  });
  it('fits, or one pixel over, is fine', () => {
    expect(run([img({ parentClientWidth: 800 })], 375, { 1: 'img' }).results).toEqual([]);
    resetIds();
    expect(run([img({ parentClientWidth: 799 })], 375, { 1: 'img' }).results).toEqual([]);
  });
  it('a placeholder, a picture still loading, and a broken one are can\'t measure and never reported', () => {
    const o = run([box({ tag: 'span', width: 800 }), img({ complete: false }), img({ naturalWidth: 0 })], 375, { 1: 'img', 2: 'img', 3: 'img' });
    expect(o.results).toEqual([]);
    expect(o.cantMeasure).toEqual({ picture_placeholder: [1], picture_loading: [2], picture_broken: [3] });
  });
  it('an element that is not a picture in the page is not looked at', () => {
    expect(run([img()], 375, {}).cantMeasure).toEqual({});
  });
});

describe('everything is plain data and never throws', () => {
  it('old-shape measurements (no new fields) give no result', () => {
    const old = { id: 1, tag: 'div', clientWidth: 1, scrollWidth: 1, clientHeight: 1, scrollHeight: 1, overflowX: 'visible', overflowY: 'visible', hasText: true };
    expect(evaluateLint([old], 375, () => undefined)).toEqual({ results: [], cantMeasure: {}, partial: [] });
  });
  it('NaN and odd values do not throw or report', () => {
    expect(() => run([box({ width: NaN, height: NaN, fontSize: NaN, hasText: true, color: 'rgb(x)' })])).not.toThrow();
  });
});
