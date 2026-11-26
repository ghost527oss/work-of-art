// @node: F7.4
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { RateLimiter, validateBridgeEvent, INSPECTOR_SOURCE, BridgeMessageSchema } from '../src/preview/previewBridge';
import { evaluateOverflow, layoutFindings, type Measurement } from '../src/preview/layoutCheck';
import { detectPreviewMode, findEntryPage, modeChoices } from '../src/preview/previewMode';
import { groupFiles, viewerLines } from '../src/preview/sourceView';
import { buildWorkbench, defaultComponent, listComponents } from '../src/preview/workbenchDocument';
import { extractSvelte, extractVue } from '../src/preview/templateExtract';
import { findComponents, jsxToHtml, parseJsx } from '../src/preview/jsxExtract';
import { snapshotOf } from './helpers/analyzeFixture';

describe('mode detection', () => {
  it('static site is static; react frontend is the workbench; full-stack API client is static', () => {
    expect(detectPreviewMode(buildSampleSnapshot('static-site', 1))).toMatchObject({ mode: 'static', entryPath: 'index.html' });
    expect(detectPreviewMode(buildSampleSnapshot('react-frontend', 1))).toMatchObject({ mode: 'workbench', entryPath: 'index.html' });
    const full = detectPreviewMode(buildSampleSnapshot('fullstack-api', 1));
    expect(full).toMatchObject({ mode: 'static', entryPath: 'client/index.html' });
  });
  it('no page means Source Inspection with the fixed reason; a framework with no component too', () => {
    const lib = detectPreviewMode(snapshotOf({ 'src/a.py': 'x = 1\n' }));
    expect(lib).toMatchObject({ mode: 'source', reason: 'No web page was found. This looks like a backend or a library.' });
    const fw = detectPreviewMode(snapshotOf({ 'package.json': '{"dependencies":{"react":"1"}}', 'index.html': '<div id="root"></div>', 'src/a.ts': 'export const a = 1;\n' }));
    expect(fw.mode).toBe('source');
  });
  it('entry page order and the choices list', () => {
    expect(findEntryPage(['z.html', 'public/index.html', 'index.html'])).toBe('index.html');
    expect(findEntryPage(['z.html', 'public/index.html'])).toBe('public/index.html');
    expect(findEntryPage(['a/b/index.html', 'a/index.html', 'z.html'])).toBe('a/index.html');
    expect(findEntryPage(['z.html', 'b.html'])).toBe('b.html');
    expect(findEntryPage(['a.py'])).toBeUndefined();
    expect(modeChoices({ mode: 'source', reason: '', hasComponents: false })).toEqual(['source']);
    expect(modeChoices({ mode: 'static', reason: '', entryPath: 'i.html', hasComponents: true })).toEqual(['static', 'workbench', 'source']);
  });
});

