// @node: F10.3
// Saves the session record when its content changes (design 7.2). Never deletes, never throws,
// at most one small write per distinct content, nothing while a load or restore runs or off the Studio.
import { detectPreviewMode } from '../preview/previewMode';
import type { KeyValueStorage } from './layoutStorage';
import { buildSessionRecord, saveSession } from './sessionRecord';
import type { SessionStoreState } from './sessionStore';
import type { ShellView } from './shellView';
import type { Store, StudioState } from './useStudioStore';

export interface SessionPersistenceDeps {
  studio: Pick<Store<StudioState>, 'getState' | 'subscribe'>;
  shell: Pick<Store<ShellView>, 'getState' | 'subscribe'>;
  session: Pick<Store<SessionStoreState>, 'getState' | 'subscribe'>;
  storage: KeyValueStorage | undefined;
  now(): number;
}

export function attachSessionPersistence(deps: SessionPersistenceDeps): () => void {
  let lastText: string | null = null;
  let entryFor: StudioState['snapshot'];
  let entry: string | undefined;
  const detected = (snap: NonNullable<StudioState['snapshot']>) => {
    if (snap !== entryFor) { entryFor = snap; try { entry = detectPreviewMode(snap).entryPath; } catch { entry = undefined; } }
    return entry;
  };
  const check = () => {
    const state = deps.studio.getState();
    const body = buildSessionRecord({ state, view: deps.shell.getState(), detectedEntry: state.snapshot ? detected(state.snapshot) : undefined, restoreStatus: deps.session.getState().status });
    // Nothing may be saved now (Start, Loading, a load or restore running). Forget the last text, so the
    // next allowed state is written even when it equals a record that Back to Start has since deleted.
    if (!body) { lastText = null; return; }
    const text = JSON.stringify(body);
    if (text === lastText) return;
    // Remember only after a successful write, so a blocked write is tried again on the next change.
    if (saveSession(deps.storage, { ...body, savedAt: deps.now() }) !== null) lastText = text;
  };
  const offs = [deps.studio.subscribe(check), deps.shell.subscribe(check), deps.session.subscribe(check)];
  check();
  return () => { for (const off of offs) off(); };
}
