// @node: F1.1
// All ingestion limits live here. Every value is PROVISIONAL until the Phase 0
// benchmark on the 4 GB target laptop. The coverage panel shows these numbers.
import { MAX_SCOPE_ENTRIES, MEDIA_HARD_MAX_BYTES, MEDIA_HARD_MAX_COUNT, MEDIA_HARD_MAX_TOTAL_BYTES } from '../types/contracts';

export interface Budgets {
  /** True until the values are replaced by benchmarked numbers. */
  provisional: boolean;
  /** Per-file prefix limit: larger files load only this many bytes and are marked truncated. */
  maxFilePrefixBytes: number;
  /** Files above this size are skipped entirely (over_hard_ceiling). */
  hardCeilingBytes: number;
  /** Total content bytes loaded per session. */
  maxTotalLoadedBytes: number;
  /** Files per batch; only one batch of raw responses is held at a time. */
  batchSize: number;
  /** Concurrent file fetches inside a batch. */
  fetchConcurrency: number;
  /** Timeout for each upstream request. */
  requestTimeoutMs: number;
  /** After this much total time, remaining files are deferred (deadline_reached). */
  totalDeadlineMs: number;
  /** Inventory entries beyond this are not represented and the tree is marked incomplete. */
  maxInventoryEntries: number;
  /** Maximum number of scope paths in one request. */
  maxScopeEntries: number;
  /** 3B-1: pictures kept for the Sandbox. Per picture, in all per session (bytes before encoding), and how many. */
  maxImageBytes: number;
  maxTotalImageBytes: number;
  maxImages: number;
}

export const BUDGETS: Budgets = {
  provisional: true,
  maxFilePrefixBytes: 200 * 1024,
  hardCeilingBytes: 1024 * 1024,
  maxTotalLoadedBytes: 3 * 1024 * 1024,
  batchSize: 25,
  fetchConcurrency: 5,
  requestTimeoutMs: 15_000,
  totalDeadlineMs: 60_000,
  maxInventoryEntries: 20_000,
  maxScopeEntries: MAX_SCOPE_ENTRIES,
  maxImageBytes: MEDIA_HARD_MAX_BYTES,
  maxTotalImageBytes: MEDIA_HARD_MAX_TOTAL_BYTES,
  maxImages: MEDIA_HARD_MAX_COUNT,
};

/**
 * Whether the client may fall back to calling GitHub directly from the browser when
 * the server route fails. On in dev builds only. `import.meta.env` is undefined when
 * this module runs in plain Node (for example a serverless function), so guard it.
 */
export const FALLBACK_ENABLED: boolean = import.meta.env?.DEV === true;
