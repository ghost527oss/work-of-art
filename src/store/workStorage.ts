// @node: F4.6
// Saved work: one slot in browser storage. The record holds the run script, the waiting
// proposal (zero-context diff), the history (diffs and fingerprints), and the log. It never
// holds file contents, AI requests or results, chat replies, secrets, or the mode.
// Nothing here throws. No React, no network.
import { z } from 'zod';
import { WORK_LIMITS } from '../config/workLimits';
import { containsSecret, redact } from '../engine/redact';
import { SessionLogEntrySchema, type RepoSnapshot } from '../types/contracts';
import type { KeyValueStorage } from './layoutStorage';
import type { StudioState } from './useStudioStore';

export const WORK_KEY = 'patchbay.work.v1';

const Hash = z.string().regex(/^[0-9a-f]{8}$/);
const Short = z.string().min(1).max(300);

const StepSchema = z.strictObject({
  kind: z.enum(['info', 'plan', 'propose', 'verify', 'finish']),
  title: Short,
  skill: Short.optional(),
  path: Short.optional(),
});

const RunSchema = z.strictObject({
  id: Short,
  status: z.enum(['running', 'paused', 'awaiting_decision', 'stopped', 'finished']),
  autoAdvance: z.boolean(),
  position: z.number().int().min(0).max(WORK_LIMITS.maxSteps),
  steps: z.array(StepSchema).min(1).max(WORK_LIMITS.maxSteps),
});

const ProposalSchema = z.strictObject({
  id: Short,
  path: Short,
  title: Short,
  diff: z.string().min(1).max(WORK_LIMITS.maxDiffChars),
});

const HistorySchema = z.strictObject({
  id: Short,
  path: Short,
  title: Short,
  at: z.number(),
  diff: z.string().min(1).max(WORK_LIMITS.maxDiffChars),
  beforeHash: Hash,
  afterHash: Hash,
  area: z.enum(['frontend', 'backend', 'security', 'api_data']).optional(),
  editKey: z.string().min(1).max(200).optional(),
});

export const WorkRecordSchema = z
  .strictObject({
    version: z.literal(1),
    repoKey: z.string().min(1).max(500),
    savedAt: z.number(),
    run: RunSchema.nullable(),
    proposal: ProposalSchema.nullable(),
    applied: z.array(HistorySchema).max(WORK_LIMITS.maxHistoryEntries),
    undone: z.array(HistorySchema).max(WORK_LIMITS.maxHistoryEntries),
    log: z.array(SessionLogEntrySchema).max(WORK_LIMITS.maxSavedLogEntries),
  })
  .refine((r) => r.applied.length + r.undone.length <= WORK_LIMITS.maxHistoryEntries, 'history too long');

export type WorkRecord = z.infer<typeof WorkRecordSchema>;

const encoder = new TextEncoder();

export function repoKeyOf(snapshot: Pick<RepoSnapshot, 'source' | 'owner' | 'name' | 'ref'>): string {
  return `${snapshot.source}:${snapshot.owner}/${snapshot.name}@${snapshot.ref}`;
}

/** "owner/name" part of a repo key, for the "was replaced" Log line. */
export function labelOfKey(key: string): string {
  const afterSource = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
  const at = afterSource.indexOf('@');
  return (at === -1 ? afterSource : afterSource.slice(0, at)).slice(0, 140);
}

export function replacedMessage(oldKey: string): string {
  return `Saved work for ${labelOfKey(oldKey)} was replaced.`;
}

export const TRIMMED_MESSAGE = 'Saved work was trimmed.';
export const SECRET_MESSAGE = 'Saved work was not updated: a change contains a likely secret.';
export const TOO_BIG_MESSAGE = 'Saved work is too large to save, so it was not saved.';

