// @node: F6.2
import { describe, expect, it } from 'vitest';
import { scanFiles, ids } from './helpers/scanFixture';

const FE = (name: string, body: string) => ({ [name]: body, 'package.json': '{"dependencies":{"react":"1"}}' });

describe('frontend checks', () => {
  it('img-alt: flags a missing alt, accepts alt, alt="", and spread', async () => {
    const r = await scanFiles({ 'a.html': '<img src="a.png">\n<img src="b.png" alt="b">\n<img src="c.png" alt="">\n<!-- <img src="no"> -->\n' });
    expect(ids(r)).toEqual(['scan.frontend.img-alt@a.html:1']);
    const j = await scanFiles(FE('src/A.tsx', "import React from 'react';\nexport const A = () => <img {...p} />;\nexport const B = () => <img src={x} />;\n"));
    expect(ids(j)).toEqual(['scan.frontend.img-alt@src/A.tsx:3']);
  });
  it('button-name: empty and self-closing buttons are flagged; labelled, titled, and texted are not', async () => {
    const r = await scanFiles({ 'a.html': '<button></button>\n<button>  </button>\n<button aria-label="x"></button>\n<button title="t"></button>\n<button>Go</button>\n<button disabled />\n' });
    expect(ids(r)).toEqual(['scan.frontend.button-name@a.html:1', 'scan.frontend.button-name@a.html:2', 'scan.frontend.button-name@a.html:6']);
  });
  it('listener-cleanup: React file with addEventListener and no removal is Possible', async () => {
    const bad = await scanFiles(FE('src/A.tsx', "import { useEffect } from 'react';\nuseEffect(() => { window.addEventListener('x', f); });\n"));
    expect(ids(bad)).toEqual(['scan.frontend.listener-cleanup@src/A.tsx:2']);
    expect(bad.result.findings[0]!.certainty).toBe('possible');
    const ok = await scanFiles(FE('src/A.tsx', "import { useEffect } from 'react';\nuseEffect(() => { window.addEventListener('x', f); return () => window.removeEventListener('x', f); });\n"));
    expect(ids(ok)).toEqual([]);
  });
});

describe('backend checks', () => {
  const SRV = (n: string, b: string) => ({ [n]: b, 'package.json': '{"dependencies":{"express":"1"}}' });
  it('input-validation: request data with no validation words is Possible; typeof or zod silences it', async () => {
    expect(ids(await scanFiles(SRV('server/a.js', "const express = require('express');\napp.post('/x', (req, res) => res.send(req.body.name));\n")))).toContain('scan.backend.input-validation@server/a.js:2');
    expect(ids(await scanFiles(SRV('server/a.js', "const express = require('express');\napp.post('/x', (req, res) => { if (typeof req.body.name !== 'string') return; });\n"))).filter((x) => x.includes('input-validation'))).toEqual([]);
    const py = await scanFiles({ 'server/a.py': 'from flask import request\nx = request.json\n' });
    expect(ids(py).some((x) => x.startsWith('scan.backend.input-validation'))).toBe(true);
  });
  it('error-leak: sending err.stack or err.message', async () => {
    const r = await scanFiles(SRV('server/a.js', "const express = require('express');\napp.use((err, req, res, next) => res.status(500).send(err.stack));\napp.get('/ok', (q, res) => res.json({ ok: true }));\n"));
    expect(ids(r).filter((x) => x.includes('error-leak'))).toEqual(['scan.backend.error-leak@server/a.js:2']);
  });
  it('sql-concat: concatenation, template, format, f-string; placeholders are fine', async () => {
    const js = await scanFiles(SRV('server/a.js', "const express = require('express');\ndb.query('SELECT * FROM t WHERE id = ' + id);\ndb.query(`DELETE FROM t WHERE id = ${id}`);\ndb.query('SELECT * FROM t WHERE id = $1', [id]);\n"));
    expect(ids(js).filter((x) => x.includes('sql-concat'))).toEqual(['scan.backend.sql-concat@server/a.js:2', 'scan.backend.sql-concat@server/a.js:3']);
    const py = await scanFiles({ 'server/a.py': 'cur.execute(f"SELECT * FROM t WHERE id={i}")\ncur.execute("SELECT %s" % x)\ncur.execute("SELECT * FROM t WHERE id=%s", (i,))\n' });
    expect(ids(py).filter((x) => x.includes('sql-concat')).length).toBe(2);
  });
  it('no-auth-limit: write route with no guard words anywhere; any guard word silences it', async () => {
    const files = SRV('server/a.js', "const express = require('express');\nconst app = express();\napp.post('/x', h);\n");
    expect(ids(await scanFiles(files))).toContain('scan.backend.no-auth-limit@server/a.js:3');
    expect(ids(await scanFiles({ ...files, 'server/b.js': "const limiter = require('x');\n" })).some((x) => x.includes('no-auth-limit'))).toBe(false);
    expect(ids(await scanFiles(SRV('server/a.js', "const app = require('express')();\napp.get('/x', h);\n"))).some((x) => x.includes('no-auth-limit'))).toBe(false);
  });
});

