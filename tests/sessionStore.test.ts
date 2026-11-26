// @node: F10.2
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { logRestored, logSessionNote, resetSessionState, SESSION_LINES } from '../src/store/sessionActions';
import type { SessionRecord } from '../src/store/sessionRecord';
import { applied, begin, cancelled, failed, idleSession, loaded, markApplied, resetSessionStore, RESET_NOTICE, setRecord } from '../src/store/sessionStore';
import { initialState, type StudioState } from '../src/store/useStudioStore';

const rec: SessionRecord = { version: 1, savedAt: 1, target: { source: 'sample', owner: 'sample', repo: 'static-site', sampleId: 'static-site' }, screen: { screen: 'studio' }, preview: { width: 768, mode: 'auto' }, notes: { crewWasActive: true, previewOnlyCount: 2 } };
const deepFreeze = <T>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

describe('restore state machine', () => {
  it('idle -> pending -> applying -> done, each part applied once', () => {
    let s = begin(idleSession(), rec, 4);
    expect(s).toMatchObject({ status: 'pending', pendingRunId: 4, record: rec });
    s = loaded(s, 4);
    expect(s.status).toBe('applying');
    s = markApplied(s, 'screen');
    expect(markApplied(s, 'screen')).toBe(s);
    s = markApplied(s, 'preview');
    s = applied(s);
    expect(s).toMatchObject({ status: 'done', screenApplied: true, previewApplied: true });
  });
  it('ignored cases return the same object', () => {
    const p = begin(idleSession(), rec, 4);
    expect(loaded(p, 5)).toBe(p);
    expect(failed(p, 5)).toBe(p);
    expect(begin(p, rec, 9)).toBe(p);
    expect(applied(p)).toBe(p);
    expect(markApplied(p, 'screen')).toBe(p);
    const i = idleSession();
    expect(cancelled(i)).toBe(i);
    expect(loaded(i, 1)).toBe(i);
  });
  it('failed and cancelled keep the record; begin again from either; reset clears it', () => {
    const f = failed(begin(idleSession(), rec, 4), 4);
    expect(f).toMatchObject({ status: 'failed', record: rec });
    const c = cancelled(begin(idleSession(), rec, 4));
    expect(c).toMatchObject({ status: 'cancelled', record: rec });
    expect(begin(f, rec, 6)).toMatchObject({ status: 'pending', pendingRunId: 6 });
    expect(begin(c, rec, 7)).toMatchObject({ status: 'pending', pendingRunId: 7 });
    expect(resetSessionStore(f)).toEqual(idleSession());
    expect(resetSessionStore(f, RESET_NOTICE)).toEqual({ ...idleSession(), notice: RESET_NOTICE });
    expect(setRecord(idleSession(), rec).record).toBe(rec);
  });
  it('plain data that survives JSON', () => {
    const s = markApplied(loaded(begin(idleSession(), rec, 4), 4), 'screen');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('resetSessionState and the Log lines', () => {
  it('equals the initial state except the run counter; input not mutated', () => {
    const s0 = initialState();
    const full: StudioState = deepFreeze({ ...s0, experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1), ingestion: { ...s0.ingestion, runId: 7, status: 'done' }, log: [{ id: 'log-1', timestamp: 1, action: 'x', status: 'info' as const, message: 'm', affectedPaths: [] }], logSeq: 1 } as unknown as StudioState);
    const r = resetSessionState(full);
    expect(r).toEqual({ ...initialState(), ingestion: { ...initialState().ingestion, runId: 7 } });
    expect(r.log).toEqual([]);
    expect(r.logSeq).toBe(0);
    expect(r.experience).toBe('start');
  });
  it('exact texts, names and counts only', () => {
    expect(SESSION_LINES.restored('octo/shop', 4)).toBe('Session restored: octo/shop, screen 4.');
    expect(SESSION_LINES.crew).toBe('The Skeleton Crew run was not restored. Start it again with Start Crew.');
    expect(SESSION_LINES.previewOnly(3)).toBe('3 Preview Only changes were not restored.');
    expect(SESSION_LINES.mode).toBe('The saved preview mode is not available, so the automatic mode was used.');
    const tok = 'ghp_' + 'Q'.repeat(36);
    const s = logRestored(initialState(), 1, `o/${tok}`, 3);
    expect(s.log.at(-1)).toMatchObject({ action: 'session_restored', status: 'info' });
    expect(s.log.at(-1)!.message).not.toContain(tok);
    expect(logSessionNote(initialState(), 1, SESSION_LINES.crew).log.at(-1)!.action).toBe('session_note');
  });
});
