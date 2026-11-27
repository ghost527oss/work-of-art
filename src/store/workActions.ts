// @node: F4.5
// @node: F6.7 (crew runs: start crew, crew steps, re-check after changes)
// @node: F8.5 (applyUserEdit)
// @node: F11.9 (approve: hash round trip and re-check line for AI proposals)
// Whole-state work actions: pure transitions from workSlice plus Log entries and chat replies,
// as one atomic update. Imports withLog from useStudioStore, as aiActions.ts does.
// useStudioStore imports only `idleWork` from workSlice, so there is no import cycle.
// Privacy: Log entries and chat replies hold paths and fixed phrases only. Never instruction
// text, file content, secrets, or diff bodies.
import { ACTIONS, HELP_LINES, PANEL_WORDS, type ActionName, type CommandArg } from '../engine/commands';
import { buildCrewScript, narrate } from '../engine/crewScript';
import { buildFixProposal } from '../engine/scanFix';
import { rescanPaths, scanFile } from '../engine/scanProject';
import { crewStartState, mergedFindings } from '../engine/scanView';
import { scanSkillById } from '../skillbook';
import { refreshScan } from './scanActions';
import { buildLineDiff } from '../edit/textDiff';
import { REASONS as EDIT_REASONS } from '../edit/elementMap';
import { containsSecret } from '../engine/redact';
import { WORK_LIMITS } from '../config/workLimits';
import { hashText, applyUnifiedDiff, reverseUnifiedDiff } from '../engine/diffApply';
import { PRACTICE_COMMENT, buildPracticeDiff, buildPracticeScript, practiceContent } from '../engine/practiceScript';
import { commentLineFor } from '../engine/unifiedDiff';
import type { PanelId } from './layoutSlice';
import { type StudioState, withLog, MAX_LOG_ENTRIES } from './useStudioStore';
import { repoKeyOf, type WorkRecord } from './workStorage';
import {
  addChat, decideProposal, decisionRefusal, idleWork, workProblems, pauseRefusal, pauseRun, redoChange, redoRefusal,
  resumeRefusal, resumeRun, runOneStep, setSelfEditingPause, startRefusal, startRun, stepRefusal,
  stopRefusal, stopRun, undoChange, undoRefusal, amendLastEntry, appendEntry, dropLastEntry, type HistoryEntry, type ProposalBuilder, type Run, type WorkState,
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
  arg?: CommandArg;
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
  // Only a change applied during THIS run counts: look back through the Log to the latest run start.
  let appliedThisRun = false;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i]!;
    if (e.action === 'run_started') break;
    if (e.action === 'change_applied' && e.affectedPaths.includes(path)) {
      appliedThisRun = true;
      break;
    }
  }
  if (appliedThisRun && text !== undefined && text.split('\n')[0]?.replace(/\r$/, '') === practiceLine) {
    return { action: 'run_verify', status: 'verified', message: `Verified: the practice copy of ${path} contains the practice line.`, affectedPaths: [path] };
  }
  return { action: 'run_verify', status: 'info', message: `Nothing to verify for ${path}: no change was applied in this run.`, affectedPaths: [path] };
}

const CREW_NARRATION = /^crew_(?:frontend|backend|security|api_data)$/;

/** Counts since the latest run start: findings narrated, fixes approved, fixes rejected. */
function crewSummary(state: StudioState): string {
  let narrated = 0, approved = 0, rejected = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i]!;
    if (e.action === 'run_started') break;
    if (CREW_NARRATION.test(e.action) && e.affectedPaths.length === 1) narrated++;
    else if (e.action === 'proposal_approved') approved++;
    else if (e.action === 'proposal_rejected') rejected++;
  }
  return `${narrated} findings narrated, ${approved} fixes approved, ${rejected} rejected.`;
}

function scanInputsOf(state: StudioState) {
  const snap = state.snapshot;
  const analysis = state.understanding.result;
  if (!snap || !analysis) return undefined;
  return { snapshot: snap, analysis, corrections: state.understanding.corrections, effective: (p: string) => practiceContent(snap, state.work.applied, p) };
}

/** Re-checks the given paths in the same update, so findings and work never disagree. */
function refreshFindings(state: StudioState, paths: string[]): StudioState {
  const inputs = scanInputsOf(state);
  if (!inputs || state.scan.status !== 'done' || !state.scan.result) return state;
  return refreshScan(state, rescanPaths(state.scan.result, paths, inputs));
}

