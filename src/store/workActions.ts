// @node: F4.5
// Whole-state work actions: pure transitions from workSlice plus Log entries and chat replies,
// as one atomic update. Imports withLog from useStudioStore, as aiActions.ts does.
// useStudioStore imports only `idleWork` from workSlice, so there is no import cycle.
// Privacy: Log entries and chat replies hold paths and fixed phrases only. Never instruction
// text, file content, secrets, or diff bodies.
import { ACTIONS, HELP_LINES, PANEL_WORDS, type ActionName, type PanelWord } from '../engine/commands';
import { hashText, applyUnifiedDiff, reverseUnifiedDiff } from '../engine/diffApply';
import { PRACTICE_COMMENT, buildPracticeScript, practiceContent } from '../engine/practiceScript';
import { commentLineFor } from '../engine/unifiedDiff';
import type { PanelId } from './layoutSlice';
import { type StudioState, withLog } from './useStudioStore';
import {
  addChat, decideProposal, decisionRefusal, idleWork, pauseRefusal, pauseRun, redoChange, redoRefusal,
  resumeRefusal, resumeRun, runOneStep, setSelfEditingPause, startRefusal, startRun, stepRefusal,
  stopRefusal, stopRun, undoChange, undoRefusal, type HistoryEntry, type Run, type WorkState,
} from './workSlice';

export type Mode = 'automation' | 'self_editing';

export interface WorkCtx {
  now: number;
  mode: Mode;
  newId(): string;
}

export type WorkEffect = { type: 'cancel_ai' } | { type: 'clear_slot' } | { type: 'open_panel'; panel: PanelId };

export interface WorkResult {
  state: StudioState;
  effects: WorkEffect[];
}

export interface CommandInput {
  name: ActionName;
  arg?: PanelWord;
}

type LogEntry = { action: string; status: StudioState['log'][number]['status']; message: string; affectedPaths?: string[] };

function logAll(state: StudioState, now: number, entries: LogEntry[]): StudioState {
  let s = state;
  for (const e of entries) s = { ...s, ...withLog(s, now, e) };
  return s;
}

function withWork(state: StudioState, work: WorkState): StudioState {
  return work === state.work ? state : { ...state, work };
}

/** Adds one chat reply (used for refused text too). */
export function addChatReply(state: StudioState, command: string, reply: string, ok: boolean): StudioState {
  return withWork(state, addChat(state.work, command, reply, ok));
}

function refuse(state: StudioState, command: string, reply: string): WorkResult {
  return { state: addChatReply(state, command, reply, false), effects: [] };
}

function accept(state: StudioState, command: string, reply: string, effects: WorkEffect[] = []): WorkResult {
  return { state: addChatReply(state, command, reply, true), effects };
}

function stepLines(state: StudioState, run: Run): LogEntry[] {
  const step = run.steps[run.position - 1];
  if (!step) return [];
  const paths = step.path ? [step.path] : [];
  const lines: LogEntry[] = [
    { action: 'run_step', status: 'info', message: `Step ${run.position} of ${run.steps.length}: ${step.title}`, affectedPaths: paths },
  ];
  if (step.skill) lines.push({ action: 'skill_used', status: 'info', message: `Skill used: ${step.skill}` });
  const snap = state.snapshot;
  if (step.kind === 'info' && snap) {
    const c = snap.coverage;
    lines.push(
      step.title === 'Check coverage'
        ? { action: 'run_info', status: 'info', message: `Coverage: ${c.skippedFiles} skipped, ${c.truncatedFiles} truncated, ${c.failedFiles} failed, source analysis ${c.sourceAnalysisComplete ? 'complete' : 'not complete'}.` }
        : { action: 'run_info', status: 'info', message: `Repository: ${c.indexedPaths} paths indexed, ${c.loadedSourceFiles} files loaded.` },
    );
  }
  return lines;
}

function verifyLine(state: StudioState, path: string): LogEntry {
  const snap = state.snapshot;
  const text = snap ? practiceContent(snap, state.work.applied, path) : undefined;
  const practiceLine = commentLineFor(path, PRACTICE_COMMENT);
  if (text !== undefined && text.split('\n')[0]?.replace(/\r$/, '') === practiceLine) {
    return { action: 'run_verify', status: 'verified', message: `Verified: the practice copy of ${path} contains the practice line.`, affectedPaths: [path] };
  }
  return { action: 'run_verify', status: 'info', message: `Nothing to verify for ${path}: no change was applied.`, affectedPaths: [path] };
}

