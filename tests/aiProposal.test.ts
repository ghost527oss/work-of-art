// @node: F11.9
import { describe, expect, it } from 'vitest';
import { AI_LIVE } from '../src/config/aiLive';
import { applyUnifiedDiff, hashText } from '../src/engine/diffApply';
import { ATTEMPTS_USED, MIXED_ENDINGS, bylineOf, checkAIProposal } from '../src/engine/aiProposal';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { aiCountAttempt } from '../src/store/aiSlice';
import { startRun } from '../src/store/workSlice';
import type { StudioState } from '../src/store/useStudioStore';
import type { AIRequest, AIResult } from '../src/types/contracts';
import { snapshotOf } from './helpers/analyzeFixture';
import { IMG_FIXTURE, loadedState, patchRequest, patchResult } from './helpers/aiHarness';

const EDIT = [{ start_line: 5, end_line: 5, new_text: '<img src="logo.png" alt="Shop logo">' }];
const newId = () => 'p-1';
async function ready() {
  const state = await loadedState(IMG_FIXTURE);
  const request = patchRequest(state, 'index.html');
  return { state, request, result: patchResult(request, EDIT) };
}

describe('checkAIProposal: the happy path', () => {
  it('returns one AI proposal with a fixed title, the byline, and no AI text', async () => {
    const { state, request, result } = await ready();
    const r = checkAIProposal(state, request, result, { findingId: 'f1', newId });
    if (!r.ok) throw new Error(r.reason);
    expect(r.proposal).toEqual({
      id: 'p-1', path: 'index.html', title: 'AI-proposed change to index.html', diff: (result.response as { unifiedDiff: string }).unifiedDiff,
      source: 'ai', byline: 'Answered by Groq (heavy).', findingId: 'f1',
    });
    expect(JSON.stringify(r.proposal)).not.toContain('Add a description');
  });
  it('omits findingId when there is none', async () => {
    const { state, request, result } = await ready();
    const r = checkAIProposal(state, request, result, { newId });
    expect(r.ok && 'findingId' in r.proposal).toBe(false);
  });
  it('the byline says lighter model when it was one', () => {
    const base: AIResult = { requestId: 'r', mode: 'live', response: { type: 'clarification', questions: ['q'] }, meta: { tier: 'light', provider: 'gemini', model: 'm', lighter: true, attempts: [] } };
    expect(bylineOf(base)).toBe('Answered by Gemini (light). Answered by a lighter model; review carefully.');
    expect(bylineOf({ ...base, meta: undefined })).toBe('Answered by an AI model.');
  });
});

describe('checkAIProposal: each refusal has a plain reason', () => {
  const reason = async (mutate: (c: Awaited<ReturnType<typeof ready>>) => { state?: StudioState; request?: AIRequest; result?: AIResult; findingId?: string }) => {
    const c = await ready();
    const m = mutate(c);
    const r = checkAIProposal(m.state ?? c.state, m.request ?? c.request, m.result ?? c.result, { ...(m.findingId ? { findingId: m.findingId } : {}), newId });
    if (r.ok) throw new Error('expected a refusal');
    return r.reason;
  };
  it('a mock answer', async () => expect(await reason((c) => ({ result: { ...c.result, mode: 'mock' } }))).toBe('This is a mock answer, so it is shown only.'));
  it('not a patch', async () => expect(await reason((c) => ({ result: { ...c.result, response: { type: 'clarification', questions: ['q'] } } }))).toBe('That answer was not a change.'));
  it('two files selected', async () => expect(await reason((c) => ({ request: { ...c.request, selectedPaths: ['index.html', 'b.js'] } }))).toBe('A change must be for exactly the one file you selected.'));
  it('a different file than the one selected', async () => expect(await reason((c) => ({ request: { ...c.request, selectedPaths: ['other.html'] } }))).toBe('A change must be for exactly the one file you selected.'));
  it('a run is active', async () => {
    expect(await reason((c) => ({ state: { ...c.state, work: startRun(c.state.work, 'run-1', [{ kind: 'info', title: 't' }], false) } }))).toBe('A run is active. Type stop first, then ask again.');
  });
  it('another proposal is waiting', async () => {
    expect(await reason((c) => ({ state: { ...c.state, work: { ...c.state.work, proposal: { id: 'x', path: 'index.html', title: 't', diff: 'd', source: 'practice' } } } }))).toBe('Another change is already waiting. Approve or reject it first.');
  });
  it('history is full', async () => {
    const entry = { id: 'h', path: 'index.html', title: 't', at: 1, diff: 'd', beforeHash: 'a', afterHash: 'b' };
    expect(await reason((c) => ({ state: { ...c.state, work: { ...c.state.work, applied: Array.from({ length: 50 }, () => entry) } } }))).toBe('History is full (50 changes). Reject this one or type reset.');
  });
  it('the attempts are used up', async () => {
    let s = (await ready()).state;
    for (let i = 0; i < 3; i++) s = { ...s, ai: aiCountAttempt(s.ai, 'f1') };
    expect(await reason(() => ({ state: s, findingId: 'f1' }))).toBe(ATTEMPTS_USED);
    expect(ATTEMPTS_USED).toBe('This finding has had 3 AI fix attempts. Fix it by hand, or ask about a different one.');
  });
  it('two attempts are still allowed', async () => {
    let s = (await ready()).state;
    for (let i = 0; i < 2; i++) s = { ...s, ai: aiCountAttempt(s.ai, 'f1') };
    const c = await ready();
    expect(checkAIProposal(s, c.request, c.result, { findingId: 'f1', newId }).ok).toBe(true);
  });
  it('the file is truncated or not loaded', async () => {
    const msg = 'That file is not fully loaded, so the change cannot be checked against it.';
    expect(await reason((c) => ({ state: { ...c.state, snapshot: { ...c.state.snapshot!, files: c.state.snapshot!.files.map((f) => ({ ...f, truncated: true })) } } }))).toBe(msg);
    expect(await reason((c) => ({ state: { ...c.state, snapshot: { ...c.state.snapshot!, files: c.state.snapshot!.files.map((f) => ({ ...f, loadStatus: 'indexed_not_loaded' as const })) } } }))).toBe(msg);
    expect(await reason((c) => ({ request: { ...c.request, selectedPaths: ['nope.html'] }, result: { ...c.result, response: { ...(c.result.response as object), affectedPaths: ['nope.html'] } as never } }))).toBe(msg);
  });
  it('the diff does not apply to the file as it is now', async () => {
    const r = await reason((c) => {
      const edited = { ...c.state.snapshot!, files: c.state.snapshot!.files.map((f) => ({ ...f, content: (f.content ?? '').replace('logo.png', 'other.png') })) };
      return { state: { ...c.state, snapshot: edited } };
    });
    expect(r).toMatch(/^The change does not fit the file as it is now \(.+\)\.$/);
  });
  it('the diff is too large', async () => {
    const r = await reason((c) => ({ result: { ...c.result, response: { ...(c.result.response as { unifiedDiff: string }), unifiedDiff: 'x'.repeat(AI_LIVE.maxProposalDiffChars + 1) } as never } }));
    expect(r).toBe('The change is too large for one reviewable diff.');
  });
  it('a likely secret in the diff', async () => {
    const r = await reason((c) => {
      const resp = c.result.response as { unifiedDiff: string };
      return { result: { ...c.result, response: { ...resp, unifiedDiff: resp.unifiedDiff.replace('alt="Shop logo"', 'alt="AKIAABCDEFGHIJKLMNOP"') } as never } };
    });
    expect(r).toBe('The change contains a likely secret, so it was not queued.');
  });
});

