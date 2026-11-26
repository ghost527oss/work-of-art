// @node: F4.7
// The harness controller: owns the single run timer, turns typed commands and button presses
// into one pure update each, bridges the layout store (Edit panel opening), and saves and
// restores the work with the restore gate. No network and no AI request: the only AI
// interaction is cancelling a pending request through `services.cancelAI`.
import { useEffect, useMemo, useRef } from 'react';
import { SCAN_LIMITS } from '../config/scanLimits';
import { WORK_LIMITS } from '../config/workLimits';
import { parseCommand, type ActionName, type CommandArg } from '../engine/commands';
import { openPanelById, type LayoutState } from '../store/layoutSlice';
import { browserStorage, type KeyValueStorage } from '../store/layoutStorage';
import { layoutStore } from './useLayout';
import { studioStore, withLog, type Store, type StudioState } from '../store/useStudioStore';
import {
  addChatReply, enterSelfEditing, restoreWork, runCommand, tickRun, type Mode, type WorkCtx, type WorkEffect,
} from '../store/workActions';
import {
  buildRecord, clearWorkSlot, historyHasSecret, loadWork, replacedMessage, saveWork, trimRecord, repoKeyOf, SECRET_MESSAGE, TOO_BIG_MESSAGE, TRIMMED_MESSAGE,
  type WorkRecord,
} from '../store/workStorage';

export interface HarnessServices {
  storage: KeyValueStorage | undefined;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  now(): number;
  newId(): string;
  cancelAI(): void;
  /** Shared across controllers of one page so the saved log is restored once per page load. */
  page?: { logRestored: boolean };
}

export interface HarnessActions {
  /** Returns true when the text was a command or a refused command word (nothing goes to the AI). */
  submitText(text: string): boolean;
  /** What the buttons call: the same path as a typed command. */
  run(name: ActionName, arg?: CommandArg): void;
  stop(): void;
}

export interface HarnessController {
  actions: HarnessActions;
  dispose(): void;
}

const defaultPage = { logRestored: false };
const pageFlags = { logRestored: false };

function fingerprint(record: WorkRecord): string {
  return JSON.stringify({ ...record, savedAt: 0 });
}

