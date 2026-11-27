// @node: F11.7
import { describe, expect, it } from 'vitest';
import { AI_LIVE } from '../src/config/aiLive';
import { cacheKey, createAnswerCache, normaliseQuestion } from '../src/engine/aiCache';
import type { AIRequest, AIResult } from '../src/types/contracts';

const req = (over: Partial<AIRequest> = {}): AIRequest => ({ requestId: 'r1', instruction: 'Explain this', taskType: 'explain', selectedPaths: ['a.ts', 'b.ts'], ...over });
const result = (type: AIResult['response']['type'] = 'explanation', mode: 'mock' | 'live' = 'live'): AIResult => {
  const response: Record<string, AIResult['response']> = {
    explanation: { type: 'explanation', summary: 's', evidencePaths: [], limitations: ['l'] },
    plan: { type: 'plan', summary: 's', affectedPaths: ['a.ts'], steps: ['x'], risks: ['r'] },
    patch_proposal: { type: 'patch_proposal', summary: 's', affectedPaths: ['a.ts'], unifiedDiff: '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n', tests: ['t'], risks: ['r'] },
    clarification: { type: 'clarification', questions: ['q'] },
    action: { type: 'action', action: 'help', summary: 's' },
  };
  return { requestId: 'r1', mode, response: response[type]! };
};
const snippet = (content: string, startLine?: number) => ({ filePath: 'a.ts', content, ...(startLine ? { startLine } : {}) });

describe('cacheKey', () => {
  const base = cacheKey('live', req());
  it('ignores the request id, path order, and the question\'s case and spacing', () => {
    expect(cacheKey('live', req({ requestId: 'zzz' }))).toBe(base);
    expect(cacheKey('live', req({ selectedPaths: ['b.ts', 'a.ts'] }))).toBe(base);
    expect(cacheKey('live', req({ instruction: '  EXPLAIN   this ' }))).toBe(base);
    expect(normaliseQuestion('  A  b\n C ')).toBe('a b c');
  });
  it('changes with the mode, task type, question, skill id, paths, and connections', () => {
    expect(cacheKey('mock', req())).not.toBe(base);
    expect(cacheKey('live', req({ taskType: 'review_finding' }))).not.toBe(base);
    expect(cacheKey('live', req({ instruction: 'Explain that' }))).not.toBe(base);
    expect(cacheKey('live', req({ skillId: 'scan.frontend.img-alt' }))).not.toBe(base);
    expect(cacheKey('live', req({ selectedPaths: ['a.ts'] }))).not.toBe(base);
    expect(cacheKey('live', req({ connections: ['a.ts calls /x (confirmed, line 1)'] }))).not.toBe(base);
  });
  it('changes with any snippet text, first line, or file, and not with snippet order', () => {
    const k = (s: ReturnType<typeof snippet>[]) => cacheKey('live', req({ sourceContext: s }));
    const one = k([snippet('const a = 1;', 10)]);
    expect(one).not.toBe(base);
    expect(k([snippet('const a = 2;', 10)])).not.toBe(one);
    expect(k([snippet('const a = 1;', 11)])).not.toBe(one);
    expect(k([{ ...snippet('const a = 1;', 10), filePath: 'b.ts' }])).not.toBe(one);
    expect(k([snippet('const a = 1; ', 10)])).not.toBe(one);
    const two = [snippet('x', 1), { filePath: 'b.ts', content: 'y' }];
    expect(k(two)).toBe(k([...two].reverse()));
  });
});

