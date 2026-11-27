// @node: F11.4
import { describe, expect, it } from 'vitest';
import { AI_LIVE } from '../src/config/aiLive';
import { buildAttemptPlan, runAttempts, tierOf, type Entry, type StepResult } from '../src/engine/live/modelRouter';

const ALL = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'o' };
const names = (p: Entry[]) => p.map((e) => `${e.provider}:${e.tier}`);

describe('tierOf', () => {
  it('suggest_change is heavy; everything else is light', () => {
    expect(tierOf('suggest_change')).toBe('heavy');
    for (const t of ['explain', 'review_finding', 'act'] as const) expect(tierOf(t)).toBe('light');
  });
});

describe('buildAttemptPlan', () => {
  it('light: Gemini, Groq, OpenRouter', () => {
    expect(names(buildAttemptPlan('light', ALL))).toEqual(['gemini:light', 'groq:light', 'openrouter:light']);
  });
  it('heavy: the heavy models first, then the light ones; OpenRouter heavy and light are the same model so the light one is dropped', () => {
    const p = buildAttemptPlan('heavy', ALL);
    expect(names(p)).toEqual(['gemini:heavy', 'groq:heavy', 'openrouter:heavy', 'gemini:light', 'groq:light']);
    expect(p.map((e) => e.lighterPart)).toEqual([false, false, false, true, true]);
  });
  it('heavy with a pinned, different OpenRouter light model keeps all six entries', () => {
    const p = buildAttemptPlan('heavy', { ...ALL, OPENROUTER_MODEL_LIGHT: 'vendor/small:free' });
    expect(p).toHaveLength(6);
    expect(p[5]).toMatchObject({ provider: 'openrouter', model: 'vendor/small:free', lighterPart: true });
  });
  it('skips a provider with no key or a blank key', () => {
    expect(names(buildAttemptPlan('light', { GROQ_API_KEY: 'q' }))).toEqual(['groq:light']);
    expect(names(buildAttemptPlan('light', { GEMINI_API_KEY: '  ', GROQ_API_KEY: 'q' }))).toEqual(['groq:light']);
  });
  it('is empty with no keys at all', () => {
    expect(buildAttemptPlan('light', {})).toEqual([]);
    expect(buildAttemptPlan('heavy', {})).toEqual([]);
  });
  it('skips an entry whose model name is set but invalid, without using the default', () => {
    const p = buildAttemptPlan('light', { ...ALL, GEMINI_MODEL_LIGHT: '../bad' });
    expect(names(p)).toEqual(['groq:light', 'openrouter:light']);
  });
  it('uses the model variables and the defaults', () => {
    const p = buildAttemptPlan('heavy', { ...ALL, GROQ_MODEL_HEAVY: 'openai/other' });
    expect(p.find((e) => e.provider === 'groq' && !e.lighterPart)!.model).toBe('openai/other');
    expect(p[0]!.model).toBe('gemini-3.6-flash');
  });
  it('drops a repeated provider-and-model pair', () => {
    const p = buildAttemptPlan('heavy', { GROQ_API_KEY: 'q', GROQ_MODEL_HEAVY: 'openai/gpt-oss-20b' });
    expect(p).toHaveLength(1);
  });
});

function fakeClock() {
  let t = 1_000;
  return { clock: { now: () => t }, advance: (ms: number) => { t += ms; } };
}
type Script = (entry: Entry, timeoutMs: number, n: number) => StepResult<string> | { spend: number; result: StepResult<string> };

function runner(plan: Entry[], script: Script, signal?: AbortSignal) {
  const c = fakeClock();
  const seen: Array<{ model: string; timeoutMs: number }> = [];
  const p = runAttempts(plan, async (entry, timeoutMs) => {
    seen.push({ model: entry.model, timeoutMs });
    const r = script(entry, timeoutMs, seen.length - 1);
    if ('spend' in r) { c.advance(r.spend); return r.result; }
    return r;
  }, c.clock, signal);
  return { p, seen };
}
const ok = (v = 'a'): StepResult<string> => ({ kind: 'ok', value: v });
const fail = (outcome: Extract<StepResult<string>, { kind: 'fail' }>['outcome']): StepResult<string> => ({ kind: 'fail', outcome });

