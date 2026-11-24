// @node: F1.1
// Shared contracts for repository ingestion. Zod schemas are the single source of
// truth; types are inferred from them. Pure data: no network, no React.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const ProjectSourceSchema = z.enum(['github', 'sample']);
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;

export const FileClassificationSchema = z.enum([
  'frontend',
  'backend',
  'shared',
  'api_data',
  'assets',
  'configuration',
  'tests',
  'documentation',
  'infrastructure',
  'unknown',
]);
export type FileClassification = z.infer<typeof FileClassificationSchema>;

export const ClassificationConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type ClassificationConfidence = z.infer<typeof ClassificationConfidenceSchema>;

export const FileLoadStatusSchema = z.enum([
  'indexed_not_loaded',
  'loaded',
  'skipped',
  'truncated',
  'failed',
  'needs_review',
]);
export type FileLoadStatus = z.infer<typeof FileLoadStatusSchema>;

export const ReasonCodeSchema = z.enum([
  'excluded_dependency',
  'excluded_generated',
  'excluded_minified',
  'excluded_lockfile',
  'excluded_sourcemap',
  'excluded_media',
  'unsupported_type',
  'binary_content',
  'symlink',
  'over_hard_ceiling',
  'over_file_prefix',
  'budget_reached',
  'outside_scope',
  'deadline_reached',
  'rate_limited',
  'fetch_failed',
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

/**
 * Skip reasons that are a deliberate policy choice about the path or file type. They are
 * always listed in the coverage report but do not make source analysis incomplete.
 */
export const POLICY_SKIP_REASONS: readonly ReasonCode[] = [
  'excluded_dependency',
  'excluded_generated',
  'excluded_minified',
  'excluded_lockfile',
  'excluded_sourcemap',
  'excluded_media',
  'unsupported_type',
  'symlink',
];

/**
 * Skip reasons for a file that has a supported type but could not be analysed: it is
 * above the hard size ceiling, or its content turned out to be binary (for example a
 * UTF-16 source file). These DO make source analysis incomplete.
 */
export const INCOMPLETE_SKIP_REASONS: readonly ReasonCode[] = ['over_hard_ceiling', 'binary_content'];

export const IngestStageSchema = z.enum([
  'resolving_ref',
  'fetching_tree',
  'classifying',
  'loading_sources',
  'preparing_preview',
]);
export type IngestStage = z.infer<typeof IngestStageSchema>;

/** Stages that are defined but not produced by this build (specs 03 and 02). */
export const NOT_YET_AVAILABLE_STAGES: readonly IngestStage[] = ['classifying', 'preparing_preview'];

export const ApiErrorCodeSchema = z.enum([
  'invalid_request',
  'not_found',
  'rate_limited',
  'unsupported',
  'oversized',
  'upstream_failure',
  'timeout',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

// ---------------------------------------------------------------------------
// Inventory, files, coverage, snapshot
// ---------------------------------------------------------------------------

export const ClassificationEvidenceSchema = z.object({
  source: z.enum(['path', 'extension', 'manifest', 'import', 'reference', 'syntax', 'ai_suggestion', 'user']),
  description: z.string(),
  relatedPath: z.string().optional(),
});
export type ClassificationEvidence = z.infer<typeof ClassificationEvidenceSchema>;

export const RepoFileSchema = z.object({
  path: z.string().min(1),
  content: z.string().optional(),
  language: z.string(),
  sizeBytes: z.number().int().nonnegative().optional(),
  loadStatus: FileLoadStatusSchema,
  classifications: z.array(FileClassificationSchema),
  classificationConfidence: ClassificationConfidenceSchema,
  classificationEvidence: z.array(ClassificationEvidenceSchema),
  needsUserReview: z.boolean(),
  truncated: z.boolean(),
});
export type RepoFile = z.infer<typeof RepoFileSchema>;

export const RepoInventoryEntrySchema = z.object({
  path: z.string().min(1),
  entryType: z.enum(['file', 'directory']),
  extension: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  loadStatus: FileLoadStatusSchema.optional(),
  classifications: z.array(FileClassificationSchema),
  confidence: ClassificationConfidenceSchema,
  evidence: z.array(ClassificationEvidenceSchema),
  reasonCode: ReasonCodeSchema.optional(),
  reason: z.string().optional(),
});
export type RepoInventoryEntry = z.infer<typeof RepoInventoryEntrySchema>;

export const RepoInventorySchema = z.object({
  entries: z.array(RepoInventoryEntrySchema),
  treeComplete: z.boolean(),
  treeWarnings: z.array(z.string()),
});
export type RepoInventory = z.infer<typeof RepoInventorySchema>;

export const RepoCoverageSchema = z.object({
  indexedPaths: z.number().int().nonnegative(),
  loadedSourceFiles: z.number().int().nonnegative(),
  deferredSourceFiles: z.number().int().nonnegative(),
  skippedFiles: z.number().int().nonnegative(),
  truncatedFiles: z.number().int().nonnegative(),
  failedFiles: z.number().int().nonnegative(),
  totalLoadedBytes: z.number().int().nonnegative(),
  skippedReasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  warnings: z.array(z.string()),
  treeComplete: z.boolean(),
  sourceAnalysisComplete: z.boolean(),
});
export type RepoCoverage = z.infer<typeof RepoCoverageSchema>;

export const RepoSnapshotSchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
  ref: z.string().min(1),
  source: ProjectSourceSchema,
  repoUrl: z.string().optional(),
  inventory: RepoInventorySchema,
  files: z.array(RepoFileSchema),
  coverage: RepoCoverageSchema,
  loadedAt: z.number(),
});
export type RepoSnapshot = z.infer<typeof RepoSnapshotSchema>;

// ---------------------------------------------------------------------------
// Request / response / events
// ---------------------------------------------------------------------------

export const MAX_SCOPE_ENTRIES = 20;

/**
 * Shape-level validation only (types, lengths, no unknown fields). The server and
 * client additionally apply the character-set validators from `repoUrl.ts`.
 */
export const RepoRequestSchema = z.strictObject({
  owner: z.string().min(1).max(39),
  repo: z.string().min(1).max(100),
  ref: z.string().min(1).max(250).optional(),
  scope: z.array(z.string().min(1).max(250)).max(MAX_SCOPE_ENTRIES).optional(),
});
export type RepoRequest = z.infer<typeof RepoRequestSchema>;

export const RepoResponseSchema = z.object({ snapshot: RepoSnapshotSchema });
export type RepoResponse = z.infer<typeof RepoResponseSchema>;

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
  /** ISO timestamp when a rate limit resets, if known. */
  resetAt: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const IngestEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stage'),
    stage: IngestStageSchema,
    status: z.enum(['started', 'finished', 'skipped']),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal('progress'),
    stage: z.literal('loading_sources'),
    loaded: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('notice'),
    code: z.literal('fallback_in_use'),
    message: z.string(),
  }),
  z.object({ type: z.literal('result'), response: RepoResponseSchema }),
  z.object({ type: z.literal('error'), error: ApiErrorSchema }),
]);
export type IngestEvent = z.infer<typeof IngestEventSchema>;

