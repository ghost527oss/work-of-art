// @node: F9.8
// The Journal store (level + transient lesson id), the saved level, openLesson, and the memoised Journal model.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createJournalMemo, type JournalInput, type JournalModel } from '../journal/journalModel';
import { cardById } from '../skillbook';
import type { Level } from '../skillbook/playbookSchema';
import { openPanelById, type LayoutState } from '../store/layoutSlice';
import { browserStorage, type KeyValueStorage } from '../store/layoutStorage';
import { createJournalStore, loadLevel, saveLevel, type JournalState } from '../store/journalPrefs';
import { studioStore, useStudioStore, type StudioState, type Store } from '../store/useStudioStore';
import { practiceContent } from '../engine/practiceScript';
import { browserDownloader } from '../export/download';
import { exportFileName } from '../export/exportName';
import { buildJournalMarkdown } from '../export/journalExport';
import { buildLogJson, buildLogMarkdown } from '../export/logExport';
import { buildPatch, planPatchExport, type PatchPlan } from '../export/patchExport';
import { logJournalExport, logLogExport, logPatchExport } from '../store/exportActions';
import { layoutStore } from './useLayout';
import { shellActions } from './useShell';

export interface JournalActions {
  setLevel(level: Level): void;
  /** Opens the Journal panel on Screen 3 and asks it to show this lesson (an unknown id opens the panel at the top). */
  openLesson(id: string): void;
  clearFocus(): void;
}

export interface JournalDeps {
  journal: Store<JournalState>;
  layout: Pick<Store<LayoutState>, 'update'>;
  backToStudio(): void;
  storage: KeyValueStorage | undefined;
}

export function createJournalController(deps: JournalDeps): { actions: JournalActions; attach(): () => void } {
  const actions: JournalActions = {
    setLevel: (level) => deps.journal.update((s) => (s.level === level ? s : { ...s, level })),
    openLesson: (id) => {
      const known = !!cardById(id);
      deps.journal.update((s) => (known ? { ...s, focusLesson: id } : s.focusLesson === undefined ? s : { level: s.level }));
      deps.layout.update((l) => openPanelById(l, 'journal'));
      deps.backToStudio();
    },
    clearFocus: () => deps.journal.update((s) => (s.focusLesson === undefined ? s : { level: s.level })),
  };
  const attach = () => {
    let saved = deps.journal.getState().level;
    return deps.journal.subscribe(() => {
      const level = deps.journal.getState().level;
      if (level !== saved) { saved = level; saveLevel(deps.storage, level); }
    });
  };
  return { actions, attach };
}

export const journalStore: Store<JournalState> = createJournalStore(loadLevel(browserStorage()));
const controller = createJournalController({ journal: journalStore, layout: layoutStore, backToStudio: shellActions.backToStudio, storage: browserStorage() });
export const journalActions: JournalActions = controller.actions;

export function useJournalState(): JournalState {
  return useSyncExternalStore(journalStore.subscribe, journalStore.getState, journalStore.getState);
}

/** Call once near the root: saves the level when it changes and releases the subscription on unmount. */
export function useJournal(): JournalActions {
  useEffect(() => controller.attach(), []);
  return journalActions;
}

export function journalInputOf(s: StudioState): JournalInput {
  return {
    snapshot: s.snapshot,
    analysis: s.understanding.result,
    analysisStatus: s.understanding.status === 'done' ? 'done' : s.understanding.status === 'failed' ? 'failed' : s.understanding.status === 'idle' ? 'idle' : 'running',
    corrections: s.understanding.corrections,
    scan: s.scan.result,
    measured: s.preview.layout.status === 'done' ? s.preview.layout.findings : EMPTY,
    mode: s.preview.mode,
    modeReason: s.preview.reason,
    entryPath: s.preview.entryPath,
  };
}
const EMPTY: never[] = [];

/** The Journal model for the current state and level, rebuilt only when an input changes. */
export function useJournalModel(level: Level): JournalModel {
  const memo = useMemo(() => createJournalMemo(), []);
  const snapshot = useStudioStore((s) => s.snapshot);
  const understanding = useStudioStore((s) => s.understanding);
  const scan = useStudioStore((s) => s.scan.result);
  const pv = useStudioStore((s) => s.preview);
  const input = journalInputOf({ snapshot, understanding, scan: { result: scan }, preview: pv } as unknown as StudioState);
  return memo(input, level);
}

// ---- Exports (@node: F9.10) ----

export interface Downloader { download(name: string, text: string): boolean; dispose(): void }

export interface ExportActions {
  patchPlan(): PatchPlan | null;
  patchName(): string;
  exportPatch(selected: ReadonlySet<string>): string | false;
  exportLog(format: 'md' | 'json'): string | false;
  exportJournal(model: JournalModel): string | false;
}

export function createExporter(studio: Store<StudioState>, downloader: Downloader, now: () => number = Date.now): ExportActions {
  const nameOf = (kind: string | undefined, ext: string) => {
    const s = studio.getState().snapshot;
    return s ? exportFileName(s, kind, ext, new Date(now())) : `patchbay${kind ? `-${kind}` : ''}.${ext}`;
  };
  const planOf = (s: StudioState): PatchPlan | null => (s.snapshot
    ? planPatchExport(s.snapshot, s.work.applied, (p) => practiceContent(s.snapshot!, s.work.applied, p), s.edit.previewOnly.length)
    : null);
  return {
    patchPlan: () => planOf(studio.getState()),
    patchName: () => nameOf(undefined, 'patch'),
    exportPatch(selected) {
      const plan = planOf(studio.getState());
      if (!plan) return false;
      const patch = buildPatch(plan, selected);
      if (patch.files === 0) return false;
      const name = nameOf(undefined, 'patch');
      if (!downloader.download(name, patch.text)) return false;
      studio.update((s) => logPatchExport(s, now(), patch.files, patch.hunks));
      return name;
    },
    exportLog(format) {
      const s = studio.getState();
      if (!s.snapshot || s.log.length === 0) return false;
      const d = new Date(now());
      const text = format === 'md' ? buildLogMarkdown(s, d) : buildLogJson(s, d);
      const name = nameOf('log', format);
      if (!downloader.download(name, text)) return false;
      studio.update((st) => logLogExport(st, now(), format, Math.min(s.log.length, 500)));
      return name;
    },
    exportJournal(model) {
      const s = studio.getState();
      if (!s.snapshot || model.status !== 'ready') return false;
      const name = nameOf(`journal-${model.level}`, 'md');
      if (!downloader.download(name, buildJournalMarkdown(model, s.snapshot))) return false;
      studio.update((st) => logJournalExport(st, now(), model.level));
      return name;
    },
  };
}

/** One exporter for the mounted Studio; its object URLs are released on unmount. */
export function useExports(): ExportActions {
  const pair = useMemo(() => {
    const downloader = browserDownloader();
    return { downloader, actions: createExporter(studioStore, downloader) };
  }, []);
  useEffect(() => () => pair.downloader.dispose(), [pair]);
  return pair.actions;
}
