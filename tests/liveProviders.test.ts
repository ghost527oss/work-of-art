// @node: F11.3
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_LIVE } from '../src/config/aiLive';
import { PROVIDERS } from '../src/config/aiProviders';
import { callProvider, type CallArgs } from '../src/engine/live/providers';
import { chatBody, geminiBody, makeFakeFetch } from './helpers/fakeProviders';

const KEY = 'SENTINEL_KEY_abc123XYZ';
const args = (over: Partial<CallArgs> = {}, f = makeFakeFetch(() => ({ json: chatBody('{"kind":"x"}') }))): { a: CallArgs; f: ReturnType<typeof makeFakeFetch> } => ({
  a: { provider: 'groq', model: 'openai/gpt-oss-20b', apiKey: KEY, system: 'SYS', user: 'USER', maxOutputTokens: 700, timeoutMs: 7000, fetchImpl: f.fetch, ...over },
  f,
});

afterEach(() => { vi.useRealTimers(); });

describe('request shape', () => {
  it('Gemini: fixed endpoint, key only in x-goog-api-key, output cap, system instruction', async () => {
    const f = makeFakeFetch(() => ({ json: geminiBody('hello') }));
    const r = await callProvider(args({ provider: 'gemini', model: 'gemini-3.1-flash-lite' }, f).a);
    expect(r).toEqual({ ok: true, text: 'hello' });
    const c = f.calls[0]!;
    expect(c.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
    expect(c.url).not.toContain(KEY);
    expect(c.headers['x-goog-api-key']).toBe(KEY);
    expect(c.headers.authorization).toBeUndefined();
    expect(c.body.generationConfig.maxOutputTokens).toBe(700);
    expect(c.body.systemInstruction.parts[0].text).toBe('SYS');
    expect(c.body.contents[0].parts[0].text).toBe('USER');
    expect(JSON.stringify(c.body)).not.toContain(KEY);
  });
  it('Groq and OpenRouter: fixed endpoint, key only in the Authorization header, output cap, model in the body', async () => {
    for (const provider of ['groq', 'openrouter'] as const) {
      const f = makeFakeFetch(() => ({ json: chatBody('hi') }));
      const model = provider === 'groq' ? 'openai/gpt-oss-120b' : 'openrouter/free';
      const r = await callProvider(args({ provider, model, maxOutputTokens: 1200 }, f).a);
      expect(r).toEqual({ ok: true, text: 'hi' });
      const c = f.calls[0]!;
      expect(c.url).toBe(PROVIDERS[provider].endpoint);
      expect(c.url).not.toContain(KEY);
      expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
      expect(c.body.model).toBe(model);
      expect(c.body.max_tokens).toBe(1200);
      expect(c.body.messages).toEqual([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }]);
      expect(JSON.stringify(c.body)).not.toContain(KEY);
    }
  });
  it('refuses redirects and sends POST', async () => {
    const { a, f } = args();
    await callProvider(a);
    expect(f.calls[0]!.init.redirect).toBe('error');
    expect(f.calls[0]!.init.method).toBe('POST');
  });
  it('an invalid model name makes no call', async () => {
    for (const model of ['../x', 'a b', '']) {
      const { a, f } = args({ model });
      expect(await callProvider(a)).toEqual({ ok: false, outcome: 'error' });
      expect(f.calls).toHaveLength(0);
    }
    const g = args({ provider: 'gemini', model: 'a/b' });
    expect(await callProvider(g.a)).toEqual({ ok: false, outcome: 'error' });
    expect(g.f.calls).toHaveLength(0);
  });
});

