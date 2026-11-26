// @node: F10.4
// The session controller (design 8.2): startup restore once per page load, resume, apply the screen and the
// Sandbox settings after the load, cancel and failure handling, Back to Start, and Reset session.
// It copies nothing that 2A, 2B, 2C, or 2F already restore.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { practiceContent } from '../engine/practiceScript';
import { findComponents } from '../preview/jsxExtract';
import { detectPreviewMode, modeChoices, type PreviewMode } from '../preview/previewMode';
import { SESSION_LIMITS as L } from '../config/sessionLimits';
import { browserStorage, type KeyValueStorage } from '../store/layoutStorage';
import { logRestored, logSessionNote, resetSessionState, SESSION_LINES } from '../store/sessionActions';
import { attachSessionPersistence } from '../store/sessionPersistence';
import { clearAllSession, clearSessionRecord, loadSession, type SessionRecord } from '../store/sessionRecord';
import {
  applied, begin, cancelled, createSessionStore, failed, loaded, markApplied, resetSessionStore, RESET_NOTICE, setRecord, type SessionStoreState,
} from '../store/sessionStore';
import { INITIAL_VIEW, openDomain, openSkeleton, type ShellView } from '../store/shellView';
import { studioStore, type Store, type StudioState } from '../store/useStudioStore';
import type { IngestionActions } from './useIngestion';
import type { PreviewActions } from './usePreview';
import { shellStore } from './useShell';

export interface SessionDeps {
  studio: Store<StudioState>;
  shell: Store<ShellView>;
  session: Store<SessionStoreState>;
  ingestion: Pick<IngestionActions, 'restore' | 'backToStart'>;
  preview: Pick<PreviewActions, 'setWidth' | 'setMode' | 'setEntry' | 'setComponent'>;
  storage: KeyValueStorage | undefined;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  now(): number;
  /** Shared by the controllers of one page, so the automatic restore starts once (React's double effect). */
  page: { started: boolean };
}

export interface SessionActions {
  startup(): void;
  resume(): void;
  backToStart(): void;
  resetSession(): void;
}

export interface SessionController { actions: SessionActions; attach(): () => void; dispose(): void }

const sameRepo = (r: SessionRecord, snap: NonNullable<StudioState['snapshot']>) =>
  r.target.source === 'sample' ? snap.source === 'sample' && snap.name === r.target.sampleId : snap.source === 'github' && snap.owner.toLowerCase() === r.target.owner.toLowerCase() && snap.name.toLowerCase() === r.target.repo.toLowerCase();

