// @node: F7.9
// The preview controller: mode and width changes, the scripts switch, the bridge listener (only while scripts are on),
// and the layout-check runner with its timer. Everything from the preview is untrusted data.
import { useEffect, useMemo, useRef } from 'react';
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import type { Finding } from '../engine/scanFindingTypes';
import { practiceContent } from '../engine/practiceScript';
import { detectPreviewMode, modeChoices, type PreviewMode } from '../preview/previewMode';
import { RateLimiter, validateBridgeEvent, type BridgeEvent } from '../preview/previewBridge';
import { evaluateOverflow, layoutFindings, type Measurement, type OverflowResult } from '../preview/layoutCheck';
import type { ElementEntry } from '../preview/previewDocument';
import {
  addConsoleLine, beginLayout, countInvalid, discardLayout, finishLayout, initPreview, resetPreview, setPreviewComponent, setPreviewMode, setPreviewScripts,
  setPreviewStatus, setPreviewWidth, stopLayout,
} from '../store/previewActions';
import type { PreviewWidth } from '../store/previewSlice';
import { studioStore, type Store, type StudioState } from '../store/useStudioStore';

export interface LayoutRunner {
  setWidth(px: number): void;
  restore(): void;
  measure(): { measurements: Measurement[]; docScrollWidth: number } | null;
  elements: readonly ElementEntry[];
  contentKey: string;
}

export interface PreviewServices {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Resolves after the next animation frame. */
  raf(): Promise<void>;
  addMessageListener(fn: (event: BridgeEvent) => void): () => void;
}

export interface PreviewActions {
  init(): void;
  setMode(mode: PreviewMode): void;
  setWidth(width: PreviewWidth): void;
  setComponent(key: string): void;
  setScripts(on: boolean): void;
  /** Starts listening for bridge messages from one iframe window with one nonce. */
  startBridge(source: unknown, nonce: string): void;
  stopBridge(): void;
  /** Called on every load event of the iframe with how many documents it has shown so far. */
  onFrameLoad(count: number): void;
  setBuilt(ok: boolean, notes: string[], error?: string): void;
  checkLayout(runner: LayoutRunner, widths: number[]): Promise<void>;
  markContent(key: string): void;
}

export interface PreviewController { actions: PreviewActions; dispose(): void }

const effectiveOf = (s: StudioState) => (p: string) => (s.snapshot ? practiceContent(s.snapshot, s.work.applied, p) : undefined);

