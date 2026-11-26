// @node: F8.6
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import { createEditController } from '../src/hooks/useEditPad';
import type { PreviewInfo } from '../src/edit/previewHandle';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { createStore, initialState, reset, type StudioState } from '../src/store/useStudioStore';
import { runCommand } from '../src/store/workActions';
import { EditPanel } from '../src/components/EditPanel';
import { EditTools, LayoutFixList, PreviewOnlyList, PropertyForm, SelectionInfo } from '../src/components/EditPads';

const snap = buildSampleSnapshot('static-site', 1);
const content = (p: string) => snap.files.find((f) => f.path === p)?.content;
function setup(mode: PreviewInfo['mode'] = 'static') {
  const built = buildStaticPreview({ entryPath: 'index.html', effective: content, loaded: new Set(snap.files.map((f) => f.path)), scripts: false, nonce: '0123456789abcdef', origin: 'http://a', approximate: mode === 'workbench' });
  if (!built.ok) throw new Error('x');
  const studio = createStore<StudioState>({ ...initialState(), experience: 'studio', snapshot: snap });
  const info = createStore<PreviewInfo>({ buildId: 1, editable: true, mode, scope: mode === 'workbench' ? 'App' : 'index.html', path: mode === 'static' ? 'index.html' : undefined, elements: built.elements, tableHash: hashText(content('index.html')!), ready: true });
  const timers: Array<() => void> = [];
  const recheck = vi.fn(async () => 2);
  let n = 0;
  const c = createEditController(studio, info, { now: () => 7, newId: () => `id${++n}`, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => undefined, doc: () => null, recheck });
  return { studio, info, c, timers, recheck, built };
}
const key = (tag: string, n = 1) => `index.html#${tag}#${n}`;

