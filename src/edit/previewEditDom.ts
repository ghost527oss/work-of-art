// @node: F8.6
// The browser adapter for the Edit pad. Writes ONLY through style.setProperty and style.removeProperty, with validated
// names and values, on elements that carry a data-pb number from the element table. Never runs page code.
import { isSafeDeclaration, type StyleDeclaration } from './styleModel';
import type { Rect } from './geometry';

type Win = Window & { Document: typeof Document; Element: typeof Element };

function byId(doc: Document, id: number): HTMLElement | null {
  if (!Number.isInteger(id) || id < 0) return null;
  const win = doc.defaultView as Win | null;
  if (!win) return null;
  return win.Document.prototype.querySelector.call(doc, `[data-pb="${id}"]`) as HTMLElement | null;
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(-100_000, Math.min(100_000, n)) : 0);

export function readRects(doc: Document, ids: readonly number[]): Rect[] {
  const out: Rect[] = [];
  for (const id of ids) {
    const el = byId(doc, id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const p = el.parentElement?.closest('[data-pb]');
    const parentId = p ? Number(p.getAttribute('data-pb')) : undefined;
    out.push({ id, left: clamp(r.left), top: clamp(r.top), width: clamp(r.width), height: clamp(r.height), ...(Number.isInteger(parentId) ? { parentId } : {}) });
  }
  return out;
}

export function elementAtPoint(doc: Document, x: number, y: number, known: ReadonlySet<number>): number | undefined {
  const list = doc.elementsFromPoint(clamp(x), clamp(y));
  for (const el of list) {
    const n = Number(el.getAttribute('data-pb'));
    if (Number.isInteger(n) && known.has(n)) return n;
  }
  return undefined;
}

export function applyLiveStyle(doc: Document, id: number, decls: readonly StyleDeclaration[]): void {
  const el = byId(doc, id);
  if (!el) return;
  for (const d of decls) if (isSafeDeclaration(d)) el.style.setProperty(d.prop, d.value);
}

export function removeLiveStyle(doc: Document, id: number, props: readonly string[]): void {
  const el = byId(doc, id);
  if (!el) return;
  for (const p of props) if (/^[a-z-]+$/.test(p)) el.style.removeProperty(p);
}

export function getScroll(win: Window): { x: number; y: number } {
  return { x: clamp(win.scrollX), y: clamp(win.scrollY) };
}

export function setScroll(win: Window, pos: { x: number; y: number }): void {
  win.scrollTo(clamp(pos.x), clamp(pos.y));
}

export function scrollPreview(win: Window, dx: number, dy: number): void {
  win.scrollBy(clamp(dx), clamp(dy));
}
