// @node: F4.1
// Applies, reverses, and fingerprints one-file unified diffs. Pure text work:
// no React, no stores, no network. Matching is exact; there is no fuzzy search.

export type ApplyResult = { ok: true; text: string } | { ok: false; reason: string };

type Kind = ' ' | '-' | '+';

interface Entry {
  kind: Kind;
  text: string;
  /** True when a "\ No newline at end of file" marker followed this line. */
  noNewline: boolean;
  /** Original line ended with "\r" (kept so a reversal reproduces the text). */
  cr: boolean;
  markerCr: boolean;
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newCount: number;
  /** Raw header tokens, e.g. "0,0" and "1", kept so a reversal can swap them verbatim. */
  oldToken: string;
  newToken: string;
  entries: Entry[];
  headCr: boolean;
}

interface ParsedDiff {
  oldHeader: string;
  newHeader: string;
  hunks: Hunk[];
}

type ParseOutcome = { ok: true; diff: ParsedDiff } | { ok: false; reason: string };

const MARKER = '\\ No newline at end of file';
const HEADER_RE = /^@@ -(\d{1,9})(?:,(\d{1,9}))? \+(\d{1,9})(?:,(\d{1,9}))? @@/;

function stripCr(s: string): string {
  return s.endsWith('\r') ? s.slice(0, -1) : s;
}

