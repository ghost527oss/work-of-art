// @node: F12.12
// The recipe controller: applies a recipe to the practice copy, waits for the three-width check of the rebuilt page, and
// keeps the change only when the problem is gone and nothing new appeared. Otherwise it undoes it with the existing Undo.
// The panel's own effect runs the check; this controller only watches the store.
import { useEffect, useMemo, useRef } from 'react';
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { previewInfoStore, type PreviewInfo } from '../edit/previewHandle';
import { practiceContent } from '../engine/practiceScript';
import type { Finding } from '../engine/scanFindingTypes';
import { problemKey, recipeFor, type RecipeOffer } from '../preview/recipes';
import { setRecipeState } from '../store/previewActions';
import { applyUserEdit, runCommand } from '../store/workActions';
import { studioStore, withLog, type Store, type StudioState } from '../store/useStudioStore';

export interface RecipeServices {
  now(): number;
  newId(): string;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface RecipeActions {
  /** Starts a recipe for a finding of the latest three-width check. Ignored while another recipe is running. */
  start(findingId: string): void;
}

export interface RecipeController { actions: RecipeActions; dispose(): void }

export const FULL_WIDTHS = [375, 768, 1024];
export const NEED_FULL_CHECK = 'Run "Check at all widths" first, so PatchBay can compare before and after.';

const WHY = {
  still: 'the problem was still there', newer: 'a new problem appeared', unfinished: 'the check did not finish', slow: 'the check ran out of time',
  changed: 'the page changed', closed: 'the Edit panel was closed', widths: 'the check did not cover all three widths',
} as const;

interface Active { id: string; target: string; before: Set<string>; oldKey: string; path: string; timer: unknown }

/** What a finding's recipe would do right now (for the button state). Pure over the store and the preview info. */
export function offerFor(state: StudioState, info: PreviewInfo, f: Finding, key = 'preview'): RecipeOffer {
  if (state.preview.mode !== 'static' || state.preview.scripts) return { ok: false, reason: 'Recipes work on the look-only page preview.' };
  if (!info.editable) return { ok: false, reason: 'Editing starts when the preview is ready.' };
  const content = state.snapshot ? practiceContent(state.snapshot, state.work.applied, f.path) : undefined;
  return recipeFor(f, info.elements, content, info.tableHash, key);
}

export function createRecipeController(studio: Store<StudioState> = studioStore, info: Store<PreviewInfo> = previewInfoStore, services: RecipeServices): RecipeController {
  let disposed = false;
  let active: Active | null = null;
  const ctx = () => ({ now: services.now(), mode: 'self_editing' as const, newId: services.newId });
  const log = (action: string, status: 'applied' | 'verified' | 'undone' | 'rejected', message: string, path: string) =>
    studio.update((s) => ({ ...s, ...withLog(s, services.now(), { action, status, message, affectedPaths: [path] }) }));
  const stop = () => { if (active) services.clearTimer(active.timer); active = null; };

  const refuse = (message: string, targetId?: string) => studio.update((s) => setRecipeState(s, { status: 'refused', message, ...(targetId ? { targetId } : {}) }));

  /** Undoes the recipe's own change, and only that one. */
  const undo = (why: string): void => {
    const a = active;
    if (!a) return;
    stop();
    const last = studio.getState().work.applied.at(-1);
    if (!last || last.id !== a.id) {
      studio.update((s) => setRecipeState(s, { status: 'refused', message: `It was not undone because another change was made after it (${why}).` }));
      return;
    }
    studio.update((s) => runCommand(s, { name: 'undo' }, ctx()).state);
    const still = studio.getState().work.applied.some((e) => e.id === a.id);
    if (still) { studio.update((s) => setRecipeState(s, { status: 'refused', message: `The change could not be undone (${why}).` })); return; }
    log('recipe_undone', 'undone', 'Recipe undone.', a.path);
    studio.update((s) => setRecipeState(s, { status: 'undone', message: `The recipe was undone: ${why}.` }));
  };

  const keep = (): void => {
    const a = active;
    if (!a) return;
    stop();
    log('recipe_kept', 'verified', 'Recipe kept: the problem is gone at three widths and nothing new appeared.', a.path);
    studio.update((s) => setRecipeState(s, { status: 'kept', message: 'The recipe was kept: the problem is gone at all three widths and nothing new appeared.' }));
  };

  const onChange = (): void => {
    if (disposed || !active) return;
    const s = studio.getState();
    const a = active;
    if (s.work.applied.at(-1)?.id !== a.id) { stop(); studio.update((x) => setRecipeState(x, { status: 'refused', message: 'Another change was made while the page was measured, so the recipe was not checked.' })); return; }
    const l = s.preview.layout;
    if (l.status === 'stopped') { undo(l.message?.includes('changed') ? WHY.changed : WHY.unfinished); return; }
    if (l.status !== 'done' || l.contentKey === a.oldKey) return; // still the old result, or running
    if (FULL_WIDTHS.some((w) => !l.widths.includes(w))) { undo(WHY.widths); return; }
    const after = new Set(l.findings.map(problemKey));
    if (after.has(a.target)) { undo(WHY.still); return; }
    for (const k of after) if (!a.before.has(k)) { undo(WHY.newer); return; }
    keep();
  };
  const unsub = studio.subscribe(onChange);

  const actions: RecipeActions = {
    start(findingId) {
      if (disposed) return;
      const s0 = studio.getState();
      const busy = s0.preview.recipe?.status;
      if (active || busy === 'applying' || busy === 'measuring') return;
      const l = s0.preview.layout;
      if (s0.preview.mode !== 'static' || s0.preview.scripts || l.status !== 'done') { refuse('Run the layout check first.', findingId); return; }
      if (FULL_WIDTHS.some((w) => !l.widths.includes(w))) { refuse(NEED_FULL_CHECK, findingId); return; }
      const f = l.findings.find((x) => x.id === findingId);
      if (!f) { refuse('That finding is no longer in the latest check.', findingId); return; }
      const offer = offerFor(s0, info.getState(), f, services.newId());
      if (!offer.ok) { refuse(offer.reason, findingId); return; }
      studio.update((s) => setRecipeState(s, { status: 'applying', message: 'Applying the recipe...', targetId: findingId }));
      let recorded = false;
      let reason: string | undefined;
      studio.update((s) => { const r = applyUserEdit(s, offer.edit, ctx()); recorded = r.recorded; reason = r.reason; return r.state; });
      if (!recorded) { refuse(reason ?? 'The change could not be recorded.', findingId); return; }
      const id = studio.getState().work.applied.at(-1)?.id;
      if (!id) { refuse('The change could not be recorded.', findingId); return; }
      log('recipe_applied', 'applied', 'Recipe applied.', offer.edit.path);
      active = { id, target: problemKey(f), before: new Set(l.findings.map(problemKey)), oldKey: l.contentKey, path: offer.edit.path, timer: null };
      active.timer = services.setTimer(() => { if (active) undo(WHY.slow); }, L.recipeTimeoutMs);
      studio.update((s) => setRecipeState(s, { status: 'measuring', message: 'Measuring the page again at 375, 768, and 1024 px...', targetId: findingId }));
      onChange();
    },
  };

  return {
    actions,
    dispose() {
      if (disposed) return;
      if (active) undo(WHY.closed);
      disposed = true;
      stop();
      unsub();
    },
  };
}

let seq = 0;
export function useRecipe(): RecipeActions {
  const ref = useRef<RecipeController | null>(null);
  const actions = useMemo<RecipeActions>(() => ({ start: (id) => ref.current?.actions.start(id) }), []);
  useEffect(() => {
    const c = createRecipeController(studioStore, previewInfoStore, {
      now: () => Date.now(),
      newId: () => `r-${Date.now().toString(36)}-${++seq}`,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
    ref.current = c;
    return () => { c.dispose(); if (ref.current === c) ref.current = null; };
  }, []);
  return actions;
}
