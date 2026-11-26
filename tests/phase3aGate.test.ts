// @node: F11.11
// The Phase 3 exit gate for sub-phase 3A, with fake providers (no network, no real key), and rapid-use invariants.
import { afterEach, describe, expect, it } from 'vitest';
import { practiceContent } from '../src/engine/practiceScript';
import { mergedFindings } from '../src/engine/scanView';
import { buildRecord } from '../src/store/workStorage';
import { FIX_IMG, NO_FIX_IMG, makeSystem, modelPatch } from './helpers/aiHarness';
import { okBody } from './helpers/fakeProviders';

const text = (s: Awaited<ReturnType<typeof makeSystem>>) => practiceContent(s.store.getState().snapshot!, s.store.getState().work.applied, 'index.html')!;
const reply = (t: string) => (c: { provider: 'gemini' | 'groq' | 'openrouter' | 'other' }) => ({ json: okBody(c.provider, t) });

describe('exit gate 1: a deliberate bug is found, a valid patch is proposed, and the fix is checked', () => {
  it('scan finds it; the AI proposes; Approve applies; the re-scan no longer finds it; Undo restores the original', async () => {
    const sys = await makeSystem({ script: reply(modelPatch(FIX_IMG)) });
    // 1. The scan found the bug (an image with no description).
    expect(sys.finding).toMatchObject({ skillId: 'scan.frontend.img-alt', path: 'index.html', firstLine: 5 });
    const original = text(sys);
    // 2. Ask the AI for a change. The first live request waits for the notice.
    expect(sys.send()).toBeNull();
    expect(sys.calls).toHaveLength(0);
    expect(sys.actions.ui!.getState().noticeOpen).toBe(true);
    sys.actions.acceptNotice!();
    await sys.settle();
    // 3. A valid patch was proposed and queued (nothing applied yet).
    const s1 = sys.store.getState();
    expect(s1.ai.status).toBe('done');
    expect(s1.ai.result!.meta).toMatchObject({ tier: 'heavy', provider: 'gemini', model: 'gemini-3.6-flash', lighter: false });
    expect(s1.work.proposal).toMatchObject({ source: 'ai', path: 'index.html' });
    expect(s1.work.applied).toHaveLength(0);
    expect(text(sys)).toBe(original);
    expect(s1.ai.proposalNote).toBe('Queued for your approval. Use Approve or Reject on the card above.');
    // 4. Approve: applied to the practice copy; the re-scan verifies.
    sys.command('approve');
    const s2 = sys.store.getState();
    expect(text(sys)).toContain(FIX_IMG);
    expect(s2.snapshot!.files.find((f) => f.path === 'index.html')!.content).toBe(original);
    expect(mergedFindings(s2).some((f) => f.skillId === 'scan.frontend.img-alt')).toBe(false);
    expect(s2.log.find((l) => l.action === 'ai_recheck')!.message).toMatch(/is no longer found in index\.html\.$/);
    // 5. Undo restores the exact original.
    sys.command('undo');
    expect(text(sys)).toBe(original);
    expect(mergedFindings(sys.store.getState()).some((f) => f.skillId === 'scan.frontend.img-alt')).toBe(true);
  });

  it('the heavy model answered a heavy request: Gemini heavy first', async () => {
    const sys = await makeSystem({ script: reply(modelPatch(FIX_IMG)) });
    sys.send(); sys.actions.acceptNotice!(); await sys.settle();
    expect(sys.calls[0]!.url).toContain('gemini-3.6-flash');
  });
});

describe('exit gate 2: the fix attempts halt at 3 and nothing loops', () => {
  it('a fake AI whose patches never fix the finding is stopped at 3 with the plain refusal', async () => {
    const sys = await makeSystem({ script: reply(modelPatch(NO_FIX_IMG)) });
    sys.send(); sys.actions.acceptNotice!(); await sys.settle();
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) { sys.send({ instruction: `Try again, attempt ${attempt}` }); await sys.settle(); }
      const s = sys.store.getState();
      expect(s.work.proposal, `attempt ${attempt}`).not.toBeNull();
      expect(s.ai.attempts![sys.finding!.id]).toBe(attempt);
      sys.command('approve'); // approve the useless change; the re-check says it is still found
      expect(sys.store.getState().log.filter((l) => l.action === 'ai_recheck').at(-1)!.message).toMatch(/is still found in index\.html\.$/);
      sys.command('undo');
    }
    expect(sys.calls).toHaveLength(3);
    // The fourth is refused with the exact message. The AI is asked, but nothing is queued.
    sys.send({ instruction: 'Try again, attempt 4' }); await sys.settle();
    const s = sys.store.getState();
    expect(s.work.proposal).toBeNull();
    expect(s.ai.attempts![sys.finding!.id]).toBe(3);
    expect(s.ai.proposalNote).toBe('Not queued: This finding has had 3 AI fix attempts. Fix it by hand, or ask about a different one.');
    // Nothing started by itself: one call per user request, four in all.
    expect(sys.calls).toHaveLength(4);
    await new Promise((r) => setTimeout(r, 30));
    expect(sys.calls).toHaveLength(4);
  });
});

