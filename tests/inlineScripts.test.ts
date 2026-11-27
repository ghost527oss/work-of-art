// @node: F12.2
import { describe, expect, it } from 'vitest';
import { extractInlineScripts } from '../src/engine/checks/inlineScripts';

describe('inline scripts', () => {
  it('finds plain, javascript, and module scripts with their place', () => {
    const html = '<p>a</p>\n<script>\nvar a;\n</script>\n<script type="module">import x from "y";</script>\n<script type="text/javascript">b()</script>';
    const r = extractInlineScripts(html);
    expect(r.scripts.map((s) => [s.startLine, s.module])).toEqual([[2, false], [5, true], [6, false]]);
    expect(html.slice(r.scripts[0]!.startOffset, r.scripts[0]!.startOffset + 4)).toBe('\nvar');
  });
  it('skips src scripts and non-JavaScript types', () => {
    const types = ['application/json', 'importmap', 'text/babel', 'text/template', 'text/x-handlebars', 'speculationrules', 'text/html'];
    const html = '<script src="a.js"></script>' + types.map((t) => `<script type="${t}">{ "a": 1 }</script>`).join('');
    expect(extractInlineScripts(html).scripts).toEqual([]);
  });
  it('skips blocks with template syntax and counts them', () => {
    const r = extractInlineScripts('<script>var a = {{ x }};</script><script>var b = "<% y %>";</script><script>var c = 1;</script><script>var d = "<?php";</script>');
    expect(r.skippedTemplate).toBe(3);
    expect(r.scripts).toHaveLength(1);
  });
  it('stops at 20 blocks and says so', () => {
    const r = extractInlineScripts('<script>a()</script>'.repeat(25));
    expect(r.scripts).toHaveLength(20);
    expect(r.overLimit).toBe(true);
  });
  it('an empty script and a script that never closes do not throw', () => {
    expect(extractInlineScripts('<script></script><script>  </script>').scripts).toEqual([]);
    expect(() => extractInlineScripts('<script>var a = 1;')).not.toThrow();
  });
});
