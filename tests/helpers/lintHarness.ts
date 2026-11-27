// @node: F12.13
// A store-level harness for the 3B-1 gate: the real preview controller, the real recipe controller, and a "panel" that
// rebuilds the page from the practice copy and measures it with a fake measuring function (no browser needed).
import { vi } from 'vitest';
import { previewInfoStore, type PreviewInfo } from '../../src/edit/previewHandle';
import { hashText } from '../../src/engine/diffApply';
import { practiceContent } from '../../src/engine/practiceScript';
import { createPreviewController, type LayoutRunner } from '../../src/hooks/usePreview';
import { createRecipeController, FULL_WIDTHS } from '../../src/hooks/useRecipe';
import type { Measurement } from '../../src/preview/layoutCheck';
import { buildStaticPreview, type ElementEntry, type StaticInput } from '../../src/preview/previewDocument';
import { createStore, initialState, type Store, type StudioState } from '../../src/store/useStudioStore';
import type { RepoSnapshot } from '../../src/types/contracts';
import { snapshotOf } from './analyzeFixture';

export interface GateOptions {
  html: string;
  /** Plain measurements for the page as it is now (the harness calls this after every rebuild). */
  measure: (content: string, elements: readonly ElementEntry[]) => Measurement[];
  snapshot?: RepoSnapshot;
  media?: StaticInput['media'];
}

export function createGate(o: GateOptions) {
  const snapshot = o.snapshot ?? snapshotOf({ 'index.html': o.html });
  const store: Store<StudioState> = createStore<StudioState>({ ...initialState(), experience: 'studio', snapshot });
  const info: Store<PreviewInfo> = createStore<PreviewInfo>({ ...previewInfoStore.getState(), mode: 'static', editable: true, ready: true });
  let now = 10_000;
  let n = 0;
  const timers: Array<() => void> = [];
  const content = () => practiceContent(store.getState().snapshot!, store.getState().work.applied, 'index.html')!;
  const build = () => {
    const html = content();
    const r = buildStaticPreview({ entryPath: 'index.html', effective: (p) => practiceContent(store.getState().snapshot!, store.getState().work.applied, p), loaded: new Set(['index.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a', ...(o.media ? { media: o.media } : {}) });
    if (!r.ok) throw new Error(r.reason);
    info.setState({ ...info.getState(), elements: r.elements, tableHash: hashText(html), editable: true, ready: true });
    return r;
  };
  const contentKey = () => hashText(store.getState().work.applied.map((a) => a.id).join(','));
  const preview = createPreviewController(store, {
    now: () => now++, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => undefined, raf: async () => undefined, addMessageListener: () => () => undefined,
  });
  const recipe = createRecipeController(store, info, { now: () => now++, newId: () => `id-${++n}`, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => undefined });
  const runner = (): LayoutRunner => {
    const b = build();
    return { setWidth: vi.fn(), restore: vi.fn(), elements: b.elements, contentKey: contentKey(), measure: () => ({ measurements: o.measure(content(), b.elements), docScrollWidth: 375 }) };
  };
  // The panel: when the content changes it drops the old result, and while a recipe is measuring it runs the three-width check.
  let lastKey = contentKey();
  store.subscribe(() => {
    const k = contentKey();
    if (k !== lastKey) { lastKey = k; preview.actions.markContent(k); }
    const s = store.getState();
    if (s.preview.recipe?.status === 'measuring' && s.preview.layout.status === 'idle') void preview.actions.checkLayout(runner(), FULL_WIDTHS, () => contentKey());
  });
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
  return {
    store, info, preview, recipe, timers, content, build, settle,
    /** Opens the page: static preview, ready, then the Full check at three widths. */
    async open() { preview.actions.init(); store.update((s) => ({ ...s, preview: { ...s.preview, mode: 'static', entryPath: 'index.html', status: 'ready' } })); build(); await preview.actions.checkLayout(runner(), FULL_WIDTHS, () => contentKey()); },
    layout: () => store.getState().preview.layout,
    dispose() { recipe.dispose(); preview.dispose(); },
  };
}
