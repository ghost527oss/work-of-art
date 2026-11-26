// @node: F3.1
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  PANEL_ORDER,
  closePanel,
  isPanelId,
  setCollapsed,
  toggleWidth,
  togglePanel,
  type LayoutState,
} from '../src/store/layoutSlice';
import { LayoutRecordSchema } from '../src/store/layoutStorage';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

const closed: LayoutState = { openPanel: null, collapsed: false, width: 'narrow' };

describe('layout defaults', () => {
  it('opens AI Chat, expanded, narrow', () => {
    expect(DEFAULT_LAYOUT).toEqual({ openPanel: 'ai', collapsed: false, width: 'narrow' });
  });
  it('lists the five panels in toolbar order', () => {
    expect(PANEL_ORDER).toEqual(['edit', 'ai', 'log', 'history', 'journal']);
    expect(isPanelId('log')).toBe(true);
    expect(isPanelId('skeleton')).toBe(false);
    expect(isPanelId(3)).toBe(false);
  });
});

describe('togglePanel', () => {
  it('opens a closed panel, expanded, keeping the width', () => {
    const next = togglePanel({ ...closed, width: 'wide' }, 'log');
    expect(next).toEqual({ openPanel: 'log', collapsed: false, width: 'wide' });
  });
  it('switches panels without closing first and expands a collapsed panel', () => {
    const next = togglePanel({ openPanel: 'ai', collapsed: true, width: 'narrow' }, 'history');
    expect(next).toEqual({ openPanel: 'history', collapsed: false, width: 'narrow' });
  });
  it('closes when pressed on the open panel, expanded or collapsed', () => {
    expect(togglePanel({ openPanel: 'ai', collapsed: false, width: 'wide' }, 'ai')).toEqual({ openPanel: null, collapsed: false, width: 'wide' });
    expect(togglePanel({ openPanel: 'ai', collapsed: true, width: 'narrow' }, 'ai')).toEqual({ openPanel: null, collapsed: false, width: 'narrow' });
  });
  it('100 presses end open, 101 end closed (from the default)', () => {
    let s: LayoutState = { openPanel: null, collapsed: false, width: 'narrow' };
    for (let i = 0; i < 100; i++) s = togglePanel(s, 'log');
    expect(s.openPanel).toBeNull();
    s = { openPanel: null, collapsed: false, width: 'narrow' };
    for (let i = 0; i < 101; i++) s = togglePanel(s, 'log');
    expect(s.openPanel).toBe('log');
  });
});

describe('setCollapsed, toggleWidth, closePanel', () => {
  it('collapse and expand an open panel', () => {
    const open = DEFAULT_LAYOUT;
    const collapsed = setCollapsed(open, true);
    expect(collapsed).toEqual({ ...open, collapsed: true });
    expect(setCollapsed(collapsed, false)).toEqual(open);
  });
  it('returns the same object for every no-op', () => {
    expect(setCollapsed(closed, true)).toBe(closed);
    expect(setCollapsed(closed, false)).toBe(closed);
    expect(setCollapsed(DEFAULT_LAYOUT, false)).toBe(DEFAULT_LAYOUT);
    expect(toggleWidth(closed)).toBe(closed);
    const collapsed = { openPanel: 'ai' as const, collapsed: true, width: 'narrow' as const };
    expect(toggleWidth(collapsed)).toBe(collapsed);
    expect(closePanel(closed)).toBe(closed);
  });
  it('toggles the width of an expanded open panel', () => {
    expect(toggleWidth(DEFAULT_LAYOUT).width).toBe('wide');
    expect(toggleWidth({ ...DEFAULT_LAYOUT, width: 'wide' }).width).toBe('narrow');
  });
  it('closing keeps the width and clears collapsed', () => {
    expect(closePanel({ openPanel: 'edit', collapsed: true, width: 'wide' })).toEqual({ openPanel: null, collapsed: false, width: 'wide' });
  });
});

describe('purity and invariants', () => {
  it('never mutates a frozen input', () => {
    const s = deepFreeze({ openPanel: 'ai', collapsed: false, width: 'narrow' } as LayoutState);
    expect(() => {
      togglePanel(s, 'log');
      setCollapsed(s, true);
      toggleWidth(s);
      closePanel(s);
    }).not.toThrow();
  });

  it('a seeded random sequence of 2,000 actions keeps collapsed => open and valid records', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let s: LayoutState = DEFAULT_LAYOUT;
    for (let i = 0; i < 2000; i++) {
      const r = Math.floor(rand() * 5);
      if (r === 0) s = togglePanel(s, PANEL_ORDER[Math.floor(rand() * PANEL_ORDER.length)]!);
      else if (r === 1) s = setCollapsed(s, rand() < 0.5);
      else if (r === 2) s = toggleWidth(s);
      else if (r === 3) s = closePanel(s);
      else s = setCollapsed(s, false);
      if (s.collapsed) expect(s.openPanel).not.toBeNull();
      expect(LayoutRecordSchema.safeParse({ version: 1, ...s }).success).toBe(true);
    }
  });

  it('survives a JSON round trip unchanged', () => {
    const s = togglePanel(DEFAULT_LAYOUT, 'journal');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('imports nothing from React, storage, the engine, or other stores', () => {
    const text = readFileSync(fileURLToPath(new URL('../src/store/layoutSlice.ts', import.meta.url)), 'utf8');
    expect(text).not.toMatch(/from\s+['"](react|\.\.?\/)/);
    expect(text).not.toMatch(/\bfetch\b/);
  });
});
