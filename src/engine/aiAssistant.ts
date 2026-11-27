// @node: F2.5
// @node: F11.8 (Phase 3A: buildLiveRequest uses the Context Engine)
// Client-side AI assistant service. All calls to /api/assistant come from here.
// Never in React components and never substitutes a response from the browser.
import { AI_LIMITS } from '../config/aiLimits';
import {
  AIResultSchema,
  type AIRequest,
  type AIResult,
  type ApiErrorCode,
  type RepoSnapshot,
} from '../types/contracts';
import { validateAIRequest, validateAIResult } from './aiValidate';
import { buildContext, type FocusFinding } from './contextEngine';
import type { Edge } from './understandTypes';
import { redact } from './redact';

// Re-export the type alias we need
export type { AIRequest, AIResult };

// ---------------------------------------------------------------------------
// AssistantError (similar to IngestError, independent of the GitHub client)
// ---------------------------------------------------------------------------

export class AssistantError extends Error {
  readonly code: ApiErrorCode;
  readonly resetAt?: string;
  constructor(code: ApiErrorCode, message: string, resetAt?: string) {
    super(message);
    this.name = 'AssistantError';
    this.code = code;
    if (resetAt) this.resetAt = resetAt;
  }
  toApiError() {
    return this.resetAt !== undefined
      ? { code: this.code, message: this.message, resetAt: this.resetAt }
      : { code: this.code, message: this.message };
  }
}

export function isAssistantAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

export interface BuildAIRequestOptions {
  instruction: string;
  taskType: AIRequest['taskType'];
  selectedPaths: string[];
  includeContent: boolean;
}

type BuildResult = { ok: true; request: AIRequest } | { ok: false; message: string };

/** Deterministic counter for request IDs (injectable in tests). */
let _counter = 0;
export function resetIdCounter() { _counter = 0; }
export function nextId(): string { return `ai-${Date.now().toString(36)}-${++_counter}`; }

const encoder = new TextEncoder();

/**
 * Validates inputs and builds an `AIRequest`.
 * Content is included only when `includeContent` is true and only from `loaded` files.
 */
export function buildAIRequest(
  snapshot: RepoSnapshot,
  options: BuildAIRequestOptions,
  requestId: string = nextId(),
): BuildResult {
  const { instruction, taskType, selectedPaths, includeContent } = options;
  const trimmed = instruction.trim();
  if (trimmed.length === 0) return { ok: false, message: 'The instruction is empty.' };
  if (trimmed.length > AI_LIMITS.maxInstructionChars) {
    return { ok: false, message: `The instruction must be at most ${AI_LIMITS.maxInstructionChars} characters.` };
  }
  if (selectedPaths.length > AI_LIMITS.maxSelectedPaths) {
    return { ok: false, message: `Select at most ${AI_LIMITS.maxSelectedPaths} files.` };
  }

  // Every selected path must be a loaded file in the snapshot.
  for (const path of selectedPaths) {
    const file = snapshot.files.find((f) => f.path === path);
    if (!file) {
      return { ok: false, message: `"${path}" is not in the loaded snapshot.` };
    }
    if (file.loadStatus !== 'loaded') {
      return { ok: false, message: `"${path}" is ${file.loadStatus} and cannot be selected.` };
    }
  }

  // Build sourceContext from loaded files only.
  let sourceContext: AIRequest['sourceContext'];
  if (includeContent && selectedPaths.length > 0) {
    let totalBytes = 0;
    sourceContext = [];
    for (const path of selectedPaths) {
      const file = snapshot.files.find((f) => f.path === path);
      if (!file || file.loadStatus !== 'loaded' || typeof file.content !== 'string') continue;
      const fileBytes = encoder.encode(file.content).length;
      if (fileBytes > AI_LIMITS.maxContextFileBytes) {
        return { ok: false, message: `The content of "${path}" is too large to include (limit ${AI_LIMITS.maxContextFileBytes} bytes).` };
      }
      totalBytes += fileBytes;
      if (totalBytes > AI_LIMITS.maxContextTotalBytes) {
        return { ok: false, message: `The combined content exceeds ${AI_LIMITS.maxContextTotalBytes} bytes. Deselect some files or uncheck "Include file contents".` };
      }
      sourceContext.push({ filePath: path, content: file.content });
    }
  }

  const req: AIRequest = {
    requestId,
    instruction: trimmed,
    taskType,
    selectedPaths,
    ...(sourceContext !== undefined ? { sourceContext } : {}),
  };

  // Run through the full validator as a final safety net.
  const v = validateAIRequest(req);
  if (!v.ok) return { ok: false, message: v.message };

  return { ok: true, request: v.request };
}

