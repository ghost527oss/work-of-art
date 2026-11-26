// @node: F5.2
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { languageOf, scanSource } from '../src/engine/sourceScan';

const js = (code: string) => scanSource('a.js', code);

describe('JavaScript imports', () => {
  it('finds every static and dynamic form with line numbers', () => {
    const r = js(`import a from './a';\nimport './side';\nexport { x } from "./x";\nconst b = require('./b');\nconst c = await import('./c');\nimport type { T } from 'pkg/types';\n`);
    expect(r.imports.map((i) => [i.spec, i.line])).toEqual([['./a', 1], ['./side', 2], ['./x', 3], ['./b', 4], ['./c', 5], ['pkg/types', 6]]);
  });
  it('multi-line imports', () => {
    const r = js(`import {\n  a,\n  b,\n} from './m';\n`);
    expect(r.imports).toEqual([{ spec: './m', line: 1 }]);
  });
  it('ignores comments and import-like text inside strings', () => {
    const r = js(`// import x from './no'\n/* require('./no2') */\nconst s = "import y from './no3'";\nconst t = \`require('./no4')\`;\nimport z from './yes';\n`);
    expect(r.imports.map((i) => i.spec)).toEqual(['./yes']);
  });
  it('counts alias imports without following them', () => {
    const r = js(`import a from '@/a';\nimport b from '~/b';\nimport c from '#c';\nimport d from '$lib/d';\nimport e from 'react';\n`);
    expect(r.aliasImports).toBe(4);
    expect(r.imports.map((i) => i.spec)).toEqual(['react']);
  });
});

describe('JavaScript calls, routes, mounts, config', () => {
  it('fetch with method, default GET, template with unknown part, external host', () => {
    const r = js(`fetch('/a');\nfetch('/b', { method: 'PUT' });\nfetch(\`/c/\${id}\`);\naxios.post('/d');\nfetch('https://api.example.com/x');\n`);
    expect(r.calls.map((c) => [c.method, c.address, c.unknown, c.external])).toEqual([
      ['GET', '/a', false, false], ['PUT', '/b', false, false], ['GET', '/c/${id}', true, false], ['POST', '/d', false, false], ['GET', 'https://api.example.com/x', false, true],
    ]);
  });
  it('routes only on app, router, or express-bound names; axios.get is not a route', () => {
    const r = js(`const app = express();\nconst api = express.Router();\napp.get('/x', h);\napi.post('/y', h);\naxios.get('/z');\nother.get('/w');\n`);
    expect(r.routes.map((x) => [x.method, x.path, x.line])).toEqual([['GET', '/x', 3], ['POST', '/y', 4]]);
  });
  it('mounts bound by require or default import', () => {
    const r = js(`const profile = require('./routes/profile');\nimport users from './users';\napp.use('/api/profile', profile);\napp.use('/u', users);\napp.use(express.json());\n`);
    expect(r.mounts).toEqual([{ prefix: '/api/profile', ident: 'profile', line: 3 }, { prefix: '/u', ident: 'users', line: 4 }]);
    expect(r.bindings.map((b) => [b.name, b.spec]).sort()).toEqual([['profile', './routes/profile'], ['users', './users']]);
  });
  it('config reads keep names only', () => {
    const r = js(`const a = process.env.PORT;\nconst b = process.env['SECRET'];\nconst c = import.meta.env.VITE_X;\nconst d = process.env.KEY = 'topsecretvalue';\n`);
    expect(r.env.map((e) => e.name)).toEqual(['PORT', 'SECRET', 'VITE_X', 'KEY']);
    expect(JSON.stringify(r)).not.toContain('topsecretvalue');
  });
  it('patterns and handlers', () => {
    expect(js(`document.title = 'x';`).patterns.dom).toBe(true);
    expect(js(`export default function handler(req, res) {}`).patterns.handler).toBe(true);
    const h = js(`export async function GET() {}\nexport const POST = () => {};`);
    expect(h.patterns.handlerMethods).toEqual(['GET', 'POST']);
  });
  it('never returns source text', () => {
    const code = `const secretLine = 'do not leak this';\nfetch('/api/x');\n`;
    expect(JSON.stringify(js(code))).not.toContain('do not leak');
  });
});

describe('HTML and CSS', () => {
  it('script, img, stylesheet link, with line numbers; comments and external targets ignored', () => {
    const r = scanSource('p/index.html', `<!doctype html>\n<!-- <script src="no.js"></script> -->\n<link rel="stylesheet" href="a.css" />\n<link rel="icon" href="x.ico">\n<img alt="x" src="/img/l.png">\n<script src="https://cdn.example.com/x.js"></script>\n<script defer src="app.js?v=1"></script>\n`);
    expect(r.loads).toEqual([{ target: 'a.css', line: 3 }, { target: '/img/l.png', line: 5 }, { target: 'app.js', line: 7 }]);
  });
  it('CSS imports', () => {
    const r = scanSource('s.css', `/* @import 'no.css'; */\n@import 'a.css';\n@import url("b.css");\n@import url(https://x.com/c.css);\n`);
    expect(r.loads).toEqual([{ target: 'a.css', line: 2 }, { target: 'b.css', line: 3 }]);
  });
});

describe('robustness', () => {
  it('unsupported files and hostile input', () => {
    expect(languageOf('a.go')).toBe('none');
    expect(scanSource('a.go', 'fetch("/x")').calls).toEqual([]);
    for (const hostile of ['import ' + 'a,'.repeat(50000), "'".repeat(100000), 'fetch('.repeat(50000), '/*'.repeat(50000), '<script '.repeat(30000)]) {
      for (const name of ['a.js', 'a.html', 'a.css', 'a.py']) {
        const t = Date.now();
        expect(() => scanSource(name, hostile)).not.toThrow();
        expect(Date.now() - t).toBeLessThan(1500);
      }
    }
  });
  it('very long lines are skipped, results are capped at 200', () => {
    const long = scanSource('a.js', `fetch('/x');${' '.repeat(10010)}fetch('/y');\nfetch('/z');\n`);
    expect(long.calls.map((c) => c.address)).toEqual(['/z']);
    const many = scanSource('a.js', Array.from({ length: 500 }, (_, i) => `fetch('/r${i}');`).join('\n'));
    expect(many.calls.length).toBeLessThanOrEqual(200);
    expect(many.capped).toBe(true);
  });
  it('the scanner source has no network or store imports', () => {
    for (const f of ['src/engine/sourceScan.ts', 'src/engine/sourceScanPy.ts', 'src/engine/scanTypes.ts']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/from 'react|store\/|fetch\(\s*['"`]http|XMLHttpRequest/);
    }
  });
});
