// @node: F3.1
// The module-level layout store (created from the saved layout), a selector hook, and the
// effect that saves the layout while the app is mounted.
import { useEffect, useSyncExternalStore } from 'react';
import { createStore, type Store } from '../store/useStudioStore';
import { attachLayoutPersistence, browserStorage, loadLayout } from '../store/layoutStorage';
import type { LayoutState } from '../store/layoutSlice';

export const layoutStore: Store<LayoutState> = createStore<LayoutState>(loadLayout(browserStorage()));

/** Reads a slice of the layout. The selector must return a primitive or an existing reference. */
export function useLayout<T>(selector: (state: LayoutState) => T): T {
  return useSyncExternalStore(
    layoutStore.subscribe,
    () => selector(layoutStore.getState()),
    () => selector(layoutStore.getState()),
  );
}

/** Call once near the root. Saves layout changes and releases the subscription on unmount. */
export function useLayoutPersistence(): void {
  useEffect(() => attachLayoutPersistence(layoutStore, browserStorage()), []);
}
