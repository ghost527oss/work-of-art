// @node: F5.5
import { describe, expect, it } from 'vitest';
import { analyze } from './helpers/analyzeFixture';

const e = (r: Awaited<ReturnType<typeof analyze>>) => r.edges.map((x) => `${x.from}:${x.line} ${x.kind} ${x.target} ${x.certainty}${x.note ? ' (' + x.note + ')' : ''}`);

describe('imports', () => {
  it('resolves with extensions, index files, and .js to .ts', async () => {
    const r = await analyze({
      'a.ts': "import './b';\nimport './c';\nimport './d.js';\nimport './missing';\n",
      'b.tsx': '1', 'c/index.js': '1', 'd.ts': '1',
    });
    expect(e(r)).toEqual([
      'a.ts:1 imports b.tsx confirmed', 'a.ts:2 imports c/index.js confirmed', 'a.ts:3 imports d.ts confirmed', 'a.ts:4 imports ./missing broken',
    ]);
  });
  it('an unresolved relative import is Inferred when the tree is incomplete', async () => {
    const { snapshotOf } = await import('./helpers/analyzeFixture');
    const { analyzeProject } = await import('../src/engine/analyzeProject');
    const snap = snapshotOf({ 'a.ts': "import './missing';\n" });
    const r = await analyzeProject({ ...snap, inventory: { ...snap.inventory, treeComplete: false } }, { yieldToMain: async () => undefined });
    expect(r.edges[0]).toMatchObject({ certainty: 'inferred', note: 'the tree is incomplete, so the file may exist' });
  });
  it('aliases are counted, packages are external', async () => {
    const r = await analyze({ 'a.ts': "import x from '@/x';\nimport y from 'lodash/fp';\nimport z from '@s/pkg/deep';\n" });
    expect(r.edges).toEqual([]);
    expect(r.coverage.aliasImportsNotFollowed).toBe(1);
    expect(r.externals).toEqual(['@s/pkg', 'lodash']);
  });
  it('files of other languages are counted, not scanned', async () => {
    const r = await analyze({ 'main.go': 'package main\n', 'b.php': '<?php', 'c.php': '<?php' });
    expect(r.coverage.notScanned).toEqual({ go: 1, php: 2 });
  });
});

describe('routes and calls', () => {
  const server = "const express = require('express');\nconst app = express();\napp.get('/users/:id', h);\napp.post('/users', h);\n";
  it('Confirmed on a literal match, Inferred with an unknown part, Broken with no match or a different method', async () => {
    const r = await analyze({
      'server.js': server,
      'client.js': "fetch('/users/7');\nfetch(`/users/${id}`);\nfetch('/nothing');\nfetch('/users', { method: 'DELETE' });\n",
    });
    const calls = r.edges.filter((x) => x.kind === 'calls_api').map((x) => `${x.line} ${x.target} ${x.certainty}${x.note ? ' ' + x.note : ''}`);
    expect(calls).toEqual([
      '1 GET /users/:id confirmed', '2 GET /users/:id inferred the address has a part that is not known until it runs',
      '3 GET /nothing broken No route matches this address.', '4 DELETE /users broken method differs',
    ]);
  });
  it('a route nobody calls is not Broken', async () => {
    const r = await analyze({ 'server.js': server });
    expect(r.edges.filter((x) => x.kind === 'defines_route').every((x) => x.certainty === 'confirmed')).toBe(true);
  });
  it('an unmounted router keeps its path with "mount path unknown" and calls to it are Inferred', async () => {
    const r = await analyze({ 'r.js': "const router = require('express').Router();\nrouter.get('/x', h);\n", 'c.js': "fetch('/x');\n" });
    expect(r.edges.find((x) => x.kind === 'defines_route')!.note).toBe('mount path unknown');
    expect(r.edges.find((x) => x.kind === 'calls_api')!.certainty).toBe('inferred');
  });
  it('file-placement routes: api/name.js, pages/api, app route.ts', async () => {
    const r = await analyze({ 'api/hello.js': 'x', 'pages/api/users/[id].ts': 'x', 'app/things/route.ts': 'export async function GET() {}\n' });
    expect(r.edges.filter((x) => x.kind === 'defines_route').map((x) => x.target)).toEqual(['ANY /api/hello', 'GET /things', 'ANY /api/users/[id]']);
  });
  it('external calls keep only the host; config reads keep only the name', async () => {
    const r = await analyze({ 'a.js': "fetch('https://api.example.com/v1/x?key=abc');\nconst k = process.env.API_KEY;\n" });
    expect(e(r)).toEqual(['a.js:1 calls_external api.example.com confirmed', 'a.js:2 reads_config API_KEY confirmed']);
  });
  it('a frontend-only repository is never Broken', async () => {
    const r = await analyze({ 'a.js': "fetch('/api/x');\n" });
    expect(r.edges[0]).toMatchObject({ certainty: 'inferred', note: 'No backend routes were found in this repository; the route may live elsewhere.' });
  });
});

describe('Python', () => {
  it('resolves absolute and relative imports; unresolved absolute imports are external', async () => {
    const r = await analyze({
      'app/__init__.py': '', 'app/main.py': 'import os\nfrom app import util\nfrom .models import M\nfrom . import util as u2\nfrom .gone import G\nimport flask\n',
      'app/util.py': 'x = 1\n', 'app/models.py': 'class M: pass\n',
    });
    expect(e(r)).toEqual([
      'app/main.py:2 imports app/util.py confirmed', 'app/main.py:3 imports app/models.py confirmed', 'app/main.py:4 imports app/util.py confirmed', 'app/main.py:5 imports .gone broken',
    ]);
    expect(r.externals).toEqual(['flask', 'os']);
  });
  it('Flask Blueprint prefixes and calls from JavaScript match', async () => {
    const r = await analyze({
      'api/__init__.py': '',
      'api/users.py': "from flask import Blueprint\nbp = Blueprint('u', __name__, url_prefix='/users')\n\n@bp.route('/<int:id>', methods=['GET'])\ndef one(id): pass\n",
      'app.py': "from flask import Flask\nfrom api import users\napp = Flask(__name__)\napp.register_blueprint(users.bp, url_prefix='/v1')\n",
      'web.js': "fetch('/v1/users/3');\n",
    });
    expect(r.edges.filter((x) => x.kind === 'defines_route').map((x) => x.target + ' ' + x.certainty)).toEqual(expect.any(Array));
    expect(r.coverage.djangoUrlFilesSeen).toBe(false);
  });
});

describe('limits', () => {
  it('200 connections per file are kept and the result is Partial with a reason', async () => {
    const code = Array.from({ length: 250 }, (_, i) => `fetch('/r${i}');`).join('\n');
    const r = await analyze({ 'big.js': code });
    expect(r.edges.filter((x) => x.from === 'big.js').length).toBeLessThanOrEqual(200);
    expect(r.coverage.partial).toBe(true);
    expect(r.coverage.partialReasons.join(' ')).toMatch(/Limit of 200 connections per file reached in 1 file\./);
  });
});
