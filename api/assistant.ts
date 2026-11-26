// @node: F2.4
// @node: F11.5 (Phase 3A: live mode, GET status)
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
//   1. Method check → 405 (GET returns the status, POST asks a question)
//   2. AI_MODE check → 501 if unknown. `mock` and blank use the mock path; `live` uses the live path
//   2b. (live only) at least one usable provider → 503 "Live AI is not set up", never a mock answer
//   3. Content-type check → 400
//   4. Body size check → 413
//   5. JSON parse → 400
//   6. validateAIRequest → 400 / 413
//   7. Client disconnect check
//   8. mock: Redact → mockResponse → validateAIResult (internal self-check)
//      live: Redact → answerLive (Model Router, parse, validate, secret check)
//   9. Return 200 JSON
//
// Mock mode reads no environment variable except AI_MODE. Live mode reads only AI_MODE and the nine names in LIVE_ENV_NAMES.
// Live mode logs only codes and outcome words, never the question, a path, an answer, a header, or a key.
import { AI_LIMITS } from '../src/config/aiLimits';
import { LIVE_ENV_NAMES, PROVIDER_ORDER, providerKey, type LiveEnv } from '../src/config/aiProviders';
import { validateAIRequest, validateAIResult } from '../src/engine/aiValidate';
import { readBodyCapped } from '../src/engine/httpBody';
import { mockResponse } from '../src/engine/mockAssistant';
import { answerLive, NOT_SET_UP_MESSAGE } from '../src/engine/live/liveAssistant';
import { buildAttemptPlan, tierOf, type Clock } from '../src/engine/live/modelRouter';
import { containsSecret, redact } from '../src/engine/redact';
import type { AIRequest, AIResult, ApiError, ApiErrorCode } from '../src/types/contracts';

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
  /** Seam for testing the live path: the `fetch` used for provider calls. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Seam for testing the live path: a clock for the time budget. */
  clock?: Clock;
}

/** Reads only the nine live names from the environment. Called in live mode only. */
function readLiveEnv(env: Env): LiveEnv {
  const out: Record<string, string | undefined> = {};
  for (const name of LIVE_ENV_NAMES) out[name] = env[name];
  return out;
}

function statusResponse(rawMode: string, env: Env): Response {
  if (rawMode === 'live') {
    const live = readLiveEnv(env);
    const providers = PROVIDER_ORDER.map((id) => ({ id, configured: providerKey(id, live) !== undefined }));
    const ready = buildAttemptPlan('light', live).length > 0;
    return new Response(JSON.stringify({ mode: 'live', ready, providers }), { status: 200, headers: JSON_CT });
  }
  return new Response(JSON.stringify({ mode: 'mock' }), { status: 200, headers: JSON_CT });
}

/** Adds one plain line about redaction to the list a response already has (the lists have room for it). */
function noteRedaction(result: AIResult, count: number): AIResult {
  if (count <= 0) return result;
  const note = `${count} likely secret${count === 1 ? '' : 's'} ${count === 1 ? 'was' : 'were'} redacted from the input before processing.`;
  const r = result.response;
  if (r.type === 'explanation') return { ...result, response: { ...r, limitations: [...r.limitations, note].slice(0, 8) } };
  if (r.type === 'plan' || r.type === 'patch_proposal') return { ...result, response: { ...r, risks: [...r.risks, note].slice(0, 8) } };
  return result;
}

function liveLog(taskType: string, outcome: string): void {
  console.info(`[api/assistant] live task=${taskType} tier=${tierOf(taskType as AIRequest['taskType'])} ${outcome}`);
}

export async function handleAssistantRequest(
  request: Request,
  env: Env,
  deps: AssistantDeps = {},
): Promise<Response> {
  // 1. Method
  if (request.method !== 'POST' && request.method !== 'GET') {
    return jsonError(405, 'invalid_request', 'Use GET or POST.', { allow: 'GET, POST' });
  }

  // 2. AI_MODE — checked BEFORE reading the body
  const rawMode = (env.AI_MODE ?? '').trim();
  if (rawMode !== '' && rawMode !== 'mock' && rawMode !== 'live') {
    return jsonError(501, 'unsupported', 'The AI mode is not recognised. Use mock or live.');
  }
  if (request.method === 'GET') return statusResponse(rawMode, env);
  const isLive = rawMode === 'live';
  const liveEnv: LiveEnv | undefined = isLive ? readLiveEnv(env) : undefined;

  // 2b. Live mode with no usable provider: say so, never answer with a mock
  if (liveEnv && buildAttemptPlan('light', liveEnv).length === 0) {
    return jsonError(503, 'unsupported', NOT_SET_UP_MESSAGE);
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

  // 8a. Live path
  if (liveEnv) {
    const live = redactRequest(req);
    let outcome: Awaited<ReturnType<typeof answerLive>>;
    try {
      outcome = await answerLive(live.request, liveEnv, {
        fetchImpl: deps.fetchImpl ?? globalThis.fetch,
        ...(deps.clock ? { clock: deps.clock } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      });
    } catch {
      console.error(`[api/assistant] failed: upstream_failure (${req.taskType})`);
      return jsonError(502, 'upstream_failure', 'Unexpected server error.');
    }
    if (outcome.aborted) return new Response(null, { status: 499 });
    if (!outcome.ok) {
      liveLog(req.taskType, `failed=${outcome.code}`);
      return jsonError(outcome.status, outcome.code, outcome.message);
    }
    const final = noteRedaction(outcome.result, live.count);
    if (containsSecret(final)) {
      console.error(`[api/assistant] failed: upstream_failure (${req.taskType})`);
      return jsonError(502, 'upstream_failure', 'The AI answer could not be checked.');
    }
    const meta = final.meta;
    liveLog(req.taskType, `via=${meta?.provider} lighter=${meta?.lighter} failed=${(meta?.attempts ?? []).map((a) => `${a.provider}:${a.outcome}`).join(',') || 'none'}`);
    return new Response(JSON.stringify(final), { status: 200, headers: JSON_CT });
  }

  // 8. Redact, build response, internal self-check (mock)
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

/** Redacts the question and every snippet (again, on the server) and counts what it replaced. */
function redactRequest(req: AIRequest): { request: AIRequest; count: number } {
  const q = redact(req.instruction);
  let count = q.count;
  const ctx = req.sourceContext?.map((item) => {
    const r = redact(item.content);
    count += r.count;
    return { ...item, content: r.text };
  });
  const request: AIRequest = { ...req, instruction: q.text, ...(ctx ? { sourceContext: ctx } : {}) };
  return { request, count };
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleAssistantRequest(request, process.env);
  },
};
