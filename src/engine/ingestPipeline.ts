// @node: F1.4
// The single ingestion pipeline. Used by the serverless endpoint and by the browser
// fallback, and (through `buildSnapshotFromFiles`) by the bundled samples, so all three
// produce snapshots with identical coverage rules. No React, no global state.
//
// The pipeline emits `stage` and `progress` events and returns the snapshot. It never
// emits `result` or `error`: the caller does that after the snapshot has been built.
import { BUDGETS, type Budgets } from '../config/budgets';
import {
  MAX_SCOPE_ENTRIES,
  assertCoverageConsistent,
  type IngestEvent,
  type ProjectSource,
  type RepoFile,
  type RepoInventoryEntry,
  type RepoRequest,
  type RepoSnapshot,
} from '../types/contracts';
import { computeCoverage, planLoading } from './fileSelector';
import {
  IngestError,
  fetchFileCapped,
  fetchTree,
  getRepoInfo,
  isAbortError,
  type FetchLike,
  type FileResult,
  type SourceDeps,
} from './githubSource';
import { buildInventory, extensionOf, type TreeEntry } from './repoInventory';
import { isSafeRepoPath, isValidOwner, isValidRef, isValidRepo } from './repoUrl';

export interface PipelineDeps {
  fetch: FetchLike;
  /** Server-side only. */
  token?: string;
  signal?: AbortSignal;
  emit?: (event: IngestEvent) => void;
  now?: () => number;
  budgets?: Budgets;
  /**
   * Reject repositories that are not confirmed public (not_found, so existence is not revealed).
   * The server sets this whenever a token is configured, because a token may see private data.
   */
  requirePublic?: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const LANGUAGES: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  json: 'json', jsonc: 'json', md: 'markdown', mdx: 'markdown', yml: 'yaml', yaml: 'yaml',
  toml: 'toml', py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust', java: 'java',
  kt: 'kotlin', kts: 'kotlin', cs: 'csharp', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp',
  hpp: 'cpp', sql: 'sql', sh: 'shell', bash: 'shell', vue: 'vue', svelte: 'svelte',
  graphql: 'graphql', gql: 'graphql', xml: 'xml', txt: 'text',
};

