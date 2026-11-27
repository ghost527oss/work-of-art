// @node: F12.10
// The pure part of the Visual Linter: plain measurements in, results out. No DOM, no clock, no page text.
// Overflow stays in layoutCheck.ts. A check that can't be trusted counts as "can't measure" and never reports.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { blend, contrastRatio, isLargeText, parseCssColor, type Rgb } from './colors';
import type { Measurement } from './layoutCheck';

export type LintKind = 'tap-target' | 'text-small' | 'contrast' | 'overlap' | 'media-wide';
export type Confidence = 'high' | 'medium' | 'low';
export interface LintResult {
  id: number; kind: LintKind; width: number; value: number; limit: number; confidence: Confidence;
  /** Tap target: [width, height]. Overlap: [other element id, overlapping area]. */
  aux?: number[];
}
export interface LintOutput {
  results: LintResult[];
  /** Element ids that could not be measured, by reason. */
  cantMeasure: Record<string, number[]>;
  partial: string[];
}

const BLOCK_LIKE = new Set(['block', 'flex', 'grid', 'inline-block', 'inline-flex', 'inline-grid', 'list-item', 'table', 'table-row', 'table-cell', 'flow-root']);
const TAP_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
const SMALL_TAGS = new Set(['small', 'sub', 'sup']);
const CONTROL_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'img', 'video', 'canvas', 'svg']);
const round1 = (n: number): number => Math.round(n * 10) / 10;

export function isVisible(m: Measurement): boolean {
  if (m.display === 'none' || m.visibility === 'hidden' || m.visibility === 'collapse') return false;
  if (m.opacity !== undefined && !(m.opacity > 0)) return false;
  if (m.width !== undefined && m.height !== undefined && (!(m.width > 0) || !(m.height > 0))) return false;
  return true;
}

function note(out: LintOutput, reason: string, id: number): void {
  (out.cantMeasure[reason] ??= []).push(id);
}

/** Evaluates every browser-measured check except overflow, at one preview width. `entryTag` is the page's own tag name. */
export function evaluateLint(ms: readonly Measurement[], width: number, entryTag: (id: number) => string | undefined): LintOutput {
  const out: LintOutput = { results: [], cantMeasure: {}, partial: [] };
  const mobile = width <= L.mobileMaxWidth;

  for (const m of ms) {
    if (!isVisible(m)) continue;
    const dom = (m.tag ?? '').toLowerCase();

    // Tap target
    if (mobile && m.width !== undefined && m.height !== undefined && !m.disabled && !m.inlineInText) {
      const native = TAP_TAGS.has(dom) && !(dom === 'a' && !m.hasHref) && !(dom === 'input' && m.inputType === 'hidden');
      if (native || m.roleButton) {
        const side = Math.min(m.width, m.height);
        if (side < L.tapMinPx) out.results.push({ id: m.id, kind: 'tap-target', width, value: round1(side), limit: L.tapMinPx, confidence: native ? 'high' : 'medium', aux: [round1(m.width), round1(m.height)] });
      }
    }

    // Small text
    if (mobile && m.hasText && m.fontSize !== undefined && m.fontSize < L.smallTextPx) {
      out.results.push({ id: m.id, kind: 'text-small', width, value: round1(m.fontSize), limit: L.smallTextPx, confidence: SMALL_TAGS.has(dom) ? 'medium' : 'high' });
    }

    // Contrast
    if (m.hasText && !m.disabled && m.color !== undefined) {
      if (m.bg?.unknown) note(out, m.bg.unknown, m.id);
      else if (m.bg?.color !== undefined) {
        const fg = parseCssColor(m.color);
        const bgc = parseCssColor(m.bg.color);
        if (!fg || !bgc || bgc.alpha < 1) note(out, 'unparsed', m.id);
        else if (fg.alpha > 0) {
          const solid: Rgb = fg.alpha < 1 ? blend(fg, bgc.rgb) : fg.rgb;
          const ratio = contrastRatio(solid, bgc.rgb);
          const limit = isLargeText(m.fontSize ?? 16, m.bold === true) ? L.contrastLarge : L.contrastNormal;
          if (ratio < limit) out.results.push({ id: m.id, kind: 'contrast', width, value: round1(ratio), limit, confidence: fg.alpha < 1 ? 'medium' : 'high' });
        }
      }
    }

    // Picture wider than its box (a real, loaded picture only)
    if (entryTag(m.id) === 'img') {
      if (dom !== 'img' || !m.img) note(out, 'picture_placeholder', m.id);
      else if (!m.img.complete) note(out, 'picture_loading', m.id);
      else if (m.img.naturalWidth === 0) note(out, 'picture_broken', m.id);
      else if (m.width !== undefined && m.width > m.img.parentClientWidth + 1) {
        out.results.push({ id: m.id, kind: 'media-wide', width, value: Math.round(m.width), limit: Math.round(m.img.parentClientWidth), confidence: m.img.local ? 'high' : 'medium' });
      }
    }
  }

  // Overlap: in-flow, visible, block-like siblings only
  const groups = new Map<number, Measurement[]>();
  for (const m of ms) {
    if (m.parentKey === undefined || m.left === undefined || m.top === undefined || m.width === undefined || m.height === undefined) continue;
    if (!isVisible(m) || m.overlay === true) continue;
    if (m.position !== undefined && m.position !== 'static' && m.position !== 'relative') continue;
    if (m.display !== undefined && !BLOCK_LIKE.has(m.display)) continue;
    (groups.get(m.parentKey) ?? groups.set(m.parentKey, []).get(m.parentKey)!).push(m);
  }
  let pairs = 0;
  let skippedGroups = 0;
  let pairLimit = false;
  for (const g of groups.values()) {
    if (g.length > L.maxChildrenPerParent) { skippedGroups++; continue; }
    for (let i = 0; i < g.length && !pairLimit; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (++pairs > L.maxPairs) { pairLimit = true; break; }
        const a = g[i]!, b = g[j]!;
        const w = Math.min(a.left! + a.width!, b.left! + b.width!) - Math.max(a.left!, b.left!);
        const h = Math.min(a.top! + a.height!, b.top! + b.height!) - Math.max(a.top!, b.top!);
        if (!(w > 0) || !(h > 0)) continue;
        const area = w * h;
        const smaller = Math.min(a.width! * a.height!, b.width! * b.height!);
        if (area < L.overlapMinArea || area < L.overlapMinShare * smaller) continue;
        const contentful = (m: Measurement) => m.hasText || CONTROL_TAGS.has((m.tag ?? '').toLowerCase());
        const unsure = a.hasTransform || b.hasTransform || a.hasNegativeMargin || b.hasNegativeMargin;
        const confidence: Confidence = !unsure && contentful(a) && contentful(b) ? 'medium' : 'low';
        out.results.push({ id: a.id, kind: 'overlap', width, value: Math.round(area), limit: L.overlapMinArea, confidence, aux: [b.id, Math.round(area)] });
      }
    }
  }
  if (skippedGroups > 0) out.partial.push(`Overlap check: ${skippedGroups} group${skippedGroups === 1 ? '' : 's'} of more than ${L.maxChildrenPerParent} neighbours ${skippedGroups === 1 ? 'was' : 'were'} not compared.`);
  if (pairLimit) out.partial.push(`Overlap check limit (${L.maxPairs.toLocaleString('en-US')} pairs) reached: later pairs were not compared.`);
  return out;
}
