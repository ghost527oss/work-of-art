// @node: F10.1
// The session record (patchbay.session.v1): an address and a view, never contents. Strict schema,
// storage helpers that never throw, the record builder, and the saved-data inventory (sizes only).
import { z } from 'zod';
import { SESSION_LIMITS as L } from '../config/sessionLimits';
import { isSampleId } from '../data/sampleRepos';
import { isSafeRepoPath, isValidOwner, isValidRef, isValidRepo } from '../engine/repoUrl';
import type { PreviewState } from './previewSlice';
import type { ShellView } from './shellView';
import type { IngestTarget, StudioState } from './useStudioStore';
import type { KeyValueStorage } from './layoutStorage';

export const SESSION_KEY = 'patchbay.session.v1';
export const WORK_KEY_NAME = 'patchbay.work.v1';
export const CORRECTIONS_KEY_NAME = 'patchbay.corrections.v1';
export const LAYOUT_KEY_NAME = 'patchbay.studio-layout.v1';
export const JOURNAL_KEY_NAME = 'patchbay.journal.v1';

const safePath = z.string().min(1).max(L.pathChars).refine(isSafeRepoPath);
const COMPONENT = /^[A-Za-z0-9._/@+-]{1,250}#[A-Za-z_$][A-Za-z0-9_$]{0,99}$/;

const TargetSchema = z.strictObject({
  source: z.enum(['github', 'sample']),
  owner: z.string().min(1).max(39),
  repo: z.string().min(1).max(100),
  ref: z.string().min(1).max(250).optional(),
  scope: z.array(safePath).min(1).max(L.folders).optional(),
  sampleId: z.string().optional(),
}).superRefine((t, ctx) => {
  if (t.source === 'sample') {
    if (!t.sampleId || !isSampleId(t.sampleId) || t.repo !== t.sampleId || t.owner !== 'sample' || t.ref !== undefined || t.scope !== undefined) ctx.addIssue({ code: 'custom', message: 'bad sample target' });
  } else {
    if (t.sampleId !== undefined || !isValidOwner(t.owner) || !isValidRepo(t.repo) || (t.ref !== undefined && !isValidRef(t.ref))) ctx.addIssue({ code: 'custom', message: 'bad github target' });
  }
});

const ScreenSchema = z.strictObject({
  screen: z.enum(['studio', 'skeleton', 'domain']),
  area: z.enum(['frontend', 'backend', 'security', 'api_data']).optional(),
}).refine((s) => (s.screen === 'domain') === (s.area !== undefined));

const PreviewSchema = z.strictObject({
  width: z.union([z.literal(375), z.literal(768), z.literal(1024), z.literal(0)]),
  mode: z.enum(['auto', 'static', 'workbench', 'source']),
  entryPath: safePath.optional(),
  component: z.string().regex(COMPONENT).optional(),
});

