// @node: F12.8
// The picture pass of ingestion: after the text files, load the small local pictures that loaded pages and stylesheets
// use, within tight caps, and keep them apart from the text. Pictures are for the Sandbox only; they are never part of
// `files`, and nothing here sends them anywhere. No React, no global state.
import type { Budgets } from '../config/budgets';
import type { RepoFile, RepoInventoryEntry, RepoMedia } from '../types/contracts';
import { fetchBytesCapped, isAbortError, IngestError, type SourceDeps } from './githubSource';
import { base64Of, imageMimeFor, isImagePath } from './imageSniff';
import { isInScope } from './fileSelector';
import { referencedImages } from './mediaRefs';

export interface MediaPassInput {
  owner: string;
  repo: string;
  ref: string;
  files: readonly RepoFile[];
  byPath: Map<string, RepoInventoryEntry>;
  scope?: readonly string[] | undefined;
  budgets: Budgets;
  source: SourceDeps;
  /** True once the whole run should stop (deadline or rate limit). */
  shouldStop: () => boolean;
  /** Why the run stopped, in plain words (used for pictures that were not reached). */
  stopReason: () => string;
}

export interface MediaPassResult { media: RepoMedia[]; warnings: string[] }

const kb = (n: number): string => `${Math.max(1, Math.round(n / 1024))} KB`;
const bytesText = (n: number): string => `${n.toLocaleString('en-US')} bytes`;

function label(entry: RepoInventoryEntry, code: 'media_loaded' | 'media_too_large' | 'media_budget_reached' | 'media_failed', reason: string): RepoInventoryEntry {
  return { ...entry, loadStatus: 'skipped', reasonCode: code, reason };
}

/** Runs the picture pass. Updates `byPath` in place and returns the loaded pictures (sorted by path). */
export async function loadMedia(input: MediaPassInput): Promise<MediaPassResult> {
  const { byPath, budgets } = input;
  const warnings: string[] = [];
  const refs = referencedImages(input.files);
  const candidates: RepoInventoryEntry[] = [];
  for (const path of refs) {
    const e = byPath.get(path);
    if (!e || e.entryType !== 'file' || e.reasonCode !== 'excluded_media' || !isImagePath(path) || !isInScope(path, input.scope)) continue;
    candidates.push(e);
  }

  // Plan from the tree sizes, before any download.
  const planned: RepoInventoryEntry[] = [];
  let plannedBytes = 0;
  let tooLarge = 0;
  let overBudget = 0;
  for (const e of candidates) {
    const size = e.sizeBytes ?? budgets.maxImageBytes;
    if (e.sizeBytes !== undefined && e.sizeBytes > budgets.maxImageBytes) {
      byPath.set(e.path, label(e, 'media_too_large', `Picture is ${bytesText(e.sizeBytes)}, above the ${bytesText(budgets.maxImageBytes)} picture limit. Shown as a placeholder.`));
      tooLarge++;
      continue;
    }
    if (planned.length >= budgets.maxImages || plannedBytes + size > budgets.maxTotalImageBytes) {
      byPath.set(e.path, label(e, 'media_budget_reached', `Picture budget reached (${budgets.maxImages} pictures or ${kb(budgets.maxTotalImageBytes)} in all). Shown as a placeholder.`));
      overBudget++;
      continue;
    }
    planned.push(e);
    plannedBytes += size;
  }

  // Download, at most a few at a time, keeping the planned order for the result.
  const results = new Map<string, RepoMedia>();
  let total = 0;
  const lanes = Math.max(1, Math.min(budgets.fetchConcurrency, 5));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= planned.length) return;
      const e = planned[i]!;
      if (input.shouldStop()) {
        byPath.set(e.path, label(e, 'media_failed', `${input.stopReason()} Shown as a placeholder.`));
        continue;
      }
      try {
        const r = await fetchBytesCapped(input.owner, input.repo, input.ref, e.path, budgets.maxImageBytes, input.source);
        if (r.truncated) { byPath.set(e.path, label(e, 'media_too_large', `Picture is larger than ${bytesText(budgets.maxImageBytes)}. Shown as a placeholder.`)); tooLarge++; continue; }
        const mime = imageMimeFor(e.path, r.bytes);
        if (!mime || r.bytes.length === 0) { byPath.set(e.path, label(e, 'media_failed', 'Not a real picture (the file does not start like its type). Shown as a placeholder.')); continue; }
        if (total + r.bytes.length > budgets.maxTotalImageBytes) { byPath.set(e.path, label(e, 'media_budget_reached', `Picture budget reached (${kb(budgets.maxTotalImageBytes)} in all). Shown as a placeholder.`)); overBudget++; continue; }
        total += r.bytes.length;
        results.set(e.path, { path: e.path, mime, base64: base64Of(r.bytes), bytes: r.bytes.length });
        byPath.set(e.path, label(e, 'media_loaded', `Loaded for the preview only (${kb(r.bytes.length)}).`));
      } catch (error) {
        if (isAbortError(error)) throw error;
        const why = error instanceof IngestError && error.code === 'rate_limited' ? 'GitHub rate limit reached.' : 'The picture could not be loaded.';
        byPath.set(e.path, label(e, 'media_failed', `${why} Shown as a placeholder.`));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, planned.length) }, () => worker()));

  const media = [...results.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (tooLarge > 0) warnings.push(`${tooLarge} picture${tooLarge === 1 ? ' is' : 's are'} over ${kb(budgets.maxImageBytes)} and shown as placeholders.`);
  if (overBudget > 0) warnings.push(`${overBudget} picture${overBudget === 1 ? '' : 's'} not loaded because the picture budget was reached.`);
  return { media, warnings };
}
