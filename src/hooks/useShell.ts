// @node: F3.2
// The screen store (plain data, NOT saved in 2A), its selector hook, the actions, and the
// effect that returns to the Studio screen whenever the experience leaves `studio`.
import { useEffect, useSyncExternalStore } from 'react';
import { createStore, useStudioStore, type Store } from '../store/useStudioStore';
import {
  INITIAL_VIEW,
  backToSkeleton,
  backToStudio,
  openDomain,
  openSkeleton,
  viewWhenStudio,
  type AreaId,
  type ShellView,
} from '../store/shellView';

export const shellStore: Store<ShellView> = createStore<ShellView>(INITIAL_VIEW);

export function useShellView(): ShellView {
  return useSyncExternalStore(shellStore.subscribe, shellStore.getState, shellStore.getState);
}

export const shellActions = {
  openSkeleton: (): void => shellStore.update(openSkeleton),
  openDomain: (area: AreaId): void => shellStore.update((v) => openDomain(v, area)),
  backToSkeleton: (): void => shellStore.update(backToSkeleton),
  backToStudio: (): void => shellStore.update(backToStudio),
  reset: (): void => shellStore.setState(INITIAL_VIEW),
};

/** Call once near the root. Sets the view back to Screen 3 whenever the experience is not `studio`. */
export function useShellReset(): void {
  const isStudio = useStudioStore((s) => s.experience === 'studio');
  useEffect(() => {
    shellStore.update((v) => viewWhenStudio(v, isStudio));
  }, [isStudio]);
}
