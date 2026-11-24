// @node: F2.4
// POST /api/assistant — the mock AI assistant endpoint.
//
// Security properties:
// - Reads AI_MODE from env only; any other env key access throws in production
//   (enforced by callers passing a Proxy in tests).
// - Makes zero outbound network requests.
// - Logs only the error code and task type, never the instruction, paths, or content.
// - Stateless: holds no data between requests, writes nothing to disk.
//
// Order of checks (the mode check runs BEFORE the body is read):
//   1. Method check → 405
//   2. AI_MODE check → 501 if live/unknown
//   3. Content-type check → 400
//   4. Body size check → 413
//   5. JSON parse → 400
//   6. validateAIRequest → 400 / 413
//   7. Client disconnect check
//   8. Redact → mockResponse → validateAIResult (internal self-check)
//   9. Return 200 JSON
import { AI_LIMITS } from '../src/config/aiLimits';
import { validateAIRequest, validateAIResult } from '../src/engine/aiValidate';
import { readBodyCapped } from '../src/engine/httpBody';
import { mockResponse } from '../src/engine/mockAssistant';
import { containsSecret, redact } from '../src/engine/redact';
import type { ApiError, ApiErrorCode } from '../src/types/contracts';

export const SUPPORTED_MODES = new Set(['mock', '']);

type Env = Readonly<Record<string, string | undefined>>;

const JSON_CT = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function jsonError(status: number, code: ApiErrorCode, message: string, extra?: Record<string, string>): Response {
  const body: { error: ApiError } = { error: { code, message } };
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_CT, ...extra } });
}

export interface AssistantDeps {
  /** Seam for testing: replace the response builder to force an internal failure. */
  _forceInternalFailure?: boolean;
}

export async function handleAssistantRequest(
  request: Request,
  env: Env,
  deps: AssistantDeps = {},
): Promise<Response> {
  // 1. Method
  if (request.method !== 'POST') {
    return jsonError(405, 'invalid_request', 'Use POST.', { allow: 'POST' });
  }

  // 2. AI_MODE — checked BEFORE reading the body
  const rawMode = (env.AI_MODE ?? '').trim();
  if (rawMode !== '' && rawMode !== 'mock') {
    return jsonError(501, 'unsupported', 'Live AI is not available in this build.');
  }

  // 3. Content-type
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return jsonError(400, 'invalid_request', 'Content-Type must be application/json.');
  }

  // 4. Body size
  const text = await readBodyCapped(request, AI_LIMITS.maxRequestBodyBytes);
  if (text === null) {
    return jsonError(413, 'oversized', `The request body must be at most ${AI_LIMITS.maxRequestBodyBytes} bytes.`);
  }

  // 5. JSON parse
  let json: unknown;
  try { json = JSON.parse(text); } catch {
    return jsonError(400, 'invalid_request', 'The request body is not valid JSON.');
  }

  // 6. Validate request
  const validated = validateAIRequest(json);
  if (!validated.ok) {
    return jsonError(validated.code === 'oversized' ? 413 : 400, validated.code, validated.message);
  }
  const req = validated.request;

  // 7. Client disconnect guard
  if (request.signal?.aborted) {
    return new Response(null, { status: 499 });
  }

  // 8. Redact, build response, internal self-check
  let result: unknown;
  try {
    // Redact instruction and all sourceContext content
    const redactedInstruction = redact(req.instruction);
    const redactedContext = req.sourceContext?.map((item) => ({
      filePath: item.filePath,
      content: redact(item.content).text,
    }));
    const totalRedacted = redactedInstruction.count +
      (req.sourceContext ?? []).reduce((s, item) => s + redact(item.content).count, 0);
    const redactedReq = { ...req, instruction: redactedInstruction.text, ...(redactedContext ? { sourceContext: redactedContext } : {}) };

    // Build the mock response
    const response = deps._forceInternalFailure
      ? (() => { throw new Error('forced internal failure for testing'); })()
      : mockResponse(redactedReq, { redactionCount: totalRedacted });

    result = { requestId: req.requestId, mode: 'mock' as const, response };

    // Self-check
    const v = validateAIResult(req, result);
    if (!v.ok) throw new Error(`Self-check failed: ${v.problems.join('; ')}`);

    if (containsSecret(result)) throw new Error('Self-check: result contains a likely secret.');
  } catch (error) {
    // Log only the error type, never the instruction, paths, or content.
    console.error(`[api/assistant] failed: upstream_failure (${req.taskType})`);
    return jsonError(500, 'upstream_failure', 'Unexpected server error.');
  }

  // 9. Return
  return new Response(JSON.stringify(result), { status: 200, headers: JSON_CT });
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleAssistantRequest(request, process.env);
  },
};