export function languageOf(path: string): string {
  return LANGUAGES[extensionOf(path) ?? ''] ?? 'text';
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function makeFile(entry: RepoInventoryEntry, text: string, bytes: number, truncated: boolean): RepoFile {
  return {
    path: entry.path,
    content: text,
    language: languageOf(entry.path),
    sizeBytes: entry.sizeBytes ?? bytes,
    loadStatus: truncated ? 'truncated' : 'loaded',
    // Placeholder classification until spec 03.
    classifications: ['unknown'],
    classificationConfidence: 'low',
    classificationEvidence: [],
    needsUserReview: false,
    truncated,
  };
}

/** Applies one fetched file to its inventory entry. Returns the new entry and, if content is kept, the file. */
function applyFetched(
  entry: RepoInventoryEntry,
  result: FileResult,
  budgets: Budgets,
): { entry: RepoInventoryEntry; file?: RepoFile } {
  if (result.binary) {
    return {
      entry: {
        ...entry,
        loadStatus: 'skipped',
        reasonCode: 'binary_content',
        reason: 'Binary content detected; not loaded.',
      },
    };
  }
  if (result.truncated) {
    return {
      entry: {
        ...entry,
        loadStatus: 'truncated',
        reasonCode: 'over_file_prefix',
        reason: `Only the first ${kb(budgets.maxFilePrefixBytes)} was loaded.`,
      },
      file: makeFile(entry, result.text, result.bytes, true),
    };
  }
  return { entry: { ...entry, loadStatus: 'loaded' }, file: makeFile(entry, result.text, result.bytes, false) };
}

/** Throws IngestError('invalid_request') for any value that fails the character-set, length, or scope rules. */
export function validateRequest(request: RepoRequest, budgets: Budgets): void {
  const bad = (what: string): never => {
    throw new IngestError('invalid_request', `Invalid ${what}.`);
  };
  if (!isValidOwner(request.owner)) bad('owner');
  if (!isValidRepo(request.repo)) bad('repository name');
  if (request.ref !== undefined && !isValidRef(request.ref)) bad('reference');
  if (request.scope) {
    if (request.scope.length > Math.min(budgets.maxScopeEntries, MAX_SCOPE_ENTRIES)) bad('scope (too many entries)');
    if (!request.scope.every(isSafeRepoPath)) bad('scope path');
  }
}

/** Runs `worker` over `items` with at most `limit` in flight. Rethrows the first failure after all lanes settle. */
async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  let next = 0;
  let failure: unknown;
  let failed = false;
  const lane = async (): Promise<void> => {
    while (!failed && !shouldStop()) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await worker(items[i] as T);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  if (failed) throw failure;
}

// ---------------------------------------------------------------------------
// runIngestion
// ---------------------------------------------------------------------------

export async function runIngestion(request: RepoRequest, deps: PipelineDeps): Promise<RepoSnapshot> {
  const budgets = deps.budgets ?? BUDGETS;
  const now = deps.now ?? Date.now;
  const emit = deps.emit ?? ((): void => undefined);
  const startedAt = now();
  validateRequest(request, budgets);

  const source: SourceDeps = {
    fetch: deps.fetch,
    timeoutMs: budgets.requestTimeoutMs,
    now,
    ...(deps.token ? { token: deps.token } : {}),
    ...(deps.signal ? { signal: deps.signal } : {}),
  };
  const { owner, repo } = request;

  // 1. Resolve the ref (and, when required, confirm the repository is public).
  let ref: string;
  if (request.ref !== undefined && !deps.requirePublic) {
    ref = request.ref;
    emit({ type: 'stage', stage: 'resolving_ref', status: 'skipped', detail: `Using "${ref}".` });
  } else {
    emit({ type: 'stage', stage: 'resolving_ref', status: 'started' });
    const info = await getRepoInfo(owner, repo, source);
    if (deps.requirePublic && info.isPrivate) {
      throw new IngestError('not_found', 'The repository was not found, or the repository is private.');
    }
    ref = request.ref ?? info.defaultBranch;
    emit({
      type: 'stage',
      stage: 'resolving_ref',
      status: 'finished',
      detail: request.ref === undefined ? `Default branch "${ref}".` : `Using "${ref}".`,
    });
  }

  // 2. Tree and inventory.
  emit({ type: 'stage', stage: 'fetching_tree', status: 'started' });
  const tree = await fetchTree(owner, repo, ref, source);
  const rawInventory = buildInventory(tree.entries, { truncated: tree.truncated, maxEntries: budgets.maxInventoryEntries });
  emit({
    type: 'stage',
    stage: 'fetching_tree',
    status: 'finished',
    detail: `${rawInventory.entries.length} paths indexed${rawInventory.treeComplete ? '' : ' (incomplete)'}.`,
  });

  // 3. Plan, then load in batches.
  const plan = planLoading(rawInventory, { scope: request.scope, budgets });
  const byPath = new Map<string, RepoInventoryEntry>(plan.inventory.entries.map((e) => [e.path, e]));
  const files: RepoFile[] = [];
  const warnings: string[] = [...plan.warnings];
  if (rawInventory.entries.length === 0 && rawInventory.treeComplete) warnings.push('This repository has no files.');

  const planned = plan.batches.flat();
  emit({ type: 'stage', stage: 'loading_sources', status: 'started' });
  if (planned.length > 0) emit({ type: 'progress', stage: 'loading_sources', loaded: 0, total: planned.length });

  const processed = new Set<string>();
  let stop: { code: 'rate_limited' | 'deadline_reached'; resetAt?: string } | null = null;

  const shouldStop = (): boolean => {
    if (!stop && now() - startedAt > budgets.totalDeadlineMs) stop = { code: 'deadline_reached' };
    return stop !== null;
  };

  const fetchOne = async (path: string): Promise<void> => {
    const entry = byPath.get(path);
    if (!entry) return;
    try {
      const result = await fetchFileCapped(owner, repo, ref, path, budgets.maxFilePrefixBytes, source);
      const applied = applyFetched(entry, result, budgets);
      byPath.set(path, applied.entry);
      if (applied.file) files.push(applied.file);
      processed.add(path);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof IngestError && error.code === 'rate_limited') {
        if (!stop) stop = error.resetAt === undefined ? { code: 'rate_limited' } : { code: 'rate_limited', resetAt: error.resetAt };
        return; // not processed: deferred below
      }
      const reason = error instanceof IngestError ? error.message : 'Unexpected error while loading this file.';
      byPath.set(path, { ...entry, loadStatus: 'failed', reasonCode: 'fetch_failed', reason });
      processed.add(path);
    }
  };

  for (const batch of plan.batches) {
    if (shouldStop()) break;
    await runPool(batch, budgets.fetchConcurrency, fetchOne, shouldStop);
    emit({ type: 'progress', stage: 'loading_sources', loaded: files.length, total: planned.length });
  }

  // Anything planned but not processed was cut short by the rate limit or the deadline.
  const unprocessed = planned.filter((p) => !processed.has(p));
  if (unprocessed.length > 0) {
    const cut = stop as { code: 'rate_limited' | 'deadline_reached'; resetAt?: string } | null;
    const code = cut?.code ?? 'deadline_reached';
    const reason =
      code === 'rate_limited'
        ? 'GitHub rate limit reached before this file was loaded.'
        : `Time limit of ${Math.round(budgets.totalDeadlineMs / 1000)} s reached before this file was loaded.`;
    for (const path of unprocessed) {
      const entry = byPath.get(path);
      if (entry) byPath.set(path, { ...entry, loadStatus: 'indexed_not_loaded', reasonCode: code, reason });
    }
    warnings.push(
      code === 'rate_limited'
        ? `GitHub rate limit reached while loading files: ${unprocessed.length} files were not loaded.${
            cut?.resetAt ? ` The limit resets at ${cut.resetAt}.` : ''
          }`
        : `Time limit reached while loading files: ${unprocessed.length} files were not loaded.`,
    );
  }

  emit({
    type: 'stage',
    stage: 'loading_sources',
    status: 'finished',
    detail: `${files.length} of ${planned.length} planned files loaded.`,
  });

  // 4. Assemble and self-check the snapshot.
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const inventory = {
    entries: plan.inventory.entries.map((e) => byPath.get(e.path) ?? e),
    treeComplete: plan.inventory.treeComplete,
    treeWarnings: plan.inventory.treeWarnings,
  };
  const loadedAt = now();
  const snapshot: RepoSnapshot = {
    id: `${owner}/${repo}@${ref}#${loadedAt}`,
    owner,
    name: repo,
    ref,
    source: 'github',
    repoUrl: `https://github.com/${owner}/${repo}`,
    inventory,
    files,
    coverage: computeCoverage(inventory, files, warnings),
    loadedAt,
  };
  assertCoverageConsistent(snapshot);
  return snapshot;
}

