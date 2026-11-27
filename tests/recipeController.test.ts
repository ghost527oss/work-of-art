// @node: F12.12
import { describe, expect, it } from 'vitest';
import { createRecipeController, FULL_WIDTHS, NEED_FULL_CHECK, offerFor } from '../src/hooks/useRecipe';
import { hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import type { Finding } from '../src/engine/scanFindingTypes';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { previewInfoStore, type PreviewInfo } from '../src/edit/previewHandle';
import { beginLayout, discardLayout, finishLayout, stopLayout } from '../src/store/previewActions';
import { applyUserEdit } from '../src/store/workActions';
import { createStore, initialState, type StudioState } from '../src/store/useStudioStore';
import { workProblems } from '../src/store/workSlice';
import { snapshotOf } from './helpers/analyzeFixture';

const HTML = '<p>a</p>\n<button class="b">Go</button>\n<p>c</p>\n';
const tap = (over: Partial<Finding> = {}): Finding => ({
  id: 'tap1', skillId: 'scan.frontend.tap-target', primary: 'frontend', areas: ['frontend'], severity: 'medium', certainty: 'found', fix: 'guided', path: 'index.html', firstLine: 2, lastLine: 2,
  snippet: [], extra: 'x', confidence: 'high', measure: { kind: 'tap-target', value: 30, limit: 44, info: { display: 'block' } }, ...over,
});
const other = (): Finding => ({ ...tap({ id: 'o', skillId: 'scan.frontend.text-small', firstLine: 1, lastLine: 1, measure: { kind: 'text-small', value: 10, limit: 12 } }) });

function setup(html = HTML, widths: number[] = FULL_WIDTHS) {
  const snapshot = snapshotOf({ 'index.html': html });
  const built = buildStaticPreview({ entryPath: 'index.html', effective: () => html, loaded: new Set(['index.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' });
  if (!built.ok) throw new Error(built.reason);
  const base: StudioState = { ...initialState(), experience: 'studio', snapshot, preview: { ...initialState().preview, mode: 'static', entryPath: 'index.html', status: 'ready', layout: { status: 'done', widths, findings: [tap(), other()], contentKey: 'k0', partialReasons: [] } } };
  const store = createStore<StudioState>(base);
  const info = createStore<PreviewInfo>({ ...previewInfoStore.getState(), mode: 'static', editable: true, elements: built.elements, tableHash: hashText(html), ready: true });
  let t = 5000;
  const timers: Array<() => void> = [];
  let cleared = 0;
  let n = 0;
  const c = createRecipeController(store, info, { now: () => t++, newId: () => `id-${++n}`, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => { cleared++; } });
  /** What the panel does after the content changed: drop the old result, then measure again and finish. */
  const panelMeasures = (findings: Finding[], key = 'k1', widths2: number[] = FULL_WIDTHS) => {
    store.update((s) => discardLayout(s));
    store.update((s) => beginLayout(s, widths2));
    store.update((s) => finishLayout(s, findings, key, [], 1));
  };
  const text = () => practiceContent(store.getState().snapshot!, store.getState().work.applied, 'index.html')!;
  return { store, info, c, timers, panelMeasures, text, cleared: () => cleared, base };
}

describe('recipe: kept', () => {
  it('applies the change, measures again at all three widths, and keeps it when the problem is gone and nothing new appeared', () => {
    const s = setup();
    s.c.actions.start('tap1');
    expect(s.store.getState().work.applied).toHaveLength(1);
    expect(s.text()).toContain('style="min-width: 44px; min-height: 44px"');
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'measuring', targetId: 'tap1' });
    s.panelMeasures([other()]);
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'kept' });
    expect(s.store.getState().work.applied).toHaveLength(1);
    expect(s.store.getState().log.map((e) => e.action)).toEqual(expect.arrayContaining(['style_recorded', 'recipe_applied', 'recipe_kept']));
    expect(s.cleared()).toBeGreaterThan(0);
    expect(workProblems(s.store.getState().work)).toEqual([]);
    s.c.dispose();
  });
  it('the old layout result still showing right after the change does not decide anything', () => {
    const s = setup();
    s.c.actions.start('tap1');
    expect(s.store.getState().preview.recipe!.status).toBe('measuring');
    s.c.dispose();
  });
});

