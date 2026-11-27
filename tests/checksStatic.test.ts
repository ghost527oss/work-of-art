// @node: F12.13
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_HOSTS, SCRIPT_HOSTS, STYLE_HOSTS } from '../src/config/previewHosts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(?:ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(p, 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const SRC = walk('src');
const CHECK_AND_PREVIEW = SRC.filter((p) => p.startsWith('src/engine/checks/') || p.startsWith('src/preview/'));
const ALL_3B1 = [...CHECK_AND_PREVIEW, 'src/engine/mediaRefs.ts', 'src/engine/imageSniff.ts', 'src/engine/mediaLoader.ts'];

describe('3B-1 static checks', () => {
  it('no eval, new Function, innerHTML, dangerouslySetInnerHTML, fetch, XMLHttpRequest, process.env, or engine/live import in the checks and the preview code', () => {
    for (const p of CHECK_AND_PREVIEW) {
      const code = stripComments(read(p));
      expect(code, p).not.toMatch(/\beval\s*\(/);
      expect(code, p).not.toMatch(/new\s+Function\b/);
      expect(code, p).not.toMatch(/innerHTML|dangerouslySetInnerHTML/);
      expect(code, p).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|process\.env|import\.meta\.env/);
      expect(code, p).not.toMatch(/from\s+['"][^'"]*engine\/live/);
      expect(code, p).not.toMatch(/\/api\/assistant|aiAssistant|mockAssistant/);
    }
  });
  it('no eval( or new Function( anywhere in src, and no dangerouslySetInnerHTML in any component', () => {
    for (const p of SRC.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
      const code = stripComments(read(p));
      expect(code, p).not.toMatch(/\beval\s*\(/);
      expect(code, p).not.toMatch(/new\s+Function\s*\(/);
      if (p.startsWith('src/components/')) expect(code, p).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    }
  });
  it('the outside host names appear only in src/config/previewHosts.ts', () => {
    const hosts = new Set([...STYLE_HOSTS, ...FONT_HOSTS, ...SCRIPT_HOSTS]);
    for (const p of SRC.filter((f) => f !== 'src/config/previewHosts.ts')) {
      const text = read(p);
      for (const h of hosts) expect(text, `${p} mentions ${h}`).not.toContain(h);
    }
  });
  it('CSSStyleSheet and replaceSync appear only in cssProbeBrowser.ts', () => {
    for (const p of SRC) {
      if (p === 'src/engine/checks/cssProbeBrowser.ts') continue;
      expect(stripComments(read(p)), p).not.toMatch(/CSSStyleSheet|replaceSync/);
    }
  });
  it('acorn is imported only through acornLoader.ts and only with a dynamic import()', () => {
    for (const p of SRC) {
      const code = stripComments(read(p));
      if (p === 'src/engine/checks/acornLoader.ts') {
        expect(code).toContain("import('acorn')");
        expect(code).not.toMatch(/^import\s[^;]*from\s+['"]acorn['"]/m);
      } else expect(code, p).not.toMatch(/from\s+['"]acorn['"]|import\(\s*['"]acorn['"]\s*\)/);
    }
  });
  it('the new browser-run code holds no colour other than #000 and #fff and no transition or animation', () => {
    const css = read('src/styles.css');
    expect(css).not.toMatch(/\btransition\s*:|\banimation\s*:|@keyframes/);
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) expect(['#000', '#fff', '#000000', '#ffffff']).toContain(m[0].toLowerCase());
    for (const p of ['src/components/BlockedList.tsx', 'src/components/LintSummary.tsx']) expect(read(p)).not.toMatch(/style=|#[0-9a-f]{3,6}\b|transition|animation/i);
  });
  it('runtime dependencies are exactly acorn, react, react-dom, and zod', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['acorn', 'react', 'react-dom', 'zod']);
  });
  it('picture bytes (the media list) are read only by the loader, coverage code, the Sandbox panel, and the preview builder', () => {
    const allowed = new Set(['src/types/contracts.ts', 'src/engine/mediaLoader.ts', 'src/engine/ingestPipeline.ts', 'src/engine/fileSelector.ts', 'src/components/SandboxPanel.tsx', 'src/components/CoveragePanel.tsx', 'src/preview/previewDocument.ts', 'src/engine/imageSniff.ts', 'src/config/budgets.ts']);
    for (const p of SRC.filter((f) => /\.(?:ts|tsx)$/.test(f))) {
      const code = stripComments(read(p));
      if (/\.media(?![-\w])|\bmedia\??:\s*[(\w]|RepoMedia|\bbase64\b/.test(code)) expect(allowed.has(p), `${p} touches picture data`).toBe(true);
    }
  });
  it('every picture, check, and preview file carries a node tag', () => {
    for (const p of ALL_3B1) expect(read(p), p).toMatch(/@node: F\d+(?:\.\d+)?/);
  });
});
