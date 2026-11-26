// @node: F8.7
// The overlay above the preview in Edit mode: it takes the pointer (so no page code ever gets an event),
// draws dashed outlines, three handles for one element, and the lasso box. Black, white, and dashes only.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { previewHandle, previewInfoStore } from '../edit/previewHandle';
import { hitTest, lassoSelect, resizeFromHandle, type Handle, type Rect } from '../edit/geometry';
import { elementAtPoint, readRects, scrollPreview } from '../edit/previewEditDom';
import { size as sizeDecl } from '../edit/styleModel';
import type { EditActions } from '../hooks/useEditPad';
import type { ElementEntry } from '../preview/previewDocument';
import type { EditTool } from '../store/editSlice';

export interface EditOverlayProps {
  selection: readonly string[];
  tool: EditTool;
  enabled: boolean;
  pad: EditActions;
}

export function EditOverlay({ selection, tool, enabled, pad }: EditOverlayProps) {
  const info = useSyncExternalStore(previewInfoStore.subscribe, previewInfoStore.getState, previewInfoStore.getState);
  const elements: readonly ElementEntry[] = info.elements;
  const buildId = info.buildId;
  const frame = previewHandle.frame;
  const [rects, setRects] = useState<Rect[]>([]);
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const drag = useRef<{ handle: Handle; rect: Rect; x: number; y: number; last?: { width?: number; height?: number }; frame: number | null } | null>(null);
  const known = useRef(new Map<number, string>());
  known.current = new Map(elements.filter((e) => e.key).map((e) => [e.id, e.key!]));

  useEffect(() => {
    const doc = frame?.contentDocument;
    if (!doc || !enabled) { setRects([]); return undefined; }
    const ids = selection.map((k) => elements.find((e) => e.key === k)?.id).filter((x): x is number => x !== undefined);
    const update = () => setRects(readRects(doc, ids));
    update();
    const win = doc.defaultView;
    win?.addEventListener('scroll', update);
    return () => win?.removeEventListener('scroll', update);
  }, [frame, elements, selection, buildId, enabled]);

  useEffect(() => () => { if (drag.current?.frame) cancelAnimationFrame(drag.current.frame); drag.current = null; }, [buildId]);

  if (!enabled || !frame) return null;
  // Always the frame's CURRENT document (it is replaced on every rebuild).
  const docNow = () => previewHandle.frame?.contentDocument ?? null;
  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = (previewHandle.frame ?? frame).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const single = rects.length === 1 ? rects[0]! : null;

  return (
    <div
      className="edit-overlay"
      role="application"
      aria-label="Edit overlay: click to select an element, drag to draw a lasso"
      onPointerDown={(e) => {
        const doc = docNow();
        if (!doc) return;
        const p = local(e);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        if (tool === 'lasso') { setLasso({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); return; }
        if (tool === 'background') { const body = elements.find((x) => x.tag === 'body')?.key ?? elements[0]?.key; if (body) pad.select([body]); return; }
        const id = elementAtPoint(doc, p.x, p.y, new Set(known.current.keys())) ?? hitTest(readRects(doc, [...known.current.keys()]), p.x, p.y);
        const key = id !== undefined ? known.current.get(id) : undefined;
        if (!key) { if (!e.shiftKey) pad.clear(); return; }
        pad.select([key], e.shiftKey ? 'toggle' : 'replace');
      }}
      onPointerMove={(e) => {
        const p = local(e);
        if (lasso) { setLasso({ ...lasso, x1: p.x, y1: p.y }); return; }
        const d = drag.current;
        if (!d || d.frame !== null) return;
        d.frame = requestAnimationFrame(() => {
          if (!drag.current) return;
          drag.current.frame = null;
          const next = resizeFromHandle(d.rect, d.handle, p.x - d.x, p.y - d.y);
          drag.current.last = next;
          const decls = [next.width !== undefined ? sizeDecl('width', next.width, 'px') : null, next.height !== undefined ? sizeDecl('height', next.height, 'px') : null]
            .flatMap((r) => (r && r.ok ? [r.decl] : []));
          pad.live(decls);
        });
      }}
      onPointerUp={() => {
        const doc = docNow();
        if (lasso && doc) {
          const box = { left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1), width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0) };
          const all = readRects(doc, [...known.current.keys()]);
          const r = lassoSelect(all, box);
          pad.select(r.ids.map((id) => known.current.get(id)!).filter(Boolean));
          setLasso(null);
          return;
        }
        const d = drag.current;
        drag.current = null;
        if (d?.frame) cancelAnimationFrame(d.frame);
        if (d?.last) {
          const decls = [d.last.width !== undefined ? sizeDecl('width', d.last.width, 'px') : null, d.last.height !== undefined ? sizeDecl('height', d.last.height, 'px') : null]
            .flatMap((r) => (r && r.ok ? [r.decl] : []));
          pad.commit(decls);
        }
      }}
      onPointerCancel={() => { const d = drag.current; drag.current = null; if (d?.frame) cancelAnimationFrame(d.frame); pad.cancelLive(['width', 'height']); setLasso(null); }}
      onWheel={(e) => { const doc = docNow(); if (doc?.defaultView) scrollPreview(doc.defaultView, e.deltaX, e.deltaY); }}
    >
      {rects.map((r) => <div key={r.id} className="edit-outline" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />)}
      {single && (['right', 'bottom', 'corner'] as Handle[]).map((h) => (
        <div
          key={h}
          className={`edit-handle edit-handle-${h}`}
          aria-label={`Resize from the ${h === 'corner' ? 'corner' : `${h} edge`}`}
          style={{ left: h === 'bottom' ? single.left + single.width / 2 - 6 : single.left + single.width - 6, top: h === 'right' ? single.top + single.height / 2 - 6 : single.top + single.height - 6 }}
          onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget.parentElement as HTMLElement).setPointerCapture?.(e.pointerId); const p = local(e); drag.current = { handle: h, rect: single, x: p.x, y: p.y, frame: null }; }}
        />
      ))}
      {lasso && <div className="edit-lasso" style={{ left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1), width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0) }} />}
    </div>
  );
}