function crewStepAndLog(state: StudioState, ctx: WorkCtx): StudioState {
  const before = state.work.run;
  const step = before?.steps[before.position];
  const inputs = scanInputsOf(state);
  if (!before || !step || !inputs) return state;
  const findings = mergedFindings(state);
  // Ids can shift after an earlier fix (same text, new counter), so fall back to skill, path, and line.
  const finding = step.findingId ? (findings.find((f) => f.id === step.findingId && (step.line === undefined || f.firstLine === step.line)) ?? findings.find((f) => f.skillId === step.skill && f.path === step.path && f.firstLine === step.line)) : undefined;
  const build: ProposalBuilder = () => {
    if (!finding) return null;
    const content = inputs.effective(finding.path);
    if (content === undefined) return null;
    const r = buildFixProposal(finding, content, (p, t) => scanFile(inputs, p, t));
    return r.ok ? { diff: r.diff, title: r.title, findingId: finding.id, source: 'crew' } : null;
  };
  const next = runOneStep(state.work, ctx.newId(), build);
  if (next === state.work || !next.run) return state;
  const n = next.run;
  const area = step.area;
  const entries: LogEntry[] = [{ action: 'run_step', status: 'info', message: `Step ${n.position} of ${n.steps.length}: ${step.title}`, affectedPaths: step.path ? [step.path] : [] }];
  if (step.kind === 'info') entries.push({ action: 'crew_info', status: 'info', message: step.title });
  else if (step.kind === 'area') entries.push({ action: `crew_${area}`, status: 'info', message: step.title });
  else if (step.kind === 'finding') {
    entries.push(finding
      ? { action: `crew_${area}`, status: 'info', message: narrate(finding), affectedPaths: [finding.path] }
      : { action: `crew_${area}`, status: 'info', message: 'This finding is already gone.' });
  } else if (step.kind === 'propose') {
    entries.push(next.proposal
      ? { action: 'proposal_created', status: 'proposed', message: `Proposal created for ${next.proposal.path}.`, affectedPaths: [next.proposal.path] }
      : { action: 'crew_fix_unavailable', status: 'info', message: 'A safe automatic fix could not be built here.', affectedPaths: step.path ? [step.path] : [] });
  } else if (step.kind === 'verify' && step.path) {
    let applied = false;
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i]!;
      if (e.action === 'run_started') break;
      if (e.action === 'change_applied' && e.affectedPaths.includes(step.path)) { applied = true; break; }
    }
    const text = inputs.effective(step.path);
    const skillId = finding?.skillId ?? step.skill;
    const line = step.line ?? finding?.firstLine;
    const still = applied && skillId && text !== undefined ? scanFile(inputs, step.path, text).some((f) => f.skillId === skillId && f.firstLine === line) : false;
    entries.push(!applied || !skillId
      ? { action: 'run_verify', status: 'info', message: `Nothing to verify for ${step.path}: no change was applied.`, affectedPaths: [step.path] }
      : text === undefined
        ? { action: 'run_verify', status: 'failed', message: `failed: ${step.path} could not be checked again.`, affectedPaths: [step.path] }
        : still
        ? { action: 'run_verify', status: 'failed', message: `failed: the check still reports this problem in ${step.path}.`, affectedPaths: [step.path] }
        : { action: 'run_verify', status: 'verified', message: `Verified: the check no longer reports this problem in ${step.path}.`, affectedPaths: [step.path] });
  }
  let s: StudioState = { ...state, work: next };
  if (n.status === 'finished') entries.push({ action: 'run_finished', status: 'info', message: `Skeleton Crew finished: ${crewSummary(s)}` });
  s = logAll(s, ctx.now, entries);
  return s;
}

