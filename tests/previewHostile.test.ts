// @node: F7.3
import { describe, expect, it } from 'vitest';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { tokenizeHtml } from '../src/preview/htmlTokens';

const NONCE = '0123456789abcdef';
function build(html: string, scripts = false) {
  const r = buildStaticPreview({ entryPath: 'i.html', effective: () => html, loaded: new Set(['i.html']), scripts, nonce: NONCE, origin: 'http://localhost:5173' });
  if (!r.ok) throw new Error(r.reason);
  return r.html;
}
/** Everything after the head (the page's own part). */
const bodyOf = (h: string) => h.slice(h.indexOf('<body'));
/** No attribute on any start tag of the output is an event handler. */
const noHandlerAttrs = (html: string) => tokenizeHtml(html).every((t) => t.type !== 'start' || (t.attrs ?? []).every((a) => !/^on/i.test(a.name)));
const DANGEROUS = /<(?:iframe|object|embed|base|meta|frame|frameset|applet|portal|template|foreignobject|use|image|link|noscript|script)\b/i;

describe('hostile pages (look-only)', () => {
  const pages: Record<string, string> = {
    'meta refresh': '<meta http-equiv="refresh" content="0;url=https://evil.test"><p>x</p>',
    'meta in odd places': '<p><meta http-equiv=refresh content="0;url=//evil.test">a</p><div <meta http-equiv=refresh>',
    'case and null tricks': '<ScRiPt>alert(1)</sCrIpT><IFRAME src=//evil.test></IFRAME><img src=x onerror=alert(1)><\0script>alert(1)</script>',
    'iframe object embed base': '<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><base href="https://evil.test/">',
    'svg tricks': '<svg><script>alert(1)</script><use href="https://evil.test/x.svg#a"/><foreignObject><iframe src=x></iframe></foreignObject><image href="https://evil.test/a.png"/><circle r="5" onload="alert(1)"/></svg>',
    'event handlers and javascript urls': '<a href="javascript:alert(1)" onclick="alert(1)">x</a><div onmouseover="alert(1)" style="background:url(https://evil.test/a.png)">y</div><form action="https://evil.test"><input formaction="https://evil.test"></form>',
    'style breakouts': '<style>a{background:url(https://evil.test/x)}</style><style>/*</style><script>alert(1)</script>*/</style><p style="width:expression(alert(1))">x</p>',
    'template and noscript': '<template><script>alert(1)</script></template><noscript><img src=x onerror=alert(1)></noscript>',
    'custom tags': '<x-evil onclick="1"><my-tag href="javascript:1">t</my-tag></x-evil>',
    'attribute smuggling': '<div title="a&quot; onmouseover=&quot;alert(1)" class=\'x" onclick="1\'>z</div>',
    'unterminated': '<div class="a" <script>alert(1)',
    'comments': '<!--><script>alert(1)</script><!-- <script>alert(2)</script> --><p>ok</p>',
  };
  for (const [name, page] of Object.entries(pages)) {
    it(name, () => {
      const out = build(page);
      const body = bodyOf(out);
      expect(body).not.toMatch(DANGEROUS);
      expect(noHandlerAttrs(out)).toBe(true);
      expect(out).not.toMatch(/href="javascript:/i);
      expect(out).not.toContain('evil.test');
      // exactly one policy meta and it is the first element in the head
      expect((out.match(/<meta http-equiv=/g) ?? []).length).toBe(1);
      expect(out.startsWith('<!doctype html><html><head><meta http-equiv="Content-Security-Policy"')).toBe(true);
      expect(out).not.toContain("script-src");
    });
  }
  it('smuggled markup in text becomes visible escaped text', () => {
    const out = build('<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>');
    expect(out).toContain('&amp;lt;script&amp;gt;');
    expect(bodyOf(out)).not.toMatch(/<script/i);
  });
  it('a fuzz of random token soups never throws, never emits a forbidden tag, and stays linear', () => {
    let seed = 99;
    const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor((seed / 2 ** 32) * n); };
    const bits = ['<', '>', '</', '<script>', '</script>', '<meta http-equiv=refresh>', '<iframe>', '"', "'", '=', ' ', 'on', 'click', '<!--', '-->', '<img ', 'src=', 'x', '<a href=', '<svg>', '<use ', '<style>', '</style>', '\0', '&', '<p>'];
    const t = Date.now();
    for (let i = 0; i < 400; i++) {
      let s = '';
      for (let j = 0; j < 40; j++) s += bits[rnd(bits.length)];
      expect(() => tokenizeHtml(s)).not.toThrow();
      const r = buildStaticPreview({ entryPath: 'i.html', effective: () => s, loaded: new Set(['i.html']), scripts: false, nonce: NONCE, origin: 'http://a' });
      if (r.ok) { expect(bodyOf(r.html)).not.toMatch(/<(?:iframe|object|embed|base|meta|script|use|image|template)\b/i); expect(noHandlerAttrs(r.html)).toBe(true); }
    }
    expect(Date.now() - t).toBeLessThan(5000);
  });
  it('huge pages stay under the bounds', () => {
    const t = Date.now();
    const r = buildStaticPreview({ entryPath: 'i.html', effective: () => '<div>'.repeat(20000) + 'x', loaded: new Set(['i.html']), scripts: false, nonce: NONCE, origin: 'http://a' });
    expect(Date.now() - t).toBeLessThan(3000);
    if (r.ok) expect(r.elements.length).toBeLessThanOrEqual(5000);
  });
});

describe('references that are not loaded files', () => {
  it('external and missing stylesheets, scripts, and images are dropped and counted', () => {
    const r = buildStaticPreview({
      entryPath: 'i.html', effective: () => '<link rel="stylesheet" href="https://evil.test/a.css"><link rel="stylesheet" href="missing.css"><img src="https://evil.test/a.png"><script src="https://evil.test/a.js"></script><a href="//evil.test">x</a>',
      loaded: new Set(['i.html']), scripts: false, nonce: NONCE, origin: 'http://a',
    });
    if (!r.ok) throw new Error('x');
    expect(r.html).not.toContain('evil.test');
    expect(r.report.blockedExternal.length).toBeGreaterThanOrEqual(3);
    expect(r.report.placeholders).toHaveLength(1);
  });
});
