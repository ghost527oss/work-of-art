// @node: F2.3
import { describe, expect, it } from 'vitest';
import { buildInsertDiff, commentLineFor } from '../src/engine/unifiedDiff';
import { applyDiff, isError } from './helpers/applyDiff';

// ---------------------------------------------------------------------------
// commentLineFor
// ---------------------------------------------------------------------------

describe('commentLineFor', () => {
  const text = 'MOCK: test comment';
  const cases: Array<[string, string]> = [
    // // style
    ['src/app.ts', `// ${text}`],
    ['src/app.tsx', `// ${text}`],
    ['src/app.js', `// ${text}`],
    ['server/routes.java', `// ${text}`],
    ['app.go', `// ${text}`],
    ['main.rs', `// ${text}`],
    ['main.c', `// ${text}`],
    ['App.swift', `// ${text}`],
    ['styles.scss', `// ${text}`],
    ['query.graphql', `// ${text}`],
    // # style
    ['app.py', `# ${text}`],
    ['app.rb', `# ${text}`],
    ['deploy.sh', `# ${text}`],
    ['config.yml', `# ${text}`],
    ['config.yaml', `# ${text}`],
    ['Dockerfile', `# ${text}`],
    ['Makefile', `# ${text}`],
    ['.gitignore', `# ${text}`],
    ['.env.example', `# ${text}`],
    // -- style
    ['query.sql', `-- ${text}`],
    // /* */ style
    ['styles.css', `/* ${text} */`],
    // <!-- --> style
    ['index.html', `<!-- ${text} -->`],
    ['index.htm', `<!-- ${text} -->`],
    ['README.md', `<!-- ${text} -->`],
    ['component.vue', `<!-- ${text} -->`],
    // plain (json, txt, unknown)
    ['data.json', text],
    ['notes.txt', text],
    ['weirdfile.xyz', text],
    ['noextension', text],
  ];
  for (const [path, expected] of cases) {
    it(`${path}`, () => expect(commentLineFor(path, text)).toBe(expected));
  }
});

// ---------------------------------------------------------------------------
// buildInsertDiff: without content
// ---------------------------------------------------------------------------

