// @node: F6.2
// Frontend checks. Each is `(ctx) => RawFinding[]`, anchored and length-bounded, run on masked text.
import { SCAN_LIMITS as L } from '../config/scanLimits';
import { at, type FileCtx } from './scanText';
import type { RawFinding } from './scanFindingTypes';

const N = L.maxPatternChars;
const MAX_HITS = 100;

export function scanImgAlt(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const re = new RegExp(`<img\\b([^>]{0,${N}})>`, 'gi');
  for (let m = re.exec(ctx.masked); m && out.length < MAX_HITS; m = re.exec(ctx.masked)) {
    const attrs = m[1]!;
    if (/\balt\b/i.test(attrs) || /\{\s*\.\.\./.test(attrs)) continue;
    out.push(at(ctx, 'scan.frontend.img-alt', m.index, m.index + m[0].length));
  }
  return out;
}

export function scanButtonName(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const named = (attrs: string) => /\baria-label(?:ledby)?\b|\btitle\b|\{\s*\.\.\./i.test(attrs);
  const re = new RegExp(`<button\\b([^>]{0,${N}}?)(\\/)?>(?:([\\s\\S]{0,200}?)<\\/button>)?`, 'gi');
  for (let m = re.exec(ctx.masked); m && out.length < MAX_HITS; m = re.exec(ctx.masked)) {
    const attrs = m[1]!;
    const selfClosing = m[2] === '/';
    if (named(attrs)) continue;
    if (selfClosing || (m[3] !== undefined && m[3].trim() === '')) out.push(at(ctx, 'scan.frontend.button-name', m.index, m.index + m[0].length));
  }
  return out;
}

export function scanListenerCleanup(ctx: FileCtx): RawFinding[] {
  if (!/from\s*['"]react['"]|require\(\s*['"]react['"]\s*\)/.test(ctx.masked)) return [];
  const add = /\b(?:window|document)\.addEventListener\s*\(/.exec(ctx.masked);
  if (!add || /removeEventListener\s*\(/.test(ctx.masked)) return [];
  return [at(ctx, 'scan.frontend.listener-cleanup', add.index, add.index + add[0].length)];
}
