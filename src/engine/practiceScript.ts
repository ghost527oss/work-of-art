// @node: F4.3
// Builds the fixed practice script and the practice copy of a file. Pure: reads the
// loaded snapshot, never changes it, makes no network call and no AI request.
import type { RepoSnapshot } from '../types/contracts';
import { WORK_LIMITS } from '../config/workLimits';
import { applyUnifiedDiff } from './diffApply';
import { redact } from './redact';
import { isSafeRepoPath } from './repoUrl';
import { buildInsertDiff, commentLineFor } from './unifiedDiff';

export type StepKind = 'info' | 'plan' | 'propose' | 'verify' | 'finish' | 'area' | 'finding';

export interface RunStep {
  kind: StepKind;
  title: string;
  skill?: string;
  path?: string;
  /** Crew runs (2D): the area a step belongs to, and the finding it narrates or fixes. */
  area?: 'frontend' | 'backend' | 'security' | 'api_data';
  findingId?: string;
}

export const PRACTICE_COMMENT = 'PRACTICE: example change from the practice run (no AI)';

export const SKILLS = {
  overview: 'repo-overview (practice)',
  coverage: 'coverage-check (practice)',
  plan: 'change-planner (practice)',
  propose: 'change-proposer (practice)',
  verify: 'verify-check (practice)',
} as const;

const encoder = new TextEncoder();

function suitablePaths(snapshot: RepoSnapshot): string[] {
  const paths: string[] = [];
  for (const f of snapshot.files) {
    if (f.loadStatus !== 'loaded' || f.truncated) continue;
    if (typeof f.content !== 'string' || f.content.length === 0) continue;
    if (!isSafeRepoPath(f.path)) continue;
    if (encoder.encode(f.content).length > WORK_LIMITS.maxPracticeFileBytes) continue;
    if (redact(f.content).count > 0) continue;
    paths.push(f.path);
  }
  paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return paths.slice(0, WORK_LIMITS.maxPracticeFiles);
}

/** Returns the practice steps, or `null` when no file is suitable. */
export function buildPracticeScript(snapshot: RepoSnapshot): RunStep[] | null {
  const paths = suitablePaths(snapshot);
  if (paths.length === 0) return null;
  const steps: RunStep[] = [
    { kind: 'info', title: 'Read the repository summary', skill: SKILLS.overview },
    { kind: 'info', title: 'Check coverage', skill: SKILLS.coverage },
    { kind: 'plan', title: `Plan a change to ${paths[0]}`, skill: SKILLS.plan },
  ];
  paths.forEach((path) => {
    steps.push({ kind: 'propose', title: `Propose a change to ${path}`, skill: SKILLS.propose, path });
    steps.push({ kind: 'verify', title: `Verify the change to ${path}`, skill: SKILLS.verify, path });
  });
  steps.push({ kind: 'finish', title: 'Finish the practice run' });
  return steps;
}

/** The zero-context practice diff for a path (inserts one "PRACTICE:" comment line at the top). */
export function buildPracticeDiff(path: string): string {
  return buildInsertDiff({ path, comment: commentLineFor(path, PRACTICE_COMMENT) }).diff;
}

export interface AppliedDiff {
  path: string;
  diff: string;
}

/**
 * The practice copy of a file: the loaded content with each applied diff for that path
 * applied in order. `undefined` when the file is missing or any diff does not apply.
 */
export function practiceContent(snapshot: RepoSnapshot, applied: readonly AppliedDiff[], path: string): string | undefined {
  const file = snapshot.files.find((f) => f.path === path);
  if (!file || typeof file.content !== 'string') return undefined;
  let text = file.content;
  for (const entry of applied) {
    if (entry.path !== path) continue;
    const r = applyUnifiedDiff(text, entry.diff);
    if (!r.ok) return undefined;
    text = r.text;
  }
  return text;
}
