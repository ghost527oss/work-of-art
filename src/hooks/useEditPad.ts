// @node: F8.6
// The Edit pad controller: selection, live updates, the commit pipeline (mapped -> History, else Preview Only),
// and the layout re-check after changes. Pointer handling lives in EditOverlay and calls these actions.
import { useEffect, useMemo, useRef } from 'react';
import { EDIT_LIMITS as L } from '../config/editLimits';
import { hashText } from '../engine/diffApply';
import { practiceContent } from '../engine/practiceScript';
import { mapElement, REASONS, rewriteStartTag } from '../edit/elementMap';
import { previewHandle, previewInfoStore, type PreviewInfo } from '../edit/previewHandle';
import { applyLiveStyle, getScroll, removeLiveStyle } from '../edit/previewEditDom';
import type { StyleDeclaration } from '../edit/styleModel';
import { suggestFix } from '../edit/suggestions';
import { addPreviewOnly, addSuggestion, clearSelection, dropSuggestion, removePreviewOnly, selectKeys, setReply, setTool } from '../store/editActions';
import type { EditTool, PreviewOnlyChange } from '../store/editSlice';
import { applyUserEdit } from '../store/workActions';
import { studioStore, withLog, type Store, type StudioState } from '../store/useStudioStore';
import type { Finding } from '../engine/scanFindingTypes';
import type { ElementEntry } from '../preview/previewDocument';

export interface EditServices {
  now(): number;
  newId(): string;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
  doc(): Document | null;
  /** Runs the layout check now; resolves with the count of layout findings (null when not possible). */
  recheck(): Promise<number | null>;
}

export interface CommitResult { recorded: number; previewOnly: number; reasons: string[] }

export interface EditActions {
  setTool(t: EditTool): void;
  select(keys: string[], mode?: 'replace' | 'toggle'): void;
  clear(): void;
  /** Applies declarations live (no recording), e.g. while dragging. */
  live(decls: StyleDeclaration[]): void;
  /** Commits declarations for the whole selection. */
  commit(decls: StyleDeclaration[]): CommitResult;
  cancelLive(props: string[]): void;
  removePreviewOnly(match: (c: PreviewOnlyChange) => boolean): void;
  tryFix(finding: Finding): void;
  keepSuggestion(elementKey: string, property: string): void;
  discardSuggestion(elementKey: string, property: string): void;
  setReply(text: string): void;
}

export interface EditController { actions: EditActions; dispose(): void }

const recordable = (info: PreviewInfo) => info.mode === 'static' && info.path !== undefined;

