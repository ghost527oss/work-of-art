// @node: F12.2
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAcorn, type AcornModule } from '../src/engine/checks/acornLoader';
import { checkJsFile, explainAcornError, parseJs } from '../src/engine/checks/jsSyntax';
import { TEMPLATE_HEAVY, VALID_JS, VALID_SCRIPT } from './helpers/lintFixtures';

let acorn: AcornModule;
beforeAll(async () => { acorn = (await loadAcorn())!; });

describe('JavaScript syntax check', () => {
  it('valid fixtures give no finding', () => {
    expect(checkJsFile('a.js', VALID_JS, acorn).issues).toEqual([]);
    expect(checkJsFile('a.js', VALID_SCRIPT, acorn).issues).toEqual([]);
    expect(checkJsFile('a.js', TEMPLATE_HEAVY, acorn).issues).toEqual([]);
    expect(checkJsFile('a.js', '#!/usr/bin/env node\nconsole.log(1);\n', acorn).issues).toEqual([]);
    expect(checkJsFile('a.js', 'const x = await Promise.resolve(1);\nexport { x };\n', acorn).issues).toEqual([]);
  });
  it('.mjs is module only and .cjs is script only (top-level return allowed)', () => {
    expect(checkJsFile('a.mjs', 'import a from "./b.js";\nexport { a };\n', acorn).issues).toEqual([]);
    expect(checkJsFile('a.cjs', 'import a from "./b.js";\n', acorn).issues).toHaveLength(1);
    expect(checkJsFile('a.cjs', 'if (x) return;\nmodule.exports = 1;\n', acorn).issues).toEqual([]);
    expect(checkJsFile('a.mjs', 'if (x) return;\n', acorn).issues).toHaveLength(1);
  });
  it('a mistake gives the exact line and column and a plain message', () => {
    const r = checkJsFile('a.js', 'const a = 1;\nif (a > 0 {\n  go();\n}\n', acorn);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ skillId: 'scan.frontend.js-syntax', line: 2, column: 11 });
    expect(r.issues[0]!.extra).toBe('A symbol was found where JavaScript did not expect one. (line 2, column 11)');
  });
  it('module-then-script: a script-only file (with, octal) is fine; two failures report the one that got further', () => {
    expect(checkJsFile('a.js', 'with (o) { x = 1; }\n', acorn).issues).toEqual([]);
    const both = parseJs(acorn, 'import a from "x";\nvar = ;\n', 'either')!;
    expect(both.mode).toBe('module');
    expect(both.line).toBe(2);
    const scriptFurther = parseJs(acorn, 'with (o) { x = ; }\n', 'either')!;
    expect(scriptFurther).not.toBeNull();
  });
  it('messages come from a fixed table; names only when safe', () => {
    expect(explainAcornError("Identifier 'total' has already been declared (3:6)")).toBe('The name "total" is declared twice.');
    expect(explainAcornError("Identifier 'a b' has already been declared")).toBe('The name a name is declared twice.');
    expect(explainAcornError("Identifier 'AKIAABCDEFGHIJKLMNOP' has already been declared")).toBe('The name a name is declared twice.');
    expect(explainAcornError('Unterminated string constant (1:8)')).toBe('A quote was opened and not closed on this line.');
    expect(explainAcornError('Something new')).toBe('JavaScript could not read this part.');
    const r = checkJsFile('a.js', 'let AKIAABCDEFGHIJKLMNOP = 1;\nlet AKIAABCDEFGHIJKLMNOP = 2;\n', acorn);
    expect(r.issues[0]!.extra).not.toContain('AKIA');
  });
  it('large files, minified files, and other types are not parsed', () => {
    expect(checkJsFile('a.js', 'x'.repeat(200 * 1024 + 1), acorn)).toEqual({ issues: [], notChecked: ['too_large'] });
    expect(checkJsFile('lib.min.js', 'var = ;', acorn)).toEqual({ issues: [], notChecked: ['minified'] });
    expect(checkJsFile('a.css', 'var = ;', acorn)).toEqual({ issues: [], notChecked: [] });
    expect(checkJsFile('a.js', 'var = ;', null)).toEqual({ issues: [], notChecked: ['no_checker'] });
  });
  it('inline scripts in an HTML page get file line numbers', () => {
    const html = '<html>\n<body>\n<p>x</p>\n<script>\nvar a = 1;\nvar b = (;\n</script>\n<script>\nok();\n</script>\n</body></html>\n';
    const r = checkJsFile('p.html', html, acorn);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ line: 6 });
    const same = checkJsFile('p.html', '<script>var = ;</script>', acorn);
    expect(same.issues[0]).toMatchObject({ line: 1, column: 13 });
  });
  it('plain-JavaScript-only: the error choice never throws on odd input', () => {
    for (const code of ['', '\u0000', '((((((', '`', '/*', 'a'.repeat(5000)]) expect(() => checkJsFile('x.js', code, acorn)).not.toThrow();
  });
});
