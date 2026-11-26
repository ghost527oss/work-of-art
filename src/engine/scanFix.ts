// @node: F6.3
// The one automatic fix (scan.security.target-blank) and the safety conditions for offering it. Pure.
import { containsSecret } from './redact';
import { applyUnifiedDiff } from './diffApply';
import type { Finding } from './scanFindingTypes';

const MAX_DIFF = 2000;

/** Builds a diff that adds rel="noopener noreferrer" to the link at the finding's lines, or null when unsafe. */
export function buildTargetBlankFix(content: string, finding: Pick<Finding, 'path' | 'firstLine' | 'lastLine'>): string | null {
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  const first = finding.firstLine;
  const last = finding.lastLine;
  if (first < 1 || last > lines.length || last < first) return null;
  const block = lines.slice(first - 1, last).map((l) => l.replace(/\r$/, ''));
  const joined = block.join('\n');
  const tag = /<a\b(?:=>|[^>])*>/i.exec(joined);
  if (!tag) return null;
  const t = tag[0];
  const target = /(?<![\w:-])target\s*=\s*(["'])_blank\1/i.exec(t);
  if (!target) return null;
  let fixed: string;
  if (/(?<![\w:-])rel\s*=\s*\{/i.test(t)) return null;
  const rel = /(?<![\w:-])rel\s*=\s*(["'])([^"'\n]*)\1/i.exec(t);
  if (rel) {
    const words = rel[2]!.split(/\s+/).filter(Boolean);
    for (const w of ['noopener', 'noreferrer']) if (!words.includes(w)) words.push(w);
    fixed = t.slice(0, rel.index) + `rel=${rel[1]}${words.join(' ')}${rel[1]}` + t.slice(rel.index + rel[0].length);
  } else if (/(?<![\w:-])rel\b/i.test(t)) {
    return null;
  } else {
    const end = target.index + target[0].length;
    fixed = t.slice(0, end) + ' rel="noopener noreferrer"' + t.slice(end);
  }
  const newBlock = (joined.slice(0, tag.index) + fixed + joined.slice(tag.index + t.length)).split('\n');
  if (newBlock.length !== block.length) return null;
  const ctxBefore = lines.slice(Math.max(0, first - 4), first - 1).map((l) => l.replace(/\r$/, ''));
  const ctxAfter = lines.slice(last, last + 3).map((l) => l.replace(/\r$/, ''));
  const start = first - ctxBefore.length;
  const oldCount = ctxBefore.length + block.length + ctxAfter.length;
  const body: string[] = [];
  for (const l of ctxBefore) body.push(' ' + l);
  for (const l of block) body.push('-' + l);
  for (const l of newBlock) body.push('+' + l);
  for (const l of ctxAfter) body.push(' ' + l);
  const noFinalNewline = !content.endsWith('\n') && last + ctxAfter.length === lines.length;
  if (noFinalNewline) {
    // The last line has no newline: mark it where it appears (changed lines, or the last context line).
    const out: string[] = [];
    const lastIdx = body.length - 1;
    for (let i = 0; i < body.length; i++) {
      out.push(body[i]!);
      const isLastOfOld = ctxAfter.length > 0 ? i === lastIdx : body[i]!.startsWith('-') && i === ctxBefore.length + block.length - 1;
      const isLastOfNew = ctxAfter.length > 0 ? false : body[i]!.startsWith('+') && i === lastIdx;
      if (isLastOfOld || isLastOfNew) out.push('\\ No newline at end of file');
    }
    if (ctxAfter.length > 0) { /* context marker covers both sides */ }
    body.length = 0;
    body.push(...out);
  }
  return `--- a/${finding.path}\n+++ b/${finding.path}\n@@ -${start},${oldCount} +${start},${oldCount} @@\n${body.join('\n')}\n`;
}

export type FixResult = { ok: true; diff: string; title: string } | { ok: false; reason: string };

export const FIX_NOTE = 'A safe automatic fix could not be built here.';

/**
 * Offers the fix only when every safety condition holds. `recheck` runs all checks that apply
 * to a file's text and returns its findings.
 */
export function buildFixProposal(finding: Finding, content: string, recheck: (path: string, text: string) => Finding[]): FixResult {
  if (finding.skillId !== 'scan.security.target-blank') return { ok: false, reason: 'No automatic fix exists for this check.' };
  const diff = buildTargetBlankFix(content, finding);
  if (diff === null) return { ok: false, reason: 'The link could not be changed safely.' };
  if (diff.length > MAX_DIFF) return { ok: false, reason: 'The change is too large.' };
  if (containsSecret(diff)) return { ok: false, reason: 'The change contains a likely secret.' };
  const applied = applyUnifiedDiff(content, diff);
  if (!applied.ok) return { ok: false, reason: 'The change does not apply exactly.' };
  const before = recheck(finding.path, content);
  const after = recheck(finding.path, applied.text);
  if (after.some((f) => f.skillId === finding.skillId && f.firstLine === finding.firstLine)) return { ok: false, reason: 'The check would still report this link.' };
  const had = new Set(before.map((f) => `${f.skillId}@${f.firstLine}`));
  if (after.some((f) => !had.has(`${f.skillId}@${f.firstLine}`))) return { ok: false, reason: 'The change would cause a new finding.' };
  return { ok: true, diff, title: `Add rel="noopener noreferrer" to the link in ${finding.path}` };
}