/** Runs the step at the run's position and logs it. Caller has checked the guard. */
function runStepAndLog(state: StudioState, ctx: WorkCtx): StudioState {
  const before = state.work.run;
  if (!before) return state;
  if (before.kind === 'crew') return crewStepAndLog(state, ctx);
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
      if (!word || !(word in PANEL_WORDS)) return refuse(state, label, 'Use: open edit, chat, log, history, or journal.');
      return accept(state, label, `Opened ${word}.`, [{ type: 'open_panel', panel: PANEL_WORDS[word as keyof typeof PANEL_WORDS] }]);
    }
    case 'start': {
      if (cmd.arg === 'crew') {
        const gate = crewStartState(state, selfEditing);
        if (!gate.enabled) return refuse(state, label, gate.reason!);
        const crewSteps = buildCrewScript({ ...state.scan.result!, findings: mergedFindings(state) }, undefined, undefined, state.preview.layout.status === 'done');
        const crewWork = startRun(w, ctx.newId(), crewSteps, selfEditing, 'crew');
        if (crewWork === w) return refuse(state, label, 'The crew script is too long to start.');
        const cs = logAll({ ...state, work: crewWork }, ctx.now, [{ action: 'run_started', status: 'info', message: `Skeleton Crew run started with ${crewSteps.length} steps.` }]);
        return accept(cs, label, 'Skeleton Crew run started.');
      }
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
      // Phase 3A: Stop also rejects a waiting AI change, even when no run is active.
      const aiWaiting = refusal !== null && w.proposal !== null && w.proposal.source === 'ai';
      if (refusal && !aiPending && !aiWaiting) return refuse(state, label, refusal);
      let s = state;
      if (aiWaiting) {
        s = logAll({ ...state, work: { ...w, proposal: null } }, ctx.now, [
          { action: 'proposal_rejected', status: 'rejected', message: 'rejected: stopped', affectedPaths: [w.proposal!.path] },
        ]);
      }
      if (!refusal) {
        const entries: LogEntry[] = [];
        if (w.proposal) {
          entries.push({ action: 'proposal_rejected', status: 'rejected', message: 'rejected: run stopped', affectedPaths: [w.proposal.path] });
        }
        entries.push({ action: 'run_stopped', status: 'info', message: 'Run stopped.' });
        s = logAll({ ...state, work: stopRun(w) }, ctx.now, entries);
        if (w.run?.kind === 'crew') s = logAll(s, ctx.now, [{ action: 'crew_stopped', status: 'info', message: `Skeleton Crew stopped: ${crewSummary(s)}` }]);
      }
      return accept(s, label, refusal ? (aiWaiting ? 'Rejected the waiting AI change.' : 'Cancelled the pending AI request.') : 'Stopped.', [{ type: 'cancel_ai' }]);
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
      // An AI change must reverse to the exact original text before anything is recorded (mixed line endings fail here).
      if (proposal.source === 'ai') {
        const back = reverseUnifiedDiff(proposal.diff);
        const undone = back === null ? undefined : applyUnifiedDiff(result.text, back);
        if (!undone || !undone.ok || hashText(undone.text) !== hashText(current)) {
          const s = logAll(state, ctx.now, [{ action: 'proposal_failed', status: 'failed', message: 'failed: the change could not be undone exactly', affectedPaths: [proposal.path] }]);
          return refuse(s, label, 'The change could not be applied: it could not be undone exactly, so nothing was changed.');
        }
      }
      const aiFinding = proposal.source === 'ai' && proposal.findingId
        ? mergedFindings(state).find((f) => f.id === proposal.findingId)
        : undefined;
      const entry: HistoryEntry = {
        id: ctx.newId(), path: proposal.path, title: proposal.title, at: ctx.now, diff: proposal.diff,
        beforeHash: hashText(current), afterHash: hashText(result.text),
        ...(proposal.source === 'crew' && proposal.findingId ? { area: state.scan.result?.findings.find((f) => f.id === proposal.findingId)?.primary } : {}),
      };
      const afterState = refreshFindings({ ...state, work: decideProposal(w, 'approve', entry) }, [proposal.path]);
      const lines: LogEntry[] = [
        { action: 'proposal_approved', status: 'approved', message: `Approved the change to ${proposal.path}.`, affectedPaths: [proposal.path] },
        { action: 'change_applied', status: 'applied', message: `Applied to the practice copy of ${proposal.path}.`, affectedPaths: [proposal.path] },
      ];
      if (aiFinding) {
        // Only the re-scan decides: "no longer found" is said only when the check no longer reports it. Never "fixed".
        const still = mergedFindings(afterState).some((f) => f.skillId === aiFinding.skillId && f.path === aiFinding.path);
        const title = scanSkillById(aiFinding.skillId)?.title ?? aiFinding.skillId;
        lines.push(still
          ? { action: 'ai_recheck', status: 'info', message: `Re-check: ${title} is still found in ${aiFinding.path}.`, affectedPaths: [aiFinding.path] }
          : { action: 'ai_recheck', status: 'verified', message: `Re-check: ${title} is no longer found in ${aiFinding.path}.`, affectedPaths: [aiFinding.path] });
      }
      const s = logAll(afterState, ctx.now, lines);
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
      const s = logAll(refreshFindings({ ...state, work: name === 'undo' ? undoChange(w) : redoChange(w) }, [entry.path]), ctx.now, [
        name === 'undo'
          ? { action: 'change_undone', status: 'undone', message: `Undid the change to ${entry.path}.`, affectedPaths: [entry.path] }
          : { action: 'change_redone', status: 'applied', message: `Redid the change to ${entry.path}.`, affectedPaths: [entry.path] },
      ]);
      return accept(s, label, name === 'undo' ? 'Undone.' : 'Redone.');
    }
    case 'reset': {
      const s0: StudioState = refreshFindings({ ...state, work: idleWork(), log: [] }, [...new Set([...w.applied, ...w.undone].map((e) => e.path))]);
      const s = logAll(s0, ctx.now, [{ action: 'work_reset', status: 'info', message: 'Work reset.' }]);
      return accept(s, label, 'Work reset.', [{ type: 'cancel_ai' }, { type: 'clear_slot' }]);
    }
  }
}

