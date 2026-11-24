// @node: F1.4
// The only module that talks to GitHub. Used by the serverless endpoint and by the
// browser fallback. Takes an injected `fetch`, so tests never touch the network.
//
// Hosts: only api.github.com (REST) and raw.githubusercontent.com (file content).
// URLs are built from validated owner/repo/ref/path values, with every segment
// percent-encoded. The optional token is sent to the API host only.
import { z } from 'zod';
import type { ApiError, ApiErrorCode } from '../types/contracts';
import type { TreeEntry } from './repoInventory';
import { isValidRef } from './repoUrl';

export const API_HOST = 'api.github.com';
export const RAW_HOST = 'raw.githubusercontent.com';
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([API_HOST, RAW_HOST]);
const API_VERSION = '2022-11-28';
const BINARY_SNIFF_BYTES = 8192;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SourceDeps {
  fetch: FetchLike;
  /** Server-side only. Sent to api.github.com, never to the raw host. */
  token?: string;
  /** Caller cancellation. Aborting rejects with an AbortError, not an IngestError. */
  signal?: AbortSignal;
  /** Timeout for each request, including reading the response body. */
  timeoutMs: number;
  /** Clock for computing reset times from Retry-After. Defaults to Date.now. */
  now?: () => number;
}

export class IngestError extends Error {
  readonly code: ApiErrorCode;
  readonly resetAt?: string;

  constructor(code: ApiErrorCode, message: string, resetAt?: string) {
    super(message);
    this.name = 'IngestError';
    this.code = code;
    if (resetAt !== undefined) this.resetAt = resetAt;
  }

  toApiError(): ApiError {
    return this.resetAt === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, resetAt: this.resetAt };
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function abortError(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  return new DOMException('The operation was aborted.', 'AbortError');
}

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;
const encSegments = (path: string): string => path.split('/').map(enc).join('/');

function repoApiUrl(owner: string, repo: string): string {
  return `https://${API_HOST}/repos/${enc(owner)}/${enc(repo)}`;
}

function treeUrl(owner: string, repo: string, ref: string): string {
  return `${repoApiUrl(owner, repo)}/git/trees/${enc(ref)}?recursive=1`;
}

function rawUrl(owner: string, repo: string, ref: string, path: string): string {
  return `https://${RAW_HOST}/${enc(owner)}/${enc(repo)}/${encSegments(ref)}/${encSegments(path)}`;
}

/** Rejects '.', '..', and empty segments, which a URL parser would resolve to a different path. */
function assertNoTraversal(label: string, value: string): void {
  if (value.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new IngestError('invalid_request', `Unsafe ${label}.`);
  }
}

function assertAllowedHost(url: string): void {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host)) throw new IngestError('invalid_request', `Host not allowed: ${host}`);
}

/** Cancels a response body we will not read, so the connection can be released. */
function discard(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

/**
 * `fetch` follows redirects on its own. After the request completes, confirm the final URL is
 * still https on one of the two allowed hosts; otherwise discard the body and fail. Skipped when
 * the response carries no URL (test doubles). The Authorization header is not forwarded to a
 * different origin by `fetch`, and the raw host never receives the token at all.
 */
function assertFinalHost(response: Response): void {
  if (!response.url) return;
  let ok = false;
  try {
    const final = new URL(response.url);
    ok = final.protocol === 'https:' && ALLOWED_HOSTS.has(final.hostname);
  } catch {
    ok = false;
  }
  if (!ok) {
    discard(response);
    throw new IngestError('upstream_failure', 'GitHub redirected to an unexpected address.');
  }
}

// ---------------------------------------------------------------------------
// Request core: timeout, abort, status mapping
// ---------------------------------------------------------------------------

interface Guarded {
  signal: AbortSignal;
  /** Maps any thrown error into AbortError, IngestError(timeout), or IngestError(upstream_failure). */
  translate(error: unknown): Error;
}

function guard(deps: SourceDeps): Guarded {
  if (deps.signal?.aborted) throw abortError(deps.signal);
  const timeout = AbortSignal.timeout(deps.timeoutMs);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
  return {
    signal,
    translate(error: unknown): Error {
      if (error instanceof IngestError) return error;
      if (deps.signal?.aborted) return abortError(deps.signal);
      if (timeout.aborted) return new IngestError('timeout', `GitHub did not respond within ${deps.timeoutMs} ms.`);
      return new IngestError('upstream_failure', 'Could not reach GitHub.');
    },
  };
}

function resetAtFrom(response: Response, now: () => number): string | undefined {
  const resetHeader = response.headers.get('x-ratelimit-reset');
  const reset = resetHeader === null ? NaN : Number(resetHeader);
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000).toISOString();
  const retryHeader = response.headers.get('retry-after');
  if (retryHeader !== null && retryHeader.trim() !== '') {
    const retryAfter = Number(retryHeader);
    if (Number.isFinite(retryAfter) && retryAfter >= 0) return new Date(now() + retryAfter * 1000).toISOString();
  }
  return undefined;
}

