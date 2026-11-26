// @node: F8.6
// The link between the Sandbox panel (which owns the iframe) and the Edit pad (which edits through it).
// Plain data goes in a small store; the iframe element itself is kept outside any store.
import { createStore, type Store } from '../store/useStudioStore';
import type { ElementEntry } from '../preview/previewDocument';

export interface PreviewInfo {
  /** Increases every time the Sandbox builds a new document. */
  buildId: number;
  /** True when the current document is a look-only static page or a workbench picture (editing possible). */
  editable: boolean;
  mode: 'static' | 'workbench' | 'source';
  scope: string;
  path?: string;
  elements: ElementEntry[];
  /** Hash of the page's effective content the element table was built from. */
  tableHash: string;
  ready: boolean;
}

export const previewInfoStore: Store<PreviewInfo> = createStore<PreviewInfo>({ buildId: 0, editable: false, mode: 'source', scope: '', elements: [], tableHash: '', ready: false });

export const previewHandle: {
  frame: HTMLIFrameElement | null;
  /** Runs the layout check at the current width; resolves with the number of layout findings, or null when it could not run. */
  recheck: (() => Promise<number | null>) | null;
  /** Scroll offsets to restore after the next rebuild. */
  pendingScroll: { x: number; y: number } | null;
} = { frame: null, recheck: null, pendingScroll: null };
