// @node: F5.9
// Saved label corrections: one slot, one repository. Only paths and label names are saved:
// no reasons, file contents, or connections. Nothing here throws.
import { z } from 'zod';
import { UNDERSTANDING_LIMITS as L } from '../config/understandingLimits';
import type { Label } from '../engine/understandTypes';
import type { RepoSnapshot } from '../types/contracts';
import type { KeyValueStorage } from './layoutStorage';
import { SELECTABLE_LABELS } from './understandingSlice';
import { repoKeyOf } from './workStorage';

export const CORRECTIONS_KEY = 'patchbay.corrections.v1';

const LabelEnum = z.enum(SELECTABLE_LABELS as unknown as [string, ...string[]]);

export const CorrectionsRecordSchema = z.strictObject({
  version: z.literal(1),
  repoKey: z.string().min(1).max(500),
  savedAt: z.number(),
  corrections: z.record(z.string().min(1).max(250), z.array(LabelEnum).min(1).max(9)).refine((c) => Object.keys(c).length <= L.maxCorrections, 'too many corrections'),
});
export type CorrectionsRecord = z.infer<typeof CorrectionsRecordSchema>;

/** The saved record, or null for anything missing, unreadable, oversized, old, or with unknown fields. */
export function loadCorrectionsRecord(storage: KeyValueStorage | undefined): CorrectionsRecord | null {
  if (!storage) return null;
  let text: string | null;
  try { text = storage.getItem(CORRECTIONS_KEY); } catch { return null; }
  if (text === null || text.length > L.maxSavedBytes) return null;
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  const parsed = CorrectionsRecordSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Corrections for this repository only, dropping paths that are not in the loaded inventory. Never throws. */
export function loadCorrectionsFor(storage: KeyValueStorage | undefined, snapshot: RepoSnapshot): Record<string, Label[]> {
  const record = loadCorrectionsRecord(storage);
  if (!record || record.repoKey !== repoKeyOf(snapshot)) return {};
  const present = new Set(snapshot.inventory.entries.filter((e) => e.entryType === 'file').map((e) => e.path));
  const out: Record<string, Label[]> = {};
  for (const [path, labels] of Object.entries(record.corrections)) if (present.has(path)) out[path] = labels as Label[];
  return out;
}

export function saveCorrections(storage: KeyValueStorage | undefined, snapshot: RepoSnapshot, corrections: Readonly<Record<string, readonly Label[]>>, now: number): boolean {
  if (!storage) return false;
  try {
    const record = { version: 1, repoKey: repoKeyOf(snapshot), savedAt: now, corrections };
    const text = JSON.stringify(record);
    if (text.length > L.maxSavedBytes) return false;
    storage.setItem(CORRECTIONS_KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function clearCorrectionsSlot(storage: KeyValueStorage | undefined): void {
  if (!storage) return;
  try {
    if (storage.removeItem) storage.removeItem(CORRECTIONS_KEY);
    else storage.setItem(CORRECTIONS_KEY, '');
  } catch { /* ignore */ }
}