export function createPreviewController(studio: Store<StudioState> = studioStore, services: PreviewServices): PreviewController {
  let disposed = false;
  let stopListener: (() => void) | null = null;
  let timer: unknown = null;
  let lastSnapshot = studio.getState().snapshot;
  const limiter = { current: new RateLimiter() };

  const clearTimer = () => { if (timer !== null) services.clearTimer(timer); timer = null; };
  const unsub = studio.subscribe(() => {
    if (disposed) return;
    const s = studio.getState();
    if (s.snapshot !== lastSnapshot) { lastSnapshot = s.snapshot; actions.stopBridge(); clearTimer(); }
  });

  const actions: PreviewActions = {
    init() {
      const s = studio.getState();
      if (disposed || !s.snapshot) return;
      const d = detectPreviewMode(s.snapshot, effectiveOf(s));
      studio.update((st) => initPreview(st, d.mode, d.reason, d.entryPath, services.now()));
    },
    setMode(mode) {
      const s = studio.getState();
      if (disposed || !s.snapshot) return;
      const d = detectPreviewMode(s.snapshot, effectiveOf(s));
      if (!modeChoices(d).includes(mode)) return;
      actions.stopBridge();
      studio.update((st) => setPreviewMode(st, mode, mode === d.mode ? d.reason : 'You chose this mode.', services.now()));
    },
    setWidth(width) {
      if (!disposed) studio.update((st) => setPreviewWidth(st, width));
    },
    setComponent(key) {
      if (!disposed) studio.update((st) => setPreviewComponent(st, key));
    },
    setScripts(on) {
      if (disposed) return;
      if (!on) actions.stopBridge();
      studio.update((st) => setPreviewScripts(st, on, services.now()));
    },
    startBridge(source, nonce) {
      if (disposed) return;
      actions.stopBridge();
      limiter.current = new RateLimiter();
      stopListener = services.addMessageListener((event) => {
        if (disposed) return;
        const r = validateBridgeEvent(event, { source, nonce });
        if (!r.ok || !limiter.current.allow(services.now())) { studio.update((st) => countInvalid(st)); return; }
        const m = r.message;
        if (m.type === 'ready') studio.update((st) => setPreviewStatus(st, 'ready', st.preview.notes));
        else if (m.type === 'console') studio.update((st) => addConsoleLine(st, m.level, m.text));
        else studio.update((st) => addConsoleLine(st, 'error', m.line ? `${m.message} (line ${m.line})` : m.message));
      });
    },
    stopBridge() {
      stopListener?.();
      stopListener = null;
    },
    onFrameLoad(count) {
      if (disposed) return;
      const s = studio.getState();
      if (count >= 2 && s.preview.scripts) { actions.stopBridge(); studio.update((st) => resetPreview(st, services.now())); }
      else if (!s.preview.scripts) studio.update((st) => setPreviewStatus(st, 'ready', st.preview.notes));
    },
    setBuilt(ok, notes, error) {
      if (disposed) return;
      studio.update((st) => setPreviewStatus(st, ok ? (st.preview.scripts ? 'building' : 'ready') : 'failed', notes, error));
    },
    markContent(key) {
      const s = studio.getState();
      if (!disposed && s.preview.layout.contentKey && s.preview.layout.contentKey !== key) studio.update((st) => discardLayout(st));
    },
    async checkLayout(runner, widths) {
      if (disposed) return;
      studio.update((st) => beginLayout(st, widths));
      if (studio.getState().preview.layout.status !== 'running') return;
      let stopped = false;
      clearTimer();
      timer = services.setTimer(() => { stopped = true; }, L.layoutMs);
      const results: OverflowResult[] = [];
      try {
        for (const w of widths) {
          if (stopped || disposed) break;
          runner.setWidth(w);
          await services.raf();
          await services.raf();
          const m = runner.measure();
          if (!m) { stopped = true; break; }
          results.push(...evaluateOverflow(m.measurements, w, m.docScrollWidth));
        }
      } catch {
        stopped = true;
      } finally {
        runner.restore();
        clearTimer();
      }
      if (disposed) return;
      if (stopped) { studio.update((st) => stopLayout(st, 'The layout check took too long and was stopped.')); return; }
      const s = studio.getState();
      const { findings, partialReasons } = layoutFindings(results, runner.elements, effectiveOf(s));
      studio.update((st) => finishLayout(st, findings as Finding[], runner.contentKey, partialReasons, services.now()));
    },
  };

  return {
    actions,
    dispose() {
      disposed = true;
      actions.stopBridge();
      clearTimer();
      unsub();
    },
  };
}

export function usePreview(): PreviewActions {
  const ref = useRef<PreviewController | null>(null);
  const actions = useMemo<PreviewActions>(
    () => ({
      init: () => ref.current?.actions.init(),
      setMode: (m) => ref.current?.actions.setMode(m),
      setWidth: (w) => ref.current?.actions.setWidth(w),
      setComponent: (k) => ref.current?.actions.setComponent(k),
      setScripts: (o) => ref.current?.actions.setScripts(o),
      startBridge: (s, n) => ref.current?.actions.startBridge(s, n),
      stopBridge: () => ref.current?.actions.stopBridge(),
      onFrameLoad: (c) => ref.current?.actions.onFrameLoad(c),
      setBuilt: (ok, notes, e) => ref.current?.actions.setBuilt(ok, notes, e),
      checkLayout: (r, w) => ref.current?.actions.checkLayout(r, w) ?? Promise.resolve(),
      markContent: (k) => ref.current?.actions.markContent(k),
    }),
    [],
  );
  useEffect(() => {
    const c = createPreviewController(studioStore, {
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      raf: () => new Promise<void>((r) => requestAnimationFrame(() => r())),
      addMessageListener: (fn) => {
        const handler = (e: MessageEvent) => fn({ source: e.source, origin: e.origin, data: e.data });
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
      },
    });
    ref.current = c;
    return () => {
      c.dispose();
      if (ref.current === c) ref.current = null;
    };
  }, []);
  return actions;
}
