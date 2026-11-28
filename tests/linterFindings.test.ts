// @node: F12.10
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateLint } from '../src/preview/linter';
import { buildMeasuredFindings } from '../src/preview/linterFindings';
import type { ElementEntry } from '../src/preview/previewDocument';
import { box, resetIds } from './helpers/lintFixtures';

beforeEach(resetIds);
const HTML = Array.from({ length: 60 }, (_, i) => `<button id="b${i}">SECRETTEXT${i}</button>`).join('\n');
const els = (n: number, tag = 'button'): ElementEntry[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, path: 'index.html', tag, line: i + 1, col: 1, startOffset: 0, endOffset: 0, endLine: i + 1 }));
const effective = () => HTML;
const lintAt = (ms: ReturnType<typeof box>[], widths: number[], entry: (id: number) => string | undefined = () => 'button') => widths.map((width) => ({ width, lint: evaluateLint(ms, width, entry) }));

describe('measured findings', () => {
  it('one finding per element and kind, listing every width, with a confidence and the measured numbers', () => {
    const ms = [box({ tag: 'button', width: 30, height: 30, hasText: true, fontSize: 10, color: 'rgb(170,170,170)'.replace(/,/g, ', ') })];
    const out = buildMeasuredFindings({ overflow: [], perWidth: lintAt(ms, [375, 768, 1024]), elements: els(1), effective, cssRules: [] });
    const kinds = out.findings.map((f) => f.measure!.kind).sort();
    expect(kinds).toEqual(['contrast', 'tap-target', 'text-small']);
    const tap = out.findings.find((f) => f.measure!.kind === 'tap-target')!;
    expect(tap).toMatchObject({ skillId: 'scan.frontend.tap-target', primary: 'frontend', areas: ['frontend'], fix: 'guided', severity: 'medium', certainty: 'found', confidence: 'high', path: 'index.html', firstLine: 1 });
    expect(tap.extra).toBe('Tap target is 30 px high and 30 px wide (needs at least 44 px each way), measured at 375, 768 px wide previews (static render, scripts off)');
    const contrast = out.findings.find((f) => f.measure!.kind === 'contrast')!;
    expect(contrast.extra).toContain('measured at 375, 768, 1024 px wide previews (static render, scripts off)');
    expect(new Set(out.findings.map((f) => f.id)).size).toBe(out.findings.length);
  });
  it('overlap names the other box by line number and is never high confidence', () => {
    const ms = [box({ parentKey: 1, tag: 'div', hasText: true, left: 0, top: 0, width: 100, height: 50 }), box({ parentKey: 1, tag: 'div', hasText: true, left: 40, top: 10, width: 100, height: 50 })];
    const out = buildMeasuredFindings({ overflow: [], perWidth: lintAt(ms, [1024], () => 'div'), elements: els(2, 'div'), effective, cssRules: [] });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({ skillId: 'scan.frontend.layout-overlap', certainty: 'possible', severity: 'low', confidence: 'medium' });
    expect(out.findings[0]!.extra).toBe('This box overlaps a neighbouring box (the one on line 2) by 2400 square px, measured at 1024 px wide preview (static render, scripts off)');
  });
  it('a wide picture is a media-unsized finding; an unmeasured picture is read from the page text with low confidence', () => {
    const wide = box({ tag: 'img', width: 900, img: { naturalWidth: 900, naturalHeight: 500, complete: true, local: true, parentClientWidth: 375 } });
    const placeholder = box({ tag: 'span', width: 120 });
    const e = els(2, 'img');
    const html = '<img src="a.png">\n<img src="b.png">';
    const out = buildMeasuredFindings({
      overflow: [], perWidth: lintAt([wide, placeholder], [375], () => 'img'), elements: e.map((x, i) => ({ ...x, startOffset: i === 0 ? 0 : 18, endOffset: i === 0 ? 17 : 35 })), effective: () => html, cssRules: [],
    });
    const measured = out.findings.find((f) => f.measure!.kind === 'media-wide')!;
    expect(measured).toMatchObject({ skillId: 'scan.frontend.media-unsized', confidence: 'high', certainty: 'possible' });
    expect(measured.extra).toBe('Picture is 900 px wide in a box 375 px wide, measured at 375 px wide preview (static render, scripts off)');
    const nolimit = out.findings.find((f) => f.measure!.kind === 'nolimit')!;
    expect(nolimit.confidence).toBe('low');
    expect(nolimit.extra).toBe('Picture has no width, height, or size limit written down (read from the page text, not measured)');
    expect(out.cantMeasure).toEqual({ picture_placeholder: 1 });
  });
  it('can\'t-measure ids are counted once across widths', () => {
    const ms = [box({ hasText: true, color: 'rgb(200, 200, 200)', bg: { unknown: 'picture' } })];
    const out = buildMeasuredFindings({ overflow: [], perWidth: lintAt(ms, [375, 768, 1024]), elements: els(1, 'div'), effective, cssRules: [] });
    expect(out.cantMeasure).toEqual({ picture: 1 });
    expect(out.findings).toEqual([]);
  });
  it('caps at 25 per kind and 100 in all, with plain notes', () => {
    const ms = Array.from({ length: 60 }, () => box({ tag: 'button', width: 10, height: 10, hasText: true, fontSize: 8, color: 'rgb(200, 200, 200)' }));
    const out = buildMeasuredFindings({ overflow: [], perWidth: lintAt(ms, [375]), elements: els(60), effective, cssRules: [] });
    for (const kind of ['tap-target', 'text-small', 'contrast']) expect(out.findings.filter((f) => f.measure!.kind === kind)).toHaveLength(25);
    expect(out.partialReasons.join(' ')).toContain('Limit of 25 findings for one kind of check reached: 105 more were not listed.');
    expect(out.findings.length).toBeLessThanOrEqual(100);
  });
  it('overflow keeps its own shape and findings come first', () => {
    const out = buildMeasuredFindings({ overflow: [{ id: 1, kind: 'text-wider', width: 375, content: 500, box: 300 }], perWidth: lintAt([box({ tag: 'button', width: 10, height: 10 })], [375]), elements: els(1), effective, cssRules: [] });
    expect(out.findings.map((f) => f.skillId)).toEqual(['scan.frontend.layout-overflow', 'scan.frontend.tap-target']);
    expect(out.findings[0]!.extra).toBe('Text is wider than its box: content 500 px in a box 300 px wide, measured at 375 px wide preview');
  });
  it('no page text ever appears in a finding\'s extra or measure', () => {
    const ms = [box({ tag: 'button', width: 10, height: 10, hasText: true })];
    const out = buildMeasuredFindings({ overflow: [], perWidth: lintAt(ms, [375]), elements: els(1), effective, cssRules: [] });
    expect(JSON.stringify(out.findings.map((f) => [f.extra, f.measure, f.confidence]))).not.toContain('SECRETTEXT');
  });
  it('severity and certainty come from the skill, and overflow-only input behaves as before', () => {
    const out = buildMeasuredFindings({ overflow: [{ id: 1, kind: 'page-wider', width: 375, content: 600, box: 375 }], perWidth: [], elements: els(1), effective, cssRules: [] });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({ skillId: 'scan.frontend.layout-overflow', severity: 'medium', fix: 'guided' });
    expect(out.cantMeasure).toEqual({});
  });
});
