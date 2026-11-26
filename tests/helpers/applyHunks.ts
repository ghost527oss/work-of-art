// @node: F9.6
// A second, independent, general unified-diff applier for tests (the spec-02 helper only handles
// one line inserted at the top). Strict: every context and removed line must match at the stated position.
// Lines keep their own endings; "\ No newline at end of file" strips the ending of the line before it.

export function applyHunks(content: string, diff: string): string {
  const src = splitKeep(content);
  const rows = diff.split('\n');
  if (rows[rows.length - 1] === '') rows.pop();
  let i = 0;
  while (i < rows.length && !rows[i]!.startsWith('@@')) i++;
  const out: string[] = [];
  let at = 0; // next unread source line (0-based)
  while (i < rows.length) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(rows[i]!);
    if (!m) throw new Error(`bad header ${rows[i]}`);
    const oldStart = Number(m[1]);
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const from = oldCount === 0 ? oldStart : oldStart - 1;
    if (from < at) throw new Error('hunks overlap or go backwards');
    while (at < from) out.push(src[at++]!);
    i++;
    let lastKind = '';
    while (i < rows.length && !rows[i]!.startsWith('@@')) {
      const r = rows[i]!;
      if (r.startsWith('\\')) {
        if (lastKind === '+' || lastKind === ' ') out[out.length - 1] = out[out.length - 1]!.replace(/\n$/, '');
        i++;
        continue;
      }
      const kind = r[0]!;
      const body = r.slice(1);
      const noEol = rows[i + 1]?.startsWith('\\') ?? false;
      const line = noEol ? body : body + '\n';
      if (kind === ' ' || kind === '-') {
        if (src[at] !== line) throw new Error(`mismatch at source line ${at + 1}: ${JSON.stringify(src[at])} vs ${JSON.stringify(line)}`);
        if (kind === ' ') out.push(src[at]!);
        at++;
      } else if (kind === '+') out.push(line);
      else throw new Error(`bad row ${JSON.stringify(r)}`);
      lastKind = kind;
      i++;
    }
  }
  while (at < src.length) out.push(src[at++]!);
  return out.join('');
}

function splitKeep(t: string): string[] {
  const parts = t.split(/(?<=\n)/);
  return parts.length === 1 && parts[0] === '' ? [] : parts;
}