function headerPath(line: string, prefix: string): string {
  return stripCr(line.slice(prefix.length)).replace(/^[ab]\//, '');
}

function parseDiff(diff: string): ParseOutcome {
  const raw = diff.split('\n');
  while (raw.length > 0 && stripCr(raw[raw.length - 1]!) === '') raw.pop();
  const lines = raw.map(stripCr);
  const crs = raw.map((l) => l.endsWith('\r'));
  let pos = 0;
  while (pos < lines.length) {
    const l = lines[pos]!;
    if (l === '' || l.startsWith('diff --git ') || l.startsWith('index ')) pos++;
    else break;
  }
  const oldHeader = raw[pos];
  const newHeader = raw[pos + 1];
  pos += 2;
  if (oldHeader === undefined || !oldHeader.startsWith('--- ')) return { ok: false, reason: 'Missing "---" header.' };
  if (newHeader === undefined || !newHeader.startsWith('+++ ')) return { ok: false, reason: 'Missing "+++" header.' };
  if (headerPath(oldHeader, '--- ') !== headerPath(newHeader, '+++ ')) {
    return { ok: false, reason: 'The two file names in the headers differ.' };
  }
  const hunks: Hunk[] = [];
  while (pos < lines.length) {
    const head = lines[pos]!;
    const m = HEADER_RE.exec(head);
    if (!m) {
      return {
        ok: false,
        reason: hunks.length === 0 ? 'Unexpected text before the first hunk.' : 'Unexpected text between hunks or a second file.',
      };
    }
    const headCr = crs[pos]!;
    pos++;
    const oldStart = Number(m[1]);
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const newCount = m[4] === undefined ? 1 : Number(m[4]);
    const oldToken = m[2] === undefined ? m[1]! : `${m[1]},${m[2]}`;
    const newToken = m[4] === undefined ? m[3]! : `${m[3]},${m[4]}`;
    const entries: Entry[] = [];
    let oldSeen = 0;
    let newSeen = 0;
    while (oldSeen < oldCount || newSeen < newCount) {
      const l = lines[pos];
      if (l === undefined) return { ok: false, reason: 'A hunk has fewer lines than its header says.' };
      const ch = l[0];
      if (ch === ' ') {
        oldSeen++;
        newSeen++;
        entries.push({ kind: ' ', text: l.slice(1), noNewline: false, cr: crs[pos]!, markerCr: false });
      } else if (ch === '-') {
        oldSeen++;
        entries.push({ kind: '-', text: l.slice(1), noNewline: false, cr: crs[pos]!, markerCr: false });
      } else if (ch === '+') {
        newSeen++;
        entries.push({ kind: '+', text: l.slice(1), noNewline: false, cr: crs[pos]!, markerCr: false });
      } else if (l === MARKER) {
        const last = entries[entries.length - 1];
        if (!last) return { ok: false, reason: 'Misplaced "no newline" marker.' };
        last.noNewline = true;
        last.markerCr = crs[pos]!;
      } else {
        return { ok: false, reason: 'A hunk line does not start with a space, "-", or "+".' };
      }
      if (oldSeen > oldCount || newSeen > newCount) {
        return { ok: false, reason: 'A hunk has more lines than its header says.' };
      }
      pos++;
    }
    while (lines[pos] === MARKER) {
      const last = entries[entries.length - 1];
      if (!last) return { ok: false, reason: 'Misplaced "no newline" marker.' };
      last.noNewline = true;
      last.markerCr = crs[pos]!;
      pos++;
    }
    hunks.push({ oldStart, oldCount, newCount, oldToken, newToken, entries, headCr });
  }
  if (hunks.length === 0) return { ok: false, reason: 'The diff has no hunks.' };
  return { ok: true, diff: { oldHeader, newHeader, hunks } };
}

interface FileLine {
  text: string;
  eol: '' | '\n' | '\r\n';
}

function splitFile(content: string): FileLine[] {
  const out: FileLine[] = [];
  let start = 0;
  while (start < content.length) {
    const nl = content.indexOf('\n', start);
    if (nl === -1) {
      out.push({ text: content.slice(start), eol: '' });
      break;
    }
    const crlf = nl > start && content[nl - 1] === '\r';
    out.push({ text: content.slice(start, crlf ? nl - 1 : nl), eol: crlf ? '\r\n' : '\n' });
    start = nl + 1;
  }
  return out;
}

export function applyUnifiedDiff(content: string, diff: string): ApplyResult {
  try {
    if (typeof content !== 'string' || typeof diff !== 'string') return { ok: false, reason: 'Input must be text.' };
    const parsed = parseDiff(diff);
    if (!parsed.ok) return parsed;
    const file = splitFile(content);
    const fileEol: '\n' | '\r\n' = file[0]?.eol === '\r\n' ? '\r\n' : '\n';
    const out: FileLine[] = [];
    let cursor = 0;

    const emitFileLine = (line: FileLine): void => {
      out.push({ text: line.text, eol: line.eol });
    };
    const copyTo = (end: number): void => {
      while (cursor < end) emitFileLine(file[cursor++]!);
    };
    const closeOpenLine = (): void => {
      const prev = out[out.length - 1];
      if (prev && prev.eol === '') prev.eol = fileEol;
    };

    for (const hunk of parsed.diff.hunks) {
      const start = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
      if (start < 0) return { ok: false, reason: 'A hunk starts before the first line.' };
      if (start < cursor) return { ok: false, reason: 'Hunks overlap or are out of order.' };
      if (start + hunk.oldCount > file.length) return { ok: false, reason: 'A hunk reaches past the end of the file.' };
      copyTo(start);
      for (const e of hunk.entries) {
        if (e.kind === '+') {
          closeOpenLine();
          out.push({ text: e.text, eol: e.noNewline ? '' : fileEol });
        } else {
          const actual = file[cursor];
          if (!actual || actual.text !== e.text) {
            return { ok: false, reason: `A ${e.kind === ' ' ? 'context' : 'removed'} line does not match the file.` };
          }
          cursor++;
          if (e.kind === ' ') {
            closeOpenLine();
            emitFileLine(actual);
          }
        }
      }
    }
    copyTo(file.length);
    return { ok: true, text: out.map((l) => l.text + l.eol).join('') };
  } catch {
    return { ok: false, reason: 'The diff could not be applied.' };
  }
}

/** Returns the diff that undoes `diff`, or `null` when `diff` cannot be read. */
export function reverseUnifiedDiff(diff: string): string | null {
  try {
    const parsed = parseDiff(diff);
    if (!parsed.ok) return null;
    const lines: string[] = [parsed.diff.oldHeader, parsed.diff.newHeader];
    for (const h of parsed.diff.hunks) {
      lines.push(`@@ -${h.newToken} +${h.oldToken} @@${h.headCr ? '\r' : ''}`);
      const flipped: Entry[] = h.entries.map((e) => ({
        ...e,
        kind: e.kind === '+' ? '-' : e.kind === '-' ? '+' : ' ',
      }));
      let i = 0;
      while (i < flipped.length) {
        const e = flipped[i]!;
        if (e.kind === ' ') {
          lines.push(' ' + e.text + (e.cr ? '\r' : ''));
          if (e.noNewline) lines.push(MARKER + (e.markerCr ? '\r' : ''));
          i++;
          continue;
        }
        const run: Entry[] = [];
        while (i < flipped.length && flipped[i]!.kind !== ' ') run.push(flipped[i++]!);
        for (const kind of ['-', '+'] as const) {
          for (const r of run) {
            if (r.kind !== kind) continue;
            lines.push(kind + r.text + (r.cr ? '\r' : ''));
            if (r.noNewline) lines.push(MARKER + (r.markerCr ? '\r' : ''));
          }
        }
      }
    }
    return lines.join('\n') + '\n';
  } catch {
    return null;
  }
}

/** 32-bit FNV-1a over UTF-16 code units, as 8 lowercase hex digits. Detects change; not security. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
