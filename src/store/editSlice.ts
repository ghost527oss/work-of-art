// @node: F8.5
// Pure state for the Edit pad. Plain data, never saved. Refused transitions return the SAME object.
import { EDIT_LIMITS as L } from '../config/editLimits';

export type EditTool = 'select' | 'lasso' | 'background';

export interface PreviewOnlyChange { elementKey: string; scope: string; property: string; value: string; reason: string; suggested?: boolean }

export interface EditState {
  tool: EditTool;
  selection: string[];
  previewOnly: PreviewOnlyChange[];
  suggestions: PreviewOnlyChange[];
  notice?: string;
  /** Last Undo/Redo reply shown beside the buttons. */
  reply?: string;
}

export function idleEdit(): EditState {
  return { tool: 'select', selection: [], previewOnly: [], suggestions: [] };
}

export function eTool(s: EditState, tool: EditTool): EditState {
  return s.tool === tool ? s : { ...s, tool };
}

export function eSelect(s: EditState, keys: readonly string[], mode: 'replace' | 'toggle' = 'replace'): EditState {
  let next: string[];
  if (mode === 'toggle') {
    const k = keys[0];
    if (k === undefined) return s;
    next = s.selection.includes(k) ? s.selection.filter((x) => x !== k) : [...s.selection, k];
  } else next = [...new Set(keys)];
  const capped = next.length > L.maxSelection;
  next = next.slice(0, L.maxSelection);
  if (next.length === s.selection.length && next.every((k, i) => k === s.selection[i]) && !capped) return s;
  return { ...s, selection: next, notice: capped ? 'Only the first 20 elements were selected.' : undefined };
}

/** Adds or replaces Preview Only changes (by element, scope, and property). Over 50 keeps the newest 50 and says so. */
export function eAddPreviewOnly(s: EditState, changes: readonly PreviewOnlyChange[]): EditState {
  if (changes.length === 0) return s;
  const key = (c: PreviewOnlyChange) => `${c.scope}|${c.elementKey}|${c.property}`;
  const incoming = new Set(changes.map(key));
  let list = [...s.previewOnly.filter((c) => !incoming.has(key(c))), ...changes.map((c) => ({ ...c }))];
  const over = list.length > L.maxPreviewOnly;
  if (over) list = list.slice(list.length - L.maxPreviewOnly);
  return { ...s, previewOnly: list, notice: over ? 'Only the last 50 Preview Only changes are kept.' : s.notice };
}

export function eRemovePreviewOnly(s: EditState, match: (c: PreviewOnlyChange) => boolean): EditState {
  const list = s.previewOnly.filter((c) => !match(c));
  return list.length === s.previewOnly.length ? s : { ...s, previewOnly: list };
}

export function eSuggest(s: EditState, c: PreviewOnlyChange): EditState {
  return { ...s, suggestions: [...s.suggestions.filter((x) => !(x.elementKey === c.elementKey && x.property === c.property)), { ...c, suggested: true }] };
}

export function eDropSuggestion(s: EditState, elementKey: string, property: string): EditState {
  const list = s.suggestions.filter((x) => !(x.elementKey === elementKey && x.property === property));
  return list.length === s.suggestions.length ? s : { ...s, suggestions: list };
}

export function eReply(s: EditState, reply: string): EditState {
  return s.reply === reply ? s : { ...s, reply };
}

export function eClearSelection(s: EditState): EditState {
  return s.selection.length === 0 && s.suggestions.length === 0 ? s : { ...s, selection: [], suggestions: [] };
}