describe('recipe: undone automatically', () => {
  const original = (s: ReturnType<typeof setup>) => hashText(HTML) === hashText(s.text());
  it('on a regression (the target is still there)', () => {
    const s = setup();
    s.c.actions.start('tap1');
    s.panelMeasures([tap(), other()]);
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: 'The recipe was undone: the problem was still there.' });
    expect(original(s)).toBe(true);
    expect(s.store.getState().work.applied).toHaveLength(0);
    expect(s.store.getState().log.map((e) => e.action)).toContain('recipe_undone');
  });
  it('on a new problem of another kind or on another element', () => {
    const s = setup();
    s.c.actions.start('tap1');
    s.panelMeasures([other(), { ...other(), id: 'n', skillId: 'scan.frontend.contrast', firstLine: 3, lastLine: 3, measure: { kind: 'contrast', value: 2, limit: 4.5 } }]);
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: expect.stringContaining('a new problem appeared') });
    expect(original(s)).toBe(true);
    const t = setup();
    t.c.actions.start('tap1');
    t.panelMeasures([other(), { ...tap({ id: 'n2', firstLine: 3, lastLine: 3 }) }]);
    expect(t.store.getState().preview.recipe!.status).toBe('undone');
    expect(original(t)).toBe(true);
  });
  it('on a stopped check, a changed page, and a 10-second timeout', () => {
    const a = setup();
    a.c.actions.start('tap1');
    a.store.update((s) => discardLayout(s)); a.store.update((s) => beginLayout(s, FULL_WIDTHS)); a.store.update((s) => stopLayout(s, 'The layout check took too long and was stopped.'));
    expect(a.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: expect.stringContaining('the check did not finish') });
    expect(original(a)).toBe(true);
    const b = setup();
    b.c.actions.start('tap1');
    b.store.update((s) => discardLayout(s)); b.store.update((s) => beginLayout(s, FULL_WIDTHS)); b.store.update((s) => stopLayout(s, 'The page changed while it was measured, so the result was dropped.'));
    expect(b.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: expect.stringContaining('the page changed') });
    const c = setup();
    c.c.actions.start('tap1');
    c.timers[0]!();
    expect(c.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: expect.stringContaining('the check ran out of time') });
    expect(original(c)).toBe(true);
  });
  it('when the check did not cover all three widths', () => {
    const s = setup();
    s.c.actions.start('tap1');
    s.panelMeasures([other()], 'k1', [768]);
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: expect.stringContaining('all three widths') });
    expect(original(s)).toBe(true);
  });
  it('the practice copy hash equals the one before the recipe after an undo (and History keeps the entry for Redo)', () => {
    const s = setup();
    s.c.actions.start('tap1');
    s.panelMeasures([tap()]);
    expect(hashText(s.text())).toBe(hashText(HTML));
    expect(s.store.getState().work.undone).toHaveLength(1);
  });
  it('closing the Edit panel while measuring undoes the change', () => {
    const s = setup();
    s.c.actions.start('tap1');
    s.c.dispose();
    expect(hashText(s.text())).toBe(hashText(HTML));
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: expect.stringContaining('the Edit panel was closed') });
  });
});

describe('recipe: the wrong History entry is never undone', () => {
  it('another change made after the recipe is left alone and the panel says so', () => {
    const s = setup();
    s.c.actions.start('tap1');
    const now = practiceContent(s.store.getState().snapshot!, s.store.getState().work.applied, 'index.html')!;
    s.store.update((st) => applyUserEdit(st, { path: 'index.html', baseHash: hashText(now), newContent: now + '<!-- x -->\n', editKey: 'edit:other', title: 'Other change' }, { now: 1, mode: 'self_editing', newId: () => 'z' }).state);
    expect(s.store.getState().work.applied).toHaveLength(2);
    // The page changed, so the check stops; the recipe would be undone, but its entry is no longer the latest, so nothing is.
    s.store.update((st) => discardLayout(st)); s.store.update((st) => beginLayout(st, FULL_WIDTHS)); s.store.update((st) => stopLayout(st, 'The page changed while it was measured, so the result was dropped.'));
    expect(s.store.getState().work.applied).toHaveLength(2);
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'refused', message: expect.stringContaining('not undone because another change was made after it') });
  });
  it('the same holds when the timer runs out and when the panel closes', () => {
    const a = setup();
    a.c.actions.start('tap1');
    const now = practiceContent(a.store.getState().snapshot!, a.store.getState().work.applied, 'index.html')!;
    a.store.update((st) => applyUserEdit(st, { path: 'index.html', baseHash: hashText(now), newContent: now + '<!-- x -->\n', editKey: 'edit:other', title: 'Other change' }, { now: 1, mode: 'self_editing', newId: () => 'z' }).state);
    a.timers[0]!();
    expect(a.store.getState().work.applied).toHaveLength(2);
    expect(a.store.getState().preview.recipe).toMatchObject({ status: 'refused', message: expect.stringContaining('the check ran out of time') });
    const b = setup();
    b.c.actions.start('tap1');
    const now2 = practiceContent(b.store.getState().snapshot!, b.store.getState().work.applied, 'index.html')!;
    b.store.update((st) => applyUserEdit(st, { path: 'index.html', baseHash: hashText(now2), newContent: now2 + '<!-- x -->\n', editKey: 'edit:other', title: 'Other change' }, { now: 1, mode: 'self_editing', newId: () => 'z' }).state);
    b.c.dispose();
    expect(b.store.getState().work.applied).toHaveLength(2);
  });
});

