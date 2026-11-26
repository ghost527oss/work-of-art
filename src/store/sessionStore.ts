// @node: F10.2
// The small restore store and its pure transitions (design 8.1). Refused transitions return the SAME object.
import type { SessionRecord } from './sessionRecord';
import { createStore, type Store } from './useStudioStore';

export type RestoreStatus = 'idle' | 'pending' | 'applying' | 'done' | 'failed' | 'cancelled';

export interface SessionStoreState {
  status: RestoreStatus;
  /** The record read at startup (shown by the Resume banner). */
  record?: SessionRecord;
  /** The ingestion run id of the restore load. */
  pendingRunId?: number;
  screenApplied: boolean;
  previewApplied: boolean;
  /** "Session reset. Nothing from it is saved." */
  notice?: string;
}

export const RESET_NOTICE = 'Session reset. Nothing from it is saved.';

export function idleSession(record?: SessionRecord): SessionStoreState {
  return { status: 'idle', ...(record ? { record } : {}), screenApplied: false, previewApplied: false };
}

/** Remember the record read at startup (no restore yet). */
export function setRecord(s: SessionStoreState, record: SessionRecord | undefined): SessionStoreState {
  if (s.record === record) return s;
  return record ? { ...s, record } : { status: s.status, screenApplied: s.screenApplied, previewApplied: s.previewApplied, ...(s.notice ? { notice: s.notice } : {}) };
}

export function begin(s: SessionStoreState, record: SessionRecord, runId: number): SessionStoreState {
  if (s.status === 'pending' || s.status === 'applying') return s;
  return { status: 'pending', record, pendingRunId: runId, screenApplied: false, previewApplied: false };
}

export function loaded(s: SessionStoreState, runId: number): SessionStoreState {
  if (s.status !== 'pending' || s.pendingRunId !== runId) return s;
  return { ...s, status: 'applying' };
}

export function markApplied(s: SessionStoreState, part: 'screen' | 'preview'): SessionStoreState {
  if (s.status !== 'applying') return s;
  if (part === 'screen' ? s.screenApplied : s.previewApplied) return s;
  return part === 'screen' ? { ...s, screenApplied: true } : { ...s, previewApplied: true };
}

export function applied(s: SessionStoreState): SessionStoreState {
  if (s.status !== 'applying') return s;
  return { ...s, status: 'done' };
}

export function failed(s: SessionStoreState, runId: number): SessionStoreState {
  if (s.status !== 'pending' || s.pendingRunId !== runId) return s;
  return { ...s, status: 'failed' };
}

export function cancelled(s: SessionStoreState): SessionStoreState {
  if (s.status !== 'pending') return s;
  return { ...s, status: 'cancelled' };
}

/** Back to Start or Reset session: the record is forgotten. */
export function resetSessionStore(_s: SessionStoreState, notice?: string): SessionStoreState {
  return { ...idleSession(), ...(notice ? { notice } : {}) };
}

export function createSessionStore(record?: SessionRecord): Store<SessionStoreState> {
  return createStore<SessionStoreState>(idleSession(record));
}
