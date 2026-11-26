// @node: F9.6
// Multi-hunk unified diff with 3 lines of context. Keeps line endings and the "no newline" marker.
import { diffLines, type Op } from './diffLines';

const MARKER = '\\ No newline at end of file';

function split(text: string): string[] {
  const out: string[] = [];
  let s = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') { out.push(text.slice(s, i + 1)); s = i + 1; }
  if (s < text.length) out.push(text.slice(s));
  return out;
}

export function buildUnifiedDiff(path: string, oldText: string, newText: string, context = 3, workLimit?: number): string | null {
  if (oldText === newText) return null;
  const a = split(oldText);
  const b = split(newText);
  const ops = diffLines(a, b, workLimit);
  const changes = ops.map((o, i) => (o.kind === 'equal' ? -1 : i)).filter((i) => i >= 0);
  if (changes.length === 0) return null;
  // group change indices into hunks (merge when the gap of equal lines is <= 2 * context)
  const groups: Array<[number, number]> = [];
  for (const i of changes) {
    const g = groups[groups.length - 1];
    if (g && i - g[1] - 1 <= 2 * context) g[1] = i; else groups.push([i, i]);
  }
  const lines: string[] = [`--- a/${path}`, `+++ b/${path}`];
  for (const [s, e] of groups) {
    const from = Math.max(0, s - context);
    const to = Math.min(ops.length - 1, e + context);
    const slice: Op[] = ops.slice(from, to + 1);
    const oldLines = slice.filter((o) => o.kind !== 'insert');
    const newLines = slice.filter((o) => o.kind !== 'delete');
    const firstA = oldLines[0]?.a ?? slice[0]!.a;
    const firstB = newLines[0]?.b ?? slice[0]!.b;
    const head = (start: number, count: number) => (count === 0 ? `${start},0` : count === 1 ? `${start + 1}` : `${start + 1},${count}`);
    lines.push(`@@ -${head(firstA, oldLines.length)} +${head(firstB, newLines.length)} @@`);
    for (const o of slice) {
      const t = o.kind === 'insert' ? b[o.b]! : a[o.a]!;
      const sign = o.kind === 'equal' ? ' ' : o.kind === 'delete' ? '-' : '+';
      lines.push(sign + t.replace(/\n$/, ''));
      const last = o.kind === 'insert' ? o.b === b.length - 1 : o.a === a.length - 1;
      if (!t.endsWith('\n') && (last || (o.kind === 'equal' && o.b === b.length - 1))) lines.push(MARKER);
    }
  }
  return lines.join('\n') + '\n';
}