/** Runs the step at the run's position and logs it. Caller has checked the guard. */
function runStepAndLog(state: StudioState, ctx: WorkCtx): StudioState {
  const before = state.work.run;
  if (!before) return state;
  const stepBefore = before.steps[before.position];
  const next = runOneStep(state.work, ctx.newId());
  if (next === state.work || !next.run || !stepBefore) return state;
  let s: StudioState = { ...state, work: next };
  const entries = stepLines(s, next.run);
  if (stepBefore.kind === 'verify' && stepBefore.path) entries.push(verifyLine(s, stepBefore.path));
  if (stepBefore.kind === 'propose' && next.proposal) {
    entries.push({ action: 'proposal_created', status: 'proposed', message: `Proposal created for ${next.proposal.path}.`, affectedPaths: [next.proposal.path] });
  }
  if (next.run.status === 'finished') entries.push({ action: 'run_finished', status: 'info', message: 'Practice run finished.' });
  s = logAll(s, ctx.now, entries);
  return s;
}

/** One timer tick. Ignored unless the run is `running`, has this id, and is at this position. */
export function tickRun(state: StudioState, runId: string, position: number, ctx: WorkCtx): StudioState {
  const run = state.work.run;
  if (!run || run.status !== 'running' || run.id !== runId || run.position !== position) return state;
  return runStepAndLog(state, ctx);
}

/** The Edit panel opened. Pauses a running run (or stops auto-advance while a decision waits). */
export function enterSelfEditing(state: StudioState, ctx: WorkCtx): StudioState {
  const next = setSelfEditingPause(state.work);
  if (next === state.work) return state;
  return logAll({ ...state, work: next }, ctx.now, [
    { action: 'run_paused', status: 'info', message: 'Paused automatically because you opened Edit.' },
  ]);
}

/** Clears work in memory (log kept). Same object when already empty. */
export function clearWork(state: StudioState): StudioState {
  const w = state.work;
  if (w.run === null && w.proposal === null && w.applied.length === 0 && w.undone.length === 0 && w.chat.length === 0 && w.runSeq === 0) return state;
  return { ...state, work: idleWork() };
}

function statusReply(state: StudioState, ctx: WorkCtx): string {
  const w = state.work;
  const mode = ctx.mode === 'self_editing' ? 'Self-editing' : 'Automation';
  const run = w.run ? `${w.run.status.replace('_', ' ')}, step ${w.run.position} of ${w.run.steps.length}` : 'no run';
  return `Mode: ${mode}. Run: ${run}. Proposal waiting: ${w.proposal ? 'yes' : 'no'}. Applied: ${w.applied.length}. Undone: ${w.undone.length}.`;
}

