// @node: F7.7
// @node: F12.11 (3B-1: the extra values for the Visual Linter, the outside-style check, and the wait for fonts and pictures)
// The only browser-only piece: reads measurements from a same-origin look-only preview document. Reads only, returns plain
// data, and holds no thresholds. Every value comes from the browser's own layout, never from the page's scripts.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import type { Measurement } from './layoutCheck';

interface FrameProtos {
  Document: typeof Document; Element: typeof Element; Node: typeof Node; HTMLImageElement: typeof HTMLImageElement;
}

export interface Gathered { measurements: Measurement[]; docScrollWidth: number; /** Outside style links that did not load. */ outsideStyleFailed: number }

type Bg = NonNullable<Measurement['bg']>;
const num = (s: string): number => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

export function gatherMeasurements(doc: Document, win: Window): Gathered {
  const out: Measurement[] = [];
  // The frame window's own prototypes: the page's markup (for example <form name="querySelectorAll">) cannot replace them.
  const W = win as unknown as FrameProtos;
  const attr = (el: Element, name: string): string | null => W.Element.prototype.getAttribute.call(el, name);
  const parentDesc = Object.getOwnPropertyDescriptor(W.Node.prototype, 'parentNode');
  const parentOf = (el: Node): Node | null => (parentDesc?.get ? (parentDesc.get.call(el) as Node | null) : null);
  const els = W.Document.prototype.querySelectorAll.call(doc, '[data-pb]') as NodeListOf<Element>;
  const parentKeys = new Map<Node, number>();
  const overlayMemo = new Map<Node, boolean>();
  const bgMemo = new Map<Node, Bg>();
  const csOf = (el: Element) => win.getComputedStyle(el);

  const isOverlay = (el: Node | null, depth = 0): boolean => {
    if (!el || el.nodeType !== 1 || depth > 40) return false;
    const hit = overlayMemo.get(el);
    if (hit !== undefined) return hit;
    const p = csOf(el as Element).position;
    const v = p === 'fixed' || p === 'sticky' || p === 'absolute' ? true : isOverlay(parentOf(el), depth + 1);
    overlayMemo.set(el, v);
    return v;
  };
  const bgOf = (el: Element, depth = 0): Bg => {
    const hit = bgMemo.get(el);
    if (hit) return hit;
    const cs = csOf(el);
    let result: Bg;
    if (depth > 30) result = { unknown: 'unparsed' };
    else if (cs.backgroundImage && cs.backgroundImage !== 'none') result = { unknown: 'picture' };
    else if (num(cs.opacity) < 1) result = { unknown: 'see_through' };
    else {
      const m = /^rgba?\(\s*[\d.]+\s*[, ]\s*[\d.]+\s*[, ]\s*[\d.]+\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(cs.backgroundColor.trim());
      if (!m) result = cs.backgroundColor.trim() === '' ? { color: 'rgb(255, 255, 255)' } : { unknown: 'unparsed' };
      else {
        const a = m[1] === undefined ? 1 : m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
        if (a >= 1) result = { color: cs.backgroundColor };
        else if (a > 0) result = { unknown: 'see_through' };
        else {
          const parent = parentOf(el);
          result = parent && parent.nodeType === 1 ? bgOf(parent as Element, depth + 1) : { color: 'rgb(255, 255, 255)' };
        }
      }
    }
    bgMemo.set(el, result);
    return result;
  };

  for (let i = 0; i < els.length && i < L.maxElements; i++) {
    const el = els[i] as HTMLElement;
    const id = Number(attr(el, 'data-pb'));
    if (!Number.isInteger(id)) continue;
    const cs = csOf(el);
    let hasText = false;
    for (const c of Array.from(el.childNodes)) if (c.nodeType === 3 && (c.textContent ?? '').trim() !== '') { hasText = true; break; }
    const rect = W.Element.prototype.getBoundingClientRect.call(el) as DOMRect;
    const parent = parentOf(el);
    let parentKey = 0;
    if (parent) { parentKey = parentKeys.get(parent) ?? parentKeys.size + 1; parentKeys.set(parent, parentKey); }
    const tag = el.tagName.toLowerCase();
    let inlineInText = false;
    if (tag === 'a' && cs.display === 'inline' && parent) for (const c of Array.from(parent.childNodes)) if (c !== el && c.nodeType === 3 && (c.textContent ?? '').trim() !== '') { inlineInText = true; break; }
    const weight = cs.fontWeight === 'bold' ? 700 : parseInt(cs.fontWeight, 10);
    const m: Measurement = {
      id, tag, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
      overflowX: cs.overflowX, overflowY: cs.overflowY, hasText,
      parentKey, left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      display: cs.display, position: cs.position, visibility: cs.visibility, opacity: num(cs.opacity),
      hasTransform: cs.transform !== 'none' && cs.transform !== '', hasNegativeMargin: [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].some((v) => num(v) < 0),
      overlay: isOverlay(el), disabled: attr(el, 'disabled') !== null, roleButton: attr(el, 'role') === 'button', hasHref: attr(el, 'href') !== null,
      inlineInText, fontSize: num(cs.fontSize), bold: Number.isFinite(weight) && weight >= 700, color: cs.color, bg: bgOf(el),
    };
    const type = attr(el, 'type');
    if (type !== null) m.inputType = type.toLowerCase();
    if (tag === 'img') {
      const img = el as HTMLImageElement;
      const nw = Object.getOwnPropertyDescriptor(W.HTMLImageElement.prototype, 'naturalWidth')?.get?.call(img) as number | undefined;
      const nh = Object.getOwnPropertyDescriptor(W.HTMLImageElement.prototype, 'naturalHeight')?.get?.call(img) as number | undefined;
      const done = Object.getOwnPropertyDescriptor(W.HTMLImageElement.prototype, 'complete')?.get?.call(img) as boolean | undefined;
      const cur = Object.getOwnPropertyDescriptor(W.HTMLImageElement.prototype, 'currentSrc')?.get?.call(img) as string | undefined;
      m.img = {
        naturalWidth: nw ?? 0, naturalHeight: nh ?? 0, complete: done === true, local: typeof cur === 'string' && cur.startsWith('data:'),
        parentClientWidth: parent && parent.nodeType === 1 ? (parent as Element).clientWidth : 0,
      };
    }
    out.push(m);
  }
  let outsideStyleFailed = 0;
  try {
    for (const link of Array.from(W.Document.prototype.querySelectorAll.call(doc, 'link[rel="stylesheet"]') as NodeListOf<HTMLLinkElement>)) if (link.sheet === null) outsideStyleFailed++;
  } catch { /* reading links is best effort */ }
  return { measurements: out, docScrollWidth: doc.documentElement ? doc.documentElement.scrollWidth : 0, outsideStyleFailed };
}

/**
 * Waits (at most `fontsMs`) for the page's fonts and (at most `assetsMs` in all) for every picture to finish loading.
 * Returns how many pictures were still loading when the wait ended. Never throws.
 */
export async function waitForAssets(doc: Document, fontsMs = L.fontsWaitMs, assetsMs = L.assetsWaitMs): Promise<{ pendingImages: number }> {
  const start = Date.now();
  const capped = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
  try {
    const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) await capped(fonts.ready, fontsMs);
    const pending = Array.from(doc.images ?? []).filter((img) => !img.complete);
    if (pending.length > 0) {
      const left = Math.max(0, assetsMs - (Date.now() - start));
      await capped(Promise.all(pending.map((img) => (typeof img.decode === 'function' ? img.decode().catch(() => undefined) : new Promise<void>((r) => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }); })))), left);
    }
    return { pendingImages: Array.from(doc.images ?? []).filter((img) => !img.complete).length };
  } catch {
    return { pendingImages: 0 };
  }
}
