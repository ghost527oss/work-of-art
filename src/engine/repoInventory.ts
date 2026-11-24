// @node: F1.3
// Builds the full path inventory from a GitHub tree listing, before any file content
// is read. Pure and deterministic: no network, no React.
import type { RepoInventory, RepoInventoryEntry } from '../types/contracts';

/** One item of GitHub's `git/trees/{ref}?recursive=1` response (fields we use). */
export interface TreeEntry {
  path: string;
  /** 'blob' = file, 'tree' = directory, 'commit' = submodule. */
  type: string;
  mode?: string;
  size?: number;
}

export interface InventoryOptions {
  /** True when GitHub reported the tree as truncated. */
  truncated: boolean;
  /** Maximum number of entries to represent. Extra entries are counted, not silently dropped. */
  maxEntries: number;
}

const SYMLINK_MODE = '120000';
const MAX_LISTED_SUBMODULES = 5;

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function depthOf(path: string): number {
  let depth = 0;
  for (let i = 0; i < path.length; i++) if (path.charCodeAt(i) === 47) depth++;
  return depth;
}

/** Lower-case extension without the dot. Dotfiles such as `.gitignore` have none. */
export function extensionOf(path: string): string | undefined {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return undefined;
  return base.slice(dot + 1).toLowerCase();
}

// Classification is a placeholder until spec 03: every entry is `unknown` with low
// confidence and no evidence.
function placeholder(): Pick<RepoInventoryEntry, 'classifications' | 'confidence' | 'evidence'> {
  return { classifications: ['unknown'], confidence: 'low', evidence: [] };
}

export function buildInventory(tree: readonly TreeEntry[], options: InventoryOptions): RepoInventory {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const candidates: RepoInventoryEntry[] = [];
  const submodules: string[] = [];
  let duplicates = 0;
  let invalid = 0;
  let unknownType = 0;

  for (const item of tree) {
    if (typeof item.path !== 'string' || item.path.length === 0) {
      invalid++;
      continue;
    }
    if (seen.has(item.path)) {
      duplicates++;
      continue;
    }

    if (item.type === 'tree' || item.type === 'commit') {
      seen.add(item.path);
      if (item.type === 'commit') submodules.push(item.path);
      candidates.push({ path: item.path, entryType: 'directory', ...placeholder() });
      continue;
    }

    if (item.type !== 'blob') {
      unknownType++;
      continue;
    }

    seen.add(item.path);
    const size = typeof item.size === 'number' && Number.isInteger(item.size) && item.size >= 0 ? item.size : undefined;
    const entry: RepoInventoryEntry = {
      path: item.path,
      entryType: 'file',
      loadStatus: 'indexed_not_loaded',
      ...placeholder(),
    };
    const extension = extensionOf(item.path);
    if (extension !== undefined) entry.extension = extension;
    if (size !== undefined) entry.sizeBytes = size;
    if (item.mode === SYMLINK_MODE) {
      entry.loadStatus = 'skipped';
      entry.reasonCode = 'symlink';
      entry.reason = 'Symbolic link; its target is not followed.';
    }
    candidates.push(entry);
  }

  // Apply the entry cap. Keep shallow paths first so top-level folders survive.
  let kept = candidates;
  let omitted = 0;
  if (candidates.length > options.maxEntries) {
    kept = [...candidates]
      .sort((a, b) => depthOf(a.path) - depthOf(b.path) || compareCodeUnits(a.path, b.path))
      .slice(0, options.maxEntries);
    omitted = candidates.length - kept.length;
  }
  kept.sort((a, b) => compareCodeUnits(a.path, b.path));

  let treeComplete = !options.truncated;

  if (options.truncated) {
    warnings.push('GitHub reported the repository tree as truncated, so some paths are missing from this inventory.');
  }
  if (omitted > 0) {
    treeComplete = false;
    warnings.push(
      `The inventory is limited to ${options.maxEntries} entries. ${omitted} deeper entries are not represented.`,
    );
  }
  if (submodules.length > 0) {
    const listed = submodules.slice(0, MAX_LISTED_SUBMODULES).join(', ');
    const more = submodules.length > MAX_LISTED_SUBMODULES ? ` and ${submodules.length - MAX_LISTED_SUBMODULES} more` : '';
    warnings.push(`Submodules are listed but not followed: ${listed}${more}.`);
  }
  const unrepresented = duplicates + invalid + unknownType;
  if (unrepresented > 0) {
    // Entries that were dropped mean the inventory does not match what GitHub returned.
    treeComplete = false;
    const parts: string[] = [];
    if (duplicates > 0) parts.push(`${duplicates} duplicate paths`);
    if (invalid > 0) parts.push(`${invalid} entries with an empty path`);
    if (unknownType > 0) parts.push(`${unknownType} entries of unknown type`);
    warnings.push(`${unrepresented} tree entries were not represented: ${parts.join(', ')}.`);
  }

  return { entries: kept, treeComplete, treeWarnings: warnings };
}
