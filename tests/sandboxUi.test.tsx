// @node: F7.9
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PreviewNotes, PreviewToolbar, ScriptsSwitch, SourceViewer, ConsolePane } from '../src/components/PreviewParts';
import { BlockedList } from '../src/components/BlockedList';
import { SandboxPanel } from '../src/components/SandboxPanel';
import { StudioLayout } from '../src/components/StudioLayout';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { layoutStore } from '../src/hooks/useLayout';
import { DEFAULT_LAYOUT } from '../src/store/layoutSlice';
import { initialState, studioStore } from '../src/store/useStudioStore';

const noop = () => undefined;
const html = (e: React.ReactElement) => renderToStaticMarkup(e);
const preview = { init: noop, setMode: noop, setWidth: noop, setComponent: noop, setEntry: noop, setScripts: noop, startBridge: noop, stopBridge: noop, onFrameLoad: noop, setBuilt: noop, checkLayout: async () => undefined, markContent: noop };
const assistant = { send: () => null, cancel: noop, clear: noop };
const buttons = (m: string) => [...m.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((x) => x[1]);

beforeEach(() => layoutStore.setState(DEFAULT_LAYOUT));
afterEach(() => studioStore.setState(initialState()));

describe('Sandbox panel', () => {
  it('renders a look-only static preview in a locked iframe with the exact flags', () => {
    studioStore.setState({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1), preview: { ...initialState().preview, mode: 'static', entryPath: 'index.html', reason: 'A plain page.', status: 'ready' } });
    const m = html(createElement(SandboxPanel, { preview }));
    expect(m).toContain('Sandbox');
    expect(m).toMatch(/<iframe[^>]*sandbox="allow-same-origin"/);
    expect(m).not.toMatch(/sandbox="[^"]*allow-scripts/);
    expect(m.toLowerCase()).toContain('referrerpolicy="no-referrer"');
    expect(m).toContain('allow=""');
    expect(m).toContain('title="Project preview"');
    expect(m).toContain('csp="');
    expect(m.toLowerCase()).toContain('srcdoc="');
    expect(m).toContain('Mode: Live Static Preview. Why: A plain page.');
    expect(m).not.toMatch(/src="http/);
    expect(m).toContain('Run scripts');
  });
  it('scripts mode uses exactly allow-scripts and never both flags', () => {
    studioStore.setState({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1), preview: { ...initialState().preview, mode: 'static', entryPath: 'index.html', scripts: true, reason: 'x' } });
    const m = html(createElement(SandboxPanel, { preview }));
    expect(m).toMatch(/sandbox="allow-scripts"/);
    expect(m).not.toContain('allow-same-origin');
    expect(m).toContain('Stop scripts');
    expect(m).toContain('Console (from the preview)');
    expect(m).toContain("script-src");
  });
  it('workbench is labelled approximate and has no scripts switch; source mode has no iframe', () => {
    studioStore.setState({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('react-frontend', 1), preview: { ...initialState().preview, mode: 'workbench', reason: 'Framework.' } });
    const w = html(createElement(SandboxPanel, { preview }));
    expect(w).toContain('Approximate: read from the source, not run.');
    expect(w).not.toContain('Run scripts');
    expect(w).toContain('Component');
    studioStore.setState({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('fullstack-api', 1), preview: { ...initialState().preview, mode: 'source', reason: 'x' } });
    const s = html(createElement(SandboxPanel, { preview }));
    expect(s).not.toContain('<iframe');
    expect(s).toContain('Filter files');
  });
  it('toolbar: widths, check buttons disabled with a reason, and the scripts confirmation names the risks', () => {
    const t = html(createElement(PreviewToolbar, { mode: 'static', choices: ['static', 'source'], width: 375, scripts: false, canMeasure: false, measureReason: 'Wait for the preview to load.', onMode: noop, onWidth: noop, onReload: noop, onCheck: noop, onCheckAll: noop }));
    expect(buttons(t)).toEqual(['375', '768', '1024', 'Fit', 'Reload', 'Check layout', 'Check at all widths']);
    expect(t).toMatch(/<button[^>]*disabled[^>]*>Check layout<\/button>/);
    expect(t).toContain('Wait for the preview to load.');
    expect(html(createElement(ScriptsSwitch, { on: false, available: true, onTurnOn: noop, onStop: noop }))).toContain('Look-only is on. Scripts are off.');
    expect(html(createElement(ScriptsSwitch, { on: false, available: false, onTurnOn: noop, onStop: noop }))).toBe('');
  });
  it('notes and console escape markup-looking text', () => {
    const n = html(createElement(PreviewNotes, { reason: '<script>x</script>', mode: 'static', notes: ['<img src=x>'], invalid: 2 }));
    expect(n).not.toContain('<script>');
    expect(n).not.toContain('<img');
    expect(n).toContain('2 invalid messages');
    expect(html(createElement(ConsolePane, { lines: [{ level: 'log', text: '<b>x</b>' }] }))).toContain('&lt;b&gt;');
  });
  it('the source viewer shows unread files with a reason and no unread content', () => {
    const m = html(createElement(SourceViewer, { files: [{ path: 'a.png', labels: ['assets'], confidence: 'high', evidence: [], needsReview: false, basis: 'path_only', ignored: false }], loaded: new Set<string>(), contentOf: () => undefined, notReadReason: () => 'not loaded' }));
    expect(m).toContain('a.png');
    expect(m).toContain('(not read)');
  });
  it('the Studio shows the panel when given, and the placeholder otherwise; it never holds a project value in the page', () => {
    studioStore.setState({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1), preview: { ...initialState().preview, mode: 'static', entryPath: 'index.html', reason: 'x' } });
    const props = { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant };
    expect(html(createElement(StudioLayout, { ...props, preview }))).toContain('id="sandbox-heading"');
    expect(html(createElement(StudioLayout, props))).toContain('Sandbox (coming in sub-phase 2E)');
  });
  it('static checks: tags, no dangerous HTML in components, no sandbox flag combinations, CSS black and white', () => {
    for (const f of ['SandboxPanel', 'PreviewParts']) {
      const src = readFileSync(`src/components/${f}.tsx`, 'utf8');
      expect(src).toContain('@node: F7.9');
      expect(src).not.toContain('dangerouslySetInnerHTML');
      expect(src).not.toMatch(/allow-same-origin.*allow-scripts|allow-scripts.*allow-same-origin/);
    }
    for (const f of readFileSync('src/preview/previewFlags.ts', 'utf8').match(/allow-[a-z-]+/g) ?? []) expect(['allow-same-origin', 'allow-scripts']).toContain(f);
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('/* @node: F7.9'));
    expect(block).not.toMatch(/transition|animation|rgb|hsl/);
    for (const c of block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(['#000', '#fff']).toContain(c.toLowerCase());
  });
});

