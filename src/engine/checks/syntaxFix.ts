// @node: F12.5
// Candidate-and-verify syntax fixes: try a few tiny single insertions at the error spot on a temporary copy, re-run
// the same check, and offer a fix only when exactly one candidate makes that error go away. Never at the end of a
// file, never more than 8 characters. The caller builds the diff and applies the safety checks.
import { CHECK_LIMITS as L } from '../../config/checkLimits';
import type { Finding } from '../scanFindingTypes';
import { getAcorn, type AcornModule } from './acornLoader';
import { analyzeHtml } from './htmlStructure';
import { extractInlineScripts } from './inlineScripts';
import { parseJs, type RawSyntaxError } from './jsSyntax';

export type SyntaxFixResult = { ok: true; newContent: string; title: string } | { ok: false; reason: string };

const NO_FIX = 'A safe automatic fix could not be found here.';
const no = (reason: string = NO_FIX): SyntaxFixResult => ({ ok: false, reason });

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1);
}

interface Segment { code: string; offset: number; kind: 'module' | 'script' | 'either'; lineOf: (err: RawSyntaxError) => number }

function segmentFor(path: string, content: string, line: number, acorn: AcornModule): Segment | null {
  const e = extOf(path);
  if (e === 'js' || e === 'mjs' || e === 'cjs') return { code: content, offset: 0, kind: e === 'mjs' ? 'module' : e === 'cjs' ? 'script' : 'either', lineOf: (err) => err.line };
  if (e === 'html' || e === 'htm') {
    for (const s of extractInlineScripts(content).scripts) {
      const err = parseJs(acorn, s.code, s.module ? 'module' : 'either');
      if (err && s.startLine + err.line - 1 === line) return { code: s.code, offset: s.startOffset, kind: s.module ? 'module' : 'either', lineOf: (x) => s.startLine + x.line - 1 };
    }
  }
  return null;
}

const INSERTS = [')', ']', '}', ',', ';', ':'];

/** A candidate passes only when the whole text then reads cleanly. A later mistake could hide a wrong repair. */
function passes(acorn: AcornModule, segment: Segment, candidate: string): boolean {
  return parseJs(acorn, candidate, segment.kind) === null;
}

function jsFix(finding: Finding, content: string): SyntaxFixResult {
  const acorn = getAcorn();
  if (!acorn) return no('The JavaScript reader is not loaded.');
  const seg = segmentFor(finding.path, content, finding.firstLine, acorn);
  if (!seg) return no();
  const err = parseJs(acorn, seg.code, seg.kind);
  if (!err) return no();
  if (err.pos >= seg.code.trimEnd().length) return no('The mistake is at the end of the file, so the right place for a repair is not known.');
  const candidates: Array<{ at: number; text: string }> = [];
  const p = err.pos;
  if (/^Unterminated string constant/.test(err.message)) {
    const quote = seg.code[p];
    if (quote !== '"' && quote !== "'") return no();
    let eol = seg.code.indexOf('\n', p);
    if (eol === -1) eol = seg.code.length;
    let end = eol;
    while (end > p && /[\s\r]/.test(seg.code[end - 1]!)) end--;
    candidates.push({ at: end, text: quote });
    const m = /[;,)]+$/.exec(seg.code.slice(p, end));
    if (m) candidates.push({ at: end - m[0].length, text: quote });
  } else if (/^Unexpected token/.test(err.message)) {
    let q = p;
    while (q > 0 && /\s/.test(seg.code[q - 1]!)) q--;
    for (const c of INSERTS) candidates.push({ at: q, text: c });
  } else return no();
  const unique = new Map<string, { at: number; text: string }>();
  for (const c of candidates) if (c.text.length <= L.maxFixChars) unique.set(`${c.at}|${c.text}`, c);
  const ok: Array<{ at: number; text: string }> = [];
  for (const c of [...unique.values()].slice(0, L.maxFixCandidates)) {
    const cand = seg.code.slice(0, c.at) + c.text + seg.code.slice(c.at);
    if (passes(acorn, seg, cand)) ok.push(c);
  }
  if (ok.length !== 1) return no(ok.length === 0 ? NO_FIX : 'More than one repair would work, so no automatic fix is offered.');
  const pick = ok[0]!;
  const at = seg.offset + pick.at;
  const line = seg.lineOf(err);
  return { ok: true, newContent: content.slice(0, at) + pick.text + content.slice(at), title: `Add ${pick.text} near line ${line} of ${finding.path}` };
}

function htmlFix(finding: Finding, content: string): SyntaxFixResult {
  const problems = analyzeHtml(content);
  const hit = problems.find((x) => x.kind === 'closed_late' && x.line === finding.firstLine);
  if (!hit || hit.closerOffset === undefined) return no();
  const text = `</${hit.tag}>`;
  if (text.length > L.maxFixChars) return no('The closing tag is longer than a safe automatic repair allows.');
  const next = content.slice(0, hit.closerOffset) + text + content.slice(hit.closerOffset);
  const after = analyzeHtml(next);
  const gone = !after.some((x) => x.kind === 'closed_late' && x.startOffset === hit.startOffset);
  if (!gone || after.length >= problems.length) return no();
  return { ok: true, newContent: next, title: `Close the <${hit.tag}> that starts on line ${finding.firstLine} of ${finding.path}` };
}

export function proposeSyntaxFix(finding: Pick<Finding, 'skillId' | 'path' | 'firstLine'>, content: string): SyntaxFixResult {
  try {
    if (finding.skillId === 'scan.frontend.js-syntax') return jsFix(finding as Finding, content);
    if (finding.skillId === 'scan.frontend.html-structure') return htmlFix(finding as Finding, content);
  } catch {
    return no();
  }
  return no();
}

/** Skills whose next mistake in the same file is progress, not damage (the parser reports one mistake at a time). */
export const ONE_AT_A_TIME_SKILLS: readonly string[] = ['scan.frontend.js-syntax', 'scan.frontend.html-structure'];
