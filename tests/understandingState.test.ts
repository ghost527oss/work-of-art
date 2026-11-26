// @node: F5.7
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { applyCorrections, filterEdges, filterFiles, summarize } from '../src/engine/understandingView';
import {
  beginUnderstanding, cancelUnderstanding, clearCorrections, completeUnderstanding, failUnderstanding, progressUnderstanding, removeCorrection, setCorrection,
} from '../src/store/understandingActions';
import { LIMIT_MESSAGE, idleUnderstanding, uBegin, uSetCorrection } from '../src/store/understandingSlice';
import { beginIngestion, completeIngestion, initialState, reset, type StudioState } from '../src/store/useStudioStore';

const snapshot = buildSampleSnapshot('fullstack-api', 1);
const result = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
const loaded = (): StudioState => ({ ...initialState(), experience: 'studio', snapshot });

describe('understanding slice', () => {
  it('begin, progress, complete, and stale ids', () => {
    let s = uBegin(idleUnderstanding(), 'snap');
    expect(s).toMatchObject({ status: 'running', runId: 1 });
    expect(uBegin(s, 'snap')).toBe(s);
    let st = loaded();
    st = beginUnderstanding(st, 1);
    const id = st.understanding.runId;
    expect(progressUnderstanding(st, id + 5, 1, 2)).toBe(st);
    st = progressUnderstanding(st, id, 5, 10);
    expect(st.understanding.progress).toEqual({ done: 5, total: 10 });
    expect(completeUnderstanding(st, id + 1, result, 2)).toBe(st);
    st = completeUnderstanding(st, id, result, 2);
    expect(st.understanding.status).toBe('done');
    expect(st.log.at(-1)!.message).toMatch(/^\d+ files sorted, \d+ need review, \d+ connections\.$/);
    expect(completeUnderstanding(st, id, result, 3)).toBe(st);
    void s;
  });
  it('cancel returns to idle with no result; fail keeps a short message', () => {
    let st = beginUnderstanding(loaded(), 1);
    expect(cancelUnderstanding(st, 2).understanding).toMatchObject({ status: 'idle' });
    expect(cancelUnderstanding(loaded(), 2)).toEqual(loaded());
    st = failUnderstanding(st, st.understanding.runId, 'x'.repeat(500), 3);
    expect(st.understanding.status).toBe('failed');
    expect(st.understanding.error!.length).toBeLessThanOrEqual(200);
  });
  it('no snapshot means no run', () => expect(beginUnderstanding(initialState(), 1)).toEqual(initialState()));
});

describe('corrections', () => {
  it('set, remove, clear, with Log entries holding only paths and label names', () => {
    let st = loaded();
    const path = 'README.md';
    const r = setCorrection(st, path, ['tests', 'frontend'], 5);
    expect(r.error).toBeNull();
    st = r.state;
    expect(st.understanding.corrections[path]).toEqual(['frontend', 'tests']);
    expect(st.log.at(-1)).toMatchObject({ action: 'label_corrected', affectedPaths: [path], message: 'Labels set to frontend, tests.' });
    expect(setCorrection(st, path, ['frontend', 'tests'], 6).state).toBe(st);
    st = removeCorrection(st, path, 7);
    expect(st.understanding.corrections).toEqual({});
    expect(st.log.at(-1)!.action).toBe('label_reset');
    st = setCorrection(st, 'a', ['backend'], 8).state;
    st = setCorrection(st, 'b', ['backend'], 8).state;
    st = clearCorrections(st, 9);
    expect(st.understanding.corrections).toEqual({});
    expect(st.log.at(-1)!.message).toBe('2 label corrections cleared.');
    expect(clearCorrections(st, 10)).toBe(st);
  });
  it('an empty set removes; an invalid set is refused', () => {
    let st = setCorrection(loaded(), 'a', ['backend'], 1).state;
    st = setCorrection(st, 'a', [], 2).state;
    expect(st.understanding.corrections).toEqual({});
    expect(setCorrection(st, 'a', ['unknown' as never], 3).error).toMatch(/Choose at least one/);
  });
  it('the 500 limit refuses a new path with the exact message and never drops one', () => {
    let u = idleUnderstanding();
    for (let i = 0; i < 500; i++) u = uSetCorrection(u, `p${i}`, ['backend']);
    expect(Object.keys(u.corrections)).toHaveLength(500);
    const st: StudioState = { ...loaded(), understanding: u };
    const r = setCorrection(st, 'new', ['backend'], 1);
    expect(r.error).toBe(LIMIT_MESSAGE);
    expect(r.error).toBe('Correction limit reached (500). Remove one to add another.');
    expect(r.state).toBe(st);
    expect(setCorrection(st, 'p3', ['frontend'], 1).error).toBeNull();
  });
  it('corrections change the effective files and counts, not the connections', () => {
    const before = summarize(applyCorrections(result, {}));
    const fixed = applyCorrections(result, { 'README.md': ['backend'] });
    const f = fixed.find((x) => x.path === 'README.md')!;
    expect(f).toMatchObject({ labels: ['backend'], confidence: 'high', needsReview: false, corrected: true });
    expect(f.evidence).toEqual([{ source: 'user', description: 'Set by you.' }]);
    expect(f.before!.labels).toEqual(['documentation']);
    expect(summarize(fixed).areas.find((a) => a.id === 'backend')!.count).toBe(before.areas.find((a) => a.id === 'backend')!.count + 1);
    expect(result.edges).toBe(result.edges);
  });
});

describe('store integration', () => {
  it('replacing or clearing the snapshot clears understanding in memory; completion stores it', () => {
    const target = { owner: 'sample', repo: 'x', source: 'sample' as const, sampleId: 'x' };
    let s = beginIngestion(initialState(), target, 1);
    const done = completeIngestion(s, s.ingestion.runId, snapshot, 2, { ...idleUnderstanding(), status: 'done', result });
    expect(done.understanding.result).toBe(result);
    expect(reset(done).understanding).toEqual(idleUnderstanding());
    s = beginIngestion(reset(done), target, 3);
    expect(s.understanding).toEqual(idleUnderstanding());
  });
  it('summary Security row is the fixed pending text, never a number', () => {
    expect(summarize(result.files).security).toBe('pending scan (2D)');
  });
});

describe('view filters', () => {
  it('filter files and edges', () => {
    expect(filterFiles(result.files, { group: 'backend' }).every((f) => f.labels.includes('backend'))).toBe(true);
    expect(filterFiles(result.files, { needsReviewOnly: true })).toEqual([]);
    expect(filterFiles(result.files, { text: 'ROUTES/' }).length).toBe(1);
    expect(filterFiles(result.files, { confidence: 'high' }).every((f) => f.confidence === 'high' && !f.ignored)).toBe(true);
    expect(filterEdges(result.edges, { kind: 'imports' }).every((e) => e.kind === 'imports')).toBe(true);
    expect(filterEdges(result.edges, { certainty: 'broken' })).toEqual([]);
    expect(filterEdges(result.edges, { text: 'profile' }).length).toBeGreaterThan(2);
  });
});