// @node: F12.6 (3B-1: blocked list and the outside-host note)
describe('blocked-resources list', () => {
  it('always shows the plain note about outside hosts and the IP address', () => {
    const m = html(createElement(BlockedList, { blocked: [] }));
    expect(m).toContain('Styles and fonts may load from: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, fonts.googleapis.com, fonts.gstatic.com.');
    expect(m).toContain('Any of these hosts can see your IP address. No referrer is sent.');
    expect(m).toContain('Pictures may load from their own https addresses.');
    expect(m).toContain('Nothing was blocked.');
  });
  it('lists at most 20 lines then the rest, as React text', () => {
    const blocked = Array.from({ length: 25 }, (_, i) => ({ what: `<b>x${i}</b>`, reason: 'not_on_list' as const }));
    const m = html(createElement(BlockedList, { blocked, outsideStyles: ['unpkg.com', 'unpkg.com'] }));
    expect(m).toContain('Not loaded in the preview (25)');
    expect(m).toContain('and 5 more.');
    expect(m).toContain('&lt;b&gt;x0&lt;/b&gt;');
    expect(m).not.toContain('<b>x0');
    expect(m).toContain('Loaded from outside: unpkg.com (styles).');
  });
  it('the Sandbox panel shows it for a static page', () => {
    studioStore.setState({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot('static-site', 1), preview: { ...initialState().preview, mode: 'static', entryPath: 'index.html', reason: 'A plain page.', status: 'ready' } });
    const m = html(createElement(SandboxPanel, { preview }));
    expect(m).toContain('can see your IP address');
  });
});

// @node: F12.9 (the Run-scripts warning tells the truth about pictures and script hosts)
describe('Run scripts warning', () => {
  it('says scripts can ask any https address for a picture and which script hosts may load', () => {
    const src = readFileSync('src/components/PreviewParts.tsx', 'utf8');
    expect(src).toContain('Scripts on the page can ask any https address for a picture');
    expect(src).toContain('that address&apos;s host can see your IP address (no referrer is sent)');
    expect(src).toContain('cannot send data to a server');
    expect(src).not.toContain('or the internet.');
  });
});
