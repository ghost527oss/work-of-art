// @node: F5.9
// The understanding controller: re-run and cancel, label corrections, and saving them.
// Loading runs use analyzeProject directly through the ingestion services, not through here.
import { useEffect, useMemo, useRef } from 'react';
import { analyzeProject, type AnalyzeOptions } from '../engine/analyzeProject';
import type { AnalysisResult, Label } from '../engine/understandTypes';
import { clearCorrectionsSlot, saveCorrections } from '../store/correctionsStorage';
import { browserStorage, type KeyValueStorage } from '../store/layoutStorage';
import {
  beginUnderstanding, cancelUnderstanding, clearCorrections, completeUnderstanding, failUnderstanding,
  progressUnderstanding, removeCorrection, setCorrection,
} from '../store/understandingActions';
import { studioStore, type Store, type StudioState } from '../store/useStudioStore';
import type { RepoSnapshot } from '../types/contracts';

export interface UnderstandingServices {
  storage: KeyValueStorage | undefined;
  now(): number;
  analyze(snapshot: RepoSnapshot, options: AnalyzeOptions): Promise<AnalysisResult>;
  yieldToMain?: () => Promise<void>;
}

export interface UnderstandingActions {
  run(): void;
  cancel(): void;
  /** Returns the refusal message, or null when accepted. */
  setLabels(path: string, labels: readonly Label[]): string | null;
  removeCorrection(path: string): void;
  clearCorrections(): void;
}

export interface UnderstandingController {
  actions: UnderstandingActions;
  dispose(): void;
}

export function createUnderstandingController(studio: Store<StudioState> = studioStore, services: UnderstandingServices): UnderstandingController {
  let disposed = false;
  let abort: AbortController | null = null;
  let lastSnapshot = studio.getState().snapshot;
  let lastCorrections = studio.getState().understanding.corrections;
  let clearing = false;

  const unsub = studio.subscribe(() => {
    if (disposed) return;
    const s = studio.getState();
    const snapshotChanged = s.snapshot !== lastSnapshot;
    if (snapshotChanged) {
      abort?.abort();
      abort = null;
    }
    const corr = s.understanding.corrections;
    if (corr !== lastCorrections) {
      // Loading a snapshot only updates what we last saw; it never writes (the slot of another repository stays).
      if (!snapshotChanged && s.snapshot) {
        if (clearing) clearCorrectionsSlot(services.storage);
        else saveCorrections(services.storage, s.snapshot, corr, services.now());
      }
      lastCorrections = corr;
    }
    lastSnapshot = s.snapshot;
  });

  const actions: UnderstandingActions = {
    run() {
      const s = studio.getState();
      if (disposed || !s.snapshot || s.understanding.status === 'running') return;
      const snapshot = s.snapshot;
      studio.update((st) => beginUnderstanding(st, services.now()));
      const runId = studio.getState().understanding.runId;
      const controller = new AbortController();
      abort = controller;
      void (async () => {
        try {
          const result = await services.analyze(snapshot, {
            signal: controller.signal,
            yieldToMain: services.yieldToMain,
            onProgress: (p) => { if (!controller.signal.aborted) studio.update((st) => progressUnderstanding(st, runId, p.done, p.total)); },
          });
          if (controller.signal.aborted || disposed) return;
          studio.update((st) => completeUnderstanding(st, runId, result, services.now()));
        } catch (error) {
          if (controller.signal.aborted || disposed || (error instanceof Error && error.name === 'AbortError')) return;
          studio.update((st) => failUnderstanding(st, runId, 'The analysis could not finish.', services.now()));
        } finally {
          if (abort === controller) abort = null;
        }
      })();
    },
    cancel() {
      if (disposed) return;
      abort?.abort();
      abort = null;
      studio.update((st) => cancelUnderstanding(st, services.now()));
    },
    setLabels(path, labels) {
      if (disposed) return null;
      let error: string | null = null;
      studio.update((st) => {
        const r = setCorrection(st, path, labels, services.now());
        error = r.error;
        return r.state;
      });
      return error;
    },
    removeCorrection(path) {
      if (!disposed) studio.update((st) => removeCorrection(st, path, services.now()));
    },
    clearCorrections() {
      if (disposed) return;
      clearing = true;
      try {
        studio.update((st) => clearCorrections(st, services.now()));
      } finally {
        clearing = false;
      }
    },
  };

  return {
    actions,
    dispose() {
      disposed = true;
      abort?.abort();
      abort = null;
      unsub();
    },
  };
}

export function useUnderstanding(): UnderstandingActions {
  const ref = useRef<UnderstandingController | null>(null);
  const actions = useMemo<UnderstandingActions>(
    () => ({
      run: () => ref.current?.actions.run(),
      cancel: () => ref.current?.actions.cancel(),
      setLabels: (p, l) => ref.current?.actions.setLabels(p, l) ?? null,
      removeCorrection: (p) => ref.current?.actions.removeCorrection(p),
      clearCorrections: () => ref.current?.actions.clearCorrections(),
    }),
    [],
  );
  useEffect(() => {
    const c = createUnderstandingController(studioStore, { storage: browserStorage(), now: () => Date.now(), analyze: analyzeProject });
    ref.current = c;
    return () => {
      c.dispose();
      if (ref.current === c) ref.current = null;
    };
  }, []);
  return actions;
}
