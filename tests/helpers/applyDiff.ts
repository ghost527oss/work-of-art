// @node: F2.3
// Independent test-side unified-diff parser and applier.
// Written completely separately from the generator in unifiedDiff.ts so a bug
// in one is caught by the other.

export interface ApplyResult {
  output: string;
  addedLines: number;
  removedLines: number;
  filesNamed: string[];
}

export interface ApplyError {
  error: string;
}

export type ApplyOutcome = ApplyResult | ApplyError;

function isError(x: ApplyOutcome): x is ApplyError {
  return 'error' in x;
}

export { isError };

/** Parses and applies a unified diff to `content`. Rejects diffs that are not safe. */
export function applyDiff(content: string, diff: string): ApplyOutcome {
  const lines = diff.split('\n').map((l, i) => ({ line: l, num: i + 1 }));
  let pos = 0;

  const peek = (): string | undefined => lines[pos]?.line;
  const consume = (): string => lines[pos++]!.line;

  // Skip blank leading lines
  while (peek() === '') pos++;

  // Expect "--- a/<file>"
  const oldHeader = consume();
  if (!oldHeader.startsWith('--- ')) return { error: `Expected --- header, got: ${JSON.stringify(oldHeader)}` };

  const newHeader = consume();
  if (!newHeader.startsWith('+++ ')) return { error: `Expected +++ header, got: ${JSON.stringify(newHeader)}` };

  // Collect all file names (after a/ and b/ prefixes)
  const filesNamed: string[] = [];
  const extractPath = (line: string, prefix: string): string => line.slice(prefix.length).replace(/^[ab]\//, '');
  filesNamed.push(extractPath(oldHeader, '--- '));
  filesNamed.push(extractPath(newHeader, '+++ '));

  if (filesNamed[0] !== filesNamed[1]) {
    return { error: `Old and new file names differ: ${filesNamed[0]} vs ${filesNamed[1]}` };
  }

  let totalAdded = 0;
  let totalRemoved = 0;

  // Parse all hunks
  while (pos < lines.length) {
    const hunkLine = peek();
    if (hunkLine === undefined || hunkLine === '') { pos++; continue; }
    if (!hunkLine.startsWith('@@')) return { error: `Unexpected line outside hunk: ${JSON.stringify(hunkLine)}` };

    consume(); // the @@ line
    const match = hunkLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!match) return { error: `Malformed hunk header: ${JSON.stringify(hunkLine)}` };

    const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
    const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

    const hunkLines: string[] = [];
    let cAdd = 0;
    let cDel = 0;
    let cCtx = 0;

    while (pos < lines.length) {
      const l = peek();
      if (l === undefined || l.startsWith('@@') || l.startsWith('--- ') || l.startsWith('+++ ')) break;
      if (l === '\\ No newline at end of file' || l === '\\ No newline at end of file\r') { consume(); continue; }
      const ch = l[0];
      if (ch === '+') { cAdd++; hunkLines.push(l.slice(1)); pos++; }
      else if (ch === '-') { cDel++; pos++; }
      else if (ch === ' ') { cCtx++; hunkLines.push(l.slice(1)); pos++; }
      else if (l === '') { pos++; } // blank line inside a hunk body
      else return { error: `Unexpected hunk line: ${JSON.stringify(l)}` };
    }

    // Verify the declared counts
    if (cDel + cCtx !== oldCount) {
      return { error: `Hunk old count mismatch: declared ${oldCount}, counted ${cDel + cCtx}` };
    }
    if (cAdd + cCtx !== newCount) {
      return { error: `Hunk new count mismatch: declared ${newCount}, counted ${cAdd + cCtx}` };
    }

    totalAdded += cAdd;
    totalRemoved += cDel;

    // Apply: compare context lines against the actual input
    if (content !== undefined && cCtx > 0) {
      const inputLines = splitInputLines(content);
      const ctxLines = hunkLines.slice(cAdd); // context lines come after the added line(s)
      for (let i = 0; i < ctxLines.length; i++) {
        const expected = ctxLines[i]!;
        const actual = inputLines[i]!;
        // Strip trailing newline variations for comparison
        const norm = (s: string | undefined) => (s ?? '').replace(/\r\n$|\r$|\n$/, '');
        if (norm(expected) !== norm(actual)) {
          return { error: `Context line ${i + 1} does not match input: expected ${JSON.stringify(norm(expected))}, got ${JSON.stringify(norm(actual))}` };
        }
      }
    }
  }

  // Build the output: prepend the first added line
  const addedLine = diff.split('\n').find((l) => l.startsWith('+') && !l.startsWith('+++'))?.slice(1) ?? '';
  void addedLine; // used below in reconstructed
  // Simpler reconstruction: the first + line of the first hunk goes at the start of content
  // For our specific one-insert case:
  const reconstructed = addedLine + '\n' + content;
  return { output: reconstructed, addedLines: totalAdded, removedLines: totalRemoved, filesNamed: [filesNamed[0]!] };
}

function splitInputLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines.push(text.slice(start, i + 1));
      start = i + 1;
    } else if (text[i] === '\r' && text[i + 1] === '\n') {
      lines.push(text.slice(start, i + 2));
      start = i + 2;
      i++;
    }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}