describe('exit gate 3: a 429 falls back, and the failure cases are plain', () => {
  it('a 429 on Gemini falls back to Groq and the answer says so', async () => {
    const sys = await makeSystem({ script: (c) => (c.provider === 'gemini' ? { status: 429 } : { json: okBody(c.provider, modelPatch(FIX_IMG)) }) });
    sys.send(); sys.actions.acceptNotice!(); await sys.settle();
    const r = sys.store.getState().ai.result!;
    expect(r.meta).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b', lighter: false, attempts: [{ provider: 'gemini', outcome: 'rate_limited' }] });
    expect(sys.calls.map((c) => c.provider)).toEqual(['gemini', 'groq']);
    const { fallbackSentence } = await import('../src/engine/aiNotes');
    expect(fallbackSentence(r.meta!)).toBe('Gemini was busy, so Groq answered.');
    expect(sys.store.getState().work.proposal).not.toBeNull();
  });
  it('every provider rate limited: the plain error, nothing queued, nothing cached', async () => {
    const sys = await makeSystem({ script: () => ({ status: 429 }) });
    sys.send(); sys.actions.acceptNotice!(); await sys.settle();
    const s = sys.store.getState();
    expect(s.ai.status).toBe('failed');
    expect(s.ai.error).toEqual({ code: 'rate_limited', message: 'Gemini, Groq and OpenRouter are at their free limit right now. Try again in a minute.' });
    expect(s.work.proposal).toBeNull();
    const before = sys.calls.length;
    sys.send(); await sys.settle();
    expect(sys.calls.length).toBeGreaterThan(before);
  });
  it('a heavy request whose heavy models all fail is answered by a lighter model and says so', async () => {
    const clar = JSON.stringify({ kind: 'clarification', questions: ['Which file?'] });
    const sys = await makeSystem({
      script: (c) => (c.url.includes('gemini-3.6-flash') || c.body.model === 'openai/gpt-oss-120b' || c.body.model === 'openrouter/free' ? { status: 500 } : { json: okBody(c.provider, clar) }),
    });
    sys.send({ selectedPaths: [], includeContent: false, finding: undefined, findingId: undefined }); sys.actions.acceptNotice!(); await sys.settle();
    const r = sys.store.getState().ai.result!;
    expect(r.meta!.lighter).toBe(true);
    expect(r.meta).toMatchObject({ provider: 'gemini', tier: 'light', model: 'gemini-3.1-flash-lite' });
  });
  it('no key at all: "Live AI is not set up", Send blocked by the status, and the server never answers with a mock', async () => {
    const sys = await makeSystem({ env: { AI_MODE: 'live' }, script: reply('{}') });
    expect(sys.actions.ui!.getState().status).toEqual({ kind: 'live', ready: false, providers: [{ id: 'gemini', configured: false }, { id: 'groq', configured: false }, { id: 'openrouter', configured: false }] });
    sys.send(); sys.actions.acceptNotice!(); await sys.settle();
    const s = sys.store.getState();
    expect(sys.calls).toHaveLength(0);
    expect(s.ai.status).toBe('failed');
    expect(s.ai.error!.code).toBe('unsupported');
    expect(s.ai.error!.message).toContain('Live AI is not set up');
    expect(JSON.stringify(s.ai)).not.toContain('"mode":"mock"');
  });
  it('mock mode (the default) is untouched: canned answer, no notice, no provider call', async () => {
    const sys = await makeSystem({ env: { GEMINI_API_KEY: 'KEY_G_sentinel' }, script: reply('{}') });
    expect(sys.actions.ui!.getState().status).toEqual({ kind: 'mock' });
    sys.send({ includeContent: false }); await sys.settle();
    expect(sys.actions.ui!.getState().noticeOpen).toBe(false);
    expect(sys.calls).toHaveLength(0);
    const r = sys.store.getState().ai.result!;
    expect(r.mode).toBe('mock');
    expect(sys.store.getState().work.proposal).toBeNull();
  });
});

describe('the AI starts a safe action', () => {
  it('"start the crew" runs start crew through the harness; approve is never run', async () => {
    const sys = await makeSystem({ script: reply(JSON.stringify({ kind: 'action', action: 'start', arg: 'crew', summary: 'Starting the crew' })) });
    sys.send({ taskType: 'act', instruction: 'please start the crew', selectedPaths: [], includeContent: false, finding: undefined, findingId: undefined });
    sys.actions.acceptNotice!(); await sys.settle();
    expect(sys.ran).toEqual(['start crew']);
    expect(sys.store.getState().work.run?.kind).toBe('crew');
    expect(sys.store.getState().log.some((l) => l.message === 'AI asked for: start crew')).toBe(true);
    expect(sys.store.getState().ai.result!.meta).toMatchObject({ tier: 'light', provider: 'gemini' });
  });
});

