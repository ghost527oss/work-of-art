// @node: F9.6
// The patch export (layer 3): one combined, verified diff per file, from the loaded original to the practice copy.
import { JOURNAL_LIMITS as L } from '../config/journalLimits';
import { applyUnifiedDiff } from '../engine/diffApply';
import { containsSecret } from '../engine/redact';
import type { HistoryEntry } from '../store/workSlice';
import type { RepoSnapshot } from '../types/contracts';
import { buildUnifiedDiff } from './unifiedDiff';

export type Origin = 'user' | 'crew' | 'practice';
export const ORIGIN_WORDS: Record<Origin, string> = { user: 'Your edits', crew: 'Skeleton Crew fixes', practice: 'Practice run changes' };
export const EXCLUDE = {
  partial: 'This file was only partly read.',
  path: 'The path has special characters that a patch cannot carry safely.',
  secret: 'The changes contain a likely secret, so they are not exported.',
  verify: 'The patch could not be verified.',
  none: 'No net change.',
  size: 'Size limit reached.',
} as const;

export interface PatchPlanFile { path: string; origins: Origin[]; changes: number; hunks: number; added: number; removed: number; patch?: string; excluded?: string; defaultSelected: boolean }
export interface PatchPlan { files: PatchPlanFile[]; previewOnlyCount: number }

export function originOf(e: Pick<HistoryEntry, 'editKey' | 'diff'>): Origin {
  if (e.editKey?.startsWith('edit:')) return 'user';
  if (e.diff.split('\n').some((l) => l.startsWith('+') && !l.startsWith('+++') && l.includes('PRACTICE:'))) return 'practice';
  return 'crew';
}

export function originsOf(entries: readonly Pick<HistoryEntry, 'editKey' | 'diff'>[]): Origin[] {
  const set = new Set(entries.map(originOf));
  return (['user', 'crew', 'practice'] as Origin[]).filter((o) => set.has(o));
}

export function planPatchExport(snapshot: RepoSnapshot, applied: readonly HistoryEntry[], effective: (p: string) => string | undefined, previewOnlyCount = 0): PatchPlan {
  const byPath = new Map<string, HistoryEntry[]>();
  for (const e of applied) byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]);
  const files: PatchPlanFile[] = [];
  for (const path of [...byPath.keys()].sort()) {
    const entries = byPath.get(path)!;
    const origins = originsOf(entries);
    const baseInfo = { path, origins, changes: entries.length, hunks: 0, added: 0, removed: 0, defaultSelected: !origins.includes('practice') };
    const file = snapshot.files.find((f) => f.path === path);
    const original = file && file.loadStatus === 'loaded' && !file.truncated ? file.content : undefined;
    const final = effective(path);
    let excluded: string | undefined;
    let patch: string | undefined;
    if (original === undefined || final === undefined) excluded = EXCLUDE.partial;
    else if (!/^[A-Za-z0-9._/@+-]+$/.test(path)) excluded = EXCLUDE.path;
    else if (original === final) excluded = EXCLUDE.none;
    else {
      const d = buildUnifiedDiff(path, original, final, L.contextLines, L.diffWork);
      const check = d ? applyUnifiedDiff(original, d) : null;
      if (!d || !check || !check.ok || check.text !== final) excluded = EXCLUDE.verify;
      else if (containsSecret(d)) excluded = EXCLUDE.secret;
      else patch = d;
    }
    const lines = patch?.split('\n') ?? [];
    files.push({
      ...baseInfo,
      hunks: lines.filter((l) => l.startsWith('@@')).length,
      added: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length,
      removed: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length,
      ...(patch ? { patch } : {}), ...(excluded ? { excluded, defaultSelected: false } : {}),
    });
  }
  return { files, previewOnlyCount };
}

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
export const utf8Bytes = (t: string) => (encoder ? encoder.encode(t).length : t.length * 3);

export function buildPatch(plan: PatchPlan, selected: ReadonlySet<string>): { text: string; files: number; hunks: number; sizeExcluded: string[] } {
  let text = '';
  let files = 0;
  let hunks = 0;
  const sizeExcluded: string[] = [];
  let bytes = 0;
  let full = false;
  for (const f of plan.files) {
    if (!selected.has(f.path) || !f.patch) continue;
    const block = `diff --git a/${f.path} b/${f.path}\n${f.patch}`;
    const size = utf8Bytes(block);
    // R7.6: once the limit is reached, every later file is excluded with the size reason.
    if (full || bytes + size > L.patchBytes) { full = true; sizeExcluded.push(f.path); continue; }
    bytes += size;
    text += block;
    files++;
    hunks += f.hunks;
  }
  return { text, files, hunks, sizeExcluded };
}
