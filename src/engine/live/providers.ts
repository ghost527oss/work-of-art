// @node: F11.3
// The three provider adapters. Server only. Each call: a fixed endpoint, the key in a header, no redirects, an output cap,
// a body size cap, and an outcome WORD on failure (never a status text, a header, or any part of a body).
import { AI_LIVE } from '../../config/aiLive';
import { PROVIDERS, isValidModelName, type AIProviderId } from '../../config/aiProviders';

export type CallFailure = 'rate_limited' | 'timeout' | 'error' | 'key_rejected' | 'aborted';
export type CallResult = { ok: true; text: string; truncated?: boolean } | { ok: false; outcome: CallFailure };

export interface CallArgs {
  provider: AIProviderId;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  timeoutMs: number;
  /** The browser's request signal: when it aborts, the call stops with `aborted`. */
  signal?: AbortSignal;
  fetchImpl: typeof fetch;
}

function statusOutcome(status: number): CallFailure {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'key_rejected';
  return 'error';
}

/** Reads at most `max` bytes of the response body as text, or returns undefined when it is larger. */
async function readCapped(response: Response, max: number): Promise<string | undefined> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) return undefined;
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  return new TextDecoder().decode(all);
}

function buildRequest(args: CallArgs): { url: string; headers: Record<string, string>; body: string } | undefined {
  const info = PROVIDERS[args.provider];
  if (!isValidModelName(args.provider, args.model)) return undefined;
  if (args.provider === 'gemini') {
    return {
      url: info.endpoint.replace('{model}', args.model),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': args.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: 'user', parts: [{ text: args.user }] }],
        generationConfig: { maxOutputTokens: args.maxOutputTokens, temperature: 0.2, responseMimeType: 'application/json' },
      }),
    };
  }
  // Groq and OpenRouter share the OpenAI chat format. JSON mode is not requested: not every model supports it,
  // so the parser accepts a JSON object that is optionally inside a code fence.
  return {
    url: info.endpoint,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: 'system', content: args.system }, { role: 'user', content: args.user }],
      max_tokens: args.maxOutputTokens,
      temperature: 0.2,
    }),
  };
}

function extractText(provider: AIProviderId, json: unknown): { text: string; truncated: boolean } | undefined {
  const j = json as Record<string, unknown> | null;
  if (!j || typeof j !== 'object') return undefined;
  if (provider === 'gemini') {
    const cands = j.candidates;
    if (!Array.isArray(cands) || cands.length === 0) return undefined;
    const parts = (cands[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
    if (!Array.isArray(parts)) return undefined;
    const text = parts.map((p) => (p && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join('');
    const finish = (cands[0] as { finishReason?: unknown }).finishReason;
    return text === '' ? undefined : { text, truncated: finish === 'MAX_TOKENS' };
  }
  const choices = j.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  const finish = (choices[0] as { finish_reason?: unknown } | undefined)?.finish_reason;
  return typeof content === 'string' && content !== '' ? { text: content, truncated: finish === 'length' } : undefined;
}

export async function callProvider(args: CallArgs): Promise<CallResult> {
  const req = buildRequest(args);
  if (!req) return { ok: false, outcome: 'error' };
  if (args.signal?.aborted) return { ok: false, outcome: 'aborted' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, args.timeoutMs);
  const onOuterAbort = (): void => controller.abort();
  args.signal?.addEventListener('abort', onOuterAbort, { once: true });
  try {
    const response = await args.fetchImpl(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return { ok: false, outcome: statusOutcome(response.status) };
    }
    const bodyText = await readCapped(response, AI_LIVE.maxProviderBodyBytes);
    if (bodyText === undefined) return { ok: false, outcome: 'error' };
    let json: unknown;
    try { json = JSON.parse(bodyText); } catch { return { ok: false, outcome: 'error' }; }
    const got = extractText(args.provider, json);
    return got === undefined ? { ok: false, outcome: 'error' } : { ok: true, text: got.text, ...(got.truncated ? { truncated: true } : {}) };
  } catch {
    if (args.signal?.aborted) return { ok: false, outcome: 'aborted' };
    if (timedOut) return { ok: false, outcome: 'timeout' };
    return { ok: false, outcome: 'error' };
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener('abort', onOuterAbort);
  }
}