// ---------------------------------------------------------------------------
// Session log
// ---------------------------------------------------------------------------

export const SessionLogEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.number(),
  action: z.string(),
  status: z.enum(['info', 'proposed', 'approved', 'rejected', 'applied', 'verified', 'failed', 'undone']),
  affectedPaths: z.array(z.string()),
  relatedIssueId: z.string().optional(),
  message: z.string(),
  redacted: z.boolean(),
});
export type SessionLogEntry = z.infer<typeof SessionLogEntrySchema>;

// ---------------------------------------------------------------------------
// Coverage consistency check
// ---------------------------------------------------------------------------

/**
 * Independently recomputes every coverage figure from the inventory and files, and
 * throws one Error listing all mismatches. Used by tests and by the client before a
 * snapshot is stored. Deliberately does not share code with the selector's
 * `computeCoverage`, so a bug in one is caught by the other.
 */
export function assertCoverageConsistent(snapshot: RepoSnapshot): void {
  const problems: string[] = [];
  const { inventory, coverage, files } = snapshot;

  const counts = { loaded: 0, truncated: 0, deferred: 0, skipped: 0, failed: 0, needsReview: 0 };
  const skipped: Array<{ path: string; reasonCode?: ReasonCode }> = [];
  const fileEntries = new Map<string, RepoInventoryEntry>();

  for (const entry of inventory.entries) {
    if (entry.entryType !== 'file') continue;
    fileEntries.set(entry.path, entry);
    switch (entry.loadStatus) {
      case 'loaded':
        counts.loaded++;
        break;
      case 'truncated':
        counts.truncated++;
        break;
      case 'indexed_not_loaded':
        counts.deferred++;
        break;
      case 'skipped':
        counts.skipped++;
        skipped.push({ path: entry.path, reasonCode: entry.reasonCode });
        break;
      case 'failed':
        counts.failed++;
        break;
      case 'needs_review':
        counts.needsReview++;
        break;
      default:
        problems.push(`file entry "${entry.path}" has no loadStatus`);
    }
  }

  const expect = (label: string, actual: number | boolean, wanted: number | boolean): void => {
    if (actual !== wanted) problems.push(`${label}: coverage says ${String(actual)}, entries say ${String(wanted)}`);
  };

  expect('indexedPaths', coverage.indexedPaths, inventory.entries.length);
  expect('loadedSourceFiles', coverage.loadedSourceFiles, counts.loaded);
  expect('truncatedFiles', coverage.truncatedFiles, counts.truncated);
  expect('deferredSourceFiles', coverage.deferredSourceFiles, counts.deferred);
  expect('skippedFiles', coverage.skippedFiles, counts.skipped);
  expect('failedFiles', coverage.failedFiles, counts.failed);
  expect('treeComplete', coverage.treeComplete, inventory.treeComplete);

  // skippedReasons: exactly one record per skipped file.
  const reasonPaths = coverage.skippedReasons.map((r) => r.path).sort();
  const skippedPaths = skipped.map((s) => s.path).sort();
  if (reasonPaths.length !== skippedPaths.length || reasonPaths.some((p, i) => p !== skippedPaths[i])) {
    problems.push('skippedReasons paths do not match skipped file entries');
  }

  // files[]: exactly the loaded and truncated entries, with matching flags and bytes.
  const encoder = new TextEncoder();
  let bytes = 0;
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) problems.push(`duplicate file "${file.path}" in files`);
    seen.add(file.path);
    const entry = fileEntries.get(file.path);
    if (!entry) {
      problems.push(`file "${file.path}" is not in the inventory`);
      continue;
    }
    if (entry.loadStatus !== 'loaded' && entry.loadStatus !== 'truncated') {
      problems.push(`file "${file.path}" has content but inventory status is ${String(entry.loadStatus)}`);
    }
    if (file.loadStatus !== entry.loadStatus) problems.push(`file "${file.path}" status differs from inventory`);
    if (file.truncated !== (file.loadStatus === 'truncated')) {
      problems.push(`file "${file.path}" truncated flag disagrees with its status`);
    }
    if (typeof file.content !== 'string') problems.push(`file "${file.path}" has no content`);
    bytes += encoder.encode(file.content ?? '').length;
  }
  if (files.length !== counts.loaded + counts.truncated) {
    problems.push(`files has ${files.length} items but ${counts.loaded + counts.truncated} entries are loaded or truncated`);
  }
  expect('totalLoadedBytes', coverage.totalLoadedBytes, bytes);

  // sourceAnalysisComplete rule (design section 6, revised in T16).
  const hasUnanalysedSkip = skipped.some((s) => s.reasonCode !== undefined && INCOMPLETE_SKIP_REASONS.includes(s.reasonCode));
  const complete =
    inventory.treeComplete &&
    counts.deferred === 0 &&
    counts.truncated === 0 &&
    counts.failed === 0 &&
    counts.needsReview === 0 &&
    !hasUnanalysedSkip;
  expect('sourceAnalysisComplete', coverage.sourceAnalysisComplete, complete);

  if (problems.length > 0) {
    throw new Error(`Coverage inconsistent:\n- ${problems.join('\n- ')}`);
  }
}

