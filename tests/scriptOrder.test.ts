// @node: F12.7
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SCRIPT_HOSTS } from '../src/config/previewHosts';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { POLICY_LOOK, POLICY_SCRIPTS, cspFor, sandboxFlags } from '../src/preview/previewFlags';
import { STORAGE_SHIM_SOURCE } from '../src/preview/storageShim';

const NONCE = '0123456789abcdef';
const files = (m: Record<string, string>) => ({ effective: (p: string) => m[p], loaded: new Set(Object.keys(m)) });
function build(m: Record<string, string>, scripts: boolean) {
  const r = buildStaticPreview({ entryPath: 'index.html', ...files(m), scripts, nonce: NONCE, origin: 'http://localhost:5173' });
  if (!r.ok) throw new Error(r.reason);
  return r;
}
const at = (html: string, text: string) => html.indexOf(text);

describe('Run-scripts document order', () => {
  const PAGE = '<!doctype html><html><head><title>t</title></head><body><div id="app">hi</div><script src="app.js"></script><script>window.second = 1;</script></body></html>';
  it('is: inspector, storage stand-in, page content, then project scripts in their original order', () => {
    const r = build({ 'index.html': PAGE, 'app.js': 'window.first = 1;' }, true);
    const i = at(r.html, 'var N=');
    const s = at(r.html, STORAGE_SHIM_SOURCE);
    const c = at(r.html, '<div id="app"');
    const a = at(r.html, 'window.first');
    const b = at(r.html, 'window.second');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(s);
    expect(s).toBeLessThan(c);
    expect(c).toBeLessThan(a);
    expect(a).toBeLessThan(b);
    expect(r.html.indexOf('</body>')).toBeGreaterThan(b);
  });
  it('a script that looks up its element at load time now finds it', () => {
    const r = build({ 'index.html': '<div id="app">hi</div><script>window.found = document.getElementById("app") !== null;</script>' }, true);
    const body = r.html.slice(r.html.indexOf('<body'));
    const els = new Set<string>();
    for (const m of body.matchAll(/id="([^"]+)"/g)) els.add(m[1]!);
    // Run the document's order against a tiny fake DOM: an id exists only once its markup was written.
    const order: string[] = [];
    const ctx = vm.createContext({ document: { getElementById: (id: string) => (order.includes(`el:${id}`) ? {} : null) }, window: {} as Record<string, unknown> });
    const tokens = [...body.matchAll(/<div id="([^"]+)"|<script>([\s\S]*?)<\/script>/g)];
    for (const t of tokens) {
      if (t[1]) order.push(`el:${t[1]}`);
      else if (t[2] && t[2].includes('window.found')) vm.runInContext(t[2], ctx);
    }
    expect((ctx.window as Record<string, unknown>).found).toBe(true);
    expect(els.has('app')).toBe(true);
  });
  it('a Look-only build still removes every script and every event handler', () => {
    const r = build({ 'index.html': '<div onclick="x()">a</div><script>alert(1)</script><script src="https://cdn.jsdelivr.net/a.js"></script>' }, false);
    expect(r.html).not.toContain('onclick');
    expect(r.html).not.toContain('alert(1)');
    expect(r.html).not.toContain('<script');
    expect(r.html).not.toContain(STORAGE_SHIM_SOURCE);
    expect(r.report.outsideScripts).toEqual([]);
    expect(r.report.blocked.filter((b) => b.reason === 'scripts_off')).toHaveLength(2);
  });
});

describe('outside scripts in Run-scripts mode', () => {
  it('an allowed CDN script is written in place as a script tag with only src; others are blocked with a reason', () => {
    const html = '<p>x</p><script src="https://code.jquery.com/jquery-3.7.1.min.js"></script><script>window.after = 1;</script><script src="https://evil.test/a.js"></script><script src="http://cdn.jsdelivr.net/a.js"></script><script src="//unpkg.com/a.js"></script><script src="https://cdn.jsdelivr.net.evil.test/a.js"></script>';
    const r = build({ 'index.html': html }, true);
    expect(r.html).toContain('<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>');
    expect(at(r.html, 'jquery')).toBeLessThan(at(r.html, 'window.after'));
    expect(r.report.outsideScripts).toEqual(['code.jquery.com']);
    expect(r.html).not.toContain('evil.test');
    expect(r.html).not.toContain('http://cdn.jsdelivr.net');
    expect(r.report.blocked.map((b) => b.reason)).toEqual(['not_on_list', 'not_https', 'not_https', 'not_on_list']);
  });
  it('every allowed script host works and a style host that is not a script host does not', () => {
    for (const h of SCRIPT_HOSTS) expect(build({ 'index.html': `<script src="https://${h}/a.js"></script>` }, true).report.outsideScripts).toEqual([h]);
    expect(build({ 'index.html': '<script src="https://fonts.googleapis.com/a.js"></script>' }, true).report.outsideScripts).toEqual([]);
  });
  it('a module script with import or export is not written and is listed as blocked', () => {
    const r = build({ 'index.html': '<script type="module">import a from "./a.js"; a();</script><script type="module" src="m.js"></script><script type="module">const ok = 1;</script>', 'm.js': 'export const x = 1;' }, true);
    expect(r.html).not.toContain('import a from');
    expect(r.html).not.toContain('export const');
    expect(r.html).toContain('const ok = 1;');
    expect(r.report.blocked.map((b) => b.reason)).toEqual(['module_script', 'module_script']);
  });
});

describe('policy and flags for Run-scripts', () => {
  it('has script-src with exactly the script hosts, no same-origin, connect-src none', () => {
    expect(POLICY_SCRIPTS).toContain(`script-src 'unsafe-inline' ${SCRIPT_HOSTS.map((h) => `https://${h}`).join(' ')};`);
    expect(POLICY_SCRIPTS).toContain("connect-src 'none'");
    expect(sandboxFlags(true)).toBe('allow-scripts');
    expect(`${sandboxFlags(true)}`).not.toContain('allow-same-origin');
    expect(cspFor(true)).toBe(POLICY_SCRIPTS);
    expect(POLICY_LOOK).not.toContain('script-src');
  });
  it('the written document carries the Run-scripts policy', () => {
    const r = build({ 'index.html': '<p>x</p>' }, true);
    expect(r.html).toContain('script-src &#39;unsafe-inline&#39; https://cdn.jsdelivr.net');
  });
});
