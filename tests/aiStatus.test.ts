// @node: F11.8
import { describe, expect, it } from 'vitest';
import { AIStatusSchema, fetchAIStatus, needsConsent } from '../src/engine/aiStatus';

const respond = (status: number, body: unknown, ct = 'application/json') =>
  (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': ct } })) as unknown as typeof fetch;

describe('fetchAIStatus', () => {
  it('mock', async () => {
    expect(await fetchAIStatus({ fetchImpl: respond(200, { mode: 'mock' }) })).toEqual({ kind: 'mock' });
  });
  it('live, ready, with providers', async () => {
    const body = { mode: 'live', ready: true, providers: [{ id: 'gemini', configured: false }, { id: 'groq', configured: true }] };
    expect(await fetchAIStatus({ fetchImpl: respond(200, body) })).toEqual({ kind: 'live', ready: true, providers: body.providers });
  });
  it('live, not ready', async () => {
    const r = await fetchAIStatus({ fetchImpl: respond(200, { mode: 'live', ready: false, providers: [] }) });
    expect(r).toEqual({ kind: 'live', ready: false, providers: [] });
  });
  it('anything wrong is "unknown" and never throws', async () => {
    const bad: Array<typeof fetch> = [
      respond(500, { mode: 'mock' }),
      respond(200, 'not json'),
      respond(200, { mode: 'other' }),
      respond(200, { mode: 'mock', extra: 1 }),
      respond(200, { mode: 'live', ready: 'yes', providers: [] }),
      respond(200, { mode: 'live', ready: true, providers: [{ id: 'openai', configured: true }] }),
      respond(200, 'x'.repeat(5000)),
      (async () => { throw new TypeError('network'); }) as unknown as typeof fetch,
    ];
    for (const fetchImpl of bad) expect(await fetchAIStatus({ fetchImpl })).toEqual({ kind: 'unknown' });
  });
  it('an already-aborted signal is unknown', async () => {
    const ac = new AbortController(); ac.abort();
    const f = (async (_u: unknown, init: RequestInit) => { if (init.signal?.aborted) throw new DOMException('x', 'AbortError'); return new Response('{}'); }) as unknown as typeof fetch;
    expect(await fetchAIStatus({ fetchImpl: f, signal: ac.signal })).toEqual({ kind: 'unknown' });
  });
  it('uses GET on the fixed endpoint', async () => {
    let seen: { url: string; method?: string } | undefined;
    const f = (async (u: string, init: RequestInit) => { seen = { url: u, method: init.method }; return new Response('{"mode":"mock"}'); }) as unknown as typeof fetch;
    await fetchAIStatus({ fetchImpl: f });
    expect(seen).toEqual({ url: '/api/assistant', method: 'GET' });
  });
});

describe('schema and consent', () => {
  it('the schema is strict and holds no key or model', () => {
    expect(AIStatusSchema.safeParse({ mode: 'live', ready: true, providers: [{ id: 'groq', configured: true, key: 'x' }] }).success).toBe(false);
  });
  it('consent is needed for live, unknown, and checking, never for mock', () => {
    expect(needsConsent({ kind: 'mock' })).toBe(false);
    expect(needsConsent({ kind: 'live', ready: true, providers: [] })).toBe(true);
    expect(needsConsent({ kind: 'unknown' })).toBe(true);
    expect(needsConsent({ kind: 'checking' })).toBe(true);
  });
});