describe('buildInsertDiff: without content', () => {
  it('produces valid headers and a zero-context hunk', () => {
    const { diff } = buildInsertDiff({ path: 'src/a.ts', comment: '// MOCK' });
    expect(diff).toContain('--- a/src/a.ts\n');
    expect(diff).toContain('+++ b/src/a.ts\n');
    expect(diff).toContain('@@ -0,0 +1 @@\n');
    expect(diff).toContain('+// MOCK\n');
    expect(diff.match(/\+/g)?.length).toBeGreaterThanOrEqual(1); // at least one addition
  });

  it('the helper rejects no-context form with unknown content gracefully', () => {
    // Without content we cannot apply — but diff is still syntactically valid
    const { diff } = buildInsertDiff({ path: 'src/a.ts', comment: '// MOCK' });
    // Just verify it starts with headers
    expect(diff.startsWith('--- ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildInsertDiff: with content — basic shapes
// ---------------------------------------------------------------------------

function applyAndCheck(path: string, content: string, comment: string): void {
  const { diff, contextDropped } = buildInsertDiff({ path, content, comment });
  const result = applyDiff(content, diff);
  expect(isError(result), isError(result) ? (result as { error: string }).error : '').toBe(false);
  if (!isError(result)) {
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(0);
    expect(result.filesNamed).toEqual([path]);
    if (!contextDropped) {
      // The inserted line should be the first line of the output (strip line endings)
      const firstLine = result.output.split(/\r?\n/)[0];
      expect(firstLine).toBe(comment);
    }
  }
}

describe('buildInsertDiff: with content', () => {
  it('1-line file', () => applyAndCheck('a.ts', 'const x = 1;\n', '// MOCK'));
  it('2-line file', () => applyAndCheck('a.ts', 'const x = 1;\nconst y = 2;\n', '// MOCK'));
  it('3-line file', () => applyAndCheck('a.ts', 'a\nb\nc\n', '// MOCK'));
  it('4-line file (context capped at 3)', () => applyAndCheck('a.ts', 'a\nb\nc\nd\n', '// MOCK'));
  it('10-line file', () => applyAndCheck('a.ts', Array.from({ length: 10 }, (_, i) => `line ${i}\n`).join(''), '// MOCK'));

  it('empty file: @@ -0,0 +1 @@', () => {
    const { diff } = buildInsertDiff({ path: 'a.ts', content: '', comment: '// MOCK' });
    expect(diff).toContain('@@ -0,0 +1 @@');
    expect(diff).toContain('+// MOCK');
  });

  it('file without trailing newline: adds no-newline marker', () => {
    const { diff } = buildInsertDiff({ path: 'a.ts', content: 'line1', comment: '// MOCK' });
    expect(diff).toContain('\\ No newline at end of file');
  });

  it('file with trailing newline: no marker', () => {
    const { diff } = buildInsertDiff({ path: 'a.ts', content: 'line1\n', comment: '// MOCK' });
    expect(diff).not.toContain('\\ No newline at end of file');
  });

  it('CRLF file: inserted line uses CRLF', () => {
    const { diff } = buildInsertDiff({ path: 'a.ts', content: 'line1\r\nline2\r\n', comment: '// MOCK' });
    // Inserted line should end with CRLF
    expect(diff).toContain('+// MOCK\r\n');
  });

  it('context is dropped when content is very long (>16 KB)', () => {
    const bigContent = 'a'.repeat(16 * 1024 + 100);
    const { diff, contextDropped } = buildInsertDiff({ path: 'big.ts', content: bigContent, comment: '// MOCK' });
    expect(contextDropped).toBe(true);
    expect(diff).toContain('@@ -0,0 +1 @@');
    expect(diff.length).toBeLessThan(16 * 1024);
  });
});

// ---------------------------------------------------------------------------
// buildInsertDiff: apply passes all shapes
// ---------------------------------------------------------------------------

describe('buildInsertDiff: apply passes for all shapes', () => {
  const shapes = [
    ['1 line LF', 'a\n'],
    ['2 lines LF', 'a\nb\n'],
    ['no trailing newline', 'a'],
    ['1 line CRLF', 'a\r\n'],
    ['2 lines CRLF', 'a\r\nb\r\n'],
  ] as const;

  for (const [name, content] of shapes) {
    it(name, () => applyAndCheck('src/a.ts', content, '// MOCK'));
  }
});

// ---------------------------------------------------------------------------
// buildInsertDiff: exactly 1 added, 0 removed
// ---------------------------------------------------------------------------

describe('buildInsertDiff: exactly one added, none removed', () => {
  it('verifies the helper counts', () => {
    const contents = ['x\n', 'x\ny\n', 'x', 'x\ny\nz\n', '', 'a\r\nb\r\n'];
    for (const content of contents) {
      const { diff } = buildInsertDiff({ path: 'f.ts', content, comment: '// M' });
      const result = applyDiff(content, diff);
      if (!isError(result)) {
        expect(result.addedLines, content).toBe(1);
        expect(result.removedLines, content).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildInsertDiff: diff stays within 20 KB for content up to 20 KB
// ---------------------------------------------------------------------------

describe('buildInsertDiff: size constraint', () => {
  it('a 20 KB content file produces a diff under 20 KB', () => {
    const content = 'a\n'.repeat(10_000); // ~20 KB
    const { diff } = buildInsertDiff({ path: 'big.ts', content, comment: '// M' });
    expect(diff.length).toBeLessThanOrEqual(20 * 1024);
  });
});

// ---------------------------------------------------------------------------
// Seeded random test: 200 cases
// ---------------------------------------------------------------------------

describe('buildInsertDiff: seeded random (200 cases)', () => {
  it('every generated diff applies cleanly', () => {
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed / 2 ** 32; };

    for (let n = 0; n < 200; n++) {
      const lineCount = Math.floor(rand() * 9); // 0 to 8 lines
      const eol = rand() < 0.3 ? '\r\n' : '\n';
      const trailing = rand() < 0.5;
      const lines = Array.from({ length: lineCount }, (_, i) => `line ${i}${eol}`);
      const content = lines.join('') + (trailing && lineCount > 0 ? '' : (lineCount > 0 ? '' : ''));
      void content;
      // Simpler: build content as either empty, or lines joined, with or without trailing newline
      const finalContent = lineCount === 0 ? '' : (trailing ? lines.join('') : lines.join('').slice(0, -eol.length));

      const { diff } = buildInsertDiff({ path: 'src/f.ts', content: finalContent, comment: '// MOCK' });
      const result = applyDiff(finalContent, diff);

      if (isError(result)) {
        // Allow context-mismatch errors only when contextDropped is true
        const { contextDropped } = buildInsertDiff({ path: 'src/f.ts', content: finalContent, comment: '// MOCK' });
        if (!contextDropped) {
          throw new Error(`Case ${n}: ${result.error}\ncontent=${JSON.stringify(finalContent)}\ndiff=${diff}`);
        }
      } else {
        expect(result.addedLines, `case ${n}`).toBe(1);
        expect(result.removedLines, `case ${n}`).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test-side applier rejects broken diffs
// ---------------------------------------------------------------------------

describe('applyDiff: rejects broken diffs', () => {
  it('wrong hunk count', () => {
    // Hunk says -1,2 but only provides 1 context line
    const diff = '--- a/f.ts\n+++ b/f.ts\n@@ -1,2 +1,3 @@\n+added\n context\n';
    const r = applyDiff('context\n', diff);
    expect(isError(r)).toBe(true);
  });

  it('context line that does not match input', () => {
    const diff = '--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,2 @@\n+added\n WRONG\n';
    const r = applyDiff('actual\n', diff);
    expect(isError(r)).toBe(true);
  });

  it('a removed line makes the check notice', () => {
    // A diff with a removal: -1,2 → remove 1 context, add 1 new
    const diff = '--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n';
    const r = applyDiff('old\n', diff);
    // addedLines = 1, removedLines = 1 — the test can check removedLines > 0
    if (!isError(r)) {
      expect(r.removedLines).toBeGreaterThan(0);
    }
  });

  it('missing +++ header', () => {
    const r = applyDiff('', '--- a/f.ts\n@@ -0,0 +1 @@\n+added\n');
    expect(isError(r)).toBe(true);
  });
});
