// @node: F1.5
// POST /api/repo: streams repository ingestion events as NDJSON.
//
// Only the request shape is accepted: { owner, repo, ref?, scope? }. The client never
// supplies a URL. Method, size, JSON, and schema problems return plain JSON 405/400.
// Once the request is accepted the response is a 200 stream, so every later failure is
// an `error` event inside the stream with a structured code. The GitHub token is read
// from the server environment and is never returned, logged, or accepted from the client.
import { BUDGETS, type Budgets } from '../src/config/budgets';
import { IngestError, isAbortError, type FetchLike } from '../src/engine/githubSource';
import { runIngestion, validateRequest } from '../src/engine/ingestPipeline';
import { encodeEvent } from '../src/engine/ndjson';
import { RepoRequestSchema, type ApiError, type ApiErrorCode, type IngestEvent, type RepoRequest } from '../src/types/contracts';

export const MAX_BODY_BYTES = 4096;

export interface HandlerDeps {
  fetch?: FetchLike;
  budgets?: Budgets;
  /** Replaceable in tests. */
  run?: typeof runIngestion;
}

type Env = Readonly<Record<string, string | undefined>>;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function jsonError(status: number, code: ApiErrorCode, message: string, extra: Record<string, string> = {}): Response {
  const body: { error: ApiError } = { error: { code, message } };
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

/** Reads at most `limit` bytes of the body. Returns null if the body is larger. */
async function readBodyCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) return null;
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder('utf-8').decode(all);
}

export async function handleRepoRequest(request: Request, env: Env, deps: HandlerDeps = {}): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonError(405, 'invalid_request', 'Use POST.', { allow: 'POST' });
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return jsonError(400, 'invalid_request', 'Content-Type must be application/json.');
  }

  const text = await readBodyCapped(request, MAX_BODY_BYTES);
  if (text === null) return jsonError(400, 'invalid_request', `The request body must be at most ${MAX_BODY_BYTES} bytes.`);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return jsonError(400, 'invalid_request', 'The request body is not valid JSON.');
  }

  const parsed = RepoRequestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, 'invalid_request', 'The request must be { owner, repo, ref?, scope? } with no other fields.');
  }
  const repoRequest: RepoRequest = parsed.data;
  const budgets = deps.budgets ?? BUDGETS;
  try {
    validateRequest(repoRequest, budgets);
  } catch (error) {
    const message = error instanceof IngestError ? error.message : 'Invalid request.';
    return jsonError(400, 'invalid_request', message);
  }

  const token = env.GITHUB_TOKEN?.trim();
  const run = deps.run ?? runIngestion;
  const upstreamFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const internal = new AbortController();
  const signal = AbortSignal.any([request.signal, internal.signal]);
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: IngestEvent): void => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };
      const finish = (): void => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      void (async () => {
        try {
          const snapshot = await run(repoRequest, {
            fetch: upstreamFetch,
            signal,
            emit: send,
            budgets,
            // With a token configured, only repositories confirmed public may be loaded.
            requirePublic: Boolean(token),
            ...(token ? { token } : {}),
          });
          send({ type: 'result', response: { snapshot } });
        } catch (error) {
          if (isAbortError(error) || signal.aborted) {
            // The client went away or cancelled: nothing to tell it.
          } else if (error instanceof IngestError) {
            console.error(`[api/repo] ingestion failed: ${error.code} (${repoRequest.owner}/${repoRequest.repo})`);
            send({ type: 'error', error: error.toApiError() });
          } else {
            // Log the error class only: messages can contain request or file data.
            console.error(`[api/repo] unexpected failure: ${error instanceof Error ? error.name : 'unknown'}`);
            send({ type: 'error', error: { code: 'upstream_failure', message: 'Unexpected server error.' } });
          }
        } finally {
          finish();
        }
      })();
    },
    cancel() {
      closed = true;
      internal.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleRepoRequest(request, process.env);
  },
};
