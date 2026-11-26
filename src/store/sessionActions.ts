// @node: F10.2
// Whole-state actions for 2G: the Reset session state and the session Log lines (names and counts only).
import { redact } from '../engine/redact';
import { initialState, withLog, type StudioState } from './useStudioStore';

/** Everything back to the initial state, keeping only the ingestion run counter (so stale runs stay stale). */
export function resetSessionState(state: StudioState): StudioState {
  const fresh = initialState();
  return { ...fresh, ingestion: { ...fresh.ingestion, runId: state.ingestion.runId } };
}

export const SESSION_LINES = {
  restored: (name: string, screen: 3 | 4 | 5) => `Session restored: ${redact(name).text}, screen ${screen}.`,
  crew: 'The Skeleton Crew run was not restored. Start it again with Start Crew.',
  previewOnly: (n: number) => `${n} Preview Only changes were not restored.`,
  mode: 'The saved preview mode is not available, so the automatic mode was used.',
} as const;

const line = (s: StudioState, now: number, action: string, message: string): StudioState => ({ ...s, ...withLog(s, now, { action, status: 'info', message }) });

export const logRestored = (s: StudioState, now: number, name: string, screen: 3 | 4 | 5) => line(s, now, 'session_restored', SESSION_LINES.restored(name, screen));
export const logSessionNote = (s: StudioState, now: number, message: string) => line(s, now, 'session_note', message);
