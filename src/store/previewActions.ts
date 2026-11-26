// @node: F7.8
// Whole-state preview actions: slice transitions plus Log entries (titles and counts only).
import { MODE_NAMES, type PreviewMode } from '../preview/previewMode';
import type { Finding } from '../engine/scanFindingTypes';
import {
  pvComponent, pvConsole, pvInit, pvInvalid, pvLayoutBegin, pvLayoutDiscard, pvLayoutDone, pvLayoutStop, pvMode, pvScripts, pvStatus, pvWidth,
  type PreviewState, type PreviewWidth,
} from './previewSlice';
import { withLog, type StudioState } from './useStudioStore';

const put = (state: StudioState, preview: PreviewState): StudioState => (preview === state.preview ? state : { ...state, preview });

export function initPreview(state: StudioState, mode: PreviewMode, reason: string, entryPath: string | undefined, now: number): StudioState {
  const next = put(state, pvInit(state.preview, mode, reason, entryPath));
  return { ...next, ...withLog(next, now, { action: 'preview_mode', status: 'info', message: `Preview mode: ${MODE_NAMES[mode]}.` }) };
}

export function setPreviewMode(state: StudioState, mode: PreviewMode, reason: string, now: number): StudioState {
  const next = put(state, pvMode(state.preview, mode, reason));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'preview_mode', status: 'info', message: `Preview mode: ${MODE_NAMES[mode]}.` }) };
}

export function setPreviewComponent(state: StudioState, key: string): StudioState {
  return put(state, pvComponent(state.preview, key));
}

export function setPreviewWidth(state: StudioState, width: PreviewWidth): StudioState {
  return put(state, pvWidth(state.preview, width));
}

export function setPreviewScripts(state: StudioState, on: boolean, now: number): StudioState {
  const next = put(state, pvScripts(state.preview, on));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'preview_scripts', status: 'info', message: on ? 'Preview scripts turned on.' : 'Preview scripts turned off.' }) };
}

export function setPreviewStatus(state: StudioState, status: PreviewState['status'], notes?: string[], error?: string): StudioState {
  return put(state, pvStatus(state.preview, status, notes, error));
}

export function addConsoleLine(state: StudioState, level: string, text: string): StudioState {
  return put(state, pvConsole(state.preview, level, text));
}

export function countInvalid(state: StudioState): StudioState {
  return put(state, pvInvalid(state.preview));
}

export function beginLayout(state: StudioState, widths: number[]): StudioState {
  return put(state, pvLayoutBegin(state.preview, widths));
}

export function finishLayout(state: StudioState, findings: Finding[], contentKey: string, partialReasons: string[], now: number): StudioState {
  const next = put(state, pvLayoutDone(state.preview, findings, contentKey, partialReasons));
  if (next === state) return state;
  return { ...next, ...withLog(next, now, { action: 'layout_check_done', status: 'info', message: `Layout check: ${findings.length} findings at ${state.preview.layout.widths.join(', ')} px.` }) };
}

export function stopLayout(state: StudioState, message: string): StudioState {
  return put(state, pvLayoutStop(state.preview, message));
}

export function discardLayout(state: StudioState): StudioState {
  return put(state, pvLayoutDiscard(state.preview));
}

export function resetPreview(state: StudioState, now: number): StudioState {
  const next = put(state, { ...pvScripts(state.preview, false), status: 'idle' });
  return { ...next, ...withLog(next, now, { action: 'preview_reset', status: 'info', message: 'The preview tried to leave the page and was reset.' }) };
}