describe('runAttempts', () => {
  const light = () => buildAttemptPlan('light', ALL);
  it('returns no_providers for an empty plan', async () => {
    expect((await runner([], () => ok()).p).kind).toBe('no_providers');
  });
  it('the first good answer wins and nothing else is tried', async () => {
    const { p, seen } = runner(light(), () => ok('first'));
    expect(await p).toMatchObject({ kind: 'ok', value: 'first', attempts: [], entry: { provider: 'gemini' } });
    expect(seen).toHaveLength(1);
  });
  it('429 skips the rest of that provider and the next provider answers', async () => {
    const plan = buildAttemptPlan('heavy', ALL);
    const { p, seen } = runner(plan, (e) => (e.provider === 'gemini' ? fail('rate_limited') : ok()));
    const r = await p;
    expect(r).toMatchObject({ kind: 'ok', entry: { provider: 'groq', tier: 'heavy', lighterPart: false }, attempts: [{ provider: 'gemini', outcome: 'rate_limited' }] });
    expect(seen.map((s) => s.model)).toEqual(['gemini-3.6-flash', 'openai/gpt-oss-120b']);
  });
  it('a rejected key skips that provider too', async () => {
    const plan = buildAttemptPlan('heavy', ALL);
    const { p, seen } = runner(plan, (e) => (e.provider === 'gemini' ? fail('key_rejected') : ok()));
    expect(await p).toMatchObject({ kind: 'ok', entry: { provider: 'groq' } });
    expect(seen.filter((s) => s.model.startsWith('gemini'))).toHaveLength(1);
  });
  it('a timeout, an error, and a bad answer go to the next entry without skipping the provider', async () => {
    const plan = buildAttemptPlan('heavy', ALL);
    for (const o of ['timeout', 'error', 'bad_answer'] as const) {
      const { p, seen } = runner(plan, (e) => (e.provider === 'gemini' && e.model === 'gemini-3.6-flash' ? fail(o) : e.model === 'gemini-3.1-flash-lite' ? ok() : fail('error')));
      // heavy Gemini fails, Groq heavy fails, OpenRouter fails, then the light Gemini entry answers.
      const r = await p;
      expect(r).toMatchObject({ kind: 'ok', entry: { provider: 'gemini', lighterPart: true } });
      expect(seen.map((s) => s.model)).toEqual(['gemini-3.6-flash', 'openai/gpt-oss-120b', 'openrouter/free', 'gemini-3.1-flash-lite']);
    }
  });
  it('never tries the same model twice', async () => {
    const { seen, p } = runner(buildAttemptPlan('heavy', ALL), () => fail('error'));
    await p;
    expect(new Set(seen.map((s) => s.model)).size).toBe(seen.length);
  });
  it('heavy falls to the light models only after every heavy model failed, and marks the answer lighter', async () => {
    const { p } = runner(buildAttemptPlan('heavy', ALL), (e) => (e.lighterPart ? ok('light') : fail('rate_limited')));
    const r = await p;
    // All three providers are skipped after their first 429, so the lighter part is never reached.
    expect(r.kind).toBe('failed');
    const { p: p2 } = runner(buildAttemptPlan('heavy', ALL), (e) => (e.lighterPart ? ok('light') : fail('bad_answer')));
    expect(await p2).toMatchObject({ kind: 'ok', value: 'light', entry: { lighterPart: true, tier: 'light', provider: 'gemini' }, attempts: [{ provider: 'gemini', outcome: 'bad_answer' }, { provider: 'groq', outcome: 'bad_answer' }, { provider: 'openrouter', outcome: 'bad_answer' }] });
  });
  it('all rate limited gives rate_limited', async () => {
    const r = await runner(light(), () => fail('rate_limited')).p;
    expect(r).toMatchObject({ kind: 'failed', code: 'rate_limited' });
    expect(r.kind === 'failed' && r.attempts).toHaveLength(3);
  });
  it('any other mix gives upstream_failure', async () => {
    const r = await runner(light(), (e) => fail(e.provider === 'gemini' ? 'rate_limited' : 'timeout')).p;
    expect(r).toMatchObject({ kind: 'failed', code: 'upstream_failure' });
  });
  it('a single provider rate limited gives rate_limited', async () => {
    const r = await runner(buildAttemptPlan('light', { GROQ_API_KEY: 'q' }), () => fail('rate_limited')).p;
    expect(r).toMatchObject({ kind: 'failed', code: 'rate_limited' });
  });
});

