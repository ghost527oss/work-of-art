// @node: F9.8
import { describe, expect, it } from 'vitest';
import { createJournalController } from '../src/hooks/useJournal';
import { INITIAL_VIEW, openDomain, type ShellView } from '../src/store/shellView';
import { LEVEL_KEY, LevelRecordSchema, createJournalStore, loadLevel, saveLevel } from '../src/store/journalPrefs';
import type { LayoutState } from '../src/store/layoutSlice';
import { createStore } from '../src/store/useStudioStore';

function mem(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  const writes: string[] = [];
  return { writes, data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(k); data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
}

describe('level record', () => {
  it('uses the key patchbay.journal.v1 and round trips each level', () => {
    expect(LEVEL_KEY).toBe('patchbay.journal.v1');
    for (const level of ['simple', 'practical', 'deeper'] as const) {
      const s = mem();
      saveLevel(s, level);
      expect(JSON.parse(s.data.get(LEVEL_KEY)!)).toEqual({ version: 1, level });
      expect(loadLevel(s)).toBe(level);
    }
  });
  it('every bad variant gives simple without throwing', () => {
    const bad = ['', 'not json', '{}', '{"version":1}', '{"version":2,"level":"deeper"}', '{"version":1,"level":"expert"}', '{"version":1,"level":"deeper","x":1}', JSON.stringify({ version: 1, level: 'deeper', pad: 'x'.repeat(2000) })];
    for (const b of bad) expect(loadLevel(mem({ [LEVEL_KEY]: b }))).toBe('simple');
    expect(loadLevel(undefined)).toBe('simple');
    expect(loadLevel({ getItem: () => { throw new Error('blocked'); }, setItem: () => undefined, removeItem: () => undefined })).toBe('simple');
    expect(LevelRecordSchema.safeParse({ version: 1, level: 'simple' }).success).toBe(true);
  });
  it('saveLevel never throws on blocked or full storage', () => {
    expect(() => saveLevel({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => undefined }, 'deeper')).not.toThrow();
    expect(() => saveLevel(undefined, 'deeper')).not.toThrow();
  });
});

describe('journal store and openLesson', () => {
  function setup() {
    const storage = mem();
    const journal = createJournalStore('simple');
    const layout = createStore<LayoutState>({ openPanel: null, collapsed: false, width: 'narrow' });
    const shell = createStore<ShellView>(openDomain(INITIAL_VIEW, 'security'));
    const c = createJournalController({ journal, layout, backToStudio: () => shell.setState(INITIAL_VIEW), storage });
    return { storage, journal, layout, shell, c };
  }

  it('saves on change only, never at start-up or for the same level', () => {
    const { storage, c } = setup();
    let subs = 0;
    const detach = c.attach();
    expect(storage.writes).toEqual([]);
    c.actions.setLevel('simple');
    expect(storage.writes).toEqual([]);
    c.actions.setLevel('deeper');
    c.actions.setLevel('deeper');
    expect(storage.writes).toEqual([LEVEL_KEY]);
    detach();
    c.actions.setLevel('practical');
    expect(storage.writes).toEqual([LEVEL_KEY]);
    void subs;
  });

  it('openLesson sets the focus, opens the Journal panel, and returns to Screen 3', () => {
    const { journal, layout, shell, c, storage } = setup();
    c.attach();
    c.actions.openLesson('lesson.scan.security.target-blank');
    expect(journal.getState().focusLesson).toBe('lesson.scan.security.target-blank');
    expect(layout.getState()).toMatchObject({ openPanel: 'journal', collapsed: false });
    expect(shell.getState()).toEqual(INITIAL_VIEW);
    c.actions.clearFocus();
    expect(journal.getState().focusLesson).toBeUndefined();
    expect(storage.writes).toEqual([]);
  });

  it('an unknown id still opens the panel and sets no focus', () => {
    const { journal, layout, c } = setup();
    c.actions.openLesson('lesson.nope');
    expect(journal.getState().focusLesson).toBeUndefined();
    expect(layout.getState().openPanel).toBe('journal');
  });

  it('the subscription is released (counted)', () => {
    const { journal, c } = setup();
    let live = 0;
    const realSub = journal.subscribe;
    journal.subscribe = (l) => { live++; const off = realSub(l); return () => { live--; off(); }; };
    const off = c.attach();
    expect(live).toBe(1);
    off();
    expect(live).toBe(0);
  });
});