export function createHarnessController(
  studio: Store<StudioState>,
  layout: Store<LayoutState>,
  services: HarnessServices,
): HarnessController {
  const page = services.page ?? defaultPage;
  let disposed = false;
  let timer: unknown = null;
  let timerKey: string | null = null;
  let lastSnapshot: StudioState['snapshot'] = undefined;
  let restoredFor: StudioState['snapshot'] = undefined;
  let lastSaved: string | null = null;
  let pendingReplacedKey: string | null = null;
  let skipSave = false;
  let noteTrim = false;
  let noteTooBig = false;
  let noteSecret = false;
  let lastEditOpen = layout.getState().openPanel === 'edit';

  // ---- queue: dispatches made while another runs wait their turn, in order ----
  const queue: Array<() => void> = [];
  let draining = false;
  function enqueue(job: () => void): void {
    if (disposed) return;
    queue.push(job);
    if (draining) return;
    draining = true;
    let firstError: unknown;
    let failed = false;
    try {
      while (queue.length > 0 && !disposed) {
        try {
          queue.shift()!();
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      }
    } finally {
      draining = false;
    }
    // A failed job must not leave a running run without its timer. The error is not hidden.
    if (!disposed) syncTimer();
    if (failed) throw firstError;
  }

  const mode = (): Mode => (layout.getState().openPanel === 'edit' ? 'self_editing' : 'automation');
  const ctx = (): WorkCtx => ({ now: services.now(), mode: mode(), newId: services.newId });

  function clearTimer(): void {
    if (timer !== null) services.clearTimer(timer);
    timer = null;
    timerKey = null;
  }

  function syncTimer(): void {
    const s = studio.getState();
    const run = s.work.run;
    const should = !disposed && s.snapshot !== undefined && run !== null && run.status === 'running';
    if (!should) {
      clearTimer();
      return;
    }
    const key = `${run.id}:${run.position}`;
    if (timer !== null && timerKey === key) return;
    clearTimer();
    timerKey = key;
    const id = run.id;
    const position = run.position;
    timer = services.setTimer(() => onTick(id, position), run.kind === 'crew' ? SCAN_LIMITS.crewTickMs : WORK_LIMITS.tickMs);
  }

  function onTick(runId: string, position: number): void {
    if (disposed) return;
    timer = null;
    timerKey = null;
    enqueue(() => {
      studio.update((s) => tickRun(s, runId, position, ctx()));
      syncTimer();
    });
  }

  function applyEffects(effects: WorkEffect[]): void {
    for (const e of effects) {
      if (e.type === 'cancel_ai') services.cancelAI();
      else if (e.type === 'open_panel') layout.update((l) => openPanelById(l, e.panel));
      else if (e.type === 'clear_slot') {
        clearWorkSlot(services.storage);
        lastSaved = null;
        pendingReplacedKey = null;
      }
    }
  }

  function dispatchCommand(name: ActionName, arg?: CommandArg): void {
    enqueue(() => {
      let effects: WorkEffect[] = [];
      studio.update((s) => {
        const r = runCommand(s, { name, arg }, ctx());
        effects = r.effects;
        if (effects.some((e) => e.type === 'clear_slot')) skipSave = true;
        return r.state;
      });
      applyEffects(effects);
      syncTimer();
    });
  }

  // ---- restore and save ----
  function restoreStep(snapshot: NonNullable<StudioState['snapshot']>): void {
    if (studio.getState().snapshot !== snapshot) return;
    const record = loadWork(services.storage);
    const key = repoKeyOf(snapshot);
    pendingReplacedKey = record !== null && record.repoKey !== key ? record.repoKey : null;
    if (record !== null && record.repoKey === key) {
      const restoreLog = !page.logRestored;
      studio.update((s) => restoreWork(s, record, ctx(), { restoreLog }));
    }
    page.logRestored = true;
    restoredFor = snapshot;
    const base = buildRecord(studio.getState(), services.now());
    lastSaved = base ? fingerprint(base) : null;
  }

  function addNote(message: string): void {
    enqueue(() => {
      studio.update((s) => ({ ...s, ...withLog(s, services.now(), { action: 'work_saved_note', status: 'info', message }) }));
    });
  }

  let seenWork: StudioState['work'] | null = null;
  let seenLog: StudioState['log'] | null = null;
  function maybeSave(): void {
    const s = studio.getState();
    if (!s.snapshot || restoredFor !== s.snapshot) return;
    // Updates that touch neither the work nor the log (AI state, ingestion progress) need no save check.
    if (s.work === seenWork && s.log === seenLog) return;
    seenWork = s.work;
    seenLog = s.log;
    if (skipSave) {
      skipSave = false;
      return;
    }
    const record = buildRecord(s, services.now());
    if (!record) return;
    const fp = fingerprint(record);
    if (fp === lastSaved) return;
    if (pendingReplacedKey !== null) {
      const old = pendingReplacedKey;
      pendingReplacedKey = null;
      addNote(replacedMessage(old));
      return;
    }
    if (historyHasSecret(s)) {
      if (!noteSecret) {
        noteSecret = true;
        addNote(SECRET_MESSAGE);
      }
      return;
    }
    noteSecret = false;
    const t = trimRecord(record);
    if (t.tooBig) {
      if (!noteTooBig) {
        noteTooBig = true;
        addNote(TOO_BIG_MESSAGE);
      }
      return;
    }
    noteTooBig = false;
    if (t.trimmed && !noteTrim) {
      noteTrim = true;
      addNote(TRIMMED_MESSAGE);
    }
    if (!t.trimmed) noteTrim = false;
    if (saveWork(services.storage, t.record)) lastSaved = fp;
  }

  function onStudioChange(): void {
    enqueue(() => {
      const s = studio.getState();
      if (s.snapshot !== lastSnapshot) {
        lastSnapshot = s.snapshot;
        restoredFor = undefined;
        pendingReplacedKey = null;
        lastSaved = null;
        seenWork = null;
        seenLog = null;
        clearTimer();
        const snap = s.snapshot;
        if (snap) enqueue(() => restoreStep(snap));
      }
      syncTimer();
      maybeSave();
    });
  }

  function onLayoutChange(): void {
    const open = layout.getState().openPanel === 'edit';
    if (open === lastEditOpen) return;
    lastEditOpen = open;
    if (!open) return;
    enqueue(() => {
      studio.update((s) => enterSelfEditing(s, ctx()));
      syncTimer();
    });
  }

  const unsubStudio = studio.subscribe(onStudioChange);
  const unsubLayout = layout.subscribe(onLayoutChange);
  lastSnapshot = studio.getState().snapshot;
  if (lastSnapshot) {
    const snap = lastSnapshot;
    enqueue(() => restoreStep(snap));
  }
  syncTimer();

  const actions: HarnessActions = {
    submitText(text) {
      if (disposed) return false;
      const parsed = parseCommand(text);
      if (parsed.kind === 'none') return false;
      if (parsed.kind === 'refused') {
        const command = text.trim().replace(/^\//, '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
        enqueue(() => studio.update((s) => addChatReply(s, command.slice(0, 20), parsed.reply, false)));
        return true;
      }
      dispatchCommand(parsed.name, parsed.arg);
      return true;
    },
    run(name, arg) {
      if (disposed) return;
      dispatchCommand(name, arg);
    },
    stop() {
      if (disposed) return;
      dispatchCommand('stop');
    },
  };

  return {
    actions,
    dispose() {
      disposed = true;
      clearTimer();
      unsubStudio();
      unsubLayout();
      queue.length = 0;
    },
  };
}

let idCounter = 0;

/**
 * Creates the controller in an effect (so a dev-mode remount gets a fresh one) and releases
 * the timer and both subscriptions on unmount. The returned actions are stable.
 */
export function useHarness(assistant: { cancel(): void }): HarnessActions {
  const assistantRef = useRef(assistant);
  assistantRef.current = assistant;
  const controllerRef = useRef<HarnessController | null>(null);
  const actions = useMemo<HarnessActions>(
    () => ({
      submitText: (text) => controllerRef.current?.actions.submitText(text) ?? false,
      run: (name, arg) => controllerRef.current?.actions.run(name, arg),
      stop: () => controllerRef.current?.actions.stop(),
    }),
    [],
  );
  useEffect(() => {
    const controller = createHarnessController(studioStore, layoutStore, {
      storage: browserStorage(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
      newId: () => `w-${Date.now().toString(36)}-${++idCounter}`,
      cancelAI: () => assistantRef.current.cancel(),
      page: pageFlags,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);
  return actions;
}
