// @node: F1.6
// Client-side ingestion service. All network calls for loading a repository live here
// (never in React components). It calls the `/api/repo` stream, validates what comes
// back, and, when allowed, falls back to the same pipeline running in the browser.
//
// A failure never produces a sample repository. Samples come only from `ingestSample`,
// which the user chooses explicitly.
import { BUDGETS, FALLBACK_ENABLED } from '../config/budgets';
import { buildSampleSnapshot, isSampleId, type SampleId } from '../data/sampleRepos';
import {
  ApiErrorCodeSchema,
  RepoResponseSchema,
  assertCoverageConsistent,
  type ApiErrorCode,
  type IngestEvent,
  type RepoRequest,
  type RepoSnapshot,
} from '../types/contracts';
import { IngestError, isAbortError, type FetchLike } from './githubSource';
import { runIngestion, validateRequest } from './ingestPipeline';
import { readEvents } from './ndjson';

export interface IngestOptions {
  /** Cancels the whole ingestion. Rejects with an AbortError and returns nothing. */
  signal?: AbortSignal;
  /** Receives stage, progress, and notice events. Never receives result or error. */
  onEvent?: (event: IngestEvent) => void;
  /** Replaceable for tests. Defaults to the global fetch. */
  fetchImpl?: FetchLike;
  /** Defaults to FALLBACK_ENABLED (dev builds only). */
  fallbackEnabled?: boolean;
  /** Server route. */
  endpoint?: string;
  /** Upper bound for the whole server-route attempt. */
  serverTimeoutMs?: number;
}

/** Server failures after which trying GitHub directly from the browser can help. */
export const FALLBACK_CODES: readonly ApiErrorCode[] = ['upstream_failure', 'timeout', 'rate_limited'];

const DEFAULT_ENDPOINT = '/api/repo';
const FALLBACK_MESSAGE = 'The server route failed. Loading directly from GitHub in this browser instead.';

const globalFetch: FetchLike = (url, init) => globalThis.fetch(url, init);

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** Validates a snapshot against the response schema and the coverage invariants. */
function validateSnapshot(snapshot: unknown): RepoSnapshot {
  const parsed = RepoResponseSchema.safeParse({ snapshot });
  if (!parsed.success) throw new IngestError('upstream_failure', 'The repository data did not match the expected format.');
  try {
    assertCoverageConsistent(parsed.data.snapshot);
  } catch {
    throw new IngestError('upstream_failure', 'The repository data failed its consistency check.');
  }
  return parsed.data.snapshot;
}

// ---------------------------------------------------------------------------
// Server route
// ---------------------------------------------------------------------------

async function ingestViaServer(target: RepoRequest, options: IngestOptions): Promise<RepoSnapshot> {
  const { signal, onEvent } = options;
  const fetchImpl = options.fetchImpl ?? globalFetch;
  const timeoutMs = options.serverTimeoutMs ?? BUDGETS.totalDeadlineMs + 2 * BUDGETS.requestTimeoutMs;
  if (signal?.aborted) throw abortError();

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const translate = (error: unknown): Error => {
    if (error instanceof IngestError) return error;
    if (signal?.aborted) return abortError();
    if (timeout.aborted) return new IngestError('timeout', 'The server did not finish in time.');
    return new IngestError('upstream_failure', 'Could not reach the server.');
  };

  try {
    const response = await fetchImpl(options.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(target),
      signal: combined,
    });

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('application/x-ndjson')) {
      // A plain JSON error from the handler (400/405), or no route at all (for example an HTML 404).
      if (type.includes('application/json')) {
        const body: unknown = await response.json().catch(() => undefined);
        const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
        const code = ApiErrorCodeSchema.safeParse(error?.code);
        if (error && code.success && typeof error.message === 'string') {
          throw new IngestError(code.data, error.message);
        }
      }
      throw new IngestError('upstream_failure', 'The server route is not available.');
    }

    for await (const event of readEvents(response, { signal: combined })) {
      if (event.type === 'result') return validateSnapshot(event.response.snapshot);
      if (event.type === 'error') {
        throw new IngestError(event.error.code, event.error.message, event.error.resetAt);
      }
      onEvent?.(event);
    }
    throw new IngestError('upstream_failure', 'The server stream ended without a result.');
  } catch (error) {
    throw translate(error);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads a public GitHub repository. Tries the server route first. If that fails with
 * `upstream_failure`, `timeout`, `rate_limited`, a network error, or a missing route,
 * and the fallback is enabled, it announces the fallback with a `notice` event and runs
 * the same pipeline in the browser. Any other failure is thrown as is.
 */
export async function ingestRepository(target: RepoRequest, options: IngestOptions = {}): Promise<RepoSnapshot> {
  const { signal, onEvent } = options;
  if (signal?.aborted) throw abortError();
  validateRequest(target, BUDGETS);

  try {
    return await ingestViaServer(target, options);
  } catch (error) {
    if (isAbortError(error)) throw error;
    const failure =
      error instanceof IngestError ? error : new IngestError('upstream_failure', 'Could not reach the server.');
    const fallbackEnabled = options.fallbackEnabled ?? FALLBACK_ENABLED;
    if (!fallbackEnabled || !FALLBACK_CODES.includes(failure.code)) throw failure;

    onEvent?.({ type: 'notice', code: 'fallback_in_use', message: FALLBACK_MESSAGE });
    const snapshot = await runIngestion(target, {
      fetch: options.fetchImpl ?? globalFetch,
      ...(signal ? { signal } : {}),
      ...(onEvent ? { emit: onEvent } : {}),
    });
    return validateSnapshot(snapshot);
  }
}

export interface SampleOptions {
  signal?: AbortSignal;
  onEvent?: (event: IngestEvent) => void;
  /** Injectable clock for tests. */
  now?: number;
}

/**
 * Loads a bundled sample with the same event sequence and the same validation as a
 * real repository, and no network calls.
 */
export async function ingestSample(id: SampleId, options: SampleOptions = {}): Promise<RepoSnapshot> {
  const { signal, onEvent } = options;
  if (signal?.aborted) throw abortError();
  if (!isSampleId(id)) throw new IngestError('invalid_request', 'Unknown sample.');

  onEvent?.({ type: 'stage', stage: 'resolving_ref', status: 'skipped', detail: 'Bundled sample.' });
  onEvent?.({ type: 'stage', stage: 'fetching_tree', status: 'skipped', detail: 'Bundled sample.' });
  onEvent?.({ type: 'stage', stage: 'loading_sources', status: 'started' });

  const snapshot = validateSnapshot(buildSampleSnapshot(id, options.now));
  if (signal?.aborted) throw abortError();

  const total = snapshot.coverage.loadedSourceFiles + snapshot.coverage.truncatedFiles;
  if (total > 0) onEvent?.({ type: 'progress', stage: 'loading_sources', loaded: total, total });
  onEvent?.({
    type: 'stage',
    stage: 'loading_sources',
    status: 'finished',
    detail: `${snapshot.coverage.loadedSourceFiles} sample files loaded.`,
  });
  return snapshot;
}