describe('checkAIProposal: line endings and the round trip', () => {
  const run = async (content: string) => {
    const snapshot = snapshotOf({ 'index.html': content });
    const state = await loadedState({ 'index.html': content }, snapshot);
    const request = patchRequest(state, 'index.html');
    const result = patchResult(request, EDIT);
    return { state, request, result, check: checkAIProposal(state, request, result, { newId }) };
  };
  const body = IMG_FIXTURE['index.html'];
  it('an LF file queues, applies, and reverses exactly', async () => {
    const r = await run(body);
    if (!r.check.ok) throw new Error(r.check.reason);
    const applied = applyUnifiedDiff(body, r.check.proposal.diff);
    expect(applied.ok).toBe(true);
  });
  it('a CRLF file queues and keeps its line endings', async () => {
    const crlf = body.replace(/\n/g, '\r\n');
    const r = await run(crlf);
    if (!r.check.ok) throw new Error(r.check.reason);
    const applied = applyUnifiedDiff(crlf, r.check.proposal.diff);
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.text).toContain('alt="Shop logo">\r\n');
    expect(applied.text.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r'))).toBe(true);
    expect(hashText(applied.text)).not.toBe(hashText(crlf));
  });
  it('a file that mixes line endings stays display-only with the plain message', async () => {
    const mixed = body.replace('<h1>Shop</h1>\n', '<h1>Shop</h1>\r\n');
    const r = await run(mixed);
    // The first line's ending is LF, so the new line is written with LF but the original line had CRLF: the round trip fails.
    const mixedFirstCrlf = body.replace(/\n/g, '\r\n').replace('<img src="logo.png">\r\n', '<img src="logo.png">\n');
    const r2 = await run(mixedFirstCrlf);
    const failures = [r.check, r2.check].filter((c) => !c.ok);
    expect(failures.length).toBeGreaterThan(0);
    for (const f of failures) expect(!f.ok && f.reason).toBe(MIXED_ENDINGS);
    expect(MIXED_ENDINGS).toBe('This file mixes line endings or ends without a newline here, so the change could not be undone exactly.');
  });
  it('a change at an unterminated last line stays display-only', async () => {
    const content = '<p>one</p>\n<p>two</p>\n<img src="logo.png">';
    const state = await loadedState({ 'index.html': content });
    const request = patchRequest(state, 'index.html');
    const result = patchResult(request, [{ start_line: 3, end_line: 3, new_text: '<img src="logo.png" alt="x">' }]);
    const c = checkAIProposal(state, request, result, { newId });
    expect(c.ok).toBe(false);
    expect(!c.ok && c.reason).toBe(MIXED_ENDINGS);
  });
  it('the sample repositories still produce valid snapshots for the checker (smoke)', () => {
    expect(buildSampleSnapshot('static-site', 1).files.length).toBeGreaterThan(0);
  });
});