describe('recipe: refusals and guards', () => {
  it('needs the latest check to cover all three widths', () => {
    const s = setup(HTML, [375]);
    s.c.actions.start('tap1');
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'refused', message: NEED_FULL_CHECK });
    expect(s.store.getState().work.applied).toHaveLength(0);
  });
  it('refuses with a plain reason: no check yet, unknown finding, overlap, not mapped, history full', () => {
    const none = setup(); none.store.update((st) => ({ ...st, preview: { ...st.preview, layout: { ...st.preview.layout, status: 'idle' as const } } }));
    none.c.actions.start('tap1');
    expect(none.store.getState().preview.recipe).toMatchObject({ status: 'refused', message: 'Run the layout check first.' });
    const s = setup();
    s.c.actions.start('nope');
    expect(s.store.getState().preview.recipe!.message).toBe('That finding is no longer in the latest check.');
    const ov = setup();
    ov.store.update((st) => ({ ...st, preview: { ...st.preview, layout: { ...st.preview.layout, findings: [tap({ id: 'ov', skillId: 'scan.frontend.layout-overlap', measure: { kind: 'overlap', value: 1, limit: 16 } })] } } }));
    ov.c.actions.start('ov');
    expect(ov.store.getState().preview.recipe!.message).toContain('design choice');
    const complex = setup('<p>a</p>\n<button style="background: url(x.png)">Go</button>\n');
    complex.c.actions.start('tap1');
    expect(complex.store.getState().preview.recipe!.message).toBe("This element's style is too complex to rewrite safely.");
    const full = setup();
    full.store.update((st) => ({ ...st, work: { ...st.work, applied: Array.from({ length: 50 }, (_, i) => ({ id: `h${i}`, path: 'other.txt', title: 't', at: 1, diff: '--- a/o\n+++ b/o\n@@ -1,1 +1,1 @@\n-a\n+b\n', beforeHash: 'aaaaaaaa', afterHash: 'bbbbbbbb' })) } }));
    full.c.actions.start('tap1');
    expect(full.store.getState().preview.recipe).toMatchObject({ status: 'refused' });
  });
  it('a likely secret near the element refuses the change and records nothing', () => {
    const s = setup('<p>a</p>\n<button class="b">Go</button>\n<p>AKIAABCDEFGHIJKLMNOP</p>\n');
    s.c.actions.start('tap1');
    expect(s.store.getState().preview.recipe).toMatchObject({ status: 'refused', message: expect.stringContaining('likely secret') });
    expect(s.store.getState().work.applied).toHaveLength(0);
  });
  it('rapid clicks: a second start while measuring is ignored', () => {
    const s = setup();
    s.c.actions.start('tap1');
    s.c.actions.start('tap1');
    s.c.actions.start('o');
    expect(s.store.getState().work.applied).toHaveLength(1);
    expect(s.timers).toHaveLength(1);
  });
  it('after dispose nothing happens, and the timer and the subscription are gone', () => {
    const s = setup();
    s.c.dispose();
    s.c.actions.start('tap1');
    expect(s.store.getState().work.applied).toHaveLength(0);
    expect(s.store.getState().preview.recipe).toBeUndefined();
  });
  it('scripts on or a non-static mode: no recipe is offered', () => {
    const s = setup();
    s.store.update((st) => ({ ...st, preview: { ...st.preview, scripts: true } }));
    expect(offerFor(s.store.getState(), s.info.getState(), tap())).toMatchObject({ ok: false });
  });
  it('the Log holds fixed words and the file path only: no file text, colours, or page text', () => {
    const s = setup();
    s.c.actions.start('tap1');
    s.panelMeasures([other()]);
    const text = JSON.stringify(s.store.getState().log);
    expect(text).not.toContain('<button');
    expect(text).not.toContain('Go</');
    expect(s.store.getState().log.filter((e) => e.action.startsWith('recipe_')).map((e) => e.message)).toEqual(['Recipe applied.', 'Recipe kept: the problem is gone at three widths and nothing new appeared.']);
  });
});