export const SessionRecordSchema = z.strictObject({
  version: z.literal(1),
  savedAt: z.number().int().nonnegative(),
  target: TargetSchema,
  screen: ScreenSchema,
  preview: PreviewSchema,
  notes: z.strictObject({ crewWasActive: z.boolean(), previewOnlyCount: z.number().int().min(0).max(L.maxPreviewOnly) }),
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type SessionTarget = SessionRecord['target'];
export type SessionBody = Omit<SessionRecord, 'savedAt'>;

/** The same checks the Start screen uses. Returns a message, or null when the target is fine. */
export function validateTarget(t: unknown): string | null {
  return TargetSchema.safeParse(t).success ? null : 'The saved repository address is not valid.';
}

export function toIngestTarget(t: SessionTarget): IngestTarget {
  if (t.source === 'sample') return { owner: 'sample', repo: t.sampleId!, source: 'sample', sampleId: t.sampleId };
  return { owner: t.owner, repo: t.repo, ...(t.ref ? { ref: t.ref } : {}), ...(t.scope ? { scope: [...t.scope] } : {}), source: 'github' };
}

export function loadSession(storage: KeyValueStorage | undefined): SessionRecord | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(SESSION_KEY);
    if (!text || text.length > L.recordBytes) return null;
    const r = SessionRecordSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Writes the record text (at most 4 KB). Returns the text written, or null. Never throws. */
export function saveSession(storage: KeyValueStorage | undefined, record: SessionRecord): string | null {
  if (!storage) return null;
  try {
    if (!SessionRecordSchema.safeParse(record).success) return null;
    const { version, savedAt, target, screen, preview, notes } = record;
    const text = JSON.stringify({ version, savedAt, target, screen, preview, notes });
    if (text.length > L.recordBytes) return null;
    storage.setItem(SESSION_KEY, text);
    return text;
  } catch {
    return null;
  }
}

const remove = (storage: KeyValueStorage | undefined, key: string) => { try { storage?.removeItem?.(key); } catch { /* blocked */ } };
export function clearSessionRecord(storage: KeyValueStorage | undefined): void { remove(storage, SESSION_KEY); }
/** Reset session: exactly the three session parts. The layout and the reading level are preferences and stay. */
export function clearAllSession(storage: KeyValueStorage | undefined): void {
  for (const k of [SESSION_KEY, WORK_KEY_NAME, CORRECTIONS_KEY_NAME]) remove(storage, k);
}

export const SAVED_PARTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: SESSION_KEY, label: 'Session address and view' },
  { key: WORK_KEY_NAME, label: 'Your changes, Log, and paused practice run' },
  { key: CORRECTIONS_KEY_NAME, label: 'Label corrections' },
  { key: LAYOUT_KEY_NAME, label: 'Panel layout' },
  { key: JOURNAL_KEY_NAME, label: 'Reading level' },
];
export interface SavedRow { key: string; label: string; bytes: number | null }

/** The five saved parts with their sizes. Reads only the text length; never returns a stored value. */
export function describeSavedData(storage: KeyValueStorage | undefined): SavedRow[] {
  return SAVED_PARTS.map((p) => {
    let bytes: number | null = null;
    try { const t = storage?.getItem(p.key); bytes = typeof t === 'string' ? t.length : null; } catch { bytes = null; }
    return { ...p, bytes };
  });
}

export interface BuildInput {
  state: StudioState;
  view: ShellView;
  /** The detected entry page for the snapshot (the page saved only when the user chose another). */
  detectedEntry?: string;
  restoreStatus: 'idle' | 'pending' | 'applying' | 'done' | 'failed' | 'cancelled';
}

/** The record without savedAt, or null when nothing should be saved now. */
export function buildSessionRecord({ state, view, detectedEntry, restoreStatus }: BuildInput): SessionBody | null {
  const snap = state.snapshot;
  if (state.experience !== 'studio' || !snap) return null;
  if (state.ingestion.status === 'running') return null;
  if (restoreStatus === 'pending' || restoreStatus === 'applying') return null;
  const t = state.ingestion.target;
  let target: SessionTarget;
  if (snap.source === 'sample') {
    const id = t?.sampleId ?? snap.name;
    if (!isSampleId(id)) return null;
    target = { source: 'sample', owner: 'sample', repo: id, sampleId: id };
  } else {
    const scope = t?.source === 'github' && t.scope && t.scope.length ? t.scope.slice(0, L.folders) : undefined;
    target = { source: 'github', owner: snap.owner, repo: snap.name, ...(snap.ref ? { ref: snap.ref } : {}), ...(scope ? { scope } : {}) };
  }
  const pv: PreviewState = state.preview;
  const run = state.work.run;
  const body: SessionBody = {
    version: 1,
    target,
    screen: view.screen === 'domain' ? { screen: 'domain', area: view.area } : { screen: view.screen },
    preview: {
      width: pv.width,
      mode: pv.chosenBy === 'user' ? pv.mode : 'auto',
      ...(pv.entryPath && pv.entryPath !== detectedEntry ? { entryPath: pv.entryPath } : {}),
      ...(pv.component ? { component: pv.component } : {}),
    },
    notes: {
      crewWasActive: !!run && run.kind === 'crew' && run.status !== 'finished' && run.status !== 'stopped',
      previewOnlyCount: Math.min(L.maxPreviewOnly, state.edit.previewOnly.length),
    },
  };
  return SessionRecordSchema.safeParse({ ...body, savedAt: 0 }).success ? body : null;
}