describe('edit controller', () => {
  it('selects only known keys and commits a mapped change to History at once', () => {
    const { studio, c } = setup();
    c.actions.select([key('button'), 'index.html#nope#1']);
    expect(studio.getState().edit.selection).toEqual([key('button')]);
    const r = c.actions.commit([{ prop: 'width', value: '200px' }]);
    expect(r).toMatchObject({ recorded: 1, previewOnly: 0 });
    const s = studio.getState();
    expect(s.work.applied).toHaveLength(1);
    expect(s.work.applied[0]!.title).toBe('Style: button at index.html:13 (width)');
    expect(practiceContent(snap, s.work.applied, 'index.html')).toContain('style="width: 200px"');
    expect(s.edit.previewOnly).toEqual([]);
  });
  it('a second commit to the same element merges; Undo reverses the whole burst', () => {
    const { studio, info, c } = setup();
    c.actions.select([key('button')]);
    c.actions.commit([{ prop: 'width', value: '200px' }]);
    // The Sandbox rebuilds after a recorded change: new table, new hash.
    const next = practiceContent(snap, studio.getState().work.applied, 'index.html')!;
    const rebuilt = buildStaticPreview({ entryPath: 'index.html', effective: () => next, loaded: new Set(['index.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' });
    if (!rebuilt.ok) throw new Error('x');
    info.setState({ ...info.getState(), elements: rebuilt.elements, tableHash: hashText(next), buildId: 2 });
    c.actions.commit([{ prop: 'height', value: '40px' }]);
    const s = studio.getState();
    expect(s.work.applied).toHaveLength(1);
    expect(practiceContent(snap, s.work.applied, 'index.html')).toContain('style="width: 200px; height: 40px"');
    const u = runCommand(s, { name: 'undo' }, { now: 8, mode: 'self_editing', newId: () => 'z' }).state;
    expect(practiceContent(snap, u.work.applied, 'index.html')).toBe(content('index.html'));
  });
  it('a stale table makes the change Preview Only with the fixed reason', () => {
    const { studio, info, c } = setup();
    info.setState({ ...info.getState(), tableHash: 'deadbeef' });
    c.actions.select([key('button')]);
    const r = c.actions.commit([{ prop: 'width', value: '200px' }]);
    expect(r.previewOnly).toBe(1);
    expect(studio.getState().edit.previewOnly).toEqual([{ elementKey: key('button'), scope: 'index.html', property: 'width', value: '200px', reason: 'The page changed after the preview was built; reload the preview.' }]);
    expect(studio.getState().work.applied).toEqual([]);
  });
  it('in the workbench every change is Preview Only with the picture reason', () => {
    const { studio, c } = setup('workbench');
    c.actions.select([key('button')]);
    c.actions.commit([{ prop: 'color', value: '#112233' }]);
    expect(studio.getState().edit.previewOnly[0]!.reason).toBe('This element comes from a component picture, which is approximate.');
    expect(studio.getState().edit.previewOnly[0]!.scope).toBe('App');
  });
  it('several selected elements in one file make one History entry', () => {
    const { studio, c } = setup();
    c.actions.select([key('p', 1), key('p', 2)]);
    c.actions.commit([{ prop: 'font-size', value: '18px' }]);
    const s = studio.getState();
    expect(s.work.applied).toHaveLength(1);
    const text = practiceContent(snap, s.work.applied, 'index.html')!;
    expect(text.match(/style="font-size: 18px"/g)).toHaveLength(2);
  });
  it('re-checks layout 300 ms after a change and logs a changed count', async () => {
    const { studio, c, timers, recheck } = setup();
    c.actions.select([key('button')]);
    c.actions.commit([{ prop: 'width', value: '200px' }]);
    timers.at(-1)!();
    await Promise.resolve(); await Promise.resolve();
    expect(recheck).toHaveBeenCalledTimes(1);
    recheck.mockResolvedValueOnce(1);
    c.actions.commit([{ prop: 'height', value: '30px' }]);
    timers.at(-1)!();
    await Promise.resolve(); await Promise.resolve();
    expect(studio.getState().log.at(-1)!.message).toBe('Layout check: 1 findings (was 2).');
  });
  it('Try a fix adds a suggestion; Keep commits it; Discard removes it', () => {
    const { studio, c } = setup();
    const f = { id: 'x', skillId: 'scan.frontend.layout-overflow', primary: 'frontend' as const, areas: ['frontend' as const], severity: 'medium' as const, certainty: 'found' as const, fix: 'guided' as const, path: 'index.html', firstLine: 12, lastLine: 12, snippet: [], extra: 'Text is wider than its box: content 3 px in a box 2 px wide, measured at 375 px wide preview' };
    c.actions.tryFix(f);
    expect(studio.getState().edit.suggestions).toMatchObject([{ elementKey: key('p', 1), property: 'overflow-wrap', value: 'anywhere' }]);
    c.actions.keepSuggestion(key('p', 1), 'overflow-wrap');
    expect(studio.getState().edit.suggestions).toEqual([]);
    expect(practiceContent(snap, studio.getState().work.applied, 'index.html')).toContain('<p style="overflow-wrap: anywhere">Fresh bread');
    c.actions.tryFix({ ...f, firstLine: 14 });
    c.actions.discardSuggestion(key('p', 2), 'overflow-wrap');
    expect(studio.getState().edit.suggestions).toEqual([]);
  });
  it('the edit state is cleared with the snapshot and dispose stops everything', () => {
    const { studio, c } = setup();
    c.actions.select([key('button')]);
    studio.update((s) => reset(s));
    expect(studio.getState().edit.selection).toEqual([]);
    c.dispose();
    c.actions.select([key('button')]);
    expect(studio.getState().edit.selection).toEqual([]);
  });
});

describe('Edit pad components', () => {
  const noop = () => undefined;
  it('the 2B panel text stays without the pad', () => {
    const m = renderToStaticMarkup(createElement(EditPanel, { mode: 'self_editing' }));
    expect(m).toContain('Editing tools arrive in sub-phase 2E.');
  });
  it('tools, selection details, Preview Only list, and the layout block', () => {
    const tools = renderToStaticMarkup(createElement(EditTools, { tool: 'lasso', disabled: false, onTool: noop, elements: [], onPick: noop }));
    expect(tools).toMatch(/aria-pressed="true"[^>]*>Lasso/);
    expect(tools).toContain('Pick from list');
    expect(renderToStaticMarkup(createElement(SelectionInfo, { selected: [], mappedCount: 0, describe: () => ({ mapped: true, attrs: '' }) }))).toContain('Select something in the preview to edit it.');
    const el = { id: 0, path: 'index.html', tag: 'button', line: 13, col: 1, startOffset: 0, endOffset: 1, endLine: 13, key: 'k' };
    expect(renderToStaticMarkup(createElement(SelectionInfo, { selected: [el], mappedCount: 1, describe: () => ({ mapped: true, attrs: '#order' }) }))).toContain('Writes to index.html, line 13.');
    expect(renderToStaticMarkup(createElement(SelectionInfo, { selected: [el], mappedCount: 0, describe: () => ({ mapped: false, reason: 'R', attrs: '' }) }))).toContain('Preview Only: R');
    const po = renderToStaticMarkup(createElement(PreviewOnlyList, { items: [{ elementKey: 'gone', scope: 's', property: 'width', value: '1px', reason: 'r' }], suggestions: [], existing: new Set<string>(), onRemove: noop, onRemoveAll: noop, onKeep: noop, onDiscard: noop }));
    expect(po).toContain('element not found');
    expect(po).toContain('Remove all');
    expect(renderToStaticMarkup(createElement(LayoutFixList, { findings: [], isWorkbench: true, status: '', canCheck: false, onCheck: noop, onCheckAll: noop, onTry: noop }))).toContain('Layout checks run on real pages, not on approximate pictures.');
  });
  it('the property form has the seven groups, labelled fields with units and ranges, and no free-form CSS field', () => {
    const m = renderToStaticMarkup(createElement(PropertyForm, { disabled: false, onCommit: noop, onResetGroup: noop }));
    for (const g of ['Size', 'Corners', 'Spacing', 'Border', 'Shadow', 'Text', 'Background']) expect(m).toContain(`<summary>${g}</summary>`);
    expect(m).toContain('Width (px, 0 to 5000)');
    expect(m).toContain('Font size (px, 6 to 200)');
    expect(m).not.toMatch(/type="text"/);
    expect(m).toContain('type="color"');
  });
  it('static rules: no innerHTML or eval in the edit code; only setProperty/removeProperty write the preview', () => {
    for (const f of ['src/edit/previewEditDom.ts', 'src/hooks/useEditPad.ts', 'src/components/EditOverlay.tsx', 'src/components/EditPads.tsx', 'src/components/EditPanel.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|dangerouslySetInnerHTML/);
    }
    const dom = readFileSync('src/edit/previewEditDom.ts', 'utf8');
    expect(dom.match(/\.style\.(\w+)\(/g)?.sort()).toEqual(['.style.removeProperty(', '.style.setProperty(']);
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('/* @node: F8.7'));
    expect(block).not.toMatch(/transition|animation|rgb|hsl/);
    for (const col of block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(['#000', '#fff']).toContain(col.toLowerCase());
  });
});
