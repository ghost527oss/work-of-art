// @node: F9.8
// The reading level preference (the only new saved item in 2F) and the small Journal store.
import { z } from 'zod';
import type { Level } from '../skillbook/playbookSchema';
import type { KeyValueStorage } from './layoutStorage';
import { createStore, type Store } from './useStudioStore';

export const LEVEL_KEY = 'patchbay.journal.v1';
export const LevelRecordSchema = z.strictObject({ version: z.literal(1), level: z.enum(['simple', 'practical', 'deeper']) });

export function loadLevel(storage: KeyValueStorage | undefined): Level {
  if (!storage) return 'simple';
  try {
    const t = storage.getItem(LEVEL_KEY);
    if (!t || t.length > 200) return 'simple';
    const r = LevelRecordSchema.safeParse(JSON.parse(t));
    return r.success ? r.data.level : 'simple';
  } catch {
    return 'simple';
  }
}

export function saveLevel(storage: KeyValueStorage | undefined, level: Level): void {
  if (!storage) return;
  try { storage.setItem(LEVEL_KEY, JSON.stringify({ version: 1, level })); } catch { /* blocked or full */ }
}

export interface JournalState { level: Level; focusLesson?: string }
export function createJournalStore(level: Level): Store<JournalState> {
  return createStore<JournalState>({ level });
}