export interface BuildLiveRequestOptions extends BuildAIRequestOptions {
  finding?: FocusFinding | undefined;
  edges?: readonly Edge[] | undefined;
  /** The practice copy's text for a path (so snippets match what an approved change would be applied to). */
  contentOf?: ((path: string) => string | undefined) | undefined;
}

export type LiveBuildResult = { ok: true; request: AIRequest; notes: string[] } | { ok: false; message: string };

/**
 * Live mode: builds the request with the Context Engine (snippets only when `includeContent` is true, connection facts, a skill id).
 * The question is redacted here and again on the server. Phase 2's limits all still apply through `validateAIRequest`.
 */
export function buildLiveRequest(
  snapshot: RepoSnapshot,
  options: BuildLiveRequestOptions,
  requestId: string = nextId(),
): LiveBuildResult {
  const trimmed = options.instruction.trim();
  if (trimmed.length === 0) return { ok: false, message: 'The instruction is empty.' };
  if (trimmed.length > AI_LIMITS.maxInstructionChars) {
    return { ok: false, message: `The instruction must be at most ${AI_LIMITS.maxInstructionChars} characters.` };
  }
  const built = buildContext({
    snapshot,
    paths: options.selectedPaths,
    finding: options.finding,
    includeContent: options.includeContent,
    // Connection facts come from file text, so they are never sent with a "Do something" request (an action may not follow file text).
    edges: options.taskType === 'act' ? undefined : options.edges,
    contentOf: options.contentOf,
  });
  if (!built.ok) return { ok: false, message: built.message };
  const c = built.context;
  const req: AIRequest = {
    requestId,
    instruction: redact(trimmed).text,
    taskType: options.taskType,
    selectedPaths: c.selectedPaths,
    ...(c.sourceContext !== undefined ? { sourceContext: c.sourceContext } : {}),
    ...(c.skillId !== undefined ? { skillId: c.skillId } : {}),
    ...(c.connections !== undefined ? { connections: c.connections } : {}),
  };
  const v = validateAIRequest(req);
  if (!v.ok) return { ok: false, message: v.message };
  return { ok: true, request: v.request, notes: c.notes };
}

// ---------------------------------------------------------------------------
// Request service
// ---------------------------------------------------------------------------

export interface RequestAssistantOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}

const DEFAULT_ENDPOINT = '/api/assistant';

/**
 * Calls `POST /api/assistant` with the given request and returns a validated `AIResult`.
 * Never returns a canned result from the browser — every result comes from the server.
 */
export async function requestAssistant(
  request: AIRequest,
  options: RequestAssistantOptions = {},
): Promise<AIResult> {
  // Validate before making a network call.
  const v = validateAIRequest(request);
  if (!v.ok) throw new AssistantError(v.code, v.message);

  const { endpoint = DEFAULT_ENDPOINT, timeoutMs = AI_LIMITS.clientTimeoutMs } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const { signal } = options;

  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const translate = (error: unknown): Error => {
    if (error instanceof AssistantError) return error;
    if (signal?.aborted) return new DOMException('The operation was aborted.', 'AbortError');
    if (timeout.aborted) return new AssistantError('timeout', 'The AI request did not complete in time.');
    return new AssistantError('upstream_failure', 'Could not reach the AI endpoint.');
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: combined,
    });

    // Read the body, capped at 256 KB.
    const MAX = AI_LIMITS.maxResponseBytes;
    let bodyText = '';
    if (response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > MAX) throw new AssistantError('upstream_failure', `The response exceeded ${MAX} bytes.`);
          chunks.push(value);
        }
      } finally {
        void reader.cancel().catch(() => undefined);
      }
      const all = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.length; }
      bodyText = new TextDecoder().decode(all);
    }

    if (!response.ok) {
      // Try to parse a structured error.
      try {
        const body = JSON.parse(bodyText) as { error?: { code?: string; message?: string } };
        const code = (body.error?.code ?? 'upstream_failure') as ApiErrorCode;
        const message = body.error?.message ?? `The server returned HTTP ${response.status}.`;
        throw new AssistantError(code, message);
      } catch (e) {
        if (e instanceof AssistantError) throw e;
        throw new AssistantError('upstream_failure', `The server returned HTTP ${response.status}.`);
      }
    }

    let result: unknown;
    try { result = JSON.parse(bodyText); } catch {
      throw new AssistantError('upstream_failure', 'The response was not valid JSON.');
    }

    // Schema validation
    const parsed = AIResultSchema.safeParse(result);
    if (!parsed.success) throw new AssistantError('upstream_failure', 'The response did not match the expected format.');

    // Cross-field validation against the original request
    const vr = validateAIResult(request, parsed.data);
    if (!vr.ok) throw new AssistantError('upstream_failure', 'The response failed consistency checks.');

    return parsed.data;
  } catch (error) {
    throw translate(error);
  }
}
