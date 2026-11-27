// @node: F12.9
import { describe, expect, it } from 'vitest';
import { base64Of } from '../src/engine/imageSniff';
import { buildStaticPreview, type StaticInput } from '../src/preview/previewDocument';
import { POLICY_LOOK, POLICY_SCRIPTS, cspFor, IFRAME_ATTRS, sandboxFlags } from '../src/preview/previewFlags';
import { PREVIEW_LIMITS } from '../src/config/previewLimits';
import { image, REAL_1X1_PNG } from './helpers/tinyImages';

const NONCE = '0123456789abcdef';
const files = (m: Record<string, string>) => ({ effective: (p: string) => m[p], loaded: new Set(Object.keys(m)) });
const PNG = { mime: 'image/png', base64: base64Of(REAL_1X1_PNG) };
const media = (m: Record<string, { mime: string; base64: string }>) => (p: string) => m[p];
function build(m: Record<string, string>, over: Partial<StaticInput> = {}) {
  const r = buildStaticPreview({ entryPath: 'index.html', ...files(m), scripts: false, nonce: NONCE, origin: 'http://localhost:5173', ...over });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe('local pictures in the preview', () => {
  it('a loaded picture is written as a real img with a data address and the allowed attributes only', () => {
    const r = build({ 'index.html': '<img src="img/dot.png" alt="a dot" width="10" onerror="x()" class="c" data-x="1">' }, { media: media({ 'img/dot.png': PNG }) });
    expect(r.html).toContain(`<img src="data:image/png;base64,${PNG.base64}"`);
    expect(r.html).toContain('alt="a dot"');
    expect(r.html).toContain('class="c"');
    expect(r.html).not.toContain('onerror');
    expect(r.html).not.toContain('image not loaded');
    expect(r.html).toMatch(/data-pb="\d+"/);
    expect(r.report.placeholders).toEqual([]);
  });
  it('a path relative to a page in a folder is resolved', () => {
    const r = build({ 'pages/p.html': '<img src="../img/dot.png">' }, { entryPath: 'pages/p.html', media: media({ 'img/dot.png': PNG }) });
    expect(r.html).toContain('data:image/png;base64,');
  });
  it('without a media lookup the behaviour is exactly as before (labelled placeholder)', () => {
    const r = build({ 'index.html': '<img src="a.png" width="50" height="40">' });
    expect(r.html).toContain('image not loaded: a.png');
    expect(r.html).toContain('width:50px;height:40px');
  });
  it('a picture that was not loaded keeps a labelled placeholder with the reason and a blocked-list entry', () => {
    const r = build({ 'index.html': '<img src="big.png"><img src="late.png"><img src="odd.png">' }, {
      media: media({}),
      mediaNote: (p) => ({ 'big.png': { text: 'too large, 200 KB', reason: 'picture_too_large' as const }, 'late.png': { text: 'over the picture budget', reason: 'picture_budget' as const } })[p],
    });
    expect(r.html).toContain('image not loaded: big.png (too large, 200 KB)');
    expect(r.html).toContain('image not loaded: late.png (over the picture budget)');
    expect(r.html).toContain('image not loaded: odd.png');
    expect(r.report.blocked.map((b) => b.reason)).toEqual(['picture_too_large', 'picture_budget', 'image_not_loaded']);
  });
  it('a stored picture whose bytes no longer match its type is not written (defence in depth)', () => {
    const wrong = { mime: 'image/png', base64: base64Of(image('jpeg')) };
    const r = build({ 'index.html': '<img src="a.png">' }, { media: media({ 'a.png': wrong }) });
    expect(r.html).not.toContain('data:image/png');
    expect(r.html).toContain('not a real picture');
    expect(r.report.blocked[0]!.reason).toBe('picture_failed');
  });
  it('url(local picture) in a loaded stylesheet and in a style block and attribute becomes a data address; other urls stay removed', () => {
    const css = '.a{background:url(../img/dot.png)} .b{background:url(https://x.test/y.png)} .c{background:url(missing.png)}';
    const r = build({ 'pages/p.html': '<link rel="stylesheet" href="../css/s.css"><style>.d{background:url("../img/dot.png")}</style><div style="background:url(../img/dot.png)">x</div>', 'css/s.css': css }, { entryPath: 'pages/p.html', media: media({ 'img/dot.png': PNG }) });
    expect(r.html.match(new RegExp(`url\\(data:image/png;base64,${PNG.base64}\\)`, 'g'))).toHaveLength(3);
    expect(r.html).not.toContain('x.test');
    expect(r.html).not.toContain('missing.png');
  });
  it('the per-document embed budget counts repeats: pictures beyond it become placeholders', () => {
    const big = { mime: 'image/png', base64: base64Of(image('png', 120 * 1024)) };
    const imgs = Array.from({ length: 20 }, () => '<img src="b.png">').join('');
    const r = build({ 'index.html': imgs }, { media: media({ 'b.png': big }) });
    const written = (r.html.match(/<img src="data:image\/png/g) ?? []).length;
    expect(written).toBeGreaterThan(5);
    expect(written).toBeLessThan(20);
    expect(written * (big.base64.length + 30)).toBeLessThanOrEqual(PREVIEW_LIMITS.maxEmbeddedMediaBytes + 4096);
    expect(r.html).toContain('too many pictures for one preview');
    expect(r.report.blocked.some((b) => b.reason === 'picture_embed_limit')).toBe(true);
    expect(r.html.length).toBeLessThan(PREVIEW_LIMITS.maxDocBytes);
  });
  it('svg handling is unchanged (a loaded text svg is still written as a data address)', () => {
    const r = build({ 'index.html': '<img src="l.svg">', 'l.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
    expect(r.html).toContain('data:image/svg+xml;charset=utf-8,');
  });
});

describe('outside pictures in the preview', () => {
  it('an allowed https picture is written with its address and the allowed attributes only; srcset is dropped', () => {
    const r = build({ 'index.html': '<img src="https://images.example.com/a.png?w=2" alt="x" srcset="https://evil.test/big.png 2x" onload="x()" width="20">' });
    expect(r.html).toContain('<img src="https://images.example.com/a.png?w=2"');
    expect(r.html).toContain('width="20"');
    expect(r.html).not.toContain('srcset');
    expect(r.html).not.toContain('evil.test');
    expect(r.html).not.toContain('onload');
    expect(r.report.placeholders).toEqual([]);
  });
  it('every rejected address is a placeholder with a plain reason and is never written', () => {
    const bad = ['http://example.com/a.png', '//example.com/a.png', 'https://user@example.com/a.png', 'https://example.com:81/a.png', 'https://127.0.0.1/a.png', 'https://localhost/a.png', 'https://nas.local/a.png', 'https://intranet/a.png', 'https://example.com/a".png', 'javascript:alert(1)'];
    for (const src of bad) {
      const r = build({ 'index.html': `<img src='${src}'>` });
      expect(r.html, src).not.toContain(`src="${src}"`);
      expect(r.html, src).toContain('image not loaded: outside address');
      expect(r.report.blocked.length, src).toBeGreaterThan(0);
    }
    const reasons = build({ 'index.html': '<img src="http://example.com/a.png"><img src="https://127.0.0.1/a.png">' }).report.blocked.map((b) => b.reason);
    expect(reasons).toEqual(['not_https', 'picture_outside_rejected']);
  });
  it('an outside address in the page\'s own CSS stays blocked', () => {
    const r = build({ 'index.html': '<style>.a{background:url(https://images.example.com/a.png)}</style><div style="background:url(https://images.example.com/b.png)">x</div>' });
    expect(r.html).not.toContain('images.example.com');
  });
  it('Preview Only styles still apply to a real picture element', () => {
    const r = build({ 'index.html': '<img src="https://images.example.com/a.png">' }, { previewStyles: [{ elementKey: 'index.html#img#1', property: 'width', value: '33px' }] });
    expect(r.html).toContain('width:33px');
  });
});

describe('policy and flags for pictures', () => {
  it('img-src is exactly data: https: in both modes and nothing else about the policy changed', () => {
    for (const p of [POLICY_LOOK, POLICY_SCRIPTS]) {
      expect(p).toContain("img-src data: https:;");
      for (const d of ["connect-src 'none'", "frame-src 'none'", "object-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'", 'media-src data:']) expect(p).toContain(d);
    }
    expect(cspFor(false)).toBe(POLICY_LOOK);
    expect(sandboxFlags(true)).toBe('allow-scripts');
    expect(sandboxFlags(false)).toBe('allow-same-origin');
    expect(IFRAME_ATTRS.referrerPolicy).toBe('no-referrer');
  });
  it('the document also says no-referrer for every request it makes', () => {
    expect(build({ 'index.html': '<p>x</p>' }).html).toContain('<meta name="referrer" content="no-referrer">');
  });
});
