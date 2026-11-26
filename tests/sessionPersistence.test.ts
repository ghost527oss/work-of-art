// @node: F10.3
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { attachSessionPersistence } from '../src/store/sessionPersistence';
import { SESSION_KEY, SessionRecordSchema } from '../src/store/sessionRecord';
import { begin, createSessionStore, failed, idleSession, type SessionStoreState } from '../src/store/sessionStore';
import { INITIAL_VIEW, openDomain, openSkeleton, backToStudio, type ShellView } from '../src/store/shellView';
import { createStore, initialState, type Store, type StudioState } from '../src/store/useStudioStore';
import { recordingStorage, throwingStorage } from './helpers/sessionFakes';

function setup(storage = recordingStorage()) {
  const studio = createStore<StudioState>(initialState());
  const shell = createStore<ShellView>(INITIAL_VIEW);
  const session = createSessionStore();
  let t = 100;
  const off = attachSessionPersistence({ studio, shell, session, storage, now: () => ++t });
  return { studio, shell, session, storage, off };
}
const loadedState = (): StudioState => {
  const s0 = initialState();
  return { ...s0, experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1), ingestion: { ...s0.ingestion, runId: 1, status: 'done', target: { owner: 'sample', repo: 'static-site', source: 'sample', sampleId: 'static-site' } }, preview: { ...s0.preview, mode: 'static', reason: 'r', entryPath: 'index.html' } };
};
const sessionWrites = (s: ReturnType<typeof recordingStorage>) => s.writes.filter((w) => w.key === SESSION_KEY);

describe('session persistence', () => {
  it('no write on Start or Loading or while a load runs; one write when the Studio first shows a snapshot', () => {
    const { studio, storage } = setup();
    studio.update((s) => ({ ...s, experience: 'loading', ingestion: { ...s.ingestion, status: 'running' } }));
    expect(sessionWrites(storage)).toHaveLength(0);
    studio.setState(loadedState());
    expect(sessionWrites(storage)).toHaveLength(1);
    studio.update((s) => ({ ...s })); // same content
    expect(sessionWrites(storage)).toHaveLength(1);
    studio.update((s) => ({ ...s, ingestion: { ...s.ingestion, status: 'running', background: true } }));
    studio.update((s) => ({ ...s, preview: { ...s.preview, width: 375 } }));
    expect(sessionWrites(storage)).toHaveLength(1);
  });
  it('changes of screen, width, chosen mode, page, component, scope, notes write once each; unrelated changes write nothing', () => {
    const { studio, shell, storage } = setup();
    studio.setState(loadedState());
    const n0 = sessionWrites(storage).length;
    shell.update(openSkeleton); shell.update((v) => openDomain(v, 'backend'));
    studio.update((s) => ({ ...s, preview: { ...s.preview, width: 1024 } }));
    studio.update((s) => ({ ...s, preview: { ...s.preview, mode: 'source', chosenBy: 'user' } }));
    studio.update((s) => ({ ...s, preview: { ...s.preview, entryPath: 'about.html' } }));
    studio.update((s) => ({ ...s, preview: { ...s.preview, component: 'src/App.tsx#App' } }));
    studio.update((s) => ({ ...s, edit: { ...s.edit, previewOnly: [{} as never] } }));
    expect(sessionWrites(storage).length - n0).toBe(7);
    const n1 = sessionWrites(storage).length;
    studio.update((s) => ({ ...s, edit: { ...s.edit, selection: ['x'] as never } }));
    studio.update((s) => ({ ...s, preview: { ...s.preview, console: [{ level: 'log', text: 'hi' }] } }));
    studio.update((s) => ({ ...s, scan: { ...s.scan, status: 'done' } }));
    expect(sessionWrites(storage).length).toBe(n1);
  });
  it('200 rapid changes with repeats: at most one write per distinct content; always valid; savedAt only with content', () => {
    const { studio, shell, storage } = setup();
    studio.setState(loadedState());
    const widths = [375, 768, 1024, 0] as const;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = rnd();
      if (r < 0.3) shell.update(openSkeleton);
      else if (r < 0.5) shell.update(backToStudio);
      else if (r < 0.7) shell.update((v) => openDomain(v, 'security'));
      else studio.update((s) => ({ ...s, preview: { ...s.preview, width: widths[Math.floor(rnd() * 4)]! } }));
      const t = storage.data.get(SESSION_KEY)!;
      const { savedAt: _s, ...body } = JSON.parse(t);
      seen.add(JSON.stringify(body));
      expect(SessionRecordSchema.safeParse(JSON.parse(t)).success).toBe(true);
    }
    const ws = sessionWrites(storage);
    // consecutive writes always differ in content
    for (let i = 1; i < ws.length; i++) {
      const a = JSON.parse(ws[i - 1]!.value); const b = JSON.parse(ws[i]!.value);
      expect({ ...a, savedAt: 0 }).not.toEqual({ ...b, savedAt: 0 });
      expect(b.savedAt).toBeGreaterThan(a.savedAt);
    }
    expect(ws.length).toBeLessThanOrEqual(200);
    expect(seen.size).toBeGreaterThan(1);
  });
  it('never writes while a restore is pending or applying; never deletes on Start or after a failed restore', () => {
    const { studio, session, storage } = setup(recordingStorage({ [SESSION_KEY]: 'OLD' }));
    session.setState(begin(idleSession(), { version: 1, savedAt: 1, target: { source: 'sample', owner: 'sample', repo: 'static-site', sampleId: 'static-site' }, screen: { screen: 'studio' }, preview: { width: 768, mode: 'auto' }, notes: { crewWasActive: false, previewOnlyCount: 0 } }, 1));
    studio.setState(loadedState());
    expect(sessionWrites(storage)).toHaveLength(0);
    session.update((s) => failed(s, 1));
    studio.setState({ ...initialState() });
    expect(storage.removals).toEqual([]);
  });
  it('rewrites after Back to Start deleted the record, even for the same content', () => {
    const { studio, storage } = setup();
    studio.setState(loadedState());
    storage.removeItem(SESSION_KEY);
    studio.setState(initialState());
    studio.setState(loadedState());
    expect(storage.data.get(SESSION_KEY)).toBeTruthy();
  });
  it('blocked storage never throws and later writes are still tried; unsubscribe releases all three', () => {
    let tries = 0;
    const st = { ...throwingStorage, setItem: () => { tries++; throw new Error('full'); } };
    const { studio } = setup(st as never);
    expect(() => studio.setState(loadedState())).not.toThrow();
    studio.update((s) => ({ ...s, preview: { ...s.preview, width: 375 } }));
    expect(tries).toBe(2);
    const counted = <T,>(s: Store<T>) => { let n = 0; const sub = s.subscribe; s.subscribe = (l) => { n++; const o = sub(l); return () => { n--; o(); }; }; return () => n; };
    const studio2 = createStore<StudioState>(initialState()); const shell2 = createStore<ShellView>(INITIAL_VIEW); const session2 = createStore<SessionStoreState>(idleSession());
    const c = [counted(studio2), counted(shell2), counted(session2)];
    const off = attachSessionPersistence({ studio: studio2, shell: shell2, session: session2, storage: recordingStorage(), now: () => 1 });
    expect(c.map((f) => f())).toEqual([1, 1, 1]);
    off();
    expect(c.map((f) => f())).toEqual([0, 0, 0]);
  });
});
