// @node: F1.3
// Decides which files to load, in what order, within the budgets. Pure and
// deterministic: sizes come from the tree listing, so the plan is made before any
// content is fetched. No network, no React.
import type { Budgets } from '../config/budgets';
import {
  INCOMPLETE_SKIP_REASONS,
  type ReasonCode,
  type RepoCoverage,
  type RepoFile,
  type RepoInventory,
  type RepoInventoryEntry,
  type RepoMedia,
} from '../types/contracts';

// ---------------------------------------------------------------------------
// Rule tables
// ---------------------------------------------------------------------------

const DEPENDENCY_DIRS = new Set(['node_modules', 'vendor', '.venv', 'venv', 'bower_components', 'Pods']);
const GENERATED_DIRS = new Set(['dist', 'build', '.next', '.nuxt', 'out', 'coverage', '__pycache__', '.git']);

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'Pipfile.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
]);

const MEDIA_EXTENSIONS = new Set([
  // images (svg is text but is treated as media, not application source)
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff', 'psd', 'svg',
  // fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // audio and video
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'mp4', 'webm', 'mov', 'avi', 'mkv',
  // archives
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'rar', '7z',
  // documents and compiled or binary artefacts
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'jar', 'wasm', 'sqlite', 'db',
]);

const STYLE_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less']);

const SOURCE_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte',
  'py', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'kts', 'cs', 'swift',
  'c', 'h', 'cpp', 'hpp', 'sql', 'sh', 'bash', 'graphql', 'gql', 'html', 'htm',
]);

const OTHER_TEXT_EXTENSIONS = new Set([
  'json', 'jsonc', 'md', 'mdx', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'txt',
]);

/** Extensionless or dotfile names that are plain text we want to read. */
const SUPPORTED_FILENAMES = new Set([
  'Dockerfile', 'Makefile', 'Procfile', 'Gemfile', 'Rakefile', 'LICENSE', 'README',
  '.gitignore', '.editorconfig', '.env.example', '.nvmrc',
]);

const MANIFEST_NAMES = new Set([
  'package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'composer.json',
  'pom.xml', 'build.gradle', 'Gemfile', 'tsconfig.json', 'Dockerfile', 'docker-compose.yml',
  'docker-compose.yaml', '.env.example', 'vercel.json', 'netlify.toml',
]);
const MANIFEST_PREFIXES = ['vite.config.', 'webpack.config.', 'next.config.', 'rollup.config.'];

const ENTRY_STEMS = new Set(['index', 'main', 'app', 'server', 'manage', 'wsgi', 'asgi']);
const ROUTE_SEGMENTS = new Set(['routes', 'route', 'api', 'controllers', 'controller', 'handlers', 'middleware', 'endpoints']);

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function dirSegments(path: string): string[] {
  const parts = path.split('/');
  parts.pop();
  return parts;
}

function extensionOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf('.');
  return dot <= 0 || dot === base.length - 1 ? '' : base.slice(dot + 1).toLowerCase();
}

function stemOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? base : base.slice(0, dot);
}

