// @node: F8.2
// One-hunk line diff with 3 lines of context. Keeps line endings; handles a missing final newline.
const MARKER = '\\ No newline at end of file';

function split(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') { out.push(text.slice(start, i + 1)); start = i + 1; }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

export function buildLineDiff(path: string, oldText: string, newText: string): string | null {
  if (oldText === newText) return null;
  const a = split(oldText);
  const b = split(newText);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const ctx = 3;
  const start = Math.max(0, pre - ctx);
  const endA = Math.min(a.length, a.length - suf + ctx);
  const endB = Math.min(b.length, b.length - suf + ctx);
  const body: string[] = [];
  const line = (sign: string, l: string, last: boolean) => {
    const noNl = !l.endsWith('\n');
    body.push(sign + l.replace(/\r?\n$/, (m) => (m === '\r\n' ? '\r' : '')));
    if (noNl && last) body.push(MARKER);
  };
  for (let i = start; i < pre; i++) line(' ', a[i]!, false);
  for (let i = pre; i < a.length - suf; i++) line('-', a[i]!, i === a.length - 1);
  for (let i = pre; i < b.length - suf; i++) line('+', b[i]!, i === b.length - 1);
  for (let i = a.length - suf; i < endA; i++) line(' ', a[i]!, i === a.length - 1);
  const oldCount = endA - start;
  const newCount = endB - start;
  const oldStart = oldCount === 0 ? start : start + 1;
  const newStart = newCount === 0 ? start : start + 1;
  return `--- a/${path}\n+++ b/${path}\n@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body.join('\n')}\n`;
}