function isRateLimited(response: Response): boolean {
  if (response.status === 429) return true;
  return (
    response.status === 403 &&
    (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))
  );
}

/** Maps a non-success response to an IngestError. Never includes the response body. */
function errorForStatus(response: Response, now: () => number, what: string): IngestError {
  discard(response);
  if (response.status === 404) return new IngestError('not_found', `${what} was not found, or the repository is private.`);
  if (isRateLimited(response)) {
    return new IngestError('rate_limited', 'GitHub rate limit reached.', resetAtFrom(response, now));
  }
  return new IngestError('upstream_failure', `GitHub returned HTTP ${response.status} for ${what}.`);
}

function apiHeaders(deps: SourceDeps): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  };
  if (deps.token) headers.Authorization = `Bearer ${deps.token}`;
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new IngestError('upstream_failure', 'GitHub returned a response that is not valid JSON.');
  }
}

// ---------------------------------------------------------------------------
// Default branch
// ---------------------------------------------------------------------------

const RepoInfoSchema = z.object({ default_branch: z.string(), private: z.boolean().optional() });

export interface RepoInfo {
  defaultBranch: string;
  /** Fails closed: true unless GitHub explicitly reports `private: false`. */
  isPrivate: boolean;
}

export async function getRepoInfo(owner: string, repo: string, deps: SourceDeps): Promise<RepoInfo> {
  const url = repoApiUrl(owner, repo);
  assertAllowedHost(url);
  const g = guard(deps);
  const now = deps.now ?? Date.now;
  try {
    const response = await deps.fetch(url, { headers: apiHeaders(deps), signal: g.signal });
    assertFinalHost(response);
    if (!response.ok) throw errorForStatus(response, now, 'The repository');
    const parsed = RepoInfoSchema.safeParse(await readJson(response));
    if (!parsed.success || !isValidRef(parsed.data.default_branch)) {
      throw new IngestError('upstream_failure', 'GitHub did not report a usable default branch.');
    }
    return { defaultBranch: parsed.data.default_branch, isPrivate: parsed.data.private !== false };
  } catch (error) {
    throw g.translate(error);
  }
}

