// @node: F3.1
// Saving and restoring the panel layout in browser storage. Never throws. The stored text
// holds exactly four fields (version, openPanel, collapsed, width) and nothing else, so no
// repository data, text, or secret can reach it.
import { z } from 'zod';
import { DEFAULT_LAYOUT, PANEL_ORDER, type LayoutState } from './layoutSlice';

export const LAYOUT_KEY = 'patchbay.studio-layout.v1';
export const MAX_LAYOUT_CHARS = 1024;

/** The small part of the browser Storage interface this module needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const LayoutRecordSchema = z.strictObject({
  version: z.literal(1),
  openPanel: z.enum(PANEL_ORDER as unknown as [string, ...string[]]).nullable(),
  collapsed: z.boolean(),
  width: z.enum(['narrow', 'wide']),
});

/** Returns the saved layout, or the default for anything missing, damaged, old, or inconsistent. */
export function loadLayout(storage: KeyValueStorage | undefined): LayoutState {
  if (!storage) return DEFAULT_LAYOUT;
  let text: string | null;
  try {
    text = storage.getItem(LAYOUT_KEY);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (text === null || text.length > MAX_LAYOUT_CHARS) return DEFAULT_LAYOUT;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return DEFAULT_LAYOUT;
  }
  const parsed = LayoutRecordSchema.safeParse(data);
  if (!parsed.success) return DEFAULT_LAYOUT;
  const { openPanel, collapsed, width } = parsed.data;
  if (collapsed && openPanel === null) return DEFAULT_LAYOUT;
  return { openPanel: openPanel as LayoutState['openPanel'], collapsed, width };
}

/** Writes the four known fields only. Swallows every failure (blocked, full, unavailable). */
export function saveLayout(storage: KeyValueStorage | undefined, state: LayoutState): void {
  if (!storage) return;
  try {
    const record = { version: 1, openPanel: state.openPanel, collapsed: state.collapsed, width: state.width };
    storage.setItem(LAYOUT_KEY, JSON.stringify(record));
  } catch {
    /* storage blocked or full: keep working in memory */
  }
}

/** The browser's localStorage, or undefined when it is missing or access throws. */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Minimal store shape (matches `createStore`). Kept local so this file imports no other store. */
interface StoreLike<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
}

/**
 * Saves the layout each time the state object changes (never for a no-op). Returns the
 * unsubscribe function. With no storage it subscribes to nothing.
 */
export function attachLayoutPersistence(store: StoreLike<LayoutState>, storage: KeyValueStorage | undefined): () => void {
  if (!storage) return () => undefined;
  let last = store.getState();
  return store.subscribe(() => {
    const next = store.getState();
    if (next === last) return;
    last = next;
    saveLayout(storage, next);
  });
}
