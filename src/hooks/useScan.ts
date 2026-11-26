// @node: F6.9
// The scan controller: ensure (start a scan when the analysis is done), run again, and cancel.
import { useEffect, useMemo, useRef } from 'react';
import type { AnalysisResult } from '../engine/understandTypes';
import { scanProject, labelsKeyOf, type ScanInputs, type ScanOptions } from '../engine/scanProject';
import type { ScanResult } from '../engine/scanFindingTypes';
import { practiceContent } from '../engine/practiceScript';
import { isActive } from '../store/workSlice';
import { beginScan, cancelScan, completeScan, failScan, progressScan } from '../store/scanActions';
import { studioStore, type Store, type StudioState } from '../store/useStudioStore';

export interface ScanServices {
  now(): number;
  scan(inputs: ScanInputs, options: ScanOptions): Promise<ScanResult>;
  yieldToMain?: () => Promise<void>;
}

export interface ScanActions {
  /** Starts a scan when the analysis is done and no up-to-date scan exists or is running. */
  ensure(): void;
  /** Scans again. */
  run(): void;
  cancel(): void;
}

export interface ScanController {
  actions: ScanActions;
  dispose(): void;
}

/** True when the labels changed since the scan ran. */
export function isScanStale(state: StudioState): boolean {
  const r = state.scan.result;
  return !!r && r.labelsKey !== labelsKeyOf(state.understanding.corrections);
}

export function createScanController(studio: Store<StudioState> = studioStore, services: ScanServices): ScanController {
  let disposed = false;
  let abort: AbortController | null = null;
  let lastSnapshot = studio.getState().snapshot;

  const unsub = studio.subscribe(() => {
    if (disposed) return;
    const s = studio.getState();
    if (s.snapshot !== lastSnapshot) {
      abort?.abort();
      abort = null;
      lastSnapshot = s.snapshot;
    }
  });

  function start(): void {
    const s = studio.getState();
    if (disposed || !s.snapshot || s.understanding.status !== 'done' || !s.understanding.result || s.scan.status === 'running' || isActive(s.work.run) || s.work.proposal !== null) return;
    const snapshot = s.snapshot;
    const analysis: AnalysisResult = s.understanding.result;
    const corrections = s.understanding.corrections;
    studio.update((st) => beginScan(st, services.now()));
    const runId = studio.getState().scan.runId;
    const controller = new AbortController();
    abort = controller;
    void (async () => {
      try {
        const result = await services.scan(
          { snapshot, analysis, corrections, effective: (p) => practiceContent(snapshot, studio.getState().work.applied, p) },
          {
            signal: controller.signal,
            yieldToMain: services.yieldToMain,
            onProgress: (p) => { if (!controller.signal.aborted) studio.update((st) => progressScan(st, runId, p.done, p.total)); },
          },
        );
        if (controller.signal.aborted || disposed) return;
        studio.update((st) => completeScan(st, runId, result, services.now()));
      } catch (error) {
        if (controller.signal.aborted || disposed || (error instanceof Error && error.name === 'AbortError')) return;
        studio.update((st) => failScan(st, runId, 'The scan could not finish.', services.now()));
      } finally {
        if (abort === controller) abort = null;
      }
    })();
  }

  const actions: ScanActions = {
    ensure() {
      const s = studio.getState();
      if (s.scan.status === 'running') return;
      if (s.scan.status === 'done' && s.scan.snapshotId === s.snapshot?.id) return;
      if (s.scan.status === 'failed' || s.scan.status === 'idle' && s.scan.runId > 0) return; // a cancelled or failed scan waits for "Scan again"
      start();
    },
    run() {
      start();
    },
    cancel() {
      if (disposed) return;
      abort?.abort();
      abort = null;
      studio.update((st) => cancelScan(st, services.now()));
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

export function useScan(): ScanActions {
  const ref = useRef<ScanController | null>(null);
  const actions = useMemo<ScanActions>(
    () => ({ ensure: () => ref.current?.actions.ensure(), run: () => ref.current?.actions.run(), cancel: () => ref.current?.actions.cancel() }),
    [],
  );
  useEffect(() => {
    const c = createScanController(studioStore, { now: () => Date.now(), scan: scanProject });
    ref.current = c;
    return () => {
      c.dispose();
      if (ref.current === c) ref.current = null;
    };
  }, []);
  return actions;
}
