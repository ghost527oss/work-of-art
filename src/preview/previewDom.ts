// @node: F7.7
// The only browser-only piece: reads measurements from a same-origin look-only preview document. Reads only.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import type { Measurement } from './layoutCheck';

export function gatherMeasurements(doc: Document, win: Window): { measurements: Measurement[]; docScrollWidth: number } {
  const out: Measurement[] = [];
  const els = doc.querySelectorAll('[data-pb]');
  for (let i = 0; i < els.length && i < L.maxElements; i++) {
    const el = els[i] as HTMLElement;
    const id = Number(el.getAttribute('data-pb'));
    if (!Number.isInteger(id)) continue;
    const cs = win.getComputedStyle(el);
    let hasText = false;
    for (const c of Array.from(el.childNodes)) if (c.nodeType === 3 && (c.textContent ?? '').trim() !== '') { hasText = true; break; }
    out.push({ id, tag: el.tagName.toLowerCase(), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, overflowX: cs.overflowX, overflowY: cs.overflowY, hasText });
  }
  return { measurements: out, docScrollWidth: doc.documentElement.scrollWidth };
}