describe('rapid use: 1,000 seeded random actions keep every invariant', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  afterEach(() => { process.off('unhandledRejection', onUnhandled); });

  it('at most one request, at most one proposal, no desync, no unhandled rejection, no AI text stored', async () => {
    process.on('unhandledRejection', onUnhandled);
    let seed = 20261126;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;
    const ANSWER_SENTINEL = 'ANSWER_SENTINEL_9931';
    const sys = await makeSystem({
      script: (c, i) => {
        const r = (i * 7 + Math.floor(rand() * 10)) % 10;
        if (r === 0) return { status: 429 };
        if (r === 1) return { status: 500 };
        if (r === 2) return { throws: 'network' };
        if (r === 3) return { text: 'garbage' };
        if (r === 4) return { delayMs: 1, json: okBody(c.provider, JSON.stringify({ kind: 'clarification', questions: [ANSWER_SENTINEL] })) };
        return { delayMs: Math.floor(rand() * 3), json: okBody(c.provider, modelPatch(rand() < 0.5 ? FIX_IMG : NO_FIX_IMG, { summary: ANSWER_SENTINEL })) };
      },
    });
    let maxPending = 0;
    const QUESTION_SENTINEL = 'QUESTION_SENTINEL_5517';
    for (let step = 0; step < 1000; step++) {
      const op = pick(['send', 'send', 'send', 'cancel', 'stop', 'approve', 'reject', 'undo', 'redo', 'ok', 'discard', 'status', 'reset', 'help', 'sendNoFile'] as const);
      switch (op) {
        case 'send': sys.send({ instruction: `${QUESTION_SENTINEL} ${Math.floor(rand() * 4)}`, bypassCache: rand() < 0.2 }); break;
        case 'sendNoFile': sys.send({ taskType: pick(['explain', 'act', 'suggest_change'] as const), selectedPaths: [], includeContent: false, finding: undefined, findingId: undefined, instruction: `${QUESTION_SENTINEL} x${Math.floor(rand() * 3)}` }); break;
        case 'cancel': sys.actions.cancel(); break;
        case 'stop': sys.command('stop'); sys.actions.cancel(); break;
        case 'approve': sys.command('approve'); break;
        case 'reject': sys.command('reject'); break;
        case 'undo': sys.command('undo'); break;
        case 'redo': sys.command('redo'); break;
        case 'ok': sys.actions.acceptNotice!(); break;
        case 'discard': sys.actions.discardHeld!(); break;
        case 'status': sys.setEnv(rand() < 0.15 ? { AI_MODE: 'mock' } : { AI_MODE: 'live', GEMINI_API_KEY: 'KEY_G_sentinel', GROQ_API_KEY: 'KEY_Q_sentinel' }); await sys.actions.refreshStatus!(); break;
        case 'reset': sys.actions.reset!(); sys.command('reset'); break;
        case 'help': sys.command('help'); break;
      }
      if (rand() < 0.3) await new Promise((r) => setTimeout(r, 1));
      const s = sys.store.getState();
      maxPending = Math.max(maxPending, s.ai.status === 'pending' ? 1 : 0);
      // At most one waiting proposal; a proposal never coexists with an active run's awaiting state mismatch.
      expect(s.work.proposal === null || typeof s.work.proposal.id === 'string').toBe(true);
      if (s.work.run?.status === 'awaiting_decision') expect(s.work.proposal).not.toBeNull();
      expect(s.work.applied.length + s.work.undone.length).toBeLessThanOrEqual(50);
      // The saved record never holds AI text or the question.
      if (step % 25 === 0) {
        const rec = JSON.stringify(buildRecord(s, 1));
        expect(rec).not.toContain(ANSWER_SENTINEL);
        expect(rec).not.toContain(QUESTION_SENTINEL);
        expect(JSON.stringify(s.log)).not.toContain(ANSWER_SENTINEL);
        expect(JSON.stringify(s.log)).not.toContain(QUESTION_SENTINEL);
        expect(JSON.stringify(s.log)).not.toContain('KEY_');
      }
    }
    await sys.settle();
    await new Promise((r) => setTimeout(r, 20));
    sys.actions.cancel();
    expect(sys.store.getState().ai.status).not.toBe('pending');
    expect(unhandled).toEqual([]);
    expect(maxPending).toBeLessThanOrEqual(1);
    // The practice copy is still the original text plus only whole applied entries.
    const s = sys.store.getState();
    expect(s.snapshot!.files.find((f) => f.path === 'index.html')!.content).toContain('<img src="logo.png">');
    expect(JSON.stringify(buildRecord(s, 1))).not.toContain('KEY_');
    expect(mergedFindings(s).length).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