// ---------------------------------------------------------------------------
// @node: F2.1 — AI Adapter contracts
// ---------------------------------------------------------------------------

export const AITaskTypeSchema = z.enum(['explain', 'suggest_change', 'review_finding']);
export type AITaskType = z.infer<typeof AITaskTypeSchema>;

const MAX_STR = 2000;
const MAX_QUESTIONS = 5;
const MAX_STEPS = 12;
const MAX_RISKS = 8;
const MAX_TESTS = 8;
const MAX_LIMITATIONS = 8;

// Bounded string helper
const bstr = z.string().min(1).max(MAX_STR);

/** A single sourceContext item. Strict: no extra fields. */
const SourceContextItemSchema = z.strictObject({
  filePath: z.string().min(1).max(250),
  content: z.string(),
});

/**
 * AI Assistant request. Strict: unknown fields are rejected so the server
 * never accidentally proxies extra data to any future provider.
 */
export const AIRequestSchema = z.strictObject({
  requestId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'requestId must be A-Z a-z 0-9 _ -'),
  instruction: z.string().min(1).max(MAX_STR),
  taskType: AITaskTypeSchema,
  selectedPaths: z.array(z.string().min(1).max(250)).max(10),
  sourceContext: z.array(SourceContextItemSchema).max(5).optional(),
});
export type AIRequest = z.infer<typeof AIRequestSchema>;

/** Four response shapes, each identified by `type`. */
export const AIResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('clarification'),
    questions: z.array(bstr).min(1).max(MAX_QUESTIONS),
  }),
  z.object({
    type: z.literal('explanation'),
    summary: bstr,
    evidencePaths: z.array(z.string().min(1).max(250)),
    limitations: z.array(bstr).min(1).max(MAX_LIMITATIONS),
  }),
  z.object({
    type: z.literal('plan'),
    summary: bstr,
    affectedPaths: z.array(z.string().min(1).max(250)),
    steps: z.array(bstr).min(1).max(MAX_STEPS),
    risks: z.array(bstr).min(1).max(MAX_RISKS),
  }),
  z.object({
    type: z.literal('patch_proposal'),
    summary: bstr,
    affectedPaths: z.array(z.string().min(1).max(250)),
    unifiedDiff: z.string().min(1),
    tests: z.array(bstr).min(1).max(MAX_TESTS),
    risks: z.array(bstr).min(1).max(MAX_RISKS),
  }),
]);
export type AIResponse = z.infer<typeof AIResponseSchema>;

/** Envelope returned by POST /api/assistant. Strict: no extra fields. */
export const AIResultSchema = z.strictObject({
  requestId: z.string().min(1).max(64),
  mode: z.enum(['mock', 'live']),
  response: AIResponseSchema,
});
export type AIResult = z.infer<typeof AIResultSchema>;
