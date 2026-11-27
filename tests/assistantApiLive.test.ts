// @node: F11.5
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAssistantRequest } from '../api/assistant';
import { LIVE_ENV_NAMES } from '../src/config/aiProviders';
import { AIResultSchema } from '../src/types/contracts';
import { makeFakeFetch, okBody, type FakeCall, type FakeStep } from './helpers/fakeProviders';

const KEYS = { GEMINI_API_KEY: 'KEY_G_sentinel', GROQ_API_KEY: 'KEY_Q_sentinel', OPENROUTER_API_KEY: 'KEY_O_sentinel' };
const LIVE = { AI_MODE: 'live', ...KEYS };
const good = JSON.stringify({ kind: 'explanation', summary: 'It adds numbers.', evidence_paths: ['src/main.ts'], limitations: [], cards_covered: true });
const baseReq = { requestId: 'req-1', instruction: 'Explain this file.', taskType: 'explain', selectedPaths: ['src/main.ts'] };
const reply = (c: FakeCall, text = good): FakeStep => ({ json: okBody(c.provider, text) });

const post = (body: unknown, ct = 'application/json') =>
  new Request('http://localhost/api/assistant', { method: 'POST', headers: { 'content-type': ct }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = () => new Request('http://localhost/api/assistant', { method: 'GET' });

afterEach(() => vi.restoreAllMocks());

describe('GET status', () => {
  it('mock mode: exactly { mode: "mock" }, no-store', async () => {
    for (const env of [{}, { AI_MODE: '' }, { AI_MODE: 'mock' }, { AI_MODE: 'mock', ...KEYS }]) {
      const res = await handleAssistantRequest(get(), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ mode: 'mock' });
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
  it('live, no keys: not ready, all three providers listed as not configured', async () => {
    const res = await handleAssistantRequest(get(), { AI_MODE: 'live' });
    expect(await res.json()).toEqual({
      mode: 'live', ready: false,
      providers: [{ id: 'gemini', configured: false }, { id: 'groq', configured: false }, { id: 'openrouter', configured: false }],
    });
  });
  it('live with some keys: ready, and only booleans (no key, no model, no other value)', async () => {
    const res = await handleAssistantRequest(get(), { AI_MODE: 'live', GROQ_API_KEY: 'KEY_Q_sentinel', GEMINI_MODEL_LIGHT: 'SECRET_MODEL_NAME', SOMETHING_ELSE: 'x' });
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      mode: 'live', ready: true,
      providers: [{ id: 'gemini', configured: false }, { id: 'groq', configured: true }, { id: 'openrouter', configured: false }],
    });
    expect(text).not.toContain('KEY_Q_sentinel');
    expect(text).not.toContain('SECRET_MODEL_NAME');
    expect(text).not.toContain('SOMETHING_ELSE');
  });
  it('a key with a blank value is not configured', async () => {
    const res = await handleAssistantRequest(get(), { AI_MODE: 'live', GEMINI_API_KEY: '   ' });
    expect(await res.json()).toMatchObject({ ready: false });
  });
  it('an unknown mode gives 501 for GET as well, without echoing the value', async () => {
    const res = await handleAssistantRequest(get(), { AI_MODE: 'weird_value' });
    expect(res.status).toBe(501);
    expect(await res.text()).not.toContain('weird_value');
  });
});

describe('live POST: order of checks', () => {
  it('no providers: 503 before the body is read, and never a mock answer', async () => {
    const res = await handleAssistantRequest(post('{not json'), { AI_MODE: 'live' });
    expect(res.status).toBe(503);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('unsupported');
    expect(body.error.message).toContain('Live AI is not set up');
    const valid = await handleAssistantRequest(post(baseReq), { AI_MODE: 'live' });
    expect(valid.status).toBe(503);
    expect(JSON.stringify(await valid.json())).not.toContain('mock');
  });
  it('wrong content type 400, bad JSON 400, invalid request 400, oversized 413, with no provider call', async () => {
    const f = makeFakeFetch((c) => reply(c));
    const run = (r: Request) => handleAssistantRequest(r, LIVE, { fetchImpl: f.fetch });
    expect((await run(post(baseReq, 'text/plain'))).status).toBe(400);
    expect((await run(post('{bad'))).status).toBe(400);
    expect((await run(post({ ...baseReq, taskType: 'nope' }))).status).toBe(400);
    expect((await run(post({ ...baseReq, skillId: 'scan.frontend.not-real' }))).status).toBe(400);
    expect((await run(post({ ...baseReq, instruction: 'x'.repeat(3000) }))).status).toBe(413);
    expect((await run(post({ ...baseReq, sourceContext: [{ filePath: 'src/main.ts', content: 'x'.repeat(21 * 1024) }] }))).status).toBe(413);
    expect(f.calls).toHaveLength(0);
  });
  it('rejects a method other than GET or POST with 405 and Allow', async () => {
    const res = await handleAssistantRequest(new Request('http://localhost/api/assistant', { method: 'DELETE' }), LIVE);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });
});

describe('live POST: answers and errors', () => {
  it('200 with a valid live result and meta; the provider got the question and the key only in a header', async () => {
    const f = makeFakeFetch((c) => reply(c));
    const res = await handleAssistantRequest(post(baseReq), LIVE, { fetchImpl: f.fetch });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(AIResultSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ requestId: 'req-1', mode: 'live', meta: { provider: 'gemini', tier: 'light', lighter: false } });
    expect(JSON.stringify(f.calls[0]!.body)).toContain('Explain this file.');
    expect(f.calls[0]!.headers['x-goog-api-key']).toBe('KEY_G_sentinel');
    expect(JSON.stringify(body)).not.toContain('KEY_');
  });
  it('a 429 on Gemini falls back to Groq', async () => {
    const f = makeFakeFetch((c) => (c.provider === 'gemini' ? { status: 429 } : reply(c)));
    const res = await handleAssistantRequest(post(baseReq), LIVE, { fetchImpl: f.fetch });
    const body = await res.json() as { meta: { provider: string; attempts: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.meta.provider).toBe('groq');
    expect(body.meta.attempts).toEqual([{ provider: 'gemini', outcome: 'rate_limited' }]);
  });
  it('all rate limited: 429 rate_limited; mixed failure: 502 upstream_failure', async () => {
    const a = await handleAssistantRequest(post(baseReq), LIVE, { fetchImpl: makeFakeFetch(() => ({ status: 429 })).fetch });
    expect(a.status).toBe(429);
    expect((await a.json() as { error: { code: string } }).error.code).toBe('rate_limited');
    const b = await handleAssistantRequest(post(baseReq), LIVE, { fetchImpl: makeFakeFetch((c) => (c.provider === 'gemini' ? { status: 429 } : { status: 500 })).fetch });
    expect(b.status).toBe(502);
    expect((await b.json() as { error: { code: string } }).error.code).toBe('upstream_failure');
  });
  it('a client abort returns 499 with no body, and the provider call is stopped', async () => {
    const ac = new AbortController();
    const f = makeFakeFetch(() => ({ hang: true }));
    const req = new Request('http://localhost/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(baseReq), signal: ac.signal });
    const p = handleAssistantRequest(req, LIVE, { fetchImpl: f.fetch });
    await new Promise((r) => setTimeout(r, 20));
    ac.abort();
    const res = await p;
    expect(res.status).toBe(499);
    expect(await res.text()).toBe('');
    expect(f.calls).toHaveLength(1);
  });
  it('a request already aborted makes no provider call', async () => {
    const ac = new AbortController(); ac.abort();
    const f = makeFakeFetch((c) => reply(c));
    const req = new Request('http://localhost/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(baseReq), signal: ac.signal });
    const res = await handleAssistantRequest(req, LIVE, { fetchImpl: f.fetch });
    expect(res.status).toBe(499);
    expect(f.calls).toHaveLength(0);
  });
  it('an unexpected throw inside the live path is a plain 502 with no detail', async () => {
    const res = await handleAssistantRequest(post(baseReq), LIVE, { fetchImpl: (() => { throw new Error('KEY_G_sentinel boom'); }) as unknown as typeof fetch });
    // callProvider catches fetch errors as outcome "error" and every provider fails: a normal 502.
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('boom');
  });
});

describe('live POST: redaction and the note', () => {
  it('a secret in the question and in a snippet never reaches a provider, and the result carries a note', async () => {
    const key = 'AKIAABCDEFGHIJKLMNOP';
    const f = makeFakeFetch((c) => reply(c));
    const res = await handleAssistantRequest(post({
      ...baseReq, instruction: `Why is ${key} here?`,
      sourceContext: [{ filePath: 'src/main.ts', content: `const k = "${key}";` }],
    }), LIVE, { fetchImpl: f.fetch });
    expect(res.status).toBe(200);
    for (const c of f.calls) expect(JSON.stringify(c.body)).not.toContain(key);
    const body = await res.json() as { response: { limitations: string[] } };
    expect(body.response.limitations.join(' ')).toContain('likely secrets were redacted from the input before processing.');
    expect(JSON.stringify(body)).not.toContain(key);
  });
  it('the note says "was" for one secret', async () => {
    const f = makeFakeFetch((c) => reply(c));
    const res = await handleAssistantRequest(post({ ...baseReq, instruction: 'x AKIAABCDEFGHIJKLMNOP' }), LIVE, { fetchImpl: f.fetch });
    expect(JSON.stringify(await res.json())).toContain('1 likely secret was redacted');
  });
});

describe('environment access', () => {
  const strict = (allowed: string[]) => new Proxy({ AI_MODE: 'live', ...KEYS } as Record<string, string | undefined>, {
    get(t, key: string) {
      if (key === 'AI_MODE' || allowed.includes(key)) return t[key];
      throw new Error(`env.${key} accessed`);
    },
  });
  it('mock mode reads only AI_MODE even when keys exist', async () => {
    const env = new Proxy({} as Record<string, string | undefined>, {
      get(_t, key: string) { if (key === 'AI_MODE') return 'mock'; throw new Error(`env.${key} accessed`); },
    });
    const res = await handleAssistantRequest(post(baseReq), env);
    expect(res.status).toBe(200);
    expect((await res.json() as { mode: string }).mode).toBe('mock');
    expect((await handleAssistantRequest(get(), env)).status).toBe(200);
  });
  it('live mode reads AI_MODE and only the nine live names', async () => {
    const f = makeFakeFetch((c) => reply(c));
    const res = await handleAssistantRequest(post(baseReq), strict([...LIVE_ENV_NAMES]), { fetchImpl: f.fetch });
    expect(res.status).toBe(200);
    expect((await handleAssistantRequest(get(), strict([...LIVE_ENV_NAMES]))).status).toBe(200);
  });
  it('with keys set but AI_MODE unset, the answer is the mock answer and no provider is called', async () => {
    const f = makeFakeFetch((c) => reply(c));
    const res = await handleAssistantRequest(post(baseReq), KEYS, { fetchImpl: f.fetch });
    expect((await res.json() as { mode: string }).mode).toBe('mock');
    expect(f.calls).toHaveLength(0);
  });
});

describe('logging', () => {
  it('logs only codes and outcome words: no question, path, snippet, answer, key, header, or provider body', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const SENT = 'SENTINEL_QUESTION_TEXT_55';
    const f = makeFakeFetch((c) => (c.provider === 'gemini' ? { status: 500, text: 'PROVIDER_BODY_SENTINEL KEY_G_sentinel' } : reply(c, JSON.stringify({ kind: 'explanation', summary: 'ANSWER_SENTINEL', evidence_paths: ['src/main.ts'] }))));
    await handleAssistantRequest(post({ ...baseReq, instruction: SENT, sourceContext: [{ filePath: 'src/main.ts', content: 'SNIPPET_SENTINEL' }] }), LIVE, { fetchImpl: f.fetch });
    await handleAssistantRequest(post({ ...baseReq, instruction: SENT }), LIVE, { fetchImpl: makeFakeFetch(() => ({ status: 429 })).fetch });
    const text = spies.flatMap((s) => s.mock.calls.map((c) => c.join(' '))).join('\n');
    expect(text).toContain('[api/assistant] live task=explain tier=light via=groq');
    expect(text).toContain('failed=gemini:error');
    expect(text).toContain('trace=gemini:error,groq:ok');
    expect(text).toContain('failed=rate_limited');
    for (const bad of [SENT, 'src/main.ts', 'SNIPPET_SENTINEL', 'ANSWER_SENTINEL', 'KEY_', 'PROVIDER_BODY_SENTINEL', 'x-goog-api-key', 'authorization', 'Bearer']) {
      expect(text).not.toContain(bad);
    }
  });
});
