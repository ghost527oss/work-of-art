// @node: F12.4
import { afterEach, describe, expect, it } from 'vitest';
import { buildSampleSnapshot, type SampleId } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { setAcornForTest } from '../src/engine/checks/acornLoader';
import { createBrowserCssProbe } from '../src/engine/checks/cssProbeBrowser';
import { setCssProbe } from '../src/engine/checks/cssProbe';
import { runCodeChecks } from '../src/engine/checks';
import { loadAcorn } from '../src/engine/checks/acornLoader';
import { scanProject } from '../src/engine/scanProject';
import { dropsRulesWith } from './helpers/fakeCssProbe';
import { ids, scanFiles } from './helpers/scanFixture';

afterEach(() => { setCssProbe(null); setAcornForTest(undefined); });

const NEW_IDS = ['js-syntax', 'balance', 'html-structure', 'html-id-duplicate', 'html-attr-missing', 'css-possible-invalid', 'css-braces'].map((n) => `scan.frontend.${n}`);

describe('code checks through the scan', () => {
  it('a JavaScript mistake is found whatever the file label, in both areas, with the plain message', async () => {
    const r = await scanFiles({ 'lib/odd.js': 'const a = 1;\nif (a > 0 {\n  go();\n}\n', 'index.html': '<p>x</p>\n' });
    expect(ids(r)).toEqual(['scan.frontend.js-syntax@lib/odd.js:2']);
    const f = r.result.findings[0]!;
    expect(f).toMatchObject({ primary: 'frontend', areas: ['frontend', 'backend'], severity: 'high', certainty: 'found' });
    expect(f.extra).toBe('A symbol was found where JavaScript did not expect one. (line 2, column 11)');
    expect(f.snippet.join('\n')).toContain('if (a > 0 {');
    expect(f.fix).toBe('auto'); // exactly one repair makes the file read cleanly
  });
  it('HTML, CSS, and inline script findings are found in one page', async () => {
    setCssProbe(dropsRulesWith('BAD'));
    const html = '<!doctype html>\n<html><head>\n<style>\na { color: red }\nb { c: BAD }\n</style>\n</head><body>\n<div id="x">\n<span>one\n</div>\n<div id="x"></div>\n<img alt="n">\n<script>\nvar a = (;\n</script>\n</body></html>\n';
    const r = await scanFiles({ 'index.html': html });
    expect(ids(r).sort()).toEqual([
      'scan.frontend.js-syntax@index.html:14', 'scan.frontend.html-structure@index.html:9', 'scan.frontend.html-id-duplicate@index.html:11',
      'scan.frontend.html-attr-missing@index.html:12', 'scan.frontend.css-possible-invalid@index.html:5',
    ].sort());
  });
  it('React and TypeScript files get the balance check', async () => {
    const r = await scanFiles({ 'src/a.ts': 'function f() {\n  if (x) {\n    go();\n}\n' });
    expect(ids(r)).toEqual(['scan.frontend.balance@src/a.ts:1']);
    expect(r.result.findings[0]!.certainty).toBe('possible');
  });
  it('a CSS file with braces that do not match is found without a probe; the missing probe is shown as not checked', async () => {
    const r = await scanFiles({ 'a.css': 'a { b: c;\n', 'ok.css': 'a { b: c }\n' });
    expect(ids(r)).toEqual(['scan.frontend.css-braces@a.css:1']);
    expect(r.result.coverage.codeNotChecked).toEqual({ no_probe: 1 });
    expect(r.result.partial).toBe(false);
  });
  it('with the loader failed, JavaScript is reported as not checked and never as fine', async () => {
    setAcornForTest(null);
    const { snapshot, analysis } = await (async () => { const s = buildSampleSnapshot('static-site', 1); return { snapshot: s, analysis: await analyzeProject(s, { yieldToMain: async () => undefined }) }; })();
    const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
    // scanProject tries to load acorn; the forced null stays
    const r = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, { yieldToMain: async () => undefined });
    expect(r.coverage.codeNotChecked?.no_checker).toBeGreaterThan(0);
  });
  it('findings carry no code outside the redacted snippet and extra text', async () => {
    const r = await scanFiles({ 'a.js': 'var s = "AKIAABCDEFGHIJKLMNOP";\nvar = ;\n' });
    expect(JSON.stringify(r.result.findings.find((f) => f.skillId === 'scan.frontend.js-syntax'))).not.toContain('AKIAABCDEFGHIJKLMNOP');
  });
  it('ids are stable and unique, and the per-check cap still applies', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 60; i++) files[`f${i}.js`] = 'var = ;\n';
    const r = await scanFiles(files);
    const syntax = r.result.findings.filter((f) => f.skillId === 'scan.frontend.js-syntax');
    expect(syntax).toHaveLength(50);
    expect(new Set(r.result.findings.map((f) => f.id)).size).toBe(r.result.findings.length);
    expect(r.result.partialReasons.join(' ')).toMatch(/Limit of 50 findings/);
  });
  it('runCodeChecks ignores other file types', async () => {
    await loadAcorn();
    expect(runCodeChecks('notes.md', 'var = ;')).toEqual({ issues: [], notChecked: [] });
  });
  it('the three bundled samples show no finding from the new checks', async () => {
    for (const id of ['static-site', 'react-frontend', 'fullstack-api'] as SampleId[]) {
      const snapshot = buildSampleSnapshot(id, 1);
      const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
      const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
      setCssProbe(() => true);
      const r = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, { yieldToMain: async () => undefined });
      expect(r.findings.filter((f) => NEW_IDS.includes(f.skillId)), id).toEqual([]);
    }
  });
  it('the browser probe is null where CSSStyleSheet does not exist (node)', () => {
    expect(createBrowserCssProbe()).toBeNull();
  });
});

