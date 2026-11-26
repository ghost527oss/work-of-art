// @node: F5.6
// The hand-written truth from design section 10: expected results for the three samples.
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot, type SampleId } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';

const run = (id: SampleId) => analyzeProject(buildSampleSnapshot(id, 1), { yieldToMain: async () => undefined });
const rows = (r: Awaited<ReturnType<typeof run>>) =>
  r.files.map((f) => `${f.path} | ${f.ignored ? 'ignored' : f.labels.join(',')} | ${f.ignored ? '-' : f.confidence}`);
const edges = (r: Awaited<ReturnType<typeof run>>) => r.edges.map((e) => `${e.from}:${e.line} ${e.kind} ${e.target} ${e.certainty}`);
const skills = (r: Awaited<ReturnType<typeof run>>, path: string) =>
  r.files.find((f) => f.path === path)!.evidence.map((e) => /^\[([^\]]+)\]/.exec(e.description)?.[1]).filter(Boolean);

describe('static site', () => {
  it('sorts as the design says', async () => {
    const r = await run('static-site');
    expect(rows(r)).toEqual([
      'README.md | documentation | high', 'about.html | frontend | medium', 'css/styles.css | frontend | high', 'img/logo.png | assets | high',
      'index.html | frontend | medium', 'js/app.js | frontend | high', 'node_modules/left-pad/index.js | ignored | -',
    ]);
    expect(skills(r, 'css/styles.css')).toEqual(['sort.ext.style', 'sort.ref.loaded-by-html']);
    expect(skills(r, 'js/app.js').sort()).toEqual(['sort.ref.loaded-by-html', 'sort.syntax.dom']);
    expect(r.files.find((f) => f.path === 'img/logo.png')!.basis).toBe('path_only');
    expect(r.files.filter((f) => f.needsReview)).toEqual([]);
  });
  it('finds exactly the four loads', async () => {
    const r = await run('static-site');
    expect(edges(r)).toEqual([
      'about.html:3 loads css/styles.css confirmed', 'index.html:6 loads css/styles.css confirmed',
      'index.html:11 loads img/logo.png confirmed', 'index.html:16 loads js/app.js confirmed',
    ]);
    expect(r.externals).toEqual([]);
    expect(r.coverage.partial).toBe(false);
  });
});

describe('react frontend', () => {
  it('sorts as the design says', async () => {
    const r = await run('react-frontend');
    expect(rows(r)).toEqual([
      'README.md | documentation | high', 'index.html | frontend | medium', 'package-lock.json | ignored | -', 'package.json | configuration | high',
      'public/favicon.ico | assets | high', 'src/App.tsx | frontend | medium', 'src/api/auth.ts | api_data | medium',
      'src/components/LoginForm.tsx | frontend | high', 'src/main.tsx | frontend | high', 'src/styles.css | frontend | medium', 'vite.config.ts | configuration | high',
    ]);
    expect(skills(r, 'src/api/auth.ts').sort()).toEqual(['sort.folder.client-api', 'sort.syntax.request-call']);
    expect(skills(r, 'src/main.tsx').sort()).toEqual(['sort.ext.jsx', 'sort.import.frontend', 'sort.manifest.frontend-project', 'sort.ref.loaded-by-html', 'sort.syntax.dom']);
    expect(r.files.filter((f) => f.needsReview)).toEqual([]);
  });
  it('finds the connections, one Inferred call, and the four packages', async () => {
    const r = await run('react-frontend');
    expect(edges(r)).toEqual([
      'index.html:4 loads src/main.tsx confirmed', 'src/App.tsx:1 imports src/components/LoginForm.tsx confirmed',
      'src/api/auth.ts:2 calls_api POST /api/sign-in inferred', 'src/components/LoginForm.tsx:2 imports src/api/auth.ts confirmed',
      'src/main.tsx:2 imports src/App.tsx confirmed', 'src/main.tsx:3 imports src/styles.css confirmed',
    ]);
    expect(r.edges.find((e) => e.kind === 'calls_api')!.note).toBe('No backend routes were found in this repository; the route may live elsewhere.');
    expect(r.externals).toEqual(['@vitejs/plugin-react', 'react', 'react-dom', 'vite']);
  });
});

describe('full-stack API', () => {
  it('sorts as the design says', async () => {
    const r = await run('fullstack-api');
    expect(rows(r)).toEqual([
      '.env.example | configuration | high', 'README.md | documentation | high', 'client/app.js | frontend,api_data | medium',
      'client/favicon.ico | assets | high', 'client/index.html | frontend | medium', 'node_modules/express/index.js | ignored | -',
      'package.json | configuration | high', 'server/index.js | backend | high', 'server/middleware/validate.js | backend | medium',
      'server/routes/profile.js | backend,api_data | medium', 'server/services/profileService.js | backend | medium',
    ]);
    expect(r.files.filter((f) => f.needsReview)).toEqual([]);
  });
  it('finds the connections, the route with its mount, and a Confirmed call', async () => {
    const r = await run('fullstack-api');
    expect(edges(r)).toEqual([
      'client/app.js:3 calls_api PUT /api/profile/:id confirmed', 'client/index.html:6 loads client/app.js confirmed',
      'server/index.js:2 imports server/routes/profile.js confirmed', 'server/index.js:7 reads_config PORT confirmed',
      'server/routes/profile.js:2 imports server/middleware/validate.js confirmed', 'server/routes/profile.js:3 imports server/services/profileService.js confirmed',
      'server/routes/profile.js:7 defines_route PUT /api/profile/:id confirmed',
    ]);
    const def = r.edges.find((e) => e.kind === 'defines_route')!;
    expect(def.note).toBe('mounted at /api/profile by server/index.js:6');
    expect(r.edges.find((e) => e.kind === 'calls_api')!.targetPath).toBe('server/routes/profile.js');
    expect(r.externals).toEqual(['express']);
  });
});

describe('determinism', () => {
  it('the same snapshot gives identical results, also with the file order reversed', async () => {
    for (const id of ['static-site', 'react-frontend', 'fullstack-api'] as const) {
      const snap = buildSampleSnapshot(id, 1);
      const a = JSON.stringify(await analyzeProject(snap, { yieldToMain: async () => undefined }));
      const rev = { ...snap, files: [...snap.files].reverse(), inventory: { ...snap.inventory, entries: [...snap.inventory.entries].reverse() } };
      expect(JSON.stringify(await analyzeProject(rev, { yieldToMain: async () => undefined }))).toBe(a);
    }
  });
});
