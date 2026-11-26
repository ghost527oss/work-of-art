// @node: F4.4
// Pure state for the practice run: the run, the one waiting proposal, the history, and the
// command replies. Every transition returns the SAME object when it refuses, so nothing
// re-renders and nothing is saved. The `*Refusal` helpers give the plain-English reason.
// No Log entries are written here (workActions.ts does that). No React, no store, no network.
import { WORK_LIMITS } from '../config/workLimits';
import { buildPracticeDiff, type RunStep } from '../engine/practiceScript';

export type { RunStep, StepKind } from '../engine/practiceScript';

export type RunStatus = 'running' | 'paused' | 'awaiting_decision' | 'stopped' | 'finished';

export interface Run {
  id: string;
  status: RunStatus;
  autoAdvance: boolean;
  position: number;
  steps: RunStep[];
}

export interface Proposal {
  id: string;
  path: string;
  title: string;
  diff: string;
}

export interface HistoryEntry {
  id: string;
  path: string;
  title: string;
  at: number;
  diff: string;
  beforeHash: string;
  afterHash: string;
}

export interface ChatLine {
  id: number;
  command: string;
  reply: string;
  ok: boolean;
}

export interface WorkState {
  run: Run | null;
  proposal: Proposal | null;
  applied: HistoryEntry[];
  undone: HistoryEntry[];
  chat: ChatLine[];
  runSeq: number;
}

export function idleWork(): WorkState {
  return { run: null, proposal: null, applied: [], undone: [], chat: [], runSeq: 0 };
}

export const MSG = {
  noRun: 'No run is active.',
  active: 'A run is already active. Type stop first.',
  closeEdit: 'Close the Edit panel first.',
  alreadyPaused: 'Already paused.',
  alreadyRunning: 'Already running.',
  pauseFirst: 'Pause the run first.',
  decideFirst: 'Decide the waiting proposal first.',
  nothingToStop: 'Nothing to stop.',
  noProposal: 'No proposal is waiting.',
  nothingToUndo: 'Nothing to undo.',
  nothingToRedo: 'Nothing to redo.',
  historyFull: `History is full (${WORK_LIMITS.maxHistoryEntries} changes). Reject this proposal or type reset.`,
} as const;

export function isActive(run: Run | null): run is Run {
  return run !== null && (run.status === 'running' || run.status === 'paused' || run.status === 'awaiting_decision');
}

// ---------------------------------------------------------------------------
// Refusal reasons (null = allowed)
// ---------------------------------------------------------------------------

export function startRefusal(w: WorkState, selfEditing: boolean): string | null {
  if (isActive(w.run)) return MSG.active;
  if (selfEditing) return MSG.closeEdit;
  return null;
}

export function pauseRefusal(w: WorkState): string | null {
  if (!isActive(w.run)) return MSG.noRun;
  if (!w.run.autoAdvance) return MSG.alreadyPaused;
  return null;
}

export function resumeRefusal(w: WorkState, selfEditing: boolean): string | null {
  if (!isActive(w.run)) return MSG.noRun;
  if (selfEditing) return MSG.closeEdit;
  if (w.run.autoAdvance) return MSG.alreadyRunning;
  return null;
}

export function stepRefusal(w: WorkState, selfEditing: boolean): string | null {
  const run = w.run;
  if (!isActive(run)) return MSG.noRun;
  if (selfEditing) return MSG.closeEdit;
  if (run.status === 'running') return MSG.pauseFirst;
  if (run.status === 'awaiting_decision') return MSG.decideFirst;
  if (run.position >= run.steps.length) return MSG.noRun;
  return null;
}

export function stopRefusal(w: WorkState): string | null {
  return isActive(w.run) ? null : MSG.nothingToStop;
}

export function decisionRefusal(w: WorkState, decision: 'approve' | 'reject'): string | null {
  if (w.proposal === null) return MSG.noProposal;
  if (decision === 'approve' && w.applied.length + w.undone.length >= WORK_LIMITS.maxHistoryEntries) return MSG.historyFull;
  return null;
}

export function undoRefusal(w: WorkState): string | null {
  if (w.proposal !== null) return MSG.decideFirst;
  if (w.run?.status === 'running') return MSG.pauseFirst;
  if (w.applied.length === 0) return MSG.nothingToUndo;
  return null;
}

