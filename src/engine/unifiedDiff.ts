// @node: F2.3
// Builds a minimal unified diff that inserts exactly one line at the top of a file.
// No external dependencies.

/** Returns the comment prefix for a file path based on its extension or name. */
export function commentLineFor(path: string, text: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const name = base.toLowerCase();

  // JavaScript / TypeScript family and C-style
  const slashSlash = new Set([
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts',
    'java', 'kt', 'kts', 'cs', 'swift', 'go', 'rs', 'c', 'h',
    'cpp', 'hpp', 'php', 'scss', 'sass', 'less', 'jsonc', 'graphql', 'gql',
  ]);
  if (slashSlash.has(ext)) return `// ${text}`;

  // Hash / shell / YAML
  const hash = new Set(['py', 'rb', 'sh', 'bash', 'yml', 'yaml', 'toml']);
  const hashNames = new Set(['dockerfile', 'makefile', 'procfile', 'gemfile', 'rakefile', '.gitignore', '.editorconfig', '.nvmrc', '.env.example']);
  if (hash.has(ext) || hashNames.has(name)) return `# ${text}`;

  // SQL
  if (ext === 'sql') return `-- ${text}`;

  // CSS
  if (ext === 'css') return `/* ${text} */`;

  // HTML / markup
  const html = new Set(['html', 'htm', 'xml', 'vue', 'svelte', 'md', 'mdx']);
  if (html.has(ext)) return `<!-- ${text} -->`;

  // Everything else (json, txt, unknown): plain line
  return text;
}

const MOCK_COMMENT_TEXT = 'MOCK: example change from the PatchBay mock assistant (not a real proposal)';
// Size limit at which context is dropped to stay under 16 KB
const CONTEXT_DROP_THRESHOLD = 16 * 1024;

export interface InsertDiffOptions {
  /** Repository-relative path, used in the diff header. */
  path: string;
  /** Already-redacted file content. When absent, the zero-context form is produced. */
  content?: string;
  /** The line to insert. Defaults to commentLineFor(path, MOCK_COMMENT_TEXT). */
  comment?: string;
}

export interface DiffResult {
  diff: string;
  /** True when context was dropped because the full diff would exceed 16 KB. */
  contextDropped: boolean;
}

/** Splits text into lines, preserving each line's own ending. */
function splitLines(text: string): string[] {
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

/** True when the line has no line ending (last line without a trailing newline). */
function noNewline(line: string): boolean {
  return !line.endsWith('\n') && !line.endsWith('\r\n');
}

/**
 * Builds a unified diff that inserts `comment` as the first line of `path`.
 *
 * - With content: takes up to 3 context lines. If the full diff would exceed 16 KB,
 *   drops context and uses the zero-context form.
 * - Without content: always uses the zero-context form.
 * - Handles CRLF files, files with no trailing newline, and empty files.
 */
export function buildInsertDiff(options: InsertDiffOptions): DiffResult {
  const { path, content } = options;
  const insert = options.comment ?? commentLineFor(path, MOCK_COMMENT_TEXT);

  const header = `--- a/${path}\n+++ b/${path}\n`;

  if (content === undefined) {
    const diff = `${header}@@ -0,0 +1 @@\n+${insert}\n`;
    return { diff, contextDropped: false };
  }

  if (content.length === 0) {
    const diff = `${header}@@ -0,0 +1 @@\n+${insert}\n`;
    return { diff, contextDropped: false };
  }

  const lines = splitLines(content);
  // Determine the line ending used in the file (or use \n as the default).
  const eol = lines[0]?.includes('\r\n') ? '\r\n' : '\n';
  // The inserted line uses the file's own ending.
  const insertedLine = `${insert}${eol}`;

  // Build with up to 3 context lines.
  const ctxCount = Math.min(3, lines.length);
  const contextLines = lines.slice(0, ctxCount);
  const isLastContext = ctxCount === lines.length;

  // Old: ctxCount lines. New: 1 (inserted) + ctxCount context lines.
  const hunk = buildHunk(1, ctxCount, 1, ctxCount + 1, insertedLine, contextLines, isLastContext);
  const full = header + hunk;

  if (full.length > CONTEXT_DROP_THRESHOLD) {
    const noCtxDiff = `${header}@@ -0,0 +1 @@\n+${insert}\n`;
    return { diff: noCtxDiff, contextDropped: true };
  }

  return { diff: full, contextDropped: false };
}

function buildHunk(
  oldStart: number,
  oldCount: number,
  newStart: number,
  newCount: number,
  insertedLine: string,
  contextLines: string[],
  isLast: boolean,
): string {
  const lines: string[] = [];
  lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`);
  lines.push(`+${insertedLine}`);

  for (let i = 0; i < contextLines.length; i++) {
    const line = contextLines[i]!;
    const isLastLine = i === contextLines.length - 1;
    const isNoNewline = isLast && isLastLine && noNewline(line);
    // For the context line: if it's the last line with no trailing newline,
    // emit it WITHOUT its content (it has none), then add \n so the
    // `\ No newline` marker lands on its own separate line.
    if (isNoNewline) {
      lines.push(` ${line}\n`);
      lines.push('\\ No newline at end of file\n');
    } else {
      lines.push(` ${line}`);
    }
  }

  return lines.join('');
}