export const DISCARD_MESSAGE = 'Saved changes did not match the loaded files, so they were not restored.';

/** Re-applies the saved history to the loaded files and compares every fingerprint. */
function historyMatches(state: StudioState, record: WorkRecord): boolean {
  const snap = state.snapshot;
  if (!snap) return false;
  const texts = new Map<string, string>();
  const textOf = (path: string): string | undefined => {
    if (texts.has(path)) return texts.get(path);
    const f = snap.files.find((x) => x.path === path);
    if (!f || f.loadStatus !== 'loaded' || f.truncated || typeof f.content !== 'string') return undefined;
    texts.set(path, f.content);
    return f.content;
  };
  const step = (e: WorkRecord['applied'][number], diff: string | null, from: string, to: string): boolean => {
    const cur = textOf(e.path);
    if (cur === undefined || diff === null || hashText(cur) !== from) return false;
    const r = applyUnifiedDiff(cur, diff);
    if (!r.ok || hashText(r.text) !== to) return false;
    texts.set(e.path, r.text);
    return true;
  };
  for (const e of record.applied) if (!step(e, e.diff, e.beforeHash, e.afterHash)) return false;
  for (let i = record.undone.length - 1; i >= 0; i--) {
    const e = record.undone[i]!;
    if (!step(e, e.diff, e.beforeHash, e.afterHash)) return false;
  }
  // The redo chain was walked forward from the applied state; the files themselves are unchanged for later use.
  return true;
}

/**
 * Restores saved work for the loaded snapshot. A different repository key restores nothing.
 * `restoreLog` is true only once per page load. A fingerprint or file mismatch discards the
 * history, run, and proposal, keeps the log, and writes one Log line.
 */
export function restoreWork(state: StudioState, record: WorkRecord, ctx: WorkCtx, opts: { restoreLog: boolean }): StudioState {
  const snap = state.snapshot;
  if (!snap || record.repoKey !== repoKeyOf(snap)) return state;
  let s = state;
  if (opts.restoreLog && record.log.length > 0) {
    let seq = s.logSeq;
    const restored = record.log.map((e) => ({ ...e, id: `log-${++seq}`, affectedPaths: [...e.affectedPaths] }));
    const log = [...restored, ...s.log];
    s = { ...s, log: log.length > MAX_LOG_ENTRIES ? log.slice(log.length - MAX_LOG_ENTRIES) : log, logSeq: seq };
  }
  const hasWork = record.run !== null || record.proposal !== null || record.applied.length > 0 || record.undone.length > 0;
  if (!hasWork) return s;
  const w = s.work;
  if (w.run !== null || w.proposal !== null || w.applied.length > 0 || w.undone.length > 0) return s;

  const proposalFile = record.proposal ? snap.files.find((f) => f.path === record.proposal!.path) : undefined;
  const candidate: WorkState = {
    ...w,
    run: record.run
      ? { ...record.run, kind: 'practice' as const, steps: record.run.steps.map((x) => ({ ...x })), status: record.run.status === 'running' ? 'paused' : record.run.status, autoAdvance: false }
      : null,
    proposal: record.proposal ? { ...record.proposal, source: 'practice' as const } : null,
    applied: record.applied.map((e) => ({ ...e })),
    undone: record.undone.map((e) => ({ ...e })),
    runSeq: record.run ? Math.max(w.runSeq, 1) : w.runSeq,
  };
  // The waiting proposal and the run script are always practice data: rebuild them and compare.
  const scriptNow = buildPracticeScript(snap);
  const trusted =
    (record.run === null || (scriptNow !== null && JSON.stringify(record.run.steps) === JSON.stringify(scriptNow))) &&
    (record.proposal === null || record.proposal.diff === buildPracticeDiff(record.proposal.path));
  const good =
    trusted &&
    historyMatches(s, record) &&
    (record.proposal === null || (proposalFile !== undefined && proposalFile.loadStatus === 'loaded' && typeof proposalFile.content === 'string')) &&
    workProblems(candidate).length === 0;
  if (!good) {
    return logAll(s, ctx.now, [{ action: 'work_discarded', status: 'failed', message: DISCARD_MESSAGE }]);
  }
  return logAll({ ...s, work: candidate }, ctx.now, [
    { action: 'work_restored', status: 'info', message: `Saved work restored: ${record.applied.length} applied, ${record.undone.length} undone.` },
  ]);
}