// ---------------------------------------------------------------------------
// buildSnapshotFromFiles (samples)
// ---------------------------------------------------------------------------

export interface SnapshotMeta {
  owner: string;
  name: string;
  ref: string;
  source: ProjectSource;
  repoUrl?: string;
  loadedAt?: number;
}

/** A file in a bundled sample: text content, or just a size for files that are never read (images, etc.). */
export type SampleFile = string | { size: number };

/**
 * Builds a snapshot from in-memory files using the same inventory, planning, and coverage
 * code as a real ingestion. Sample files must be small: a supported file above the prefix
 * limit, or a size-only file that the plan wants to load, is a programming error.
 */
export function buildSnapshotFromFiles(
  meta: SnapshotMeta,
  fileMap: Readonly<Record<string, SampleFile>>,
  budgets: Budgets = BUDGETS,
): RepoSnapshot {
  const encoder = new TextEncoder();
  const tree: TreeEntry[] = [];
  const dirs = new Set<string>();
  for (const path of Object.keys(fileMap).sort()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    const file = fileMap[path] as SampleFile;
    tree.push({ path, type: 'blob', size: typeof file === 'string' ? encoder.encode(file).length : file.size });
  }
  for (const dir of dirs) tree.push({ path: dir, type: 'tree' });

  const inventory = buildInventory(tree, { truncated: false, maxEntries: budgets.maxInventoryEntries });
  const plan = planLoading(inventory, { budgets });
  const byPath = new Map<string, RepoInventoryEntry>(plan.inventory.entries.map((e) => [e.path, e]));
  const files: RepoFile[] = [];

  for (const path of plan.batches.flat()) {
    const entry = byPath.get(path) as RepoInventoryEntry;
    const content = fileMap[path];
    if (typeof content !== 'string') throw new Error(`Sample file "${path}" must have text content.`);
    const bytes = encoder.encode(content).length;
    if (bytes > budgets.maxFilePrefixBytes) throw new Error(`Sample file "${path}" is larger than the per-file limit.`);
    const applied = applyFetched(entry, { text: content, bytes, truncated: false, binary: false }, budgets);
    byPath.set(path, applied.entry);
    if (applied.file) files.push(applied.file);
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const finalInventory = {
    entries: plan.inventory.entries.map((e) => byPath.get(e.path) ?? e),
    treeComplete: plan.inventory.treeComplete,
    treeWarnings: plan.inventory.treeWarnings,
  };
  const loadedAt = meta.loadedAt ?? Date.now();
  const snapshot: RepoSnapshot = {
    id: `${meta.owner}/${meta.name}@${meta.ref}#${loadedAt}`,
    owner: meta.owner,
    name: meta.name,
    ref: meta.ref,
    source: meta.source,
    ...(meta.repoUrl ? { repoUrl: meta.repoUrl } : {}),
    inventory: finalInventory,
    files,
    coverage: computeCoverage(finalInventory, files, plan.warnings),
    loadedAt,
  };
  assertCoverageConsistent(snapshot);
  return snapshot;
}
