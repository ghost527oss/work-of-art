// @node: F7.3
import { describe, expect, it } from 'vitest';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { sanitizeCss } from '../src/preview/cssSanitize';
import { POLICY_LOOK, POLICY_SCRIPTS, cspFor, sandboxFlags, IFRAME_ATTRS } from '../src/preview/previewFlags';
import { tokenizeHtml } from '../src/preview/htmlTokens';
import { INSPECTOR_SOURCE } from '../src/preview/previewBridge';

const NONCE = '0123456789abcdef';
const files = (m: Record<string, string>) => ({ effective: (p: string) => m[p], loaded: new Set(Object.keys(m)) });
const build = (m: Record<string, string>, over: Partial<Parameters<typeof buildStaticPreview>[0]> = {}) => {
  const r = buildStaticPreview({ entryPath: 'index.html', ...files(m), scripts: false, nonce: NONCE, origin: 'http://localhost:5173', ...over });
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe('flags', () => {
  it('sandbox is exactly one of two strings, and anything else is look-only', () => {
    expect(sandboxFlags(false)).toBe('allow-same-origin');
    expect(sandboxFlags(true)).toBe('allow-scripts');
    for (const v of [undefined, null, 'true', 1, {}, 'allow-scripts allow-same-origin']) expect(sandboxFlags(v)).toBe('allow-same-origin');
    for (const f of [sandboxFlags(true), sandboxFlags(false)]) {
      expect(f.split(' ')).toHaveLength(1);
      expect(f).not.toMatch(/top-navigation|popups|forms|modals|downloads|pointer-lock|presentation/);
    }
    expect(IFRAME_ATTRS).toMatchObject({ referrerPolicy: 'no-referrer', allow: '' });
  });
  it('the policies are exact', () => {
    expect(POLICY_LOOK).toBe("default-src 'none'; img-src data:; font-src data:; media-src data:; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'");
    expect(POLICY_SCRIPTS).toContain("script-src 'unsafe-inline'");
    expect(POLICY_LOOK).not.toContain('script-src');
    expect(cspFor(true)).toBe(POLICY_SCRIPTS);
    expect(cspFor('x')).toBe(POLICY_LOOK);
  });
});

describe('tokenizer', () => {
  it('handles attributes, comments, raw text, and unterminated input without throwing', () => {
    const t = tokenizeHtml('<!doctype html><DIV class=a id="b" hidden>x<!-- c --><script>if(a<b){}</script><p');
    expect(t.map((x) => x.type)).toEqual(['doctype', 'start', 'text', 'comment', 'start', 'text', 'end', 'text']);
    expect(t[1]!.attrs).toEqual([{ name: 'class', value: 'a', hasValue: true }, { name: 'id', value: 'b', hasValue: true }, { name: 'hidden', value: '', hasValue: false }]);
    expect(t[1]!.line).toBe(1);
    for (const s of ['<', '<<<', '<a href="', '<!--', '<scr', '\0<b\0>', '<a '.repeat(10000)]) expect(() => tokenizeHtml(s)).not.toThrow();
  });
});

describe('static document', () => {
  it('starts with the policy, writes allowed tags, inlines loaded styles, and annotates elements with lines', () => {
    const r = build({ 'index.html': '<!doctype html>\n<html><head><title>Hi</title><link rel="stylesheet" href="s.css"></head>\n<body class="b"><h1 id="t">Hello</h1><p>one &amp; <b>two</b></p></body></html>', 's.css': 'h1{color:#000}' });
    expect(r.html.startsWith('<!doctype html><html><head><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(r.html).toContain('<h1 id="t" data-pb="0">Hello</h1>');
    expect(r.html).toContain('h1{color:#000}');
    expect(r.html).toContain('<title>Hi</title>');
    expect(r.html).toContain('<body class="b">');
    expect(r.elements.map((e) => [e.tag, e.line])).toEqual([['h1', 3], ['p', 3], ['b', 3]]);
    expect(r.report.inlinedFiles).toBe(1);
  });
  it('replaces images with labelled placeholders and draws loaded SVGs', () => {
    const r = build({ 'index.html': '<img src="a.png" width="50" height="40" id="x"><img src="l.svg">', 'l.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
    expect(r.html).toContain('image not loaded: a.png');
    expect(r.html).toContain('width:50px;height:40px');
    expect(r.html).toContain('data:image/svg+xml;charset=utf-8,');
    expect(decodeURIComponent(r.html.match(/svg\+xml;charset=utf-8,([^"]*)"/)![1]!)).not.toContain('<script');
    expect(r.notes.join(' ')).toContain('placeholders');
  });
  it('drops event handlers and scripts in look-only mode, and writes a valid look-only policy', () => {
    const r = build({ 'index.html': '<div onclick="steal()" class="c">x</div><script>alert(1)</script><a href="https://evil.test/x" target="_blank" rel="x">go</a>' });
    expect(r.html).not.toContain('onclick');
    expect(r.html).not.toContain('alert(1)');
    expect(r.html).not.toContain('evil.test');
    expect(r.html).toContain('<a href="#"');
    expect(r.html).not.toContain('target=');
    expect(r.html).not.toContain('script-src');
    expect(r.report.blockedExternal).toEqual(['https://evil.test/x']);
  });
  it('Run scripts mode: inspector first, page scripts inlined and escaped, handlers kept, no annotation', () => {
    const r = build({ 'index.html': '<div onclick="a()">x</div><script src="app.js"></script><script>var s="</script>";</script>', 'app.js': 'var x = "</script><!-- ";' }, { scripts: true });
    expect(r.html).toContain('script-src &#39;unsafe-inline&#39;');
    expect(r.html.indexOf('var N=')).toBeLessThan(r.html.indexOf('var x ='));
    expect(r.html).toContain('<\\/script');
    expect(r.html).toContain('<\\!--');
    expect(r.html).toContain('onclick="a()"');
    expect(r.html).not.toContain('data-pb');
    expect(r.elements).toEqual([]);
    expect(() => INSPECTOR_SOURCE('bad', 'http://x')).toThrow();
    expect(() => INSPECTOR_SOURCE(NONCE, 'javascript:alert(1)')).toThrow();
  });
  it('fails cleanly when the page is missing or too large', () => {
    expect(buildStaticPreview({ entryPath: 'x.html', ...files({}), scripts: false, nonce: NONCE, origin: 'http://a' })).toEqual({ ok: false, reason: 'The page could not be read.' });
    const big = buildStaticPreview({ entryPath: 'i.html', ...files({ 'i.html': '<p>' + 'a'.repeat(1100 * 1024) + '</p>' }), scripts: false, nonce: NONCE, origin: 'http://a' });
    expect(big.ok).toBe(false);
  });
  it('the output has no data-pb collision from page attributes', () => {
    const r = build({ 'index.html': '<div data-pb="999" data-x="1">x</div>' });
    expect(r.html).toContain('data-x-x="1"');
    expect((r.html.match(/data-pb="/g) ?? []).length).toBe(1);
  });
});

describe('css sanitizer', () => {
  it('removes imports, outside urls, expression, bindings, and angle brackets', () => {
    const css = '@import url(https://evil.test/a.css);\na{background:url(https://evil.test/x.png);b:url("data:image/png;base64,AAA");width:expression(alert(1));-moz-binding:url(x);behavior:url(y)}\n</style><script>x</script>';
    const out = sanitizeCss(css);
    expect(out).not.toMatch(/@import|evil\.test|expression\(|moz-binding|behavior|</);
    expect(out).toContain('data:image/png;base64,AAA');
  });
});
