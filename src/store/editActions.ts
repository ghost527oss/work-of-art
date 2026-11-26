// @node: F8.5
// Whole-state Edit pad actions. Log lines hold paths, titles, and counts only.
import {
  eAddPreviewOnly, eClearSelection, eDropSuggestion, eRemovePreviewOnly, eReply, eSelect, eSuggest, eTool,
  type EditState, type EditTool, type PreviewOnlyChange,
} from './editSlice';
import { withLog, type StudioState } from './useStudioStore';

const put = (s: StudioState, edit: EditState): StudioState => (edit === s.edit ? s : { ...s, edit });

export const setTool = (s: StudioState, t: EditTool) => put(s, eTool(s.edit, t));
export const selectKeys = (s: StudioState, keys: readonly string[], mode: 'replace' | 'toggle' = 'replace') => put(s, eSelect(s.edit, keys, mode));
export const clearSelection = (s: StudioState) => put(s, eClearSelection(s.edit));
export const setReply = (s: StudioState, r: string) => put(s, eReply(s.edit, r));

export function addPreviewOnly(s: StudioState, changes: readonly PreviewOnlyChange[], now: number): StudioState {
  const next = put(s, eAddPreviewOnly(s.edit, changes));
  if (next === s) return s;
  return { ...next, ...withLog(next, now, { action: 'style_preview_only', status: 'info', message: `${changes.length} Preview Only change${changes.length === 1 ? '' : 's'}.` }) };
}

export const removePreviewOnly = (s: StudioState, match: (c: PreviewOnlyChange) => boolean) => put(s, eRemovePreviewOnly(s.edit, match));
export const addSuggestion = (s: StudioState, c: PreviewOnlyChange) => put(s, eSuggest(s.edit, c));
export const dropSuggestion = (s: StudioState, key: string, prop: string) => put(s, eDropSuggestion(s.edit, key, prop));