describe('status mapping', () => {
  const run = async (step: Parameters<typeof makeFakeFetch>[0]) => callProvider(args({}, makeFakeFetch(step)).a);
  it('429 is rate_limited', async () => expect(await run(() => ({ status: 429 }))).toEqual({ ok: false, outcome: 'rate_limited' }));
  it('401 and 403 are key_rejected', async () => {
    expect(await run(() => ({ status: 401 }))).toEqual({ ok: false, outcome: 'key_rejected' });
    expect(await run(() => ({ status: 403 }))).toEqual({ ok: false, outcome: 'key_rejected' });
  });
  it('5xx and other 4xx are error', async () => {
    for (const status of [500, 502, 503, 400, 404, 418]) expect(await run(() => ({ status }))).toEqual({ ok: false, outcome: 'error' });
  });
  it('a network failure is error', async () => expect(await run(() => ({ throws: 'network' }))).toEqual({ ok: false, outcome: 'error' }));
  it('a body that is not JSON, or has no text, is error', async () => {
    expect(await run(() => ({ text: 'not json' }))).toEqual({ ok: false, outcome: 'error' });
    expect(await run(() => ({ json: { choices: [] } }))).toEqual({ ok: false, outcome: 'error' });
    expect(await run(() => ({ json: { choices: [{ message: { content: '' } }] } }))).toEqual({ ok: false, outcome: 'error' });
    expect(await run(() => ({ json: { nothing: true } }))).toEqual({ ok: false, outcome: 'error' });
  });
  it('a body over the 64 KB cap is error', async () => {
    expect(await run(() => ({ bigBody: AI_LIVE.maxProviderBodyBytes + 10 }))).toEqual({ ok: false, outcome: 'error' });
  });
  it('a Gemini answer with no candidates is error', async () => {
    const f = makeFakeFetch(() => ({ json: { promptFeedback: { blockReason: 'SAFETY' } } }));
    expect(await callProvider(args({ provider: 'gemini', model: 'gemini-3.6-flash' }, f).a)).toEqual({ ok: false, outcome: 'error' });
  });
});

describe('timeout and abort', () => {
  it('times out after timeoutMs (fake timers)', async () => {
    vi.useFakeTimers();
    const { a } = args({ timeoutMs: 7000 }, makeFakeFetch(() => ({ hang: true })));
    const p = callProvider(a);
    await vi.advanceTimersByTimeAsync(6999);
    let settled = false;
    void p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toEqual({ ok: false, outcome: 'timeout' });
  });
  it('a slow answer inside the limit succeeds', async () => {
    vi.useFakeTimers();
    const { a } = args({ timeoutMs: 7000 }, makeFakeFetch(() => ({ delayMs: 6000, json: chatBody('ok') })));
    const p = callProvider(a);
    await vi.advanceTimersByTimeAsync(6001);
    expect(await p).toEqual({ ok: true, text: 'ok' });
  });
  it('the outer signal aborting gives aborted, and an already-aborted signal makes no call', async () => {
    const ac = new AbortController();
    const { a, f } = args({ signal: ac.signal }, makeFakeFetch(() => ({ hang: true })));
    const p = callProvider(a);
    ac.abort();
    expect(await p).toEqual({ ok: false, outcome: 'aborted' });
    const again = args({ signal: ac.signal });
    expect(await callProvider(again.a)).toEqual({ ok: false, outcome: 'aborted' });
    expect(again.f.calls).toHaveLength(0);
    expect(f.calls).toHaveLength(1);
  });
  it('clears its timer on success (no timer left behind)', async () => {
    vi.useFakeTimers();
    const { a } = args({}, makeFakeFetch(() => ({ json: chatBody('ok') })));
    const p = callProvider(a);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('no provider text or key ever appears in a result', () => {
  it('error bodies, headers, and the key stay out of every outcome', async () => {
    const SECRET_BODY = 'PROVIDER_ECHOED_SECRET_BODY';
    for (const status of [400, 401, 403, 429, 500]) {
      const f = makeFakeFetch(() => ({ status, text: JSON.stringify({ error: { message: `${SECRET_BODY} ${KEY}` } }) }));
      const r = await callProvider(args({}, f).a);
      const text = JSON.stringify(r);
      expect(text).not.toContain(SECRET_BODY);
      expect(text).not.toContain(KEY);
      expect(r.ok).toBe(false);
    }
  });
});

describe('a cut-off answer is reported as truncated', () => {
  it('Gemini finishReason MAX_TOKENS', async () => {
    const f = makeFakeFetch(() => ({ json: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"kind":"expl' }] } }] } }));
    expect(await callProvider(args({ provider: 'gemini', model: 'gemini-3.6-flash' }, f).a)).toEqual({ ok: true, text: '{"kind":"expl', truncated: true });
  });
  it('OpenAI-style finish_reason length', async () => {
    const f = makeFakeFetch(() => ({ json: { choices: [{ finish_reason: 'length', message: { content: '{"kind"' } }] } }));
    expect(await callProvider(args({}, f).a)).toEqual({ ok: true, text: '{"kind"', truncated: true });
  });
  it('a finished answer is not marked truncated', async () => {
    const f = makeFakeFetch(() => ({ json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }] } }));
    expect(await callProvider(args({ provider: 'gemini', model: 'gemini-3.6-flash' }, f).a)).toEqual({ ok: true, text: 'ok' });
  });
});
