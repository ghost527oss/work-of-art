// @node: F3.1
// Pure layout state for the Studio shell: which panel is open, whether it is collapsed,
// and its width. Every action is a pure function. An action that would not change the
// state returns the SAME object, so nothing re-renders and nothing is saved.
// This module imports nothing from React, storage, the engine, or other stores.

export type PanelId = 'edit' | 'ai' | 'log' | 'history' | 'journal';
export type PanelWidth = 'narrow' | 'wide';

/** The panels in toolbar order (Skeleton Crew is a screen, not a panel). */
export const PANEL_ORDER: readonly PanelId[] = ['edit', 'ai', 'log', 'history', 'journal'];

export interface LayoutState {
  openPanel: PanelId | null;
  /** True only while a panel is open. */
  collapsed: boolean;
  width: PanelWidth;
}

export const DEFAULT_LAYOUT: LayoutState = { openPanel: 'ai', collapsed: false, width: 'narrow' };

export function isPanelId(value: unknown): value is PanelId {
  return typeof value === 'string' && (PANEL_ORDER as readonly string[]).includes(value);
}

/** Opens the panel when closed or another one is open; closes it when it is the open one (expanded or collapsed). */
export function togglePanel(state: LayoutState, id: PanelId): LayoutState {
  if (state.openPanel === id) return { openPanel: null, collapsed: false, width: state.width };
  return { openPanel: id, collapsed: false, width: state.width };
}

/** No-op while no panel is open or when the value is unchanged. */
export function setCollapsed(state: LayoutState, value: boolean): LayoutState {
  if (state.openPanel === null || state.collapsed === value) return state;
  return { ...state, collapsed: value };
}

/** No-op while no panel is open or while collapsed. */
export function toggleWidth(state: LayoutState): LayoutState {
  if (state.openPanel === null || state.collapsed) return state;
  return { ...state, width: state.width === 'narrow' ? 'wide' : 'narrow' };
}

export function closePanel(state: LayoutState): LayoutState {
  if (state.openPanel === null) return state;
  return { openPanel: null, collapsed: false, width: state.width };
}
