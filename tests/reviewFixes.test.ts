// @node: F12.2
// Independent-review fixes: React code in .js is "not checked" (never a syntax error); JSX does not upset the bracket count.
import { describe, it, expect } from 'vitest';
import * as acorn from 'acorn';
import { checkJsFile } from '../src/engine/checks/jsSyntax';
import { checkBalance } from '../src/engine/checks/balance';

describe('review fixes', () => {
  it('a React component in a .js file is not reported as a syntax error', () => {
    const r = checkJsFile('src/App.js', 'export default function App() {\n  return <div className="a">hi</div>;\n}\n', acorn as never);
    expect(r.issues).toEqual([]);
    expect(r.notChecked).toContain('jsx');
  });
  it('a real mistake in plain JavaScript is still reported', () => {
    const r = checkJsFile('a.js', 'const a = (1 + ;\n', acorn as never);
    expect(r.issues.length).toBe(1);
  });
  it('a self-closing JSX element followed by text is not a bracket problem', () => {
    const src = 'export const X = () => (\n  <p>\n    <A x={1}/> (see <B/>)\n  </p>\n);\n';
    expect(checkBalance('X.jsx', src)).toEqual([]);
  });
  it('a real unclosed bracket is still reported', () => {
    expect(checkBalance('X.jsx', 'const a = {\n  b: [1, 2,\n};\n').length).toBe(1);
  });
});

import { splitCssRules } from '../src/engine/checks/cssCheck';
describe('review fixes: css line numbers', () => {
  it('line numbers stay right after a string cut short by a newline', () => {
    const css = 'a { content: "oops\n}\nb { color: red }\n}\n';
    const r = splitCssRules(css);
    // the stray closing brace on the 4th line must be reported on line 4
    expect(r.braceProblems.some((b) => b.line === 4)).toBe(true);
  });
});
