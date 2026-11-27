// @node: F11.11
// Static checks on the source tree for Phase 3A: where secrets, providers, and environment access may appear.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const SRC = walk('src');
const API = walk('api');
const ALL = [...SRC, ...API];
/** The file's code without comments (comments may mention what the code must not do). */
const read = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const raw = (p: string) => readFileSync(p, 'utf8');
const NEW_FILES = [
  'src/config/aiLive.ts', 'src/config/aiProviders.ts',
  'src/engine/live/cardPicker.ts', 'src/engine/live/promptBuilder.ts', 'src/engine/live/answerParser.ts', 'src/engine/live/providers.ts',
  'src/engine/live/modelRouter.ts', 'src/engine/live/liveAssistant.ts',
  'src/engine/contextEngine.ts', 'src/engine/aiCache.ts', 'src/engine/aiStatus.ts', 'src/engine/aiActionPolicy.ts', 'src/engine/aiProposal.ts', 'src/engine/aiNotes.ts',
  'src/store/aiProposalActions.ts', 'src/hooks/useAIHandoff.ts',
  'src/components/AIStatusBanner.tsx', 'src/components/AINotice.tsx', 'src/components/FindingFocus.tsx',
];

describe('environment and provider access stay on the server', () => {
  it('process.env appears only in api/assistant.ts and api/repo.ts (the Vercel entry points)', () => {
    // Two data files mention it as text: the sample repository's server code and a lesson card. They never read it.
    const DATA = new Set(['src/data/sampleRepos.ts', 'src/skillbook/playbook.ts']);
    const hits = ALL.filter((p) => !DATA.has(p) && /process\.env/.test(read(p)));
    expect(hits.sort()).toEqual(['api/assistant.ts', 'api/repo.ts']);
  });
  it('provider host names appear only in the provider table', () => {
    const hits = ALL.filter((p) => /generativelanguage\.googleapis\.com|api\.groq\.com|openrouter\.ai\/api/.test(read(p)));
    expect(hits).toEqual(['src/config/aiProviders.ts']);
  });
  it('the key variable names appear only where they are defined or shown to the user as setup text', () => {
    const allowed = new Set(['src/config/aiProviders.ts', 'src/engine/live/liveAssistant.ts', 'src/engine/aiNotes.ts']);
    const hits = ALL.filter((p) => /(GEMINI|GROQ|OPENROUTER)_API_KEY/.test(read(p)));
    for (const p of hits) expect(allowed.has(p), p).toBe(true);
  });
  it('no VITE_ variable is used for a key or a model, in code or in .env.example', () => {
    for (const p of ALL) expect(read(p), p).not.toMatch(/VITE_[A-Z_]*(KEY|MODEL|TOKEN|SECRET)/);
    expect(readFileSync('.env.example', 'utf8')).not.toMatch(/^VITE_/m);
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^GEMINI_API_KEY=$/m);
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^OPENROUTER_MODEL_HEAVY=$/m);
  });
  it('no key value is written in any source file', () => {
    for (const p of ALL) expect(read(p), p).not.toMatch(/AIza[0-9A-Za-z_-]{35}|\bgsk_[0-9A-Za-z]{20,}|sk-or-v1-[0-9a-f]{20,}/);
  });
  it('browser code never imports the live engine; only api/assistant.ts and the live folder do', () => {
    const importers = ALL.filter((p) => /from '(?:\.\.?\/)+(?:src\/)?engine\/live\/|from '\.\/(?:answerParser|cardPicker|liveAssistant|modelRouter|promptBuilder|providers)'/.test(read(p)));
    const outsideLive = importers.filter((p) => !p.startsWith('src/engine/live/'));
    expect(outsideLive).toEqual(['api/assistant.ts']);
  });
  it('the live engine imports no React, no store, and reads no environment', () => {
    for (const p of SRC.filter((f) => f.startsWith('src/engine/live/'))) {
      const t = read(p);
      expect(t, p).not.toMatch(/from 'react|from '\.\.\/\.\.\/store|from '\.\.\/\.\.\/hooks|from '\.\.\/\.\.\/components|process\.env|import\.meta\.env/);
    }
  });
  it('the only calls to a provider are in providers.ts (through the injected fetch)', () => {
    for (const p of SRC.filter((f) => f.startsWith('src/engine/live/') && f !== 'src/engine/live/providers.ts')) {
      expect(read(p), p).not.toMatch(/\bfetch\(|fetchImpl\(/);
    }
  });
  it('providers.ts refuses redirects and keeps the key in a header', () => {
    const t = read('src/engine/live/providers.ts');
    expect(t).toContain("redirect: 'error'");
    expect(t).toContain("'x-goog-api-key'");
    expect(t).toContain('authorization');
    expect(t).not.toMatch(/\?key=|[?&]api_key=/);
  });
});

describe('new code hygiene', () => {
  it('every new file has an F11 node tag', () => {
    for (const p of NEW_FILES) expect(raw(p), p).toMatch(/@node: F11\.\d+/);
  });
  it('no raw HTML, eval, or dynamic function in any Phase 3A file or in the components that show AI text', () => {
    for (const p of [...NEW_FILES, 'src/components/AIAssistantPanel.tsx', 'src/components/AIResponseView.tsx', 'src/components/ProposalCard.tsx']) {
      expect(read(p), p).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\(|new Function\(|document\.write/);
    }
  });
  it('no AI text is written to storage: the Phase 3A browser code touches no storage API', () => {
    for (const p of NEW_FILES.filter((f) => !f.startsWith('src/engine/live/'))) {
      expect(read(p), p).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });
  it('package.json has exactly acorn, react, react-dom, and zod as runtime dependencies (3B-1 added acorn on purpose)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['acorn', 'react', 'react-dom', 'zod']);
  });
  it('the Phase 3A CSS uses only #000 and #fff and no motion', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('@node: F11.10'));
    expect(block).not.toMatch(/transition|animation|@keyframes/i);
    for (const c of block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(['#000', '#fff']).toContain(c.toLowerCase());
  });
  it('the vite config forwards GET for /api/assistant (any method is passed through)', () => {
    const t = readFileSync('vite.config.ts', 'utf8');
    expect(t).toContain("method: req.method ?? 'GET'");
    expect(t).toContain("'/api/assistant'");
  });
});
