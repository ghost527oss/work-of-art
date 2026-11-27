// @node: F12.13
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/engine/analyzeProject';
import { setCssProbe } from '../src/engine/checks/cssProbe';
import { runCodeChecks } from '../src/engine/checks';
import { loadAcorn } from '../src/engine/checks/acornLoader';
import { scanProject } from '../src/engine/scanProject';
import { evaluateLint } from '../src/preview/linter';
import { buildMeasuredFindings } from '../src/preview/linterFindings';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { keepsAll } from './helpers/fakeCssProbe';
import { box, resetIds } from './helpers/lintFixtures';
import { snapshotOf } from './helpers/analyzeFixture';

afterEach(() => setCssProbe(null));
const timed = <T>(fn: () => T, ms = 4000): T => { const t = performance.now(); const r = fn(); expect(performance.now() - t).toBeLessThan(ms); return r; };

describe('hostile repository text finishes within the limits', () => {
  it('a 1 MB line in JavaScript, HTML, and CSS is skipped as too large and nothing throws', async () => {
    await loadAcorn();
    setCssProbe(keepsAll);
    const big = 'x'.repeat(1024 * 1024);
    for (const [path, text] of [['a.js', `var s = "${big}`], ['a.html', `<p>${big}`], ['a.css', `a { b: ${big}`], ['a.tsx', `const s = "${big}`]] as const) {
      const r = timed(() => runCodeChecks(path, text));
      expect(r.issues, path).toEqual([]);
      if (path !== 'a.tsx') expect(r.notChecked, path).toContain('too_large');
    }
  });
  it('40,000 nested tags and 10,000 braces give a capped, plain result', async () => {
    await loadAcorn();
    setCssProbe(keepsAll);
    const tags = timed(() => runCodeChecks('a.html', '<div>'.repeat(40_000)));
    expect(tags.issues.length).toBeLessThanOrEqual(10);
    const css = timed(() => runCodeChecks('a.css', 'a{'.repeat(10_000)));
    expect(css.issues.length).toBeLessThanOrEqual(20);
    const js = timed(() => runCodeChecks('a.js', '{'.repeat(10_000)));
    expect(js.issues).toHaveLength(1);
    const ts = timed(() => runCodeChecks('a.ts', '{'.repeat(10_000)));
    expect(ts.issues.length).toBeLessThanOrEqual(3);
  });
  it('a closing style tag inside CSS, a closing script tag inside a string, and odd inline scripts do not throw', async () => {
    await loadAcorn();
    setCssProbe(keepsAll);
    for (const [path, text] of [['a.css', 'a { content: "</style>" } b { c: d'], ['p.html', '<script>var s = "</script>"; var = ;</script>'], ['p.html', '<style>a{b:c</style><script>if (</script>'], ['p.html', '<script type="module">'.repeat(30)]] as const) expect(() => runCodeChecks(path, text), path).not.toThrow();
  });
  it('a 2,000-file repository of broken files is scanned within the scan limits with a plain partial note', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 300; i++) files[`f${i}.js`] = 'var = ;\n';
    const snapshot = snapshotOf(files);
    const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
    const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
    const r = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, { yieldToMain: async () => undefined });
    expect(r.findings.filter((f) => f.skillId === 'scan.frontend.js-syntax')).toHaveLength(50);
    expect(r.partialReasons.join(' ')).toMatch(/Limit of 50 findings/);
  });
});

describe('hostile pages in the preview', () => {
  it('a <script src> to an outside host, a lookalike CDN host, and an outside style are never written in Look-only mode', () => {
    const html = '<link rel="stylesheet" href="https://cdn.jsdelivr.net.evil.test/a.css"><script src="https://cdn.jsdelivr.net/a.js"></script><script src="https://evil.test/a.js"></script><p>x</p>';
    const r = buildStaticPreview({ entryPath: 'i.html', effective: () => html, loaded: new Set(['i.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' });
    if (!r.ok) throw new Error('x');
    expect(r.html).not.toContain('<script');
    const body = r.html.slice(r.html.indexOf('<body'));
    expect(r.html).not.toContain('evil.test');
    expect(body).not.toContain('cdn.jsdelivr.net');
    expect(r.html).not.toContain('<link');
    expect(r.report.outsideScripts).toEqual([]);
  });
  it('a 5,000-element page builds, is measured as plain data, and the findings stay capped', () => {
    resetIds();
    const html = Array.from({ length: 5000 }, (_, i) => `<div id="d${i}">x</div>`).join('');
    const built = timed(() => buildStaticPreview({ entryPath: 'i.html', effective: () => html, loaded: new Set(['i.html']), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' }));
    if (!built.ok) throw new Error(built.reason);
    expect(built.elements.length).toBeLessThanOrEqual(5000);
    const ms = built.elements.map((e, i) => box({ id: e.id, tag: 'div', parentKey: Math.floor(i / 50), left: (i % 50) * 5, top: 0, width: 10, height: 10, hasText: true, fontSize: 8 }));
    const out = timed(() => ({ widths: [375, 768, 1024].map((width) => ({ width, lint: evaluateLint(ms, width, () => undefined) })) }));
    const built2 = timed(() => buildMeasuredFindings({ overflow: [], perWidth: out.widths, elements: built.elements, effective: () => html, cssRules: [] }));
    expect(built2.findings.length).toBeLessThanOrEqual(100);
    expect(built2.partialReasons.join(' ')).toMatch(/Limit of 25 findings/);
  });
  it('picture addresses and scripts that look like markup cannot break out of an attribute', () => {
    const html = `<img src='https://images.example.com/a.png" onerror="alert(1)'><img src="https://images.example.com/a.png?x=&quot;onerror=1"><script src="https://code.jquery.com/a.js&quot;></script><script>">`;
    const r = buildStaticPreview({ entryPath: 'i.html', effective: () => html, loaded: new Set(['i.html']), scripts: true, nonce: '0123456789abcdef', origin: 'http://a' });
    if (!r.ok) throw new Error('x');
    expect(r.html).not.toMatch(/\sonerror\s*=/);
    expect(r.html).not.toMatch(/\sonload\s*=/);
  });
});