export function runCommand(state: StudioState, cmd: CommandInput, ctx: WorkCtx): WorkResult {
  const name = cmd.name;
  const label = cmd.arg ? `${name} ${cmd.arg}` : name;
  const w = state.work;
  const snap = state.snapshot;
  const needsSnapshot: ActionName[] = ['start', 'pause', 'resume', 'step', 'approve', 'reject', 'undo', 'redo', 'reset'];
  if (needsSnapshot.includes(name) && !snap) return refuse(state, label, 'Load a repository first.');
  const selfEditing = ctx.mode === 'self_editing';

  switch (name) {
    case 'help':
      return accept(state, label, ACTIONS.length === HELP_LINES.length ? HELP_LINES.join('\n') : '');
    case 'status':
      return accept(state, label, statusReply(state, ctx));
    case 'open': {
      const word = cmd.arg;
      if (!word) return refuse(state, label, 'Use: open edit, chat, log, history, or journal.');
      return accept(state, label, `Opened ${word}.`, [{ type: 'open_panel', panel: PANEL_WORDS[word] }]);
    }
    case 'start': {
      const refusal = startRefusal(w, selfEditing);
      if (refusal) return refuse(state, label, refusal);
      const steps = buildPracticeScript(snap!);
      if (!steps) {
        return refuse(state, label, 'No suitable file for a practice change. It needs a fully loaded text file under 20 KB with no secrets.');
      }
      const work = startRun(w, ctx.newId(), steps, selfEditing);
      const s = logAll({ ...state, work }, ctx.now, [
        { action: 'run_started', status: 'info', message: `Practice run (no AI) started with ${steps.length} steps.` },
      ]);
      return accept(s, label, 'Practice run (no AI) started.');
    }
    case 'pause': {
      const refusal = pauseRefusal(w);
      if (refusal) return refuse(state, label, refusal);
      const s = logAll({ ...state, work: pauseRun(w) }, ctx.now, [{ action: 'run_paused', status: 'info', message: 'Run paused.' }]);
      return accept(s, label, 'Paused.');
    }
    case 'resume': {
      const refusal = resumeRefusal(w, selfEditing);
      if (refusal) return refuse(state, label, refusal);
      const s = logAll({ ...state, work: resumeRun(w, selfEditing) }, ctx.now, [{ action: 'run_resumed', status: 'info', message: 'Run resumed.' }]);
      return accept(s, label, w.run?.status === 'awaiting_decision' ? 'The run continues after you approve or reject.' : 'Resumed.');
    }
    case 'step': {
      const refusal = stepRefusal(w, selfEditing);
      if (refusal) return refuse(state, label, refusal);
      const s = runStepAndLog(state, ctx);
      return accept(s, label, `Ran step ${s.work.run?.position ?? 0} of ${s.work.run?.steps.length ?? 0}.`);
    }
    case 'stop': {
      const aiPending = state.ai.status === 'pending';
      const refusal = stopRefusal(w);
      if (refusal && !aiPending) return refuse(state, label, refusal);
      let s = state;
      if (!refusal) {
        const entries: LogEntry[] = [];
        if (w.proposal) {
          entries.push({ action: 'proposal_rejected', status: 'rejected', message: 'rejected: run stopped', affectedPaths: [w.proposal.path] });
        }
        entries.push({ action: 'run_stopped', status: 'info', message: 'Run stopped.' });
        s = logAll({ ...state, work: stopRun(w) }, ctx.now, entries);
      }
      return accept(s, label, refusal ? 'Cancelled the pending AI request.' : 'Stopped.', [{ type: 'cancel_ai' }]);
    }
    case 'approve': {
      const refusal = decisionRefusal(w, 'approve');
      if (refusal) return refuse(state, label, refusal);
      const proposal = w.proposal!;
      const current = practiceContent(snap!, w.applied, proposal.path);
      const result = current === undefined ? undefined : applyUnifiedDiff(current, proposal.diff);
      if (current === undefined || !result || !result.ok) {
        const reason = result && !result.ok ? result.reason : 'the file is not available';
        const s = logAll(state, ctx.now, [{ action: 'proposal_failed', status: 'failed', message: `failed: ${reason}`, affectedPaths: [proposal.path] }]);
        return refuse(s, label, `The change could not be applied: ${reason}`);
      }
      const entry: HistoryEntry = {
        id: ctx.newId(), path: proposal.path, title: proposal.title, at: ctx.now, diff: proposal.diff,
        beforeHash: hashText(current), afterHash: hashText(result.text),
      };
      const s = logAll({ ...state, work: decideProposal(w, 'approve', entry) }, ctx.now, [
        { action: 'proposal_approved', status: 'approved', message: `Approved the change to ${proposal.path}.`, affectedPaths: [proposal.path] },
        { action: 'change_applied', status: 'applied', message: `Applied to the practice copy of ${proposal.path}.`, affectedPaths: [proposal.path] },
      ]);
      return accept(s, label, 'Approved and applied to the practice copy.');
    }
    case 'reject': {
      const refusal = decisionRefusal(w, 'reject');
      if (refusal) return refuse(state, label, refusal);
      const path = w.proposal!.path;
      const s = logAll({ ...state, work: decideProposal(w, 'reject') }, ctx.now, [
        { action: 'proposal_rejected', status: 'rejected', message: `Rejected the change to ${path}.`, affectedPaths: [path] },
      ]);
      return accept(s, label, 'Rejected.');
    }
    case 'undo':
    case 'redo': {
      const refusal = name === 'undo' ? undoRefusal(w) : redoRefusal(w);
      if (refusal) return refuse(state, label, refusal);
      const entry = name === 'undo' ? w.applied[w.applied.length - 1]! : w.undone[w.undone.length - 1]!;
      const current = practiceContent(snap!, w.applied, entry.path);
      const expected = name === 'undo' ? entry.afterHash : entry.beforeHash;
      const diff = name === 'undo' ? reverseUnifiedDiff(entry.diff) : entry.diff;
      const result = current !== undefined && diff !== null && hashText(current) === expected ? applyUnifiedDiff(current, diff) : undefined;
      const wanted = name === 'undo' ? entry.beforeHash : entry.afterHash;
      if (!result || !result.ok || hashText(result.text) !== wanted) {
        const s = logAll(state, ctx.now, [{ action: `change_${name}_failed`, status: 'failed', message: 'failed: file changed since', affectedPaths: [entry.path] }]);
        return refuse(s, label, 'The file changed since, so this could not be done.');
      }
      const s = logAll({ ...state, work: name === 'undo' ? undoChange(w) : redoChange(w) }, ctx.now, [
        name === 'undo'
          ? { action: 'change_undone', status: 'undone', message: `Undid the change to ${entry.path}.`, affectedPaths: [entry.path] }
          : { action: 'change_redone', status: 'applied', message: `Redid the change to ${entry.path}.`, affectedPaths: [entry.path] },
      ]);
      return accept(s, label, name === 'undo' ? 'Undone.' : 'Redone.');
    }
    case 'reset': {
      const s0: StudioState = { ...state, work: idleWork(), log: [] };
      const s = logAll(s0, ctx.now, [{ action: 'work_reset', status: 'info', message: 'Work reset.' }]);
      return accept(s, label, 'Work reset.', [{ type: 'cancel_ai' }, { type: 'clear_slot' }]);
    }
  }
}