export async function resolveDefaultBranch(owner: string, repo: string, deps: SourceDeps): Promise<string> {
  return (await getRepoInfo(owner, repo, deps)).defaultBranch;
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

const TreeResponseSchema = z.object({
  tree: z.array(
    z.object({
      path: z.string().optional(),
      type: z.string().optional(),
      mode: z.string().optional(),
      size: z.number().optional(),
    }),
  ),
  truncated: z.boolean().optional(),
});

export interface TreeResult {
  entries: TreeEntry[];
  truncated: boolean;
}

export async function fetchTree(owner: string, repo: string, ref: string, deps: SourceDeps): Promise<TreeResult> {
  const url = treeUrl(owner, repo, ref);
  assertAllowedHost(url);
  const g = guard(deps);
  const now = deps.now ?? Date.now;
  try {
    const response = await deps.fetch(url, { headers: apiHeaders(deps), signal: g.signal });
    assertFinalHost(response);

    if (response.status === 409) {
      // GitHub answers 409 "Git Repository is empty." for a repository with no commits.
      const body = await response.text().catch(() => '');
      if (/empty/i.test(body)) return { entries: [], truncated: false };
      throw new IngestError('upstream_failure', 'GitHub returned HTTP 409 for the repository tree.');
    }
    if (!response.ok) throw errorForStatus(response, now, `The reference "${ref}"`);

    const parsed = TreeResponseSchema.safeParse(await readJson(response));
    if (!parsed.success) throw new IngestError('upstream_failure', 'GitHub returned an unexpected tree format.');

    const entries: TreeEntry[] = parsed.data.tree.map((item) => {
      const entry: TreeEntry = { path: item.path ?? '', type: item.type ?? '' };
      if (item.mode !== undefined) entry.mode = item.mode;
      if (item.size !== undefined) entry.size = item.size;
      return entry;
    });
    return { entries, truncated: parsed.data.truncated === true };
  } catch (error) {
    throw g.translate(error);
  }
}

// ---------------------------------------------------------------------------
// File content (size-capped)
// ---------------------------------------------------------------------------

export interface FileResult {
  /** Decoded text. Empty when `binary` is true. */
  text: string;
  /** Bytes kept (after any truncation). Zero when `binary` is true. */
  bytes: number;
  /** True when the file was longer than the cap and only a prefix was kept. */
  truncated: boolean;
  /** True when a NUL byte appears in the first 8 KB. Content is discarded. */
  binary: boolean;
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

/**
 * Fetches one file from the raw host and reads at most `maxBytes`. The stream is
 * cancelled as soon as more than `maxBytes` has arrived, so an oversized file is never
 * fully buffered. A cut that lands inside a multi-byte UTF-8 character is moved back to
 * the previous character boundary.
 */
export async function fetchFileCapped(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  maxBytes: number,
  deps: SourceDeps,
): Promise<FileResult> {
  assertNoTraversal('file path', path);
  assertNoTraversal('reference', ref);
  const url = rawUrl(owner, repo, ref, path);
  assertAllowedHost(url);
  const g = guard(deps);
  const now = deps.now ?? Date.now;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  // Reading the body must also stop on timeout or abort, even if the fetch
  // implementation does not tie the body stream to the signal.
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(g.signal.reason);
    if (g.signal.aborted) onAbort();
    else g.signal.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => undefined); // avoid an unhandled rejection when nothing is racing it
  try {
    // No Authorization header here, whatever the token: the raw host never gets it.
    const response = await deps.fetch(url, { signal: g.signal });
    assertFinalHost(response);
    if (!response.ok) throw errorForStatus(response, now, `The file "${path}"`);

    if (!response.body) return { text: '', bytes: 0, truncated: false, binary: false };

    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let sawMore = false;
    while (total <= maxBytes) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > maxBytes) sawMore = true;
    }
    if (sawMore) void reader.cancel().catch(() => undefined);

    const all = concat(chunks, total);

    const sniff = Math.min(all.length, BINARY_SNIFF_BYTES);
    for (let i = 0; i < sniff; i++) {
      if (all[i] === 0) return { text: '', bytes: 0, truncated: false, binary: true };
    }

    let end = Math.min(all.length, maxBytes);
    if (sawMore) {
      // Byte at `maxBytes` is the first dropped byte. If it is a UTF-8 continuation
      // byte, the cut is inside a character: step back to the character's lead byte.
      while (end > 0 && ((all[end] ?? 0) & 0xc0) === 0x80) end--;
    }
    const kept = all.subarray(0, end);
    return { text: new TextDecoder('utf-8').decode(kept), bytes: kept.length, truncated: sawMore, binary: false };
  } catch (error) {
    if (reader) void reader.cancel().catch(() => undefined);
    throw g.translate(error);
  } finally {
    if (onAbort) g.signal.removeEventListener('abort', onAbort);
  }
}
