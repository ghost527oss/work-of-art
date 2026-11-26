// @node: F5.3
import { describe, expect, it } from 'vitest';
import { scanPython } from '../src/engine/sourceScanPy';
import { scanSource } from '../src/engine/sourceScan';

const py = (c: string, p = 'app.py') => scanPython(p, c);

describe('Python imports', () => {
  it('absolute, aliased, from, and relative forms', () => {
    const r = py(`import os\nimport a.b as c\nfrom x.y import z, w as q\nfrom . import m\nfrom .u import v\nfrom ..p import (\n  r,\n)\n`);
    expect(r.imports.map((i) => [i.spec, i.dots, i.names, i.line])).toEqual([
      ['os', 0, undefined, 1], ['a.b', 0, undefined, 2], ['x.y', 0, ['z', 'w'], 3], ['', 1, ['m'], 4], ['u', 1, ['v'], 5], ['p', 2, ['r'], 6],
    ]);
  });
  it('ignores comments and triple-quoted bodies', () => {
    const r = py(`# import nope\n"""\nimport nope2\nfrom x import y\n"""\nimport yes\n`);
    expect(r.imports.map((i) => i.spec)).toEqual(['yes']);
  });
});

describe('Python routes, mounts, calls, config', () => {
  it('Flask routes with methods, Blueprint prefix, and register_blueprint', () => {
    const r = py(`from flask import Flask, Blueprint\napp = Flask(__name__)\nbp = Blueprint('u', __name__, url_prefix='/users')\n\n@bp.route('/<id>', methods=['GET', 'PUT'])\ndef one(id): pass\n\n@app.get('/health')\ndef h(): pass\n\napp.register_blueprint(bp, url_prefix='/v1')\n`);
    expect(r.routes.map((x) => [x.method, x.path, x.owner, x.line])).toEqual([['GET', '/<id>', 'bp', 5], ['PUT', '/<id>', 'bp', 5], ['GET', '/health', 'app', 8]]);
    expect(r.bindings.find((b) => b.name === 'bp')).toMatchObject({ prefix: '/users', router: true });
    expect(r.mounts).toEqual([{ prefix: '/v1', ident: 'bp', line: 11 }]);
  });
  it('a route with no methods accepts any method; unknown decorators are not routes', () => {
    const r = py(`app = Flask(__name__)\n@app.route('/x')\ndef x(): pass\n@other.get('/y')\ndef y(): pass\n`);
    expect(r.routes).toEqual([{ path: '/x', line: 2, owner: 'app' }]);
  });
  it('requests, httpx, urlopen with f-strings', () => {
    const r = py(`import requests\nrequests.get('http://svc/x')\nrequests.post(f"/api/{uid}")\nrequests.request('DELETE', '/y')\n`);
    expect(r.calls.map((c) => [c.method, c.address, c.unknown, c.external])).toEqual([
      ['GET', 'http://svc/x', false, true], ['POST', '/api/{uid}', true, false], ['DELETE', '/y', false, false],
    ]);
  });
  it('config reads: names only', () => {
    const r = py(`import os\na = os.environ['A']\nb = os.environ.get('B', 'secretvalue')\nc = os.getenv("C")\n`);
    expect(r.env.map((e) => e.name)).toEqual(['A', 'B', 'C']);
    expect(JSON.stringify(r)).not.toContain('secretvalue');
  });
  it('Django URL files are noted, not followed', () => {
    expect(py(`urlpatterns = [path('a/', v)]\n`, 'site/urls.py').djangoUrls).toBe(true);
    expect(py(`x = 1\n`, 'site/urls.py').djangoUrls).toBe(false);
  });
  it('the dispatcher uses this scanner for .py and never throws', () => {
    expect(scanSource('x/app.py', 'import os\n').language).toBe('py');
    expect(() => scanPython('a.py', '"""'.repeat(10000))).not.toThrow();
  });
});
