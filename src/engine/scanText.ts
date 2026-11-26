// @node: F6.2
// Shared helpers for the 2D checks: line lookup, bounded snippets, stable finding ids. Pure.
import { SCAN_LIMITS as L } from '../config/scanLimits';
import { hashText } from './diffApply';
import { redact } from './redact';
import { lineIndex } from './sourceScan';
import type { RawFinding } from './scanFindingTypes';

export interface FileCtx {
  path: string;
  /** Effective content (the practice copy when changes were applied). */
  text: string;
  /** Comments blanked, line breaks kept. */
  masked: string;
  lineOf: (offset: number) => number;
}

export function makeCtx(path: string, text: string, masked: string): FileCtx {
  return { path, text, masked, lineOf: lineIndex(text) };
}

/** A raw finding spanning the match from `start` to `end` (offsets). */
export function at(ctx: FileCtx, skillId: string, start: number, end: number, extra?: string): RawFinding {
  const first = ctx.lineOf(start);
  const last = ctx.lineOf(Math.max(start, end - 1));
  return { skillId, path: ctx.path, firstLine: first, lastLine: last, ...(extra ? { extra } : {}) };
}

/** Lines first-2 .. last+2, at most 12 lines, each redacted and cut to 200 characters. */
export function snippetFor(lines: readonly string[], first: number, last: number): string[] {
  const span = last - first + 1;
  const lastKept = span > 8 ? first + 7 : last;
  const from = Math.max(1, first - 2);
  const to = Math.min(lines.length, lastKept + 2);
  const out: string[] = [];
  for (let n = from; n <= to && out.length < L.snippetLines; n++) {
    const line = redact((lines[n - 1] ?? '').replace(/\r$/, '')).text;
    out.push(line.length > L.snippetLineChars ? `${line.slice(0, L.snippetLineChars)}...` : line);
  }
  return out;
}

/** `skillId|path|h|k`: h = hash of the trimmed first line, k = count of earlier findings with the same h. */
export function makeFindingId(skillId: string, path: string, firstLineText: string, earlierSame: number): string {
  return `${skillId}|${path}|${hashText(firstLineText.trim())}|${earlierSame + 1}`;
}