export function createEditController(studio: Store<StudioState> = studioStore, info: Store<PreviewInfo> = previewInfoStore, services: EditServices): EditController {
  let disposed = false;
  let timer: unknown = null;
  let lastCount: number | null = null;
  let lastSnapshot = studio.getState().snapshot;
  const unsub = studio.subscribe(() => {
    const s = studio.getState();
    if (s.snapshot !== lastSnapshot) { lastSnapshot = s.snapshot; if (timer !== null) services.clearTimer(timer); timer = null; lastCount = null; }
  });

  const entriesFor = (keys: readonly string[]): ElementEntry[] => {
    const els = info.getState().elements;
    return keys.map((k) => els.find((e) => e.key === k)).filter((e): e is ElementEntry => !!e);
  };

  function scheduleRecheck(tries = 0): void {
    if (disposed) return;
    if (tries === 0 && lastCount === null) {
      const l = studio.getState().preview.layout;
      if (l.status === 'done') lastCount = l.findings.length;
    }
    if (timer !== null) services.clearTimer(timer);
    timer = services.setTimer(() => {
      timer = null;
      void services.recheck().then((n) => {
        if (disposed) return;
        // The preview may still be reloading after the change: try again a few times.
        if (n === null) { if (tries < 5) scheduleRecheck(tries + 1); return; }
        if (lastCount !== null && n !== lastCount) {
          const was = lastCount;
          studio.update((s) => ({ ...s, ...withLog(s, services.now(), { action: 'layout_recheck', status: 'info', message: `Layout check: ${n} findings (was ${was}).` }) }));
        }
        lastCount = n;
      });
    }, L.recheckMs);
  }

  const actions: EditActions = {
    setTool(t) { if (!disposed) studio.update((s) => setTool(s, t)); },
    select(keys, mode = 'replace') {
      if (disposed) return;
      const known = new Set(info.getState().elements.map((e) => e.key));
      studio.update((s) => selectKeys(s, keys.filter((k) => known.has(k)), mode));
    },
    clear() { if (!disposed) studio.update((s) => clearSelection(s)); },
    live(decls) {
      const doc = services.doc();
      if (disposed || !doc) return;
      for (const e of entriesFor(studio.getState().edit.selection)) applyLiveStyle(doc, e.id, decls);
    },
    cancelLive(props) {
      const doc = services.doc();
      if (!doc) return;
      for (const e of entriesFor(studio.getState().edit.selection)) removeLiveStyle(doc, e.id, props);
    },
    commit(decls) {
      const result: CommitResult = { recorded: 0, previewOnly: 0, reasons: [] };
      if (disposed || decls.length === 0) return result;
      const s0 = studio.getState();
      const i = info.getState();
      const sel = entriesFor(s0.edit.selection);
      if (sel.length === 0 || !s0.snapshot) return result;
      actions.live(decls);
      const doc = services.doc();
      if (doc?.defaultView) previewHandle.pendingScroll = getScroll(doc.defaultView);
      const previewOnly: PreviewOnlyChange[] = [];
      const toPreview = (e: ElementEntry, reason: string) => { for (const d of decls) previewOnly.push({ elementKey: e.key!, scope: i.scope, property: d.prop, value: d.value, reason }); result.reasons.push(reason); };
      const mapped: ElementEntry[] = [];
      for (const e of sel) {
        if (!recordable(i)) { toPreview(e, e.reason ?? REASONS.picture); continue; }
        const content = practiceContent(s0.snapshot, s0.work.applied, e.path);
        const m = mapElement(e, content, i.tableHash);
        if (!m.ok) toPreview(e, m.reason); else mapped.push(e);
      }
      if (mapped.length > 0) {
        const path = mapped[0]!.path;
        const base = practiceContent(s0.snapshot, s0.work.applied, path)!;
        let text: string | null = base;
        for (const e of [...mapped].sort((a, b) => b.startOffset - a.startOffset)) { text = text === null ? null : rewriteStartTag(text, e, decls); }
        if (text === null) for (const e of mapped) toPreview(e, REASONS.changed);
        else if (text !== base) {
          const first = mapped[0]!;
          const editKey = `edit:${path}:${hashText(mapped.map((e) => e.key).sort().join(','))}`;
          const title = `Style: ${first.tag} at ${path}:${first.line} (${decls.map((d) => d.prop).join(', ')})`;
          let reason: string | undefined;
          studio.update((s) => {
            const r = applyUserEdit(s, { path, baseHash: hashText(base), newContent: text!, editKey, title }, { now: services.now(), mode: 'self_editing', newId: services.newId });
            reason = r.recorded ? undefined : r.reason;
            return r.state;
          });
          if (reason) for (const e of mapped) toPreview(e, reason);
          else {
            result.recorded = mapped.length;
            const keys = new Set(mapped.map((e) => e.key));
            const props = new Set(decls.map((d) => d.prop));
            studio.update((s) => removePreviewOnly(s, (c) => keys.has(c.elementKey) && props.has(c.property)));
          }
        }
      }
      if (previewOnly.length > 0) { result.previewOnly = previewOnly.length; studio.update((s) => addPreviewOnly(s, previewOnly, services.now())); }
      scheduleRecheck();
      return result;
    },
    removePreviewOnly(match) {
      if (disposed) return;
      const doc = services.doc();
      const gone = studio.getState().edit.previewOnly.filter(match);
      if (doc) for (const c of gone) { const e = entriesFor([c.elementKey])[0]; if (e) removeLiveStyle(doc, e.id, [c.property]); }
      studio.update((s) => removePreviewOnly(s, match));
      scheduleRecheck();
    },
    tryFix(finding) {
      if (disposed) return;
      const decl = suggestFix(finding.extra);
      const i = info.getState();
      const el = i.elements.find((e) => e.path === finding.path && e.line === finding.firstLine);
      if (!decl || !el?.key) return;
      const doc = services.doc();
      if (doc) applyLiveStyle(doc, el.id, [decl]);
      studio.update((s) => addSuggestion(s, { elementKey: el.key!, scope: i.scope, property: decl.prop, value: decl.value, reason: 'Suggested fix', suggested: true }));
      scheduleRecheck();
    },
    keepSuggestion(elementKey, property) {
      const sug = studio.getState().edit.suggestions.find((x) => x.elementKey === elementKey && x.property === property);
      if (!sug) return;
      const before = studio.getState().edit.selection;
      studio.update((s) => dropSuggestion(selectKeys(s, [elementKey]), elementKey, property));
      actions.commit([{ prop: sug.property, value: sug.value }]);
      studio.update((s) => selectKeys(s, before));
    },
    discardSuggestion(elementKey, property) {
      const doc = services.doc();
      const e = entriesFor([elementKey])[0];
      if (doc && e) removeLiveStyle(doc, e.id, [property]);
      studio.update((s) => dropSuggestion(s, elementKey, property));
      scheduleRecheck();
    },
    setReply(text) { if (!disposed) studio.update((s) => setReply(s, text)); },
  };

  return {
    actions,
    dispose() {
      disposed = true;
      if (timer !== null) services.clearTimer(timer);
      timer = null;
      unsub();
    },
  };
}

let n = 0;
export function useEditPad(): EditActions {
  const ref = useRef<EditController | null>(null);
  const actions = useMemo<EditActions>(() => ({
    setTool: (t) => ref.current?.actions.setTool(t),
    select: (k, m) => ref.current?.actions.select(k, m),
    clear: () => ref.current?.actions.clear(),
    live: (d) => ref.current?.actions.live(d),
    commit: (d) => ref.current?.actions.commit(d) ?? { recorded: 0, previewOnly: 0, reasons: [] },
    cancelLive: (p) => ref.current?.actions.cancelLive(p),
    removePreviewOnly: (m) => ref.current?.actions.removePreviewOnly(m),
    tryFix: (f) => ref.current?.actions.tryFix(f),
    keepSuggestion: (k, p) => ref.current?.actions.keepSuggestion(k, p),
    discardSuggestion: (k, p) => ref.current?.actions.discardSuggestion(k, p),
    setReply: (t) => ref.current?.actions.setReply(t),
  }), []);
  useEffect(() => {
    const c = createEditController(studioStore, previewInfoStore, {
      now: () => Date.now(),
      newId: () => `e-${Date.now().toString(36)}-${++n}`,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      doc: () => previewHandle.frame?.contentDocument ?? null,
      recheck: () => previewHandle.recheck?.() ?? Promise.resolve(null),
    });
    ref.current = c;
    return () => { c.dispose(); if (ref.current === c) ref.current = null; };
  }, []);
  return actions;
}
