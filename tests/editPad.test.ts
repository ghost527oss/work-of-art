// @node: F8.1
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { applyUnifiedDiff, hashText, reverseUnifiedDiff } from '../src/engine/diffApply';
import * as S from '../src/edit/styleModel';
import { mergeStyle, parseInlineStyle, serializeStyle } from '../src/edit/inlineStyle';
import { buildLineDiff } from '../src/edit/textDiff';
import { mapElement, REASONS, rewriteStartTag } from '../src/edit/elementMap';
import { hitTest, lassoSelect, resizeFromHandle } from '../src/edit/geometry';
import { suggestFix } from '../src/edit/suggestions';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { applyUserEdit } from '../src/store/workActions';
import { idleEdit, eSelect, eAddPreviewOnly } from '../src/store/editSlice';
import { initialState, type StudioState } from '../src/store/useStudioStore';
import { practiceContent } from '../src/engine/practiceScript';
import { WorkRecordSchema, buildRecord } from '../src/store/workStorage';

const snap = buildSampleSnapshot('static-site', 1);
const index = snap.files.find((f) => f.path === 'index.html')!.content!;
const table = () => {
  const r = buildStaticPreview({ entryPath: 'index.html', effective: (p) => snap.files.find((f) => f.path === p)?.content, loaded: new Set(snap.files.map((f) => f.path)), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' });
  if (!r.ok) throw new Error('x');
  return r.elements;
};

describe('style model', () => {
  it('builds exactly the documented values', () => {
    expect(S.size('width', '240', 'px')).toEqual({ ok: true, decl: { prop: 'width', value: '240px' } });
    expect(S.size('width', '50', '%')).toEqual({ ok: true, decl: { prop: 'width', value: '50%' } });
    expect(S.size('height', 'x', 'auto')).toEqual({ ok: true, decl: { prop: 'height', value: 'auto' } });
    expect(S.radius('12', 'px')).toEqual({ ok: true, decl: { prop: 'border-radius', value: '12px' } });
    expect(S.margin('top', '-4')).toEqual({ ok: true, decl: { prop: 'margin-top', value: '-4px' } });
    expect(S.shadow('medium', '#112233')).toEqual({ ok: true, decl: { prop: 'box-shadow', value: '0 4px 8px #112233' } });
    expect(S.shadow('none', 'x')).toEqual({ ok: true, decl: { prop: 'box-shadow', value: 'none' } });
    expect(S.gradient('#000000', '#FFFFFF', 90)).toEqual({ ok: true, decl: { prop: 'background-image', value: 'linear-gradient(90deg, #000000, #ffffff)' } });
    expect(S.fontSize(12.6)).toEqual({ ok: true, decl: { prop: 'font-size', value: '13px' } });
  });
  it('refuses out-of-range and malformed input with the inline message', () => {
    expect(S.size('width', '6000', 'px')).toEqual({ ok: false, error: 'Use a number from 0 to 5000.' });
    expect(S.padding('top', '-1').ok).toBe(false);
    expect(S.fontSize('5').ok).toBe(false);
    expect(S.color('color', 'red').ok).toBe(false);
    expect(S.color('color', '#12345g').ok).toBe(false);
    expect(S.borderStyle('groove').ok).toBe(false);
    expect(S.size('width', 'Infinity', 'px').ok).toBe(false);
  });
  it('fuzz: no builder output ever contains a dangerous character or function', () => {
    let seed = 5;
    const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor((seed / 2 ** 32) * n); };
    const junk = ['1', '-1', '1e9', 'NaN', '#000000', '#ffffff', "'", '"', ';', '{', '}', '<', '>', '\\', 'url(x)', 'expression(1)', 'px', '%', 'auto', '', ' ', 'small', 'none', 'large', '#AbCdEf', '360', '9999'];
    const pick = () => junk[rnd(junk.length)];
    const bad = /["';{}<>\\]|url\(|expression\(/i;
    for (let i = 0; i < 3000; i++) {
      const results = [S.size('width', pick(), pick()), S.radius(pick(), pick()), S.padding('top', pick()), S.margin('left', pick()), S.borderWidth(pick()), S.borderStyle(pick()), S.color('color', pick()), S.shadow(pick(), pick()), S.fontSize(pick()), S.background(pick()), S.gradient(pick(), pick(), pick())];
      for (const r of results) if (r.ok) { expect(r.decl.value).not.toMatch(bad); expect(S.isSafeDeclaration(r.decl)).toBe(true); }
    }
  });
});

describe('inline style', () => {
  it('parses plain lists and refuses complex ones', () => {
    expect(parseInlineStyle('color: red; WIDTH:10px;')).toEqual([{ prop: 'color', value: 'red' }, { prop: 'width', value: '10px' }]);
    for (const t of ['background: url(x.png)', 'a: "b;c"', 'a: calc(1px;2px)', 'a: b(', 'nocolon', '{{x}}', "a: 'b"]) expect(parseInlineStyle(t), t).toBeNull();
  });
  it('merges in place and appends in the fixed order', () => {
    const m = mergeStyle([{ prop: 'color', value: 'red' }, { prop: 'width', value: '1px' }], [{ prop: 'width', value: '2px' }, { prop: 'font-size', value: '9px' }, { prop: 'height', value: '3px' }]);
    expect(serializeStyle(m)).toBe('color: red; width: 2px; height: 3px; font-size: 9px');
  });
});

describe('mapping and the start-tag rewrite (design 8.1 worked example)', () => {
  it('button width 200px gives exactly the documented diff', () => {
    const el = table().find((e) => e.tag === 'button')!;
    expect(el.key).toBe('index.html#button#1');
    expect(mapElement(el, index, hashText(index))).toEqual({ ok: true });
    const next = rewriteStartTag(index, el, [{ prop: 'width', value: '200px' }])!;
    expect(next).toContain('<button id="order" class="btn" style="width: 200px">Order now</button>');
    const diff = buildLineDiff('index.html', index, next)!;
    expect(diff).toBe([
      '--- a/index.html', '+++ b/index.html', '@@ -10,7 +10,7 @@', '     <main>', '       <img src="img/logo.png" />', '       <p>Fresh bread every morning.</p>',
      '-      <button id="order" class="btn">Order now</button>', '+      <button id="order" class="btn" style="width: 200px">Order now</button>',
      '       <p id="message"></p>', '     </main>', '     <script src="js/app.js"></script>', '',
    ].join('\n'));
    expect(applyUnifiedDiff(index, diff)).toEqual({ ok: true, text: next });
    expect(next.length - index.length).toBe(' style="width: 200px"'.length);
  });
  it('the img on line 11 gets the attribute before " />"', () => {
    const el = table().find((e) => e.line === 11 && e.tag === 'img')!;
    expect(rewriteStartTag(index, el, [{ prop: 'width', value: '100px' }])).toContain('<img src="img/logo.png" style="width: 100px" />');
  });
  it('fixed reasons: changed page, complex style, not HTML, SVG, unknown tag', () => {
    const el = table().find((e) => e.tag === 'button')!;
    expect(mapElement(el, index + ' ', hashText(index))).toEqual({ ok: false, reason: REASONS.changed });
    const complex = index.replace('<button id="order" class="btn">', '<button id="order" class="btn" style="background: url(x.png)">');
    const el2 = { ...el, endOffset: el.endOffset + ' style="background: url(x.png)"'.length };
    expect(mapElement(el2, complex, hashText(complex))).toEqual({ ok: false, reason: REASONS.complex });
    expect(mapElement({ ...el, path: 'a.vue' }, index, hashText(index))).toEqual({ ok: false, reason: REASONS.notHtml });
    const svg = buildStaticPreview({ entryPath: 'a.html', effective: () => '<svg><circle r="1"/></svg><x-y>t</x-y>', loaded: new Set(['a.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' });
    if (!svg.ok) throw new Error('x');
    expect(svg.elements.map((e) => e.reason)).toEqual([REASONS.svg, REASONS.svg, REASONS.unknown]);
  });
  it('returns null when the tag is not where the table says', () => {
    const el = table().find((e) => e.tag === 'button')!;
    expect(rewriteStartTag('x'.repeat(index.length), el, [{ prop: 'width', value: '1px' }])).toBeNull();
    expect(rewriteStartTag(index, el, [{ prop: 'width', value: 'url(x)' }])).toBeNull();
  });
});

describe('text diff', () => {
  it('handles CRLF, no final newline, and equal texts', () => {
    expect(buildLineDiff('a', 'x', 'x')).toBeNull();
    for (const [a, b] of <Array<[string, string]>>[['a\r\nb\r\nc\r\n', 'a\r\nB\r\nc\r\n'], ['a\nb', 'a\nB'], ['one', 'two'], ['', 'x\n'], ['x\n', '']]) {
      const d = buildLineDiff('f', a, b)!;
      expect(applyUnifiedDiff(a, d), JSON.stringify([a, b])).toEqual({ ok: true, text: b });
      expect(applyUnifiedDiff(b, reverseUnifiedDiff(d)!)).toEqual({ ok: true, text: a });
    }
  });
});

describe('applyUserEdit', () => {
  const base = (): StudioState => ({ ...initialState(), experience: 'studio', snapshot: snap });
  let n = 0;
  const ctx = { now: 5, mode: 'self_editing' as const, newId: () => `u${++n}` };
  const el = () => table().find((e) => e.tag === 'button')!;
  it('records one History entry at once, merges a burst, and reverting removes it', () => {
    const s0 = base();
    const w200 = rewriteStartTag(index, el(), [{ prop: 'width', value: '200px' }])!;
    const r1 = applyUserEdit(s0, { path: 'index.html', baseHash: hashText(index), newContent: w200, editKey: 'k1', title: 'Style: button' }, ctx);
    expect(r1.recorded).toBe(true);
    expect(r1.state.work.applied).toHaveLength(1);
    expect(r1.state.log.at(-1)).toMatchObject({ action: 'style_recorded', status: 'applied', affectedPaths: ['index.html'] });
    const both = w200.replace('style="width: 200px"', 'style="width: 200px; height: 40px"');
    const r2 = applyUserEdit(r1.state, { path: 'index.html', baseHash: hashText(w200), newContent: both, editKey: 'k1', title: 'Style: button' }, ctx);
    expect(r2.state.work.applied).toHaveLength(1);
    const e = r2.state.work.applied[0]!;
    expect(e.beforeHash).toBe(hashText(index));
    expect(e.afterHash).toBe(hashText(both));
    expect(e.diff).toContain('style="width: 200px; height: 40px"');
    expect(practiceContent(snap, r2.state.work.applied, 'index.html')).toBe(both);
    const r3 = applyUserEdit(r2.state, { path: 'index.html', baseHash: hashText(both), newContent: index, editKey: 'k1', title: 'Style: button' }, ctx);
    expect(r3.state.work.applied).toEqual([]);
    expect(r3.state.log.at(-1)!.message).toBe('Style change reverted');
  });
  it('refuses when the page changed, when History is full, or when the diff has a secret', () => {
    const s0 = base();
    const w = rewriteStartTag(index, el(), [{ prop: 'width', value: '200px' }])!;
    expect(applyUserEdit(s0, { path: 'index.html', baseHash: 'deadbeef', newContent: w, editKey: 'k', title: 't' }, ctx)).toMatchObject({ recorded: false, reason: REASONS.changed });
    const full = { ...s0, work: { ...s0.work, applied: Array.from({ length: 50 }, (_, i) => ({ id: `h${i}`, path: 'z', title: 't', at: 1, diff: 'd', beforeHash: '00000000', afterHash: '11111111' })) } };
    expect(applyUserEdit(full, { path: 'index.html', baseHash: hashText(index), newContent: w, editKey: 'k', title: 't' }, ctx)).toMatchObject({ recorded: false, reason: REASONS.full });
    const secret = index.replace('<p>Fresh bread every morning.</p>', `<p>ghp_${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}</p>`);
    expect(applyUserEdit(s0, { path: 'index.html', baseHash: hashText(index), newContent: secret, editKey: 'k', title: 't' }, ctx)).toMatchObject({ recorded: false, reason: REASONS.secret });
  });
  it('the saved record accepts editKey and old records still load', () => {
    const w = rewriteStartTag(index, el(), [{ prop: 'width', value: '200px' }])!;
    const r = applyUserEdit(base(), { path: 'index.html', baseHash: hashText(index), newContent: w, editKey: 'edit:index.html:index.html#button#1', title: 't' }, ctx);
    const rec = buildRecord(r.state, 1)!;
    expect(rec.applied[0]!.editKey).toBe('edit:index.html:index.html#button#1');
    expect(WorkRecordSchema.safeParse(JSON.parse(JSON.stringify(rec))).success).toBe(true);
    const old = { ...rec, applied: rec.applied.map(({ editKey: _k, ...x }) => x) };
    expect(WorkRecordSchema.safeParse(old).success).toBe(true);
  });
});

describe('geometry, edit state, suggestions', () => {
  const rects = [{ id: 0, left: 0, top: 0, width: 300, height: 300 }, { id: 1, left: 10, top: 10, width: 100, height: 50, parentId: 0 }, { id: 2, left: 20, top: 20, width: 20, height: 20, parentId: 1 }];
  it('hit test picks the deepest; lasso picks outermost fully inside; handles clamp', () => {
    expect(hitTest(rects, 25, 25)).toBe(2);
    expect(hitTest(rects, 200, 200)).toBe(0);
    expect(hitTest(rects, 999, 999)).toBeUndefined();
    expect(lassoSelect(rects, { left: 5, top: 5, width: 200, height: 200 }).ids).toEqual([1]);
    expect(lassoSelect(Array.from({ length: 30 }, (_, i) => ({ id: i, left: i, top: 0, width: 1, height: 1 })), { left: 0, top: 0, width: 100, height: 100 })).toMatchObject({ capped: true });
    expect(resizeFromHandle(rects[1]!, 'corner', 50, -100)).toEqual({ width: 150, height: 1 });
    expect(resizeFromHandle(rects[1]!, 'right', 1e9, 0)).toEqual({ width: 5000 });
  });
  it('selection caps at 20 with the notice; Preview Only caps at 50', () => {
    const s = eSelect(idleEdit(), Array.from({ length: 25 }, (_, i) => `k${i}`));
    expect(s.selection).toHaveLength(20);
    expect(s.notice).toBe('Only the first 20 elements were selected.');
    let e = idleEdit();
    e = eAddPreviewOnly(e, Array.from({ length: 60 }, (_, i) => ({ elementKey: `k${i}`, scope: 'p', property: 'width', value: '1px', reason: 'r' })));
    expect(e.previewOnly).toHaveLength(50);
  });
  it('suggestions are the three fixed declarations', () => {
    expect(suggestFix('Text is wider than its box: ...')).toEqual({ prop: 'overflow-wrap', value: 'anywhere' });
    expect(suggestFix('Text is cut off at the bottom: ...')).toEqual({ prop: 'height', value: 'auto' });
    expect(suggestFix('The page is wider than the screen: ...')).toEqual({ prop: 'max-width', value: '100%' });
    expect(suggestFix('x')).toBeNull();
  });
  it('Preview Only styles reach the built document only through the validator', () => {
    const r = buildStaticPreview({ entryPath: 'i.html', effective: () => '<p style="color: red">x</p><p>y</p>', loaded: new Set(['i.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a',
      previewStyles: [{ elementKey: 'i.html#p#1', property: 'width', value: '20px' }, { elementKey: 'i.html#p#2', property: 'width', value: 'url(x)' }, { elementKey: 'i.html#p#2', property: 'behavior', value: 'x' }] });
    if (!r.ok) throw new Error('x');
    expect(r.html).toContain('style="color: red;width:20px"');
    expect(r.html).not.toContain('url(x)');
    expect(r.html).not.toContain('behavior');
  });
});