export function createSessionController(deps: SessionDeps): SessionController {
  const { studio, shell, session } = deps;
  let timer: unknown = null;
  let busy = false;
  let offs: Array<() => void> = [];
  const clear = () => { if (timer !== null) deps.clearTimer(timer); timer = null; };

  function start(record: SessionRecord): void {
    const before = studio.getState().ingestion.runId;
    if (deps.ingestion.restore(record.target) !== null) return; // a damaged record never starts a request
    const runId = studio.getState().ingestion.runId;
    if (runId === before) return;
    session.update((s) => begin(s, record, runId));
  }

  function finish(): void {
    clear();
    const s = session.getState();
    if (s.status !== 'applying' || !s.record) return;
    const r = s.record;
    const snap = studio.getState().snapshot;
    const view = shell.getState();
    const screenNo = view.screen === 'domain' ? 5 : view.screen === 'skeleton' ? 4 : 3;
    const now = deps.now();
    studio.update((st) => {
      let next = logRestored(st, now, r.target.source === 'sample' ? r.target.sampleId! : `${snap?.owner ?? r.target.owner}/${snap?.name ?? r.target.repo}`, screenNo);
      if (r.notes.crewWasActive) next = logSessionNote(next, now, SESSION_LINES.crew);
      if (r.notes.previewOnlyCount > 0) next = logSessionNote(next, now, SESSION_LINES.previewOnly(r.notes.previewOnlyCount));
      return next;
    });
    session.update(applied);
  }

  function applyScreen(r: SessionRecord): void {
    if (r.screen.screen === 'skeleton') shell.update(openSkeleton);
    else if (r.screen.screen === 'domain' && r.screen.area) { shell.update(openSkeleton); shell.update((v) => openDomain(v, r.screen.area!)); }
    session.update((s) => markApplied(s, 'screen'));
  }

  /** The Sandbox settings, once the preview slice is initialised for this snapshot (or when the wait ends). */
  function applyPreview(r: SessionRecord, initialised: boolean): void {
    const st = studio.getState();
    const snap = st.snapshot!;
    deps.preview.setWidth(r.preview.width);
    if (initialised) {
      const effective = (p: string) => practiceContent(snap, st.work.applied, p);
      const choices = modeChoices(detectPreviewMode(snap, effective));
      let mode: PreviewMode = st.preview.mode;
      if (r.preview.mode !== 'auto') {
        if (choices.includes(r.preview.mode)) { deps.preview.setMode(r.preview.mode); mode = r.preview.mode; }
        else studio.update((x) => logSessionNote(x, deps.now(), SESSION_LINES.mode));
      }
      const page = r.preview.entryPath;
      const pages = snap.files.filter((f) => typeof f.content === 'string' && /\.html?$/i.test(f.path)).map((f) => f.path);
      if (page && mode === 'static' && pages.includes(page)) deps.preview.setEntry(page);
      const comp = r.preview.component;
      if (comp && mode === 'workbench') {
        const [path, name] = comp.split('#');
        const text = path ? effective(path) : undefined;
        if (text !== undefined && name && findComponents(path!, text).some((c) => c.name === name && !c.error)) deps.preview.setComponent(comp);
      }
    }
    session.update((s) => markApplied(s, 'preview'));
  }

  function step(): void {
    if (busy) return;
    busy = true;
    try {
      const s = session.getState();
      const st = studio.getState();
      if (s.status === 'pending') {
        const ing = st.ingestion;
        if (ing.runId === s.pendingRunId && ing.status === 'failed') { session.update((x) => failed(x, ing.runId)); return; }
        if (st.experience === 'start' && ing.status === 'idle') { session.update(cancelled); return; }
        if (ing.runId === s.pendingRunId && ing.status === 'done' && st.experience === 'studio' && st.snapshot) {
          session.update((x) => loaded(x, ing.runId));
          if (!sameRepo(s.record!, st.snapshot)) { session.update(applied); return; } // not ours: apply nothing
          applyScreen(s.record!);
          timer = deps.setTimer(() => {
            timer = null;
            const now = session.getState();
            if (now.status === 'applying' && !now.previewApplied && studio.getState().snapshot) applyPreview(now.record!, false);
            finish();
          }, L.applyWaitMs);
        }
      }
      const a = session.getState();
      if (a.status === 'applying' && !a.previewApplied && a.record) {
        const cur = studio.getState();
        if (cur.snapshot && cur.preview.reason !== '') { applyPreview(a.record, true); finish(); }
      }
    } finally {
      busy = false;
    }
  }

  const actions: SessionActions = {
    startup() {
      if (deps.page.started) return;
      deps.page.started = true;
      const record = loadSession(deps.storage);
      session.update((s) => setRecord(s, record ?? undefined));
      if (record && studio.getState().experience === 'start') start(record);
    },
    resume() {
      const s = session.getState();
      if (!s.record || s.status === 'pending' || s.status === 'applying') return;
      if (studio.getState().experience !== 'start') return;
      start(s.record);
    },
    backToStart() {
      clear();
      deps.ingestion.backToStart();
      clearSessionRecord(deps.storage);
      session.update((s) => resetSessionStore(s));
    },
    resetSession() {
      clear();
      deps.ingestion.backToStart(); // aborts any load
      clearAllSession(deps.storage);
      studio.update(resetSessionState);
      shell.setState(INITIAL_VIEW);
      session.update((s) => resetSessionStore(s, RESET_NOTICE));
    },
  };

  return {
    actions,
    attach() {
      for (const off of offs) off();
      offs = [studio.subscribe(step), session.subscribe(step)];
      step();
      return () => { for (const off of offs) off(); offs = []; };
    },
    dispose() { for (const off of offs) off(); offs = []; clear(); },
  };
}

// ---- the app's instance ----
export const sessionStore: Store<SessionStoreState> = createSessionStore();
const pageFlags = { started: false };

export function useSessionView(): SessionStoreState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, sessionStore.getState);
}

/** Call once near the root, after useIngestion and usePreview. */
export function useSessionRestore(ingestion: IngestionActions, preview: SessionDeps['preview']): SessionActions {
  const controller = useMemo(() => createSessionController({
    studio: studioStore, shell: shellStore, session: sessionStore, ingestion, preview, storage: browserStorage(),
    setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now(), page: pageFlags,
  }), [ingestion, preview]);
  useEffect(() => {
    const detach = controller.attach();
    const detachSave = attachSessionPersistence({ studio: studioStore, shell: shellStore, session: sessionStore, storage: browserStorage(), now: () => Date.now() });
    controller.actions.startup();
    return () => { detach(); detachSave(); controller.dispose(); };
  }, [controller]);
  return controller.actions;
}
