// @node: F8.4
// Selection geometry: hit testing, lasso, handle drags. Pure; every number is clamped.
export interface Rect { id: number; left: number; top: number; width: number; height: number; parentId?: number }

const c = (n: number) => (Number.isFinite(n) ? Math.max(-100_000, Math.min(100_000, n)) : 0);
const norm = (r: Rect): Rect => ({ ...r, left: c(r.left), top: c(r.top), width: Math.max(0, c(r.width)), height: Math.max(0, c(r.height)) });

export function hitTest(rects: readonly Rect[], x: number, y: number): number | undefined {
  let best: { id: number; area: number; order: number } | undefined;
  rects.forEach((raw, order) => {
    const r = norm(raw);
    if (x < r.left || y < r.top || x > r.left + r.width || y > r.top + r.height) return;
    const area = r.width * r.height;
    if (!best || area < best.area || (area === best.area && order > best.order)) best = { id: r.id, area, order };
  });
  return best?.id;
}

export function lassoSelect(rects: readonly Rect[], box: { left: number; top: number; width: number; height: number }, max = 20): { ids: number[]; capped: boolean } {
  const b = norm({ id: -1, ...box });
  const inside = (r: Rect) => r.left >= b.left && r.top >= b.top && r.left + r.width <= b.left + b.width && r.top + r.height <= b.top + b.height;
  const ok = new Set(rects.map(norm).filter(inside).map((r) => r.id));
  const outer = rects.filter((r) => ok.has(r.id) && !(r.parentId !== undefined && ok.has(r.parentId))).map((r) => r.id);
  return { ids: outer.slice(0, max), capped: outer.length > max };
}

export type Handle = 'right' | 'bottom' | 'corner';

export function resizeFromHandle(rect: Rect, handle: Handle, dx: number, dy: number): { width?: number; height?: number } {
  const clampSize = (n: number) => Math.max(1, Math.min(5000, Math.round(c(n))));
  const out: { width?: number; height?: number } = {};
  if (handle === 'right' || handle === 'corner') out.width = clampSize(rect.width + dx);
  if (handle === 'bottom' || handle === 'corner') out.height = clampSize(rect.height + dy);
  return out;
}

export function overlayRect(frame: { left: number; top: number }, el: Rect, scroll = { x: 0, y: 0 }): { left: number; top: number; width: number; height: number } {
  const r = norm(el);
  return { left: r.left - scroll.x + frame.left * 0, top: r.top - scroll.y + frame.top * 0, width: r.width, height: r.height };
}
