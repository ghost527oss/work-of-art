// @node: F11.3
// A scripted fake `fetch` for the three providers. No network is touched. Delays use setTimeout so fake timers work.
export interface FakeCall {
  url: string;
  provider: 'gemini' | 'groq' | 'openrouter' | 'other';
  headers: Record<string, string>;
  body: Record<string, any>;
  init: RequestInit;
}

export interface FakeStep {
  status?: number;
  /** A JSON body. */
  json?: unknown;
  /** A raw text body (overrides json). */
  text?: string;
  /** Wait this long (fake or real timers) before answering. */
  delayMs?: number;
  /** Never answer; only an abort ends it. */
  hang?: boolean;
  /** Throw instead of answering. */
  throws?: 'network';
  /** A body larger than any cap (bytes). */
  bigBody?: number;
}

export function providerOfUrl(url: string): FakeCall['provider'] {
  if (url.startsWith('https://generativelanguage.googleapis.com/')) return 'gemini';
  if (url.startsWith('https://api.groq.com/')) return 'groq';
  if (url.startsWith('https://openrouter.ai/')) return 'openrouter';
  return 'other';
}

export const geminiBody = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
export const chatBody = (text: string) => ({ choices: [{ message: { content: text } }] });
/** The right success body for the provider that was called. */
export const okBody = (provider: FakeCall['provider'], text: string) => (provider === 'gemini' ? geminiBody(text) : chatBody(text));

export function makeFakeFetch(script: (call: FakeCall, index: number) => FakeStep | Promise<FakeStep>) {
  const calls: FakeCall[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    const h = init.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    const call: FakeCall = { url, provider: providerOfUrl(url), headers, body: init.body ? JSON.parse(String(init.body)) : {}, init };
    const index = calls.length;
    calls.push(call);
    const step = await script(call, index);
    const signal = init.signal as AbortSignal | undefined;
    const abortError = () => new DOMException('The operation was aborted.', 'AbortError');
    if (signal?.aborted) throw abortError();
    if (step.throws === 'network') throw new TypeError('fetch failed');
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(t); reject(abortError()); };
      let t: ReturnType<typeof setTimeout> | undefined;
      if (step.hang) {
        signal?.addEventListener('abort', onAbort, { once: true });
        return;
      }
      t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, step.delayMs ?? 0);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    const status = step.status ?? 200;
    if (step.bigBody) return new Response('x'.repeat(step.bigBody), { status });
    const bodyText = step.text ?? (step.json !== undefined ? JSON.stringify(step.json) : '');
    return new Response(bodyText, { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: fakeFetch, calls };
}