// ---------------------------------------------------------------------------
// Your own Edit pad changes (2E-2): applied at once, merged per burst, one atomic update.
// ---------------------------------------------------------------------------

export interface UserEdit { path: string; baseHash: string; newContent: string; editKey: string; title: string }
export type UserEditResult = { state: StudioState; recorded: boolean; reason?: string };

export function applyUserEdit(state: StudioState, edit: UserEdit, ctx: WorkCtx): UserEditResult {
  const snap = state.snapshot;
  if (!snap) return { state, recorded: false, reason: EDIT_REASONS.changed };
  const w = state.work;
  const current = practiceContent(snap, w.applied, edit.path);
  if (current === undefined || hashText(current) !== edit.baseHash) return { state, recorded: false, reason: EDIT_REASONS.changed };
  const last = w.applied[w.applied.length - 1];
  const merging = !!last && last.editKey === edit.editKey && last.path === edit.path && w.undone.length === 0;
  let work: WorkState;
  let message: string;
  let diff: string | null;
  if (merging) {
    const rev = reverseUnifiedDiff(last!.diff);
    const orig = rev ? applyUnifiedDiff(current, rev) : null;
    if (!orig || !orig.ok) return { state, recorded: false, reason: EDIT_REASONS.changed };
    diff = buildLineDiff(edit.path, orig.text, edit.newContent);
    if (diff === null) {
      work = dropLastEntry(w);
      const s = logAll(refreshFindings({ ...state, work }, [edit.path]), ctx.now, [{ action: 'style_reverted', status: 'undone', message: 'Style change reverted', affectedPaths: [edit.path] }]);
      return { state: s, recorded: true };
    }
    const check = checkDiff(orig.text, diff, edit.newContent);
    if (check) return { state, recorded: false, reason: check };
    work = amendLastEntry(w, { ...last!, diff, at: ctx.now, title: edit.title.slice(0, 80), afterHash: hashText(edit.newContent) });
    message = `Style change recorded: ${edit.title.slice(0, 80)}`;
  } else {
    if (w.applied.length + w.undone.length >= WORK_LIMITS.maxHistoryEntries) return { state, recorded: false, reason: EDIT_REASONS.full };
    diff = buildLineDiff(edit.path, current, edit.newContent);
    if (diff === null) return { state, recorded: false, reason: undefined };
    const check = checkDiff(current, diff, edit.newContent);
    if (check) return { state, recorded: false, reason: check };
    work = appendEntry(w, { id: ctx.newId(), path: edit.path, title: edit.title.slice(0, 80), at: ctx.now, diff, beforeHash: hashText(current), afterHash: hashText(edit.newContent), editKey: edit.editKey.slice(0, 200) });
    message = `Style change recorded: ${edit.title.slice(0, 80)}`;
  }
  const s = logAll(refreshFindings({ ...state, work }, [edit.path]), ctx.now, [{ action: 'style_recorded', status: 'applied', message, affectedPaths: [edit.path] }]);
  return { state: s, recorded: true };
}

function checkDiff(from: string, diff: string, expected: string): string | null {
  if (diff.length > WORK_LIMITS.maxDiffChars) return EDIT_REASONS.large;
  if (containsSecret(diff)) return EDIT_REASONS.secret;
  const r = applyUnifiedDiff(from, diff);
  if (!r.ok || r.text !== expected) return EDIT_REASONS.changed;
  return null;
}
