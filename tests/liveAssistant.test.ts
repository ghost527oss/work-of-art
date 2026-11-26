// @node: F11.4
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_LIVE } from '../src/config/aiLive';
import { validateAIResult } from '../src/engine/aiValidate';
import { NOT_SET_UP_MESSAGE, answerLive, describeFailures } from '../src/engine/live/liveAssistant';
import { AIResultSchema, type AIRequest } from '../src/types/contracts';
import { makeFakeFetch, okBody, type FakeCall, type FakeStep } from './helpers/fakeProviders';

const ALL = { GEMINI_API_KEY: 'KEY_G_sentinel', GROQ_API_KEY: 'KEY_Q_sentinel', OPENROUTER_API_KEY: 'KEY_O_sentinel' };
const explain = (over: Partial<AIRequest> = {}): AIRequest => ({ requestId: 'req-1', instruction: 'What does this do?', taskType: 'explain', selectedPaths: ['src/a.ts'], ...over });
const good = JSON.stringify({ kind: 'explanation', summary: 'It adds numbers.', evidence_paths: ['src/a.ts'], limitations: [], cards_covered: true });
const reply = (c: FakeCall, text = good): FakeStep => ({ json: okBody(c.provider, text) });

afterEach(() => { vi.useRealTimers(); });

describe('answerLive: success', () => {
  it('answers with the first provider, with meta, and a result that validates', async () => {
    const f = makeFakeFetch((c) => reply(c));
    const out = await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    if (!out.ok || out.aborted) throw new Error('expected ok');
    expect(AIResultSchema.safeParse(out.result).success).toBe(true);
    expect(validateAIResult(explain(), out.result).ok).toBe(true);
    expect(out.result.mode).toBe('live');
    expect(out.result.meta).toEqual({ tier: 'light', provider: 'gemini', model: 'gemini-3.1-flash-lite', lighter: false, attempts: [] });
    expect(f.calls).toHaveLength(1);
  });
  it('uses the light tier and output cap for explain, and the heavy ones for suggest_change', async () => {
    const f = makeFakeFetch((c) => reply(c));
    await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    expect(f.calls[0]!.body.generationConfig.maxOutputTokens).toBe(AI_LIVE.maxOutputTokensLight);
    const f2 = makeFakeFetch((c) => reply(c, JSON.stringify({ kind: 'clarification', questions: ['Which file?'] })));
    await answerLive(explain({ taskType: 'suggest_change', selectedPaths: [] }), ALL, { fetchImpl: f2.fetch });
    expect(f2.calls[0]!.body.generationConfig.maxOutputTokens).toBe(AI_LIVE.maxOutputTokensHeavy);
    expect(f2.calls[0]!.url).toContain('gemini-3.6-flash');
  });
  it('puts the cards, the question, and the answer kinds in the prompt, and keeps the key out of it', async () => {
    const f = makeFakeFetch((c) => reply(c));
    await answerLive(explain({ instruction: 'what is a stylesheet?' }), ALL, { fetchImpl: f.fetch });
    const prompt = JSON.stringify(f.calls[0]!.body);
    expect(prompt).toContain('what is a stylesheet?');
    expect(prompt).toContain('[concept.stylesheet]');
    expect(prompt).not.toContain('KEY_G_sentinel');
  });
  it('uses the model variables', async () => {
    const f = makeFakeFetch((c) => reply(c));
    await answerLive(explain(), { ...ALL, GEMINI_MODEL_LIGHT: 'gemini-pinned' }, { fetchImpl: f.fetch });
    expect(f.calls[0]!.url).toContain('gemini-pinned');
  });
});