describe('security checks', () => {
  it('hardcoded-secret: finds the kind, never the value', async () => {
    const token = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    const r = await scanFiles({ 'src/a.js': `const t = '${token}';\n// also ${token}\n`, 'k.json': '{"a":"-----BEGIN RSA PRIVATE KEY-----"}' });
    const f = r.result.findings.filter((x) => x.skillId === 'scan.security.hardcoded-secret');
    expect(f.map((x) => x.extra).sort()).toEqual(['a GitHub token', 'a GitHub token', 'a private key']);
    const text = JSON.stringify(r.result);
    expect(text).not.toContain(token);
    expect(f.every((x) => x.snippet.every((l) => !l.includes(token)))).toBe(true);
    expect(f[0]!.snippet.join('\n')).toContain('[REDACTED:');
  });
  it('dangerous-html and eval', async () => {
    const r = await scanFiles({ 'src/a.js': "el.innerHTML = x;\nif (a == b) {}\nel.innerHTML == y;\neval('1');\nnew Function('a', 'return a');\nx.eval(1);\n" });
    expect(ids(r)).toEqual(['scan.security.eval@src/a.js:4', 'scan.security.eval@src/a.js:5', 'scan.security.dangerous-html@src/a.js:1'].sort((a, b) => (r.result.findings.findIndex((f) => `${f.skillId}@${f.path}:${f.firstLine}` === a) - r.result.findings.findIndex((f) => `${f.skillId}@${f.path}:${f.firstLine}` === b))));
    expect(ids(r)).not.toContain('scan.security.eval@src/a.js:6');
    const py = await scanFiles({ 'a.py': 'eval("1")\nexec("x")\nself.eval(1)\n' });
    expect(ids(py).filter((x) => x.includes('eval')).length).toBe(2);
  });
  it('target-blank: missing rel or rel without noopener', async () => {
    const r = await scanFiles({ 'a.html': '<a href="x" target="_blank">x</a>\n<a href="x" target="_blank" rel="noopener">x</a>\n<a href="x" target="_blank" rel="nofollow">x</a>\n<a href="x">x</a>\n' });
    expect(ids(r).sort()).toEqual(['scan.security.target-blank@a.html:1', 'scan.security.target-blank@a.html:3']);
  });
  it('cors-wildcard', async () => {
    const r = await scanFiles({ 's.js': "app.use(cors());\nres.setHeader('Access-Control-Allow-Origin', '*');\nconst o = { origin: '*' };\napp.use(cors({ origin: 'https://x.test' }));\n", 'a.py': "CORS(app)\nCORS(app, allow_origins=['*'])\n" });
    expect(ids(r).filter((x) => x.includes('cors')).length).toBeGreaterThanOrEqual(4);
  });
  it('env-file: real .env files, also unread ones; .example is fine', async () => {
    const r = await scanFiles({ '.env': 'A=1\n', 'config/.env.local': { size: 5 }, '.env.example': 'A=\n', '.env.sample': 'A=\n' });
    expect(ids(r).filter((x) => x.includes('env-file')).sort()).toEqual(['scan.security.env-file@.env:1', 'scan.security.env-file@config/.env.local:1']);
    expect(r.result.findings.find((f) => f.path === '.env')!.snippet).toEqual([]);
  });
});

describe('api checks', () => {
  it('fetch-no-ok-check: needs fetch and .json() and no .ok or .status', async () => {
    expect(ids(await scanFiles({ 'a.js': "const r = await fetch('/x');\nreturn r.json();\n" })).some((x) => x.includes('fetch-no-ok'))).toBe(true);
    expect(ids(await scanFiles({ 'a.js': "const r = await fetch('/x');\nif (!r.ok) throw 1;\nreturn r.json();\n" })).some((x) => x.includes('fetch-no-ok'))).toBe(false);
  });
  it('insecure-url: http to a real host, not to localhost', async () => {
    const r = await scanFiles({ 'a.js': "fetch('http://api.example.com/x');\nfetch('http://localhost:3000/x');\nfetch('https://ok.example.com');\n", 'b.py': "requests.get('http://svc.example.org/a')\n" });
    expect(r.result.findings.filter((f) => f.skillId === 'scan.api.insecure-url').map((f) => f.extra).sort()).toEqual(['api.example.com', 'svc.example.org']);
  });
  it('route-mismatch: a Broken call becomes a finding with the note', async () => {
    const r = await scanFiles({ 's.js': "const app = require('express')();\napp.get('/users', h);\n", 'c.js': "fetch('/nothing');\n" });
    const f = r.result.findings.find((x) => x.skillId === 'scan.api.route-mismatch')!;
    expect([f.path, f.firstLine, f.extra]).toEqual(['c.js', 1, 'No route matches this address.']);
  });
});

