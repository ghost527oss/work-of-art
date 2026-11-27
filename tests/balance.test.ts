// @node: F12.2
import { describe, expect, it } from 'vitest';
import { checkBalance } from '../src/engine/checks/balance';
import { TEMPLATE_HEAVY } from './helpers/lintFixtures';

const lines = (path: string, text: string) => checkBalance(path, text).map((i) => i.line);

describe('balance check (React and TypeScript files)', () => {
  it('only .jsx, .ts, and .tsx are checked', () => {
    expect(checkBalance('a.js', 'function (')).toEqual([]);
    expect(checkBalance('a.css', '{')).toEqual([]);
  });
  it('finds a missing and an extra bracket', () => {
    expect(lines('a.ts', 'function f() {\n  if (x) {\n    go();\n}\n')).toEqual([1]);
    expect(lines('a.tsx', 'const a = [1, 2;\n')).toHaveLength(1);
    expect(lines('a.tsx', 'const a = 1;\n}\n')).toEqual([2]);
    expect(lines('a.jsx', 'export default function A() {\n  return <div>{items.map((i) => <b>{i}</b>}</div>;\n}\n')).toHaveLength(1);
  });
  it('an unclosed quote is reported in .ts only', () => {
    expect(lines('a.ts', 'const s = "abc;\nconst t = 1;\n')).toEqual([1]);
    expect(checkBalance('a.tsx', 'const s = "abc;\nconst t = 1;\n')).toEqual([]);
  });
  it('no false alarm for strings, comments, templates, and regex', () => {
    expect(checkBalance('a.ts', TEMPLATE_HEAVY)).toEqual([]);
    expect(checkBalance('a.ts', "const a = '(';\nconst b = \"}\";\n// {{{\n/* ( [ */\nconst r = /[)]+/g;\n")).toEqual([]);
    expect(checkBalance('a.ts', 'const x = `a ${ f({ a: [1] }) } b`;\n')).toEqual([]);
    expect(checkBalance('a.ts', 'const q = a / b / c;\nconst p = (a) / 2;\n')).toEqual([]);
  });
  it('no false alarm for apostrophes in page text (React files)', () => {
    expect(checkBalance('a.jsx', "export default function A() {\n  return <p>Don't forget {name}'s book</p>;\n}\n")).toEqual([]);
    expect(checkBalance('a.tsx', "const A = () => (\n  <div>\n    <p>It's fine, isn't it? {'{'}</p>\n    <a href=\"/x\">Don't</a>\n  </div>\n);\n")).toEqual([]);
    expect(checkBalance('a.jsx', 'const A = () => <div className="a">{x}</div>;\nconst B = () => <img src="a.png" />;\n')).toEqual([]);
  });
  it('a multi-line attribute text in a React file is not an error', () => {
    expect(checkBalance('a.tsx', 'const A = () => <a title="first\nsecond">x</a>;\n')).toEqual([]);
  });
  it('wording is "may", never "valid"', () => {
    const r = checkBalance('a.ts', 'function f() {\n');
    expect(r).toHaveLength(1);
    expect(r[0]!.extra).toMatch(/may/);
    expect(r[0]!.extra).not.toMatch(/valid/i);
    expect(r[0]!.skillId).toBe('scan.frontend.balance');
  });
  it('at most 3 findings, and odd input does not throw', () => {
    expect(checkBalance('a.ts', '{'.repeat(10000)).length).toBeLessThanOrEqual(3);
    for (const t of ['', '`', '/*', '"', '${', '}'.repeat(5), '\u0000']) expect(() => checkBalance('a.tsx', t)).not.toThrow();
  });
});