/** Builds the record from the current state, or `null` when no snapshot is loaded. Writes the allowed fields only. */
export function buildRecord(state: StudioState, now: number): WorkRecord | null {
  const snap = state.snapshot;
  if (!snap) return null;
  const w = state.work;
  // A crew run and a crew proposal are never saved (2D R6.10); the applied fixes come back through History.
  const savedRun = w.run && w.run.kind === 'practice' ? w.run : null;
  const savedProposal = w.proposal && w.proposal.source === 'practice' ? w.proposal : null;
  const run = savedRun
    ? {
        id: savedRun.id,
        status: savedRun.status === 'running' ? ('paused' as const) : savedRun.status,
        autoAdvance: false,
        position: savedRun.position,
        steps: savedRun.steps.map((s) => ({
          kind: s.kind as 'info' | 'plan' | 'propose' | 'verify' | 'finish',
          title: s.title,
          ...(s.skill !== undefined ? { skill: s.skill } : {}),
          ...(s.path !== undefined ? { path: s.path } : {}),
        })),
      }
    : null;
  const entry = (e: StudioState['work']['applied'][number]) => ({
    id: e.id, path: e.path, title: e.title, at: e.at, diff: e.diff, beforeHash: e.beforeHash, afterHash: e.afterHash,
    ...(e.area ? { area: e.area } : {}),
    ...(e.editKey ? { editKey: e.editKey } : {}),
  });
  return {
    version: 1,
    repoKey: repoKeyOf(snap),
    savedAt: now,
    run,
    proposal: savedProposal ? { id: savedProposal.id, path: savedProposal.path, title: savedProposal.title, diff: savedProposal.diff } : null,
    applied: w.applied.map(entry),
    undone: w.undone.map(entry),
    log: state.log.slice(-WORK_LIMITS.maxSavedLogEntries).map((e) => ({
      id: e.id, timestamp: e.timestamp, action: e.action, status: e.status, affectedPaths: [...e.affectedPaths],
      message: redact(e.message).text, redacted: e.redacted,
    })),
  };
}

/** True when any history diff looks like it contains a secret (the history is then not saved). */
export function historyHasSecret(state: StudioState): boolean {
  return [...state.work.applied, ...state.work.undone].some((e) => containsSecret(e.diff));
}

export function recordBytes(record: WorkRecord): number {
  return encoder.encode(JSON.stringify(record)).length;
}

export interface TrimResult {
  record: WorkRecord;
  /** Something was dropped to fit. */
  trimmed: boolean;
  /** Applied changes alone do not fit, so the record must not be saved. */
  tooBig: boolean;
}

/** Drops the oldest log entries first, then the oldest undone changes. Never drops an applied change. */
export function trimRecord(record: WorkRecord, maxBytes: number = WORK_LIMITS.maxSavedBytes): TrimResult {
  if (recordBytes(record) <= maxBytes) return { record, trimmed: false, tooBig: false };
  let log = record.log;
  let undone = record.undone;
  const build = (): WorkRecord => ({ ...record, log, undone });
  // Drop log entries in chunks so a large log is not re-measured 200 times.
  while (log.length > 0 && recordBytes(build()) > maxBytes) log = log.slice(Math.max(1, Math.ceil(log.length / 10)));
  while (undone.length > 0 && recordBytes(build()) > maxBytes) undone = undone.slice(1);
  const out = build();
  return { record: out, trimmed: true, tooBig: recordBytes(out) > maxBytes };
}

/** Returns the saved record, or `null` for anything missing, unreadable, oversized, old, or unknown. */
export function loadWork(storage: KeyValueStorage | undefined): WorkRecord | null {
  if (!storage) return null;
  let text: string | null;
  try {
    text = storage.getItem(WORK_KEY);
  } catch {
    return null;
  }
  if (text === null || text.length > WORK_LIMITS.maxSavedBytes) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = WorkRecordSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Writes the record. Returns false when storage is missing, blocked, or full. */
export function saveWork(storage: KeyValueStorage | undefined, record: WorkRecord): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WORK_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearWorkSlot(storage: KeyValueStorage | undefined): void {
  if (!storage) return;
  try {
    if (storage.removeItem) storage.removeItem(WORK_KEY);
    else storage.setItem(WORK_KEY, '');
  } catch {
    /* ignore */
  }
}
