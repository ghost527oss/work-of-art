// @node: F4.8
// The always-visible status line with the one Stop button. Props only.
import type { RunStatus } from '../store/workSlice';

export interface StopBarRun {
  /** `crew` shows "Skeleton Crew run". Missing or `practice` shows "Practice run (no AI)". */
  kind?: 'practice' | 'crew';
  status: RunStatus;
  position: number;
  total: number;
  autoAdvance: boolean;
}

export interface StopBarProps {
  mode: 'automation' | 'self_editing';
  run: StopBarRun | null;
  waiting: boolean;
  /** An AI request is pending, so Stop has something to cancel even without a run. */
  aiPending?: boolean;
  onStop(): void;
}

const STATE_TEXT: Record<RunStatus, string> = {
  running: 'running',
  paused: 'paused',
  awaiting_decision: 'waiting for a decision',
  stopped: 'stopped',
  finished: 'finished',
};

export function isRunActive(run: StopBarRun | null): boolean {
  return run !== null && (run.status === 'running' || run.status === 'paused' || run.status === 'awaiting_decision');
}

export function StopBar({ mode, run, waiting, aiPending = false, onStop }: StopBarProps) {
  const active = isRunActive(run);
  const canStop = active || aiPending;
  const showResumeHint = run !== null && active && !run.autoAdvance;
  return (
    <div className="stop-bar" role="status" aria-live="polite">
      <span className="stop-bar-text">
        {run === null ? 'No run. Type start in AI Chat.' : `${run.kind === 'crew' ? 'Skeleton Crew run' : 'Practice run (no AI)'}: ${STATE_TEXT[run.status]}, step ${run.position} of ${run.total}.`}
      </span>{' '}
      <span className="stop-bar-text">Mode: {mode === 'self_editing' ? 'Self-editing' : 'Automation'}.</span>
      {waiting && <span className="stop-bar-text"> Waiting for your decision.</span>}
      {showResumeHint && <span className="stop-bar-text"> Type resume in AI Chat to continue.</span>}{' '}
      <button type="button" className="stop-button" disabled={!canStop} onClick={onStop}>
        Stop
      </button>
    </div>
  );
}