describe('answerLive: fallback', () => {
  it('429 on Gemini falls back to Groq and records the failed attempt', async () => {
    const f = makeFakeFetch((c) => (c.provider === 'gemini' ? { status: 429 } : reply(c)));
    const out = await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    if (!out.ok || out.aborted) throw new Error('expected ok');
    expect(out.result.meta).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-20b', lighter: false, attempts: [{ provider: 'gemini', outcome: 'rate_limited' }] });
    expect(f.calls.map((c) => c.provider)).toEqual(['gemini', 'groq']);
  });
  it('a bad answer counts as bad_answer and the next model answers', async () => {
    const f = makeFakeFetch((c, i) => reply(c, i === 0 ? 'I am sorry, I cannot help' : good));
    const out = await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    if (!out.ok || out.aborted) throw new Error('expected ok');
    expect(out.result.meta!.attempts).toEqual([{ provider: 'gemini', outcome: 'bad_answer' }]);
    expect(out.result.meta!.provider).toBe('groq');
  });
  it('a path the user did not select is a bad answer', async () => {
    const evil = JSON.stringify({ kind: 'explanation', summary: 's', evidence_paths: ['/etc/passwd'] });
    const f = makeFakeFetch((c, i) => reply(c, i === 0 ? evil : good));
    const out = await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    expect(out.ok && !out.aborted && out.result.meta!.attempts[0]!.outcome).toBe('bad_answer');
  });
  it('a secret in a model answer is a bad answer and never reaches the result', async () => {
    const leaky = JSON.stringify({ kind: 'explanation', summary: 'the key is AKIAABCDEFGHIJKLMNOP' });
    const f = makeFakeFetch((c, i) => reply(c, i === 0 ? leaky : good));
    const out = await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    if (!out.ok || out.aborted) throw new Error('expected ok');
    expect(JSON.stringify(out.result)).not.toContain('AKIA');
    expect(out.result.meta!.attempts[0]!.outcome).toBe('bad_answer');
  });
  it('a heavy request falls to a light model only after every heavy one failed, and says lighter', async () => {
    const snippetReq = explain({ taskType: 'suggest_change', selectedPaths: [] });
    const clar = JSON.stringify({ kind: 'clarification', questions: ['Which file?'] });
    // Heavy entries return nonsense; the light entries answer.
    const f = makeFakeFetch((c) => reply(c, c.url.includes('flash-lite') || c.body.model === 'openai/gpt-oss-20b' ? clar : 'nonsense'));
    const out = await answerLive(snippetReq, ALL, { fetchImpl: f.fetch });
    if (!out.ok || out.aborted) throw new Error('expected ok');
    expect(out.result.meta).toMatchObject({ lighter: true, tier: 'light', provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    expect(out.result.meta!.attempts.map((a) => a.provider)).toEqual(['gemini', 'groq', 'openrouter']);
  });
});

describe('answerLive: failure', () => {
  it('no keys: unsupported 503 with the exact message and no call', async () => {
    const f = makeFakeFetch((c) => reply(c));
    expect(await answerLive(explain(), {}, { fetchImpl: f.fetch })).toEqual({ ok: false, status: 503, code: 'unsupported', message: NOT_SET_UP_MESSAGE });
    expect(f.calls).toHaveLength(0);
    expect(NOT_SET_UP_MESSAGE).toBe('Live AI is not set up. Add at least one key (GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY) to the server settings.');
  });
  it('all rate limited: 429 rate_limited naming the providers', async () => {
    const f = makeFakeFetch(() => ({ status: 429 }));
    const out = await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    expect(out).toEqual({ ok: false, status: 429, code: 'rate_limited', message: 'Gemini, Groq and OpenRouter are at their free limit right now. Try again in a minute.' });
  });
  it('one provider rate limited: singular wording', async () => {
    const f = makeFakeFetch(() => ({ status: 429 }));
    const out = await answerLive(explain(), { GROQ_API_KEY: 'q' }, { fetchImpl: f.fetch });
    expect(out).toMatchObject({ status: 429, message: 'Groq is at its free limit right now. Try again in a minute.' });
  });
  it('mixed failures: 502 upstream_failure with plain outcome words only', async () => {
    const f = makeFakeFetch((c) => (c.provider === 'gemini' ? { status: 500 } : c.provider === 'groq' ? { throws: 'network' } : { text: '{"nope":1}' }));
    const out = await answerLive(explain(), ALL, { fetchImpl: f.fetch });
    expect(out).toEqual({ ok: false, status: 502, code: 'upstream_failure', message: 'Gemini had a problem. Groq had a problem. OpenRouter had a problem.' });
  });
  it('a rejected key is named plainly and never echoes the key or the provider body', async () => {
    const f = makeFakeFetch(() => ({ status: 401, text: 'KEY_G_sentinel PROVIDER_BODY' }));
    const out = await answerLive(explain(), { GEMINI_API_KEY: 'KEY_G_sentinel' }, { fetchImpl: f.fetch });
    expect(out).toMatchObject({ ok: false, code: 'upstream_failure', message: 'Gemini did not accept its key.' });
    expect(JSON.stringify(out)).not.toContain('KEY_G_sentinel');
    expect(JSON.stringify(out)).not.toContain('PROVIDER_BODY');
  });
  it('an oversized prompt is refused before any call', async () => {
    const f = makeFakeFetch((c) => reply(c));
    const out = await answerLive(explain({ instruction: 'q'.repeat(AI_LIVE.maxPromptChars) }), ALL, { fetchImpl: f.fetch });
    expect(out).toMatchObject({ ok: false, status: 413, code: 'oversized' });
    expect(f.calls).toHaveLength(0);
  });
  it('describeFailures lists each provider once with its last outcome', () => {
    expect(describeFailures([{ provider: 'groq', outcome: 'timeout' }, { provider: 'groq', outcome: 'error' }], false)).toBe('Groq had a problem.');
    expect(describeFailures([], false)).toBe('No live AI provider could answer. Try again in a moment.');
    expect(describeFailures([{ provider: 'gemini', outcome: 'out_of_time' }], false)).toBe('Gemini was not tried because time ran out.');
  });
});

describe('answerLive: time and abort (fake timers)', () => {
  it('two hanging providers use the whole 14 s budget, OpenRouter is not tried', async () => {
    vi.useFakeTimers();
    const f = makeFakeFetch(() => ({ hang: true }));
    const p = answerLive(explain(), ALL, { fetchImpl: f.fetch });
    await vi.advanceTimersByTimeAsync(14_000);
    const out = await p;
    expect(out).toMatchObject({ ok: false, status: 502, code: 'upstream_failure' });
    expect(f.calls.map((c) => c.provider)).toEqual(['gemini', 'groq']);
    expect(out.ok === false && 'message' in out && out.message).toBe('Gemini took too long. Groq took too long. OpenRouter was not tried because time ran out.');
  });
  it('an abort stops the run and starts no further attempt', async () => {
    const ac = new AbortController();
    const f = makeFakeFetch(() => ({ hang: true }));
    const p = answerLive(explain(), ALL, { fetchImpl: f.fetch, signal: ac.signal });
    await Promise.resolve();
    ac.abort();
    expect(await p).toEqual({ ok: false, aborted: true });
    expect(f.calls).toHaveLength(1);
  });
});

describe('answerLive: 500 seeded random provider behaviours', () => {
  function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
  it('always ends with a valid result or a coded failure, one call per model at most, meta whenever it succeeds', async () => {
    const rand = rng(77);
    const tasks: Array<AIRequest> = [
      explain(), explain({ taskType: 'review_finding' }),
      explain({ taskType: 'suggest_change', selectedPaths: [] }),
      explain({ taskType: 'act', selectedPaths: [] }),
    ];
    const answers = [
      good, 'garbage', '{"kind":"explanation"}', JSON.stringify({ kind: 'clarification', questions: ['q'] }),
      JSON.stringify({ kind: 'action', action: 'approve', summary: 'x' }), JSON.stringify({ kind: 'action', action: 'help', summary: 'x' }),
      JSON.stringify({ kind: 'explanation', summary: 'AKIAABCDEFGHIJKLMNOP' }),
    ];
    for (let n = 0; n < 500; n++) {
      const request = tasks[Math.floor(rand() * tasks.length)]!;
      const keys: Record<string, string> = {};
      if (rand() < 0.8) keys.GEMINI_API_KEY = 'g';
      if (rand() < 0.8) keys.GROQ_API_KEY = 'q';
      if (rand() < 0.8) keys.OPENROUTER_API_KEY = 'o';
      const f = makeFakeFetch((c): FakeStep => {
        const r = rand();
        if (r < 0.15) return { status: 429 };
        if (r < 0.25) return { status: 500 };
        if (r < 0.3) return { status: 401 };
        if (r < 0.35) return { throws: 'network' };
        return reply(c, answers[Math.floor(rand() * answers.length)]!);
      });
      const out = await answerLive(request, keys, { fetchImpl: f.fetch });
      const urls = f.calls.map((c) => `${c.provider}:${c.body.model ?? c.url}`);
      expect(new Set(urls).size).toBe(urls.length);
      if (out.ok && !out.aborted) {
        expect(AIResultSchema.safeParse(out.result).success).toBe(true);
        expect(validateAIResult(request, out.result).ok).toBe(true);
        expect(out.result.meta).toBeDefined();
        expect(JSON.stringify(out.result)).not.toContain('AKIA');
        if (out.result.response.type === 'action') expect(out.result.response.action).not.toBe('approve');
      } else if (!out.ok && !out.aborted) {
        expect(['unsupported', 'rate_limited', 'upstream_failure']).toContain(out.code);
        if (Object.keys(keys).length === 0) expect(out.code).toBe('unsupported');
      } else throw new Error('unexpected abort');
    }
  });
});