describe('workbench', () => {
  it('finds components, converts JSX, shows placeholders for expressions, and inlines children', async () => {
    const snap = buildSampleSnapshot('react-frontend', 1);
    const paths = snap.files.filter((f) => f.content !== undefined).map((f) => f.path);
    const effective = (p: string) => snap.files.find((f) => f.path === p)?.content;
    const analysis = await analyzeProject(snap, { yieldToMain: async () => undefined });
    const list = listComponents({ paths, effective });
    expect(list.map((c) => c.name).sort()).toEqual(['App', 'LoginForm']);
    expect(defaultComponent(list)!.name).toBe('App');
    const r = buildWorkbench({ paths, effective, analysis, nonce: '0123456789abcdef', origin: 'http://a' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.html).toMatch(/<h1 data-pb="\d+">Sample app<\/h1>/);
    expect(r.html).toMatch(/<form data-pb="\d+">/);
    expect(r.html).toContain('class="pb-expr"');
    expect(r.html).not.toMatch(/onsubmit|onchange|onclick/i);
    // 2E-2: workbench elements are annotated, but never mappable (the picture is approximate).
    expect(r.elements.length).toBeGreaterThan(0);
    expect(r.elements.every((e) => e.mappable === false && e.reason === 'This element comes from a component picture, which is approximate.')).toBe(true);
    expect(r.html).toContain('font-family');
  });
  it('class names, htmlFor, literal styles, and boxes for unknown components; a bad component is isolated', () => {
    const src = "export function A() { return (<div className=\"x\" style={{ marginTop: 4, color: 'red' }} onClick={f}><label htmlFor=\"a\">L</label><B /><C {...p} key={1} ref={r} /></div>); }\nfunction B() { return <i>b</i>; }\nfunction Broken() { return <div><span></div>; }\n";
    const found = findComponents('a.tsx', src);
    expect(found.map((c) => [c.name, !!c.error])).toEqual([['A', false], ['B', false], ['Broken', true]]);
    const by = new Map(found.map((c) => [c.name, c]));
    const html = jsxToHtml(by.get('A')!.jsx!, { lookup: (n) => by.get(n) });
    expect(html).toBe('<div class="x" style="margin-top:4px;color:red"><label for="a">L</label><i>b</i><div class="pb-box">&lt;C /&gt;</div></div>');
  });
  it('a cycle between components and deep nesting do not hang', () => {
    const found = findComponents('a.jsx', 'function A() { return <B />; }\nfunction B() { return <A />; }\n');
    const by = new Map(found.map((c) => [c.name, c]));
    const t = Date.now();
    const out = jsxToHtml(by.get('A')!.jsx!, { lookup: (n) => by.get(n) });
    expect(Date.now() - t).toBeLessThan(500);
    expect(out).toContain('pb-box');
    expect(parseJsx('<div>'.repeat(200) + 'x', 0)).toBeNull();
  });
  it('Vue and Svelte templates', () => {
    const vue = extractVue('<script>export default {}</script><template><div :class="c" @click="f" v-if="x">{{ name }}</div></template><style>.a{color:red}</style>')!;
    expect(vue.markup).toContain('<div>');
    expect(vue.markup).not.toMatch(/v-if|@click|:class/);
    expect(vue.markup).toContain('pb-expr');
    expect(vue.css).toBe('.a{color:red}');
    const sv = extractSvelte('<script>let a = 1;</script>{#if a}<p on:click={f}>{a}</p>{/if}<style>p{margin:0}</style>')!;
    expect(sv.markup).toContain('<p>');
    expect(sv.markup).not.toMatch(/on:click|\{#if|\{\/if/);
    expect(sv.css).toBe('p{margin:0}');
  });
});

describe('templates are bounded (review finding)', () => {
  it('a hostile 60 KB template is read in well under a second', () => {
    const t = Date.now();
    extractVue(`<template>${'<a '.repeat(20000)}</template>`);
    extractSvelte('<a '.repeat(20000));
    expect(Date.now() - t).toBeLessThan(1000);
  });
});

describe('source view', () => {
  it('groups by label and builds redacted, numbered, bounded lines', async () => {
    const snap = buildSampleSnapshot('fullstack-api', 1);
    const analysis = await analyzeProject(snap, { yieldToMain: async () => undefined });
    const g = groupFiles(analysis.files, new Set(snap.files.map((f) => f.path)));
    expect(g.map((x) => x.group)).toEqual([...g.map((x) => x.group)].sort());
    expect(g.flatMap((x) => x.paths.map((p) => p.path))).not.toContain('node_modules/express/index.js');
    const token = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    const v = viewerLines(`a\n${token}\n${'x'.repeat(500)}\n`);
    expect(v.lines[1]!.text).toContain('[REDACTED:');
    expect(v.lines[2]!.text.length).toBe(403);
    const many = viewerLines('l\n'.repeat(3000));
    expect(many.lines).toHaveLength(2000);
    expect(many.next).toBe(2000);
    expect(viewerLines('l\n'.repeat(3000), 2000).next).toBeNull();
  });
});

describe('bridge', () => {
  const win = {};
  const ok = { v: 1, type: 'console', nonce: '0123456789abcdef', level: 'log', text: 'hi\u0007there' };
  const ev = (data: unknown, over: object = {}) => ({ source: win, origin: 'null', data, ...over });
  it('accepts a good message and cleans control characters', () => {
    const r = validateBridgeEvent(ev(ok), { source: win, nonce: '0123456789abcdef' });
    expect(r).toEqual({ ok: true, message: { ...ok, text: 'hi there' } });
  });
  it('rejects wrong source, origin, nonce, shape, extra fields, big messages, and non-plain data', () => {
    const exp = { source: win, nonce: '0123456789abcdef' };
    const bad = [
      ev(ok, { source: {} }), ev(ok, { origin: 'http://evil.test' }), ev({ ...ok, nonce: 'ffffffffffffffff' }), ev({ ...ok, extra: 1 }), ev({ ...ok, type: 'navigate' }),
      ev({ ...ok, text: 'x'.repeat(9000) }), ev('string'), ev(null), ev([ok]), ev(Object.create({ v: 1 })), ev({ v: 2, type: 'ready', nonce: '0123456789abcdef' }),
    ];
    for (const e of bad) expect(validateBridgeEvent(e, exp)).toEqual({ ok: false });
    expect(BridgeMessageSchema.safeParse({ v: 1, type: 'ready', nonce: '0123456789abcdef' }).success).toBe(true);
  });
  it('rate limit: 20 per second', () => {
    const l = new RateLimiter();
    let allowed = 0;
    for (let i = 0; i < 50; i++) if (l.allow(1000 + i)) allowed++;
    expect(allowed).toBe(20);
    expect(l.allow(2100)).toBe(true);
  });
  it('the inspector source has no wildcard origin and uses fixed text', () => {
    const s = INSPECTOR_SOURCE('0123456789abcdef', 'http://localhost:5173');
    expect(s).not.toContain("'*'");
    expect(s).not.toContain('"*"');
    expect(s).toContain('postMessage(m,O)');
  });
});

describe('layout check', () => {
  const m = (over: Partial<Measurement>): Measurement => ({ id: 0, tag: 'p', clientWidth: 100, scrollWidth: 100, clientHeight: 20, scrollHeight: 20, overflowX: 'visible', overflowY: 'visible', hasText: true, ...over });
  it('text wider than its box (visible and hidden), cut off at the bottom, and a page wider than the screen', () => {
    const r = evaluateOverflow([m({ id: 1, scrollWidth: 140 }), m({ id: 2, scrollWidth: 140, overflowX: 'hidden' }), m({ id: 3, overflowY: 'hidden', scrollHeight: 60 }), m({ id: 4, scrollWidth: 400, clientWidth: 400 })], 375, 410);
    expect(r.map((x) => [x.id, x.kind])).toEqual([[1, 'text-wider'], [2, 'text-wider'], [3, 'text-cut-bottom'], [4, 'page-wider']]);
  });
  it('auto and scroll are never reported; 1 px of slack; elements with no text are skipped', () => {
    const r = evaluateOverflow([m({ scrollWidth: 300, overflowX: 'auto' }), m({ id: 1, scrollWidth: 300, overflowX: 'scroll' }), m({ id: 2, scrollWidth: 101 }), m({ id: 3, scrollWidth: 500, hasText: false })], 375, 375);
    expect(r).toEqual([]);
  });
  it('clamps absurd numbers', () => {
    expect(evaluateOverflow([m({ scrollWidth: Number.POSITIVE_INFINITY })], 375, 0)).toEqual([]);
    expect(evaluateOverflow([m({ scrollWidth: 1e12 })], 375, 0)[0]!.content).toBe(100000);
  });
  it('one finding per element and kind with every width, a snippet from the tag lines, and the 100 cap', () => {
    const el = [{ id: 0, path: 'a.html', tag: 'p', line: 2, col: 1, startOffset: 0, endOffset: 5, endLine: 2 }];
    const eff = () => '<body>\n<p class="a">long text</p>\n</body>\n';
    const rs = [{ id: 0, kind: 'text-wider' as const, width: 375, content: 312, box: 240 }, { id: 0, kind: 'text-wider' as const, width: 768, content: 312, box: 240 }];
    const { findings } = layoutFindings(rs, el, eff);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ skillId: 'scan.frontend.layout-overflow', primary: 'frontend', severity: 'medium', certainty: 'found', fix: 'guided', path: 'a.html', firstLine: 2 });
    expect(findings[0]!.extra).toBe('Text is wider than its box: content 312 px in a box 240 px wide, measured at 375, 768 px wide previews');
    expect(findings[0]!.snippet.join('\n')).toContain('long text');
    const many = Array.from({ length: 130 }, (_, i) => ({ id: i, path: 'a.html', tag: 'p', line: 2, col: 1, startOffset: 0, endOffset: 5, endLine: 2 }));
    const big = layoutFindings(many.map((e) => ({ id: e.id, kind: 'text-wider' as const, width: 375, content: 2, box: 1 })), many, eff);
    expect(big.findings).toHaveLength(100);
    expect(big.partialReasons).toEqual(['Layout check limit (100) reached: later findings are missing.']);
  });
});