function depthOf(path: string): number {
  let depth = 0;
  for (let i = 0; i < path.length; i++) if (path.charCodeAt(i) === 47) depth++;
  return depth;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Exclusion and scope rules
// ---------------------------------------------------------------------------

export interface Exclusion {
  reasonCode: ReasonCode;
  reason: string;
}

/** Policy exclusions that depend only on the path (design section 9, rules 2 to 7). */
export function exclusionFor(path: string): Exclusion | undefined {
  const dirs = dirSegments(path);
  const base = baseName(path);
  const lower = base.toLowerCase();
  const ext = extensionOf(path);

  const dep = dirs.find((d) => DEPENDENCY_DIRS.has(d));
  if (dep) return { reasonCode: 'excluded_dependency', reason: `Inside dependency directory "${dep}".` };

  const gen = dirs.find((d) => GENERATED_DIRS.has(d));
  if (gen) return { reasonCode: 'excluded_generated', reason: `Inside generated or build output directory "${gen}".` };

  if (lower.endsWith('.min.js') || lower.endsWith('.min.css')) {
    return { reasonCode: 'excluded_minified', reason: 'Minified file.' };
  }
  if (ext === 'map') return { reasonCode: 'excluded_sourcemap', reason: 'Source map.' };
  if (LOCKFILES.has(base)) return { reasonCode: 'excluded_lockfile', reason: 'Dependency lockfile.' };
  if (MEDIA_EXTENSIONS.has(ext)) return { reasonCode: 'excluded_media', reason: `Media or binary file type ".${ext}".` };

  const supported =
    SUPPORTED_FILENAMES.has(base) ||
    SOURCE_EXTENSIONS.has(ext) ||
    STYLE_EXTENSIONS.has(ext) ||
    OTHER_TEXT_EXTENSIONS.has(ext);
  if (!supported) {
    return {
      reasonCode: 'unsupported_type',
      reason: ext ? `File type ".${ext}" is not a supported text type.` : 'File name is not a supported text type.',
    };
  }
  return undefined;
}

/**
 * Scope rule: no scope means everything is in scope. Otherwise files at the
 * repository root are always in scope, and other files must equal a scope path or sit
 * below one. Matching is by whole path segment, so scope "src" does not match "src2/a".
 */
export function isInScope(path: string, scope: readonly string[] | undefined): boolean {
  if (!scope || scope.length === 0) return true;
  if (!path.includes('/')) return true;
  return scope.some((p) => path === p || path.startsWith(p + '/'));
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** 0 manifests/config, 1 entry points, 2 routes/handlers, 3 source, 4 styles, 5 other text. */
export function rankFor(path: string): number {
  const base = baseName(path);
  const ext = extensionOf(path);

  if (MANIFEST_NAMES.has(base) || MANIFEST_PREFIXES.some((p) => base.startsWith(p))) return 0;
  const isSource = SOURCE_EXTENSIONS.has(ext);
  if (isSource && ENTRY_STEMS.has(stemOf(path))) return 1;
  if (isSource && dirSegments(path).some((d) => ROUTE_SEGMENTS.has(d))) return 2;
  if (isSource) return 3;
  if (STYLE_EXTENSIONS.has(ext)) return 4;
  return 5;
}

// ---------------------------------------------------------------------------
// Load plan
// ---------------------------------------------------------------------------

export interface PlanOptions {
  scope?: readonly string[];
  budgets: Budgets;
}

export interface LoadPlan {
  /** The inventory with load status and reasons assigned. Directories are unchanged. */
  inventory: RepoInventory;
  /** Paths to fetch, in priority order, split into batches of at most `batchSize`. */
  batches: string[][];
  /** Number of files planned for loading. */
  candidateCount: number;
  warnings: string[];
}

function withStatus(
  entry: RepoInventoryEntry,
  loadStatus: NonNullable<RepoInventoryEntry['loadStatus']>,
  reasonCode: ReasonCode,
  reason: string,
): RepoInventoryEntry {
  return { ...entry, loadStatus, reasonCode, reason };
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function planLoading(inventory: RepoInventory, options: PlanOptions): LoadPlan {
  const { budgets, scope } = options;
  const decided = new Map<string, RepoInventoryEntry>();
  const candidates: RepoInventoryEntry[] = [];

  for (const entry of inventory.entries) {
    if (entry.entryType !== 'file') continue;
    // Entries already decided upstream (for example symlinks) are left untouched.
    if (entry.loadStatus !== 'indexed_not_loaded') continue;

    const exclusion = exclusionFor(entry.path);
    if (exclusion) {
      decided.set(entry.path, withStatus(entry, 'skipped', exclusion.reasonCode, exclusion.reason));
      continue;
    }
    if (entry.sizeBytes !== undefined && entry.sizeBytes > budgets.hardCeilingBytes) {
      decided.set(
        entry.path,
        withStatus(
          entry,
          'skipped',
          'over_hard_ceiling',
          `File is ${formatBytes(entry.sizeBytes)}, above the ${formatBytes(budgets.hardCeilingBytes)} limit.`,
        ),
      );
      continue;
    }
    if (!isInScope(entry.path, scope)) {
      decided.set(
        entry.path,
        withStatus(entry, 'indexed_not_loaded', 'outside_scope', 'Outside the selected folders.'),
      );
      continue;
    }
    candidates.push(entry);
  }

  candidates.sort(
    (a, b) =>
      rankFor(a.path) - rankFor(b.path) ||
      depthOf(a.path) - depthOf(b.path) ||
      compareCodeUnits(a.path, b.path),
  );

  // Budget cutoff: estimate each file as min(size, prefix limit). Unknown size is
  // treated as the full prefix limit. The first file that would overflow, and every
  // file after it, is deferred.
  const planned: RepoInventoryEntry[] = [];
  let estimate = 0;
  let cutoff = -1;
  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i]!;
    const cost = Math.min(entry.sizeBytes ?? budgets.maxFilePrefixBytes, budgets.maxFilePrefixBytes);
    if (estimate + cost > budgets.maxTotalLoadedBytes) {
      cutoff = i;
      break;
    }
    estimate += cost;
    planned.push(entry);
  }

  const warnings: string[] = [];
  if (cutoff >= 0) {
    const deferred = candidates.slice(cutoff);
    for (const entry of deferred) {
      decided.set(
        entry.path,
        withStatus(
          entry,
          'indexed_not_loaded',
          'budget_reached',
          `Content budget of ${formatBytes(budgets.maxTotalLoadedBytes)} reached before this file.`,
        ),
      );
    }
    warnings.push(
      `Content budget of ${formatBytes(budgets.maxTotalLoadedBytes)} reached: ${deferred.length} supported files were not loaded.`,
    );
  }

  const batches: string[][] = [];
  for (let i = 0; i < planned.length; i += budgets.batchSize) {
    batches.push(planned.slice(i, i + budgets.batchSize).map((e) => e.path));
  }

  return {
    inventory: {
      entries: inventory.entries.map((e) => decided.get(e.path) ?? e),
      treeComplete: inventory.treeComplete,
      treeWarnings: [...inventory.treeWarnings],
    },
    batches,
    candidateCount: planned.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/**
 * Derives the coverage report from the inventory in a single pass, so the counts can
 * never drift from the per-entry statuses. `files` supplies the loaded content, used
 * only for the byte total. `extraWarnings` (for example a budget or deadline note) are
 * appended after the tree warnings.
 *
 * `sourceAnalysisComplete` is true only when the tree is complete and no file is
 * deferred, truncated, failed, awaiting review, or skipped because it was over the hard
 * ceiling or turned out to be binary. Policy exclusions (path or file-type rules) are
 * always listed but do not make analysis incomplete.
 */
export function computeCoverage(
  inventory: RepoInventory,
  files: readonly RepoFile[],
  extraWarnings: readonly string[] = [],
  media: readonly RepoMedia[] = [],
): RepoCoverage {
  let loaded = 0;
  let truncated = 0;
  let deferred = 0;
  let skipped = 0;
  let failed = 0;
  let needsReview = 0;
  let unanalysedSkips = 0;
  const skippedReasons: Array<{ path: string; reason: string }> = [];

  for (const entry of inventory.entries) {
    if (entry.entryType !== 'file') continue;
    switch (entry.loadStatus) {
      case 'loaded':
        loaded++;
        break;
      case 'truncated':
        truncated++;
        break;
      case 'indexed_not_loaded':
        deferred++;
        break;
      case 'skipped':
        skipped++;
        if (entry.reasonCode !== undefined && INCOMPLETE_SKIP_REASONS.includes(entry.reasonCode)) unanalysedSkips++;
        skippedReasons.push({ path: entry.path, reason: entry.reason ?? entry.reasonCode ?? 'skipped' });
        break;
      case 'failed':
        failed++;
        break;
      case 'needs_review':
        needsReview++;
        break;
      default:
        // A file entry with no status has not been decided: count it as deferred so
        // it can never be reported as analysed.
        deferred++;
    }
  }

  const encoder = new TextEncoder();
  let totalLoadedBytes = 0;
  for (const file of files) totalLoadedBytes += encoder.encode(file.content ?? '').length;

  const sourceAnalysisComplete =
    inventory.treeComplete &&
    deferred === 0 &&
    truncated === 0 &&
    failed === 0 &&
    needsReview === 0 &&
    unanalysedSkips === 0;

  return {
    indexedPaths: inventory.entries.length,
    loadedSourceFiles: loaded,
    deferredSourceFiles: deferred,
    skippedFiles: skipped,
    truncatedFiles: truncated,
    failedFiles: failed,
    totalLoadedBytes,
    skippedReasons,
    warnings: [...inventory.treeWarnings, ...extraWarnings],
    treeComplete: inventory.treeComplete,
    sourceAnalysisComplete,
    ...(media.length > 0 ? { loadedMediaFiles: media.length, loadedMediaBytes: media.reduce((n, m) => n + m.bytes, 0) } : {}),
  };
}