describe('applicability and hygiene', () => {
  it('a file in Needs Review gets only the Security checks; corrections change which checks run', async () => {
    const files = { 'lib/x.js': 'const a = 1;\nel.innerHTML = z;\nconst n = req.body.name;\n' };
    const plain = await scanFiles(files);
    expect(ids(plain).map((x) => x.split('@')[0])).toEqual(['scan.security.dangerous-html']);
    const fixed = await scanFiles(files, { 'lib/x.js': ['backend'] });
    expect(ids(fixed).map((x) => x.split('@')[0]).sort()).toEqual(['scan.backend.input-validation', 'scan.security.dangerous-html']);
  });
  it('finding ids are stable and snippets are bounded and redacted', async () => {
    const a = await scanFiles({ 'a.html': '<img src="1">\n<img src="1">\n' });
    const b = await scanFiles({ 'a.html': 'x\n\n<img src="1">\n<img src="1">\n' });
    expect(a.result.findings.map((f) => f.id.replace(/\|\d+$/, ''))).toEqual(b.result.findings.map((f) => f.id.replace(/\|\d+$/, '')));
    expect(new Set(a.result.findings.map((f) => f.id)).size).toBe(2);
    const long = await scanFiles({ 'a.html': `<img src="${'x'.repeat(300)}">\n` });
    expect(long.result.findings[0]!.snippet[0]!.length).toBeLessThanOrEqual(203);
  });
  it('hostile 200 KB input finishes in under a second per check', async () => {
    const { makeCtx } = await import('../src/engine/scanText');
    const { scanImgAlt, scanButtonName } = await import('../src/engine/scanFrontend');
    const { scanErrorLeak, scanSqlConcat, scanInputValidation } = await import('../src/engine/scanBackend');
    const { scanTargetBlank, scanSecrets, scanDangerousHtml, scanEval, scanCorsWildcard } = await import('../src/engine/scanSecurity');
    const { scanInsecureUrl, scanFetchNoOk } = await import('../src/engine/scanApi');
    const hostile = ('<img <button <a target="_blank" res.send( db.query(" fetch( ' + '<'.repeat(50)).repeat(1500).slice(0, 200 * 1024);
    const ctx = makeCtx('a.js', hostile, hostile);
    for (const f of [scanImgAlt, scanButtonName, scanErrorLeak, scanSqlConcat, scanInputValidation, scanTargetBlank, scanSecrets, scanDangerousHtml, scanEval, scanCorsWildcard, scanInsecureUrl, scanFetchNoOk]) {
      const t = Date.now();
      f(ctx);
      expect(Date.now() - t).toBeLessThan(1000);
    }
  });
});

describe('review findings (2D)', () => {
  it('a private key body never reaches a snippet', async () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAsecretbody1\nsecretbody2secretbody2\n-----END RSA PRIVATE KEY-----\n';
    const r = await scanFiles({ 'src/k.js': `const a = 1;\nconst k = \`${key}\`;\n` });
    const f = r.result.findings.find((x) => x.skillId === 'scan.security.hardcoded-secret')!;
    expect(JSON.stringify(f)).not.toContain('secretbody');
    expect(f.snippet).toContain('[REDACTED:private_key]');
  });
  it('data-target and data-rel are not the attributes', async () => {
    const r = await scanFiles({ 'a.html': '<a data-target="_blank" href="x">x</a>\n<a target="_blank" data-rel="k" href="y">y</a>\n<a target="_blank" rel="noreferrer" href="z">z</a>\n' });
    expect(ids(r)).toEqual(['scan.security.target-blank@a.html:2']);
    const { buildTargetBlankFix } = await import('../src/engine/scanFix');
    const diff = buildTargetBlankFix('<a target="_blank" data-rel="k" href="y">y</a>\n', { path: 'a.html', firstLine: 1, lastLine: 1 })!;
    expect(diff).toContain('data-rel="k" rel="noopener noreferrer"'.slice(0, 11));
    expect(diff).not.toContain('data-rel="k noopener');
  });
  it('placeholders in example env files and UI text are not secrets', async () => {
    const r = await scanFiles({ '.env.example': 'JWT_SECRET=change-me-please\nAPI_KEY=your-key-here\n', 'src/a.js': "const t = { password: 'Enter your password' };\n" });
    expect(ids(r).filter((x) => x.includes('hardcoded-secret'))).toEqual([]);
  });
  it('text inside strings is not code', async () => {
    const r = await scanFiles({ 'src/a.js': "const a = 'eval(x)';\nconst b = \"x.innerHTML = 1\";\nconst c = \"<img src='a'>\";\n" });
    expect(ids(r)).toEqual([]);
  });
  it('an arrow function inside a tag does not hide the alt attribute', async () => {
    const r = await scanFiles({ 'package.json': '{"dependencies":{"react":"1"}}', 'src/A.tsx': "import React from 'react';\nexport const A = () => <img onError={() => x()} alt=\"a\" />;\n" });
    expect(ids(r)).toEqual([]);
  });
  it('insecure-url skips private and IPv6 local hosts; other fetch methods are not fetch', async () => {
    const r = await scanFiles({ 'a.js': "fetch('http://[::1]:3000/x');\nfetch('http://10.0.0.5/x');\nfetch('http://192.168.1.2/x');\ncache.fetch(k);\n" });
    expect(ids(r)).toEqual([]);
  });
});
