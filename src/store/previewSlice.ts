// @node: F7.8
// Pure state for the Sandbox preview. Plain data. The built HTML is NOT stored here. Refused transitions return the SAME object.
// Imports only types, so useStudioStore can import `idlePreview` without a cycle.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import type { Finding } from '../engine/scanFindingTypes';
import type { PreviewMode } from '../preview/previewMode';

export type PreviewWidth = 375 | 768 | 1024 | 0;

export interface PreviewState {
  mode: PreviewMode;
  chosenBy: 'auto' | 'user';
  reason: string;
  entryPath?: string;
  component?: string;
  width: PreviewWidth;
  scripts: boolean;
  status: 'idle' | 'building' | 'ready' | 'failed';
  error?: string;
  notes: string[];
  console: Array<{ level: string; text: string }>;
  invalidMessages: number;
  layout: { status: 'idle' | 'running' | 'done' | 'stopped'; widths: number[]; findings: Finding[]; contentKey: string; partialReasons: string[]; message?: string };
}

export function idlePreview(): PreviewState {
  return {
    mode: 'source', chosenBy: 'auto', reason: '', width: 768, scripts: false, status: 'idle', notes: [], console: [], invalidMessages: 0,
    layout: { status: 'idle', widths: [], findings: [], contentKey: '', partialReasons: [] },
  };
}

const freshLayout = (): PreviewState['layout'] => idlePreview().layout;

export function pvInit(s: PreviewState, mode: PreviewMode, reason: string, entryPath?: string): PreviewState {
  return { ...idlePreview(), mode, reason, entryPath, width: s.width };
}

/** A mode change forces scripts off and drops measured results. */
export function pvMode(s: PreviewState, mode: PreviewMode, reason: string): PreviewState {
  if (s.mode === mode && s.chosenBy === 'user') return s;
  return { ...s, mode, chosenBy: 'user', reason, scripts: false, status: 'idle', error: undefined, console: [], invalidMessages: 0, layout: freshLayout() };
}

export function pvComponent(s: PreviewState, key: string): PreviewState {
  return s.component === key ? s : { ...s, component: key, status: 'idle', layout: freshLayout() };
}

export function pvWidth(s: PreviewState, width: PreviewWidth): PreviewState {
  return s.width === width ? s : { ...s, width };
}

/** Run scripts is refused unless the mode is the static preview. */
export function pvScripts(s: PreviewState, on: boolean): PreviewState {
  if (s.scripts === on) return s;
  if (on && s.mode !== 'static') return s;
  return { ...s, scripts: on, status: 'idle', console: [], invalidMessages: 0, layout: on ? { ...freshLayout(), message: 'The layout check is not available while scripts run.' } : freshLayout() };
}

export function pvStatus(s: PreviewState, status: PreviewState['status'], notes: string[] = s.notes, error?: string): PreviewState {
  return s.status === status && s.notes === notes && s.error === error ? s : { ...s, status, notes, error };
}

export function pvConsole(s: PreviewState, level: string, text: string): PreviewState {
  const c = [...s.console, { level, text }];
  return { ...s, console: c.length > L.consoleLines ? c.slice(c.length - L.consoleLines) : c };
}

export function pvInvalid(s: PreviewState): PreviewState {
  return { ...s, invalidMessages: s.invalidMessages + 1 };
}

export function pvLayoutBegin(s: PreviewState, widths: number[]): PreviewState {
  if (s.layout.status === 'running' || s.scripts || s.mode !== 'static') return s;
  return { ...s, layout: { status: 'running', widths, findings: [], contentKey: s.layout.contentKey, partialReasons: [] } };
}

export function pvLayoutDone(s: PreviewState, findings: Finding[], contentKey: string, partialReasons: string[]): PreviewState {
  if (s.layout.status !== 'running') return s;
  return { ...s, layout: { status: 'done', widths: s.layout.widths, findings, contentKey, partialReasons } };
}

export function pvLayoutStop(s: PreviewState, message: string): PreviewState {
  if (s.layout.status !== 'running') return s;
  return { ...s, layout: { status: 'stopped', widths: s.layout.widths, findings: [], contentKey: '', partialReasons: [], message } };
}

/** Discards measured results (content, snapshot, or mode changed). */
export function pvLayoutDiscard(s: PreviewState): PreviewState {
  return s.layout.status === 'idle' && s.layout.findings.length === 0 ? s : { ...s, layout: freshLayout() };
}
