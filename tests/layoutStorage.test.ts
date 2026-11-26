// @node: F3.1
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, togglePanel, type LayoutState } from '../src/store/layoutSlice';
import {
  LAYOUT_KEY,
  attachLayoutPersistence,
  browserStorage,
  loadLayout,
  saveLayout,
  type KeyValueStorage,
} from '../src/store/layoutStorage';
import { createStore } from '../src/store/useStudioStore';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  const storage: KeyValueStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      writes.push([k, v]);
      data.set(k, v);
    },
  };
  return { storage, writes, data };
}

const valid = (o: Record<string, unknown> = {}) => JSON.stringify({ version: 1, openPanel: 'log', collapsed: false, width: 'wide', ...o });

describe('loadLayout', () => {
  it('returns a valid saved record without the version', () => {
    const { storage } = fakeStorage({ [LAYOUT_KEY]: valid() });
    expect(loadLayout(storage)).toEqual({ openPanel: 'log', collapsed: false, width: 'wide' });
  });
  it('accepts a closed layout and a collapsed open layout', () => {
    expect(loadLayout(fakeStorage({ [LAYOUT_KEY]: valid({ openPanel: null }) }).storage).openPanel).toBeNull();
    expect(loadLayout(fakeStorage({ [LAYOUT_KEY]: valid({ collapsed: true }) }).storage).collapsed).toBe(true);
  });
  const bad: Array<[string, string | null]> = [
    ['no value', null],
    ['bad JSON', '{not json'],
    ['wrong version', valid({ version: 2 })],
    ['unknown field', valid({ extra: 1 })],
    ['unknown panel id', valid({ openPanel: 'skeleton' })],
    ['wrong types', valid({ collapsed: 'yes' })],
    ['wrong width', valid({ width: 'huge' })],
    ['collapsed with no open panel', valid({ openPanel: null, collapsed: true })],
    ['over 1,024 characters', valid() + ' '.repeat(1100)],
  ];
  for (const [name, text] of bad) {
    it(`gives the default for: ${name}`, () => {
      const { storage } = fakeStorage(text === null ? {} : { [LAYOUT_KEY]: text });
      expect(loadLayout(storage)).toBe(DEFAULT_LAYOUT);
    });
  }
  it('gives the default with no storage and when getItem throws', () => {
    expect(loadLayout(undefined)).toBe(DEFAULT_LAYOUT);
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(loadLayout(throwing)).toBe(DEFAULT_LAYOUT);
  });
});

describe('saveLayout', () => {
  it('writes exactly four known fields plus the version, under 200 bytes', () => {
    const { storage, writes } = fakeStorage();
    saveLayout(storage, { openPanel: 'ai', collapsed: false, width: 'narrow' });
    expect(writes).toHaveLength(1);
    const text = writes[0]![1];
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['collapsed', 'openPanel', 'version', 'width']);
    expect(text.length).toBeLessThan(200);
  });
  it('writes only the four fields even when the state carries extra data', () => {
    const { storage, writes } = fakeStorage();
    const state = { openPanel: 'log', collapsed: false, width: 'wide', secret: 'ghp_x', repo: 'owner/name' } as unknown as LayoutState;
    saveLayout(storage, state);
    expect(writes[0]![1]).not.toContain('ghp_');
    expect(writes[0]![1]).not.toContain('owner');
  });
  it('never throws when setItem throws, and does nothing with no storage', () => {
    const full: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveLayout(full, DEFAULT_LAYOUT)).not.toThrow();
    expect(() => saveLayout(undefined, DEFAULT_LAYOUT)).not.toThrow();
  });
});

describe('attachLayoutPersistence', () => {
  it('saves once per changed state object and never for a no-op', () => {
    const { storage, writes } = fakeStorage();
    const store = createStore<LayoutState>(DEFAULT_LAYOUT);
    const stop = attachLayoutPersistence(store, storage);
    store.update((s) => togglePanel(s, 'log'));
    expect(writes).toHaveLength(1);
    store.setState(store.getState()); // same object
    expect(writes).toHaveLength(1);
    store.update((s) => togglePanel(s, 'log'));
    expect(writes).toHaveLength(2);
    stop();
    store.update((s) => togglePanel(s, 'edit'));
    expect(writes).toHaveLength(2);
  });
  it('does nothing without storage', () => {
    const store = createStore<LayoutState>(DEFAULT_LAYOUT);
    const stop = attachLayoutPersistence(store, undefined);
    store.update((s) => togglePanel(s, 'log'));
    expect(() => stop()).not.toThrow();
  });
  it('a saved layout is restored by loadLayout', () => {
    const { storage } = fakeStorage();
    const store = createStore<LayoutState>(DEFAULT_LAYOUT);
    attachLayoutPersistence(store, storage);
    store.update((s) => togglePanel(s, 'journal'));
    expect(loadLayout(storage)).toEqual(store.getState());
  });
});

describe('module hygiene', () => {
  it('browserStorage is undefined outside a browser', () => {
    expect(browserStorage()).toBeUndefined();
  });
  it('layoutStorage imports nothing from React, the engine, or the network', () => {
    const text = readFileSync(fileURLToPath(new URL('../src/store/layoutStorage.ts', import.meta.url)), 'utf8');
    expect(text).not.toMatch(/from\s+['"]react/);
    expect(text).not.toMatch(/engine|api\//);
    expect(text).not.toMatch(/\bfetch\b/);
  });
});