export function redoRefusal(w: WorkState): string | null {
  if (w.proposal !== null) return MSG.decideFirst;
  if (w.run?.status === 'running') return MSG.pauseFirst;
  if (w.undone.length === 0) return MSG.nothingToRedo;
  return null;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export function startRun(w: WorkState, runId: string, steps: RunStep[], selfEditing: boolean): WorkState {
  if (startRefusal(w, selfEditing) !== null) return w;
  if (steps.length === 0 || steps.length > WORK_LIMITS.maxSteps) return w;
  return {
    ...w,
    run: { id: runId, status: 'running', autoAdvance: true, position: 0, steps: steps.map((s) => ({ ...s })) },
    proposal: null,
    runSeq: w.runSeq + 1,
  };
}

export function pauseRun(w: WorkState): WorkState {
  if (pauseRefusal(w) !== null) return w;
  const run = w.run as Run;
  return { ...w, run: { ...run, autoAdvance: false, status: run.status === 'running' ? 'paused' : run.status } };
}

export function resumeRun(w: WorkState, selfEditing: boolean): WorkState {
  if (resumeRefusal(w, selfEditing) !== null) return w;
  const run = w.run as Run;
  return { ...w, run: { ...run, autoAdvance: true, status: run.status === 'paused' ? 'running' : run.status } };
}

/** Sets the one waiting proposal and moves the run to `awaiting_decision`. */
export function createProposal(w: WorkState, proposal: Proposal): WorkState {
  const run = w.run;
  if (!run || w.proposal !== null) return w;
  if (run.status !== 'running' && run.status !== 'paused') return w;
  return { ...w, proposal: { ...proposal }, run: { ...run, status: 'awaiting_decision' } };
}

/**
 * Runs the step at `position` (used by ticks and `step`). Allowed while `running` or `paused`
 * with no waiting proposal. A `propose` step creates the proposal; the last step finishes the run.
 */
export function runOneStep(w: WorkState, proposalId: string): WorkState {
  const run = w.run;
  if (!run || w.proposal !== null) return w;
  if (run.status !== 'running' && run.status !== 'paused') return w;
  const step = run.steps[run.position];
  if (!step) return w;
  const moved: Run = { ...run, position: run.position + 1 };
  if (step.kind === 'propose' && step.path !== undefined) {
    return createProposal({ ...w, run: moved }, { id: proposalId, path: step.path, title: step.title, diff: buildPracticeDiff(step.path) });
  }
  if (moved.position >= moved.steps.length) moved.status = 'finished';
  return { ...w, run: moved };
}

export function stepRun(w: WorkState, selfEditing: boolean, proposalId: string): WorkState {
  if (stepRefusal(w, selfEditing) !== null) return w;
  return runOneStep(w, proposalId);
}

export function stopRun(w: WorkState): WorkState {
  if (stopRefusal(w) !== null) return w;
  return { ...w, run: { ...(w.run as Run), status: 'stopped', autoAdvance: false }, proposal: null };
}

/** Approve needs a ready history entry (hashes computed by the caller). Reject ignores `entry`. */
export function decideProposal(w: WorkState, decision: 'approve' | 'reject', entry?: HistoryEntry): WorkState {
  if (decisionRefusal(w, decision) !== null) return w;
  const run = w.run;
  const nextRun: Run | null =
    run && run.status === 'awaiting_decision' ? { ...run, status: run.autoAdvance ? 'running' : 'paused' } : run;
  if (decision === 'reject') return { ...w, proposal: null, run: nextRun };
  if (!entry) return w;
  return { ...w, proposal: null, run: nextRun, applied: [...w.applied, { ...entry }], undone: [] };
}

export function undoChange(w: WorkState): WorkState {
  if (undoRefusal(w) !== null) return w;
  const last = w.applied[w.applied.length - 1] as HistoryEntry;
  return { ...w, applied: w.applied.slice(0, -1), undone: [...w.undone, last] };
}

export function redoChange(w: WorkState): WorkState {
  if (redoRefusal(w) !== null) return w;
  const last = w.undone[w.undone.length - 1] as HistoryEntry;
  return { ...w, undone: w.undone.slice(0, -1), applied: [...w.applied, last] };
}

/** The Edit panel opened: pause a running run, or stop auto-advance while a decision waits. */
export function setSelfEditingPause(w: WorkState): WorkState {
  const run = w.run;
  if (!run) return w;
  if (run.status === 'running') return { ...w, run: { ...run, status: 'paused', autoAdvance: false } };
  if (run.status === 'awaiting_decision' && run.autoAdvance) return { ...w, run: { ...run, autoAdvance: false } };
  return w;
}

export function addChat(w: WorkState, command: string, reply: string, ok: boolean): WorkState {
  const last = w.chat[w.chat.length - 1];
  const line: ChatLine = { id: last ? last.id + 1 : 1, command, reply, ok };
  const chat = [...w.chat, line];
  return { ...w, chat: chat.length > WORK_LIMITS.maxChatReplies ? chat.slice(chat.length - WORK_LIMITS.maxChatReplies) : chat };
}

/** Returns what is wrong with a work state (empty when it is consistent). Used by tests and restore. */
export function workProblems(w: WorkState): string[] {
  const p: string[] = [];
  if (w.run === null && w.proposal !== null) p.push('proposal without a run');
  if ((w.run?.status === 'awaiting_decision') !== (w.proposal !== null)) p.push('awaiting_decision and proposal disagree');
  if (w.applied.length + w.undone.length > WORK_LIMITS.maxHistoryEntries) p.push('history too long');
  if (w.run && w.run.position > w.run.steps.length) p.push('position past the end');
  if (w.run && w.run.steps.length > WORK_LIMITS.maxSteps) p.push('too many steps');
  if (w.chat.length > WORK_LIMITS.maxChatReplies) p.push('too many chat lines');
  if (w.run?.status === 'running' && !w.run.autoAdvance) p.push('running without autoAdvance');
  return p;
}