describe('runAttempts: time', () => {
  const light = () => buildAttemptPlan('light', ALL);
  it('gives each attempt at most 15 s', async () => {
    const { p, seen } = runner(light(), () => ok());
    await p;
    expect(seen[0]!.timeoutMs).toBe(AI_LIVE.attemptTimeoutMs);
    expect(AI_LIVE.attemptTimeoutMs).toBe(15000);
  });
  it('the second attempt gets only the time that remains of the 25 s', async () => {
    const { p, seen } = runner(light(), (_e, _t, n) => (n === 0 ? { spend: 15000, result: fail('timeout') } : ok()));
    await p;
    expect(seen.map((s) => s.timeoutMs)).toEqual([15000, 10000]);
  });
  it('stops starting attempts below 1.5 s and records out_of_time, never exceeding 25 s of attempts', async () => {
    const r = await runner(light(), (_e, t) => ({ spend: t, result: fail('timeout') })).p;
    // Gemini (15 s) + Groq (the 10 s that remain) use all 25 s; OpenRouter is not started.
    expect(r).toMatchObject({ kind: 'failed', code: 'upstream_failure' });
    expect(r.kind === 'failed' && r.attempts.map((a) => a.outcome)).toEqual(['timeout', 'timeout', 'out_of_time']);
    expect(r.kind === 'failed' && r.attempts[2]!.provider).toBe('openrouter');
  });
  it('an attempt that leaves 2 s is still given those 2 s', async () => {
    const { p, seen } = runner(light(), (_e, _t, n) => (n === 0 ? { spend: 15000, result: fail('timeout') } : n === 1 ? { spend: 8000, result: fail('timeout') } : ok()));
    await p;
    expect(seen.map((s) => s.timeoutMs)).toEqual([15000, 10000, 2000]);
  });
  it('1.4 s remaining starts nothing; exactly 1.5 s starts an attempt', async () => {
    const a = await runner(light(), (_e, _t, n) => (n < 2 ? { spend: n === 0 ? 15000 : 8600, result: fail('timeout') } : ok())).p;
    expect(a.kind).toBe('failed');
    const b = runner(light(), (_e, _t, n) => (n < 2 ? { spend: n === 0 ? 15000 : 8500, result: fail('timeout') } : ok()));
    expect((await b.p).kind).toBe('ok');
    expect(b.seen.map((s) => s.timeoutMs)).toEqual([15000, 10000, 1500]);
  });
});

describe('runAttempts: abort', () => {
  it('an already-aborted signal makes no attempt', async () => {
    const ac = new AbortController(); ac.abort();
    const { p, seen } = runner(buildAttemptPlan('light', ALL), () => ok(), ac.signal);
    expect((await p).kind).toBe('aborted');
    expect(seen).toHaveLength(0);
  });
  it('an abort during an attempt stops at once and starts no further attempt', async () => {
    const ac = new AbortController();
    const { p, seen } = runner(buildAttemptPlan('light', ALL), () => { ac.abort(); return fail('timeout'); }, ac.signal);
    expect((await p).kind).toBe('aborted');
    expect(seen).toHaveLength(1);
  });
  it('a step that reports aborted ends the run', async () => {
    const { p, seen } = runner(buildAttemptPlan('light', ALL), () => ({ kind: 'aborted' }));
    expect((await p).kind).toBe('aborted');
    expect(seen).toHaveLength(1);
  });
});