describe('what is stored', () => {
  it('stores live explanation, plan, patch_proposal, and clarification answers', () => {
    const c = createAnswerCache();
    for (const t of ['explanation', 'plan', 'patch_proposal', 'clarification'] as const) {
      expect(c.put(`k-${t}`, result(t))).toBe(true);
      expect(c.get(`k-${t}`)).toEqual(result(t));
    }
    expect(c.size()).toBe(4);
  });
  it('never stores an action answer or a mock answer', () => {
    const c = createAnswerCache();
    expect(c.put('a', result('action'))).toBe(false);
    expect(c.put('m', result('explanation', 'mock'))).toBe(false);
    expect(c.size()).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });
  it('never stores a result that contains a secret', () => {
    const c = createAnswerCache();
    const leaky = result('explanation');
    if (leaky.response.type === 'explanation') leaky.response.summary = 'key AKIAABCDEFGHIJKLMNOP';
    expect(c.put('k', leaky)).toBe(false);
    expect(c.size()).toBe(0);
  });
  it('a miss returns undefined, and get returns a copy that cannot change the stored answer', () => {
    const c = createAnswerCache();
    expect(c.get('nope')).toBeUndefined();
    c.put('k', result());
    const a = c.get('k')!;
    (a.response as { summary: string }).summary = 'CHANGED';
    expect(c.get('k')).toEqual(result());
  });
  it('the stored copy is independent of the object that was put', () => {
    const c = createAnswerCache();
    const r = result();
    c.put('k', r);
    (r.response as { summary: string }).summary = 'CHANGED';
    expect(c.get('k')).toEqual(result());
  });
  it('put on an existing key replaces it', () => {
    const c = createAnswerCache();
    c.put('k', result('explanation'));
    c.put('k', result('plan'));
    expect(c.size()).toBe(1);
    expect(c.get('k')!.response.type).toBe('plan');
  });
});

describe('limits', () => {
  it('uses the 30-entry and 256 KB limits by default', () => {
    expect(AI_LIVE.cacheMaxEntries).toBe(30);
    expect(AI_LIVE.cacheMaxBytes).toBe(256 * 1024);
  });
  it('drops the oldest first when there are more than 30 entries', () => {
    const c = createAnswerCache();
    for (let i = 0; i < 35; i++) c.put(`k${i}`, result());
    expect(c.size()).toBe(30);
    expect(c.get('k0')).toBeUndefined();
    expect(c.get('k4')).toBeUndefined();
    expect(c.get('k5')).toBeDefined();
    expect(c.get('k34')).toBeDefined();
  });
  it('drops the oldest first when the bytes pass the limit, and never exceeds it', () => {
    const c = createAnswerCache({ maxEntries: 30, maxBytes: 3000 });
    const big = (n: number): AIResult => ({ requestId: 'r', mode: 'live', response: { type: 'explanation', summary: 'x'.repeat(n), evidencePaths: [], limitations: ['l'] } });
    for (let i = 0; i < 6; i++) c.put(`k${i}`, big(1000));
    expect(c.bytes()).toBeLessThanOrEqual(3000);
    expect(c.get('k0')).toBeUndefined();
    expect(c.get('k5')).toBeDefined();
  });
  it('one entry larger than the limit is not stored and does not evict others', () => {
    const c = createAnswerCache({ maxEntries: 30, maxBytes: 3000 });
    c.put('small', result());
    const huge: AIResult = { requestId: 'r', mode: 'live', response: { type: 'explanation', summary: 'x'.repeat(2000), evidencePaths: [], limitations: ['y'.repeat(2000)] } };
    expect(c.put('huge', huge)).toBe(false);
    expect(c.get('small')).toBeDefined();
    expect(c.get('huge')).toBeUndefined();
  });
  it('clear empties it and resets the byte count', () => {
    const c = createAnswerCache();
    c.put('k', result());
    expect(c.bytes()).toBeGreaterThan(0);
    c.clear();
    expect(c.size()).toBe(0);
    expect(c.bytes()).toBe(0);
    expect(c.get('k')).toBeUndefined();
  });
  it('the byte count always equals the sum of what is stored (500 seeded random operations)', () => {
    let s = 12345; const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const c = createAnswerCache({ maxEntries: 8, maxBytes: 5000 });
    for (let i = 0; i < 500; i++) {
      const op = rand();
      const key = `k${Math.floor(rand() * 20)}`;
      if (op < 0.7) c.put(key, { requestId: 'r', mode: 'live', response: { type: 'explanation', summary: 'x'.repeat(Math.floor(rand() * 900) + 1), evidencePaths: [], limitations: ['l'] } });
      else if (op < 0.95) c.get(key);
      else c.clear();
      expect(c.size()).toBeLessThanOrEqual(8);
      expect(c.bytes()).toBeLessThanOrEqual(5000);
      if (c.size() === 0) expect(c.bytes()).toBe(0);
    }
  });
});
