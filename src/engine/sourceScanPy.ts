// @node: F5.3
// The basic Python scanner: imports, Flask/FastAPI routes and mounts, requests calls, config reads.
// Not read: Django URL files, class-based views, dynamic or star imports.
import { UNDERSTANDING_LIMITS as L } from '../config/understandingLimits';
import { emptyScan, type ScanResult } from './scanTypes';

const MAX_RESULTS = 200;

/** Blank comments and triple-quoted bodies, keeping line breaks. `skeleton` also blanks ordinary string bodies. */
function maskPy(src: string): { masked: string; skeleton: string } {
  const m: string[] = [];
  const k: string[] = [];
  let i = 0;
  const n = src.length;
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i]!;
    if (c === '#') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      const b = blank(src.slice(i, j));
      m.push(b); k.push(b); i = j; continue;
    }
    const tri = src.startsWith('"""', i) ? '"""' : src.startsWith("'''", i) ? "'''" : '';
    if (tri) {
      let j = src.indexOf(tri, i + 3);
      j = j === -1 ? n : j + 3;
      const b = blank(src.slice(i, j));
      m.push(b); k.push(b); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const closed = j < n && src[j] === c;
      const body = src.slice(i + 1, Math.min(j, n));
      m.push(c + body + (closed ? c : ''));
      k.push(c + blank(body) + (closed ? c : ''));
      i = closed ? j + 1 : Math.min(j, n);
      continue;
    }
    m.push(c); k.push(c); i++;
  }
  return { masked: m.join(''), skeleton: k.join('') };
}

function lineStarts(text: string): (o: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (o) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= o) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

export function scanPython(path: string, content: string): ScanResult {
  const out = emptyScan('py');
  const text = content.length > L.maxScanChars ? content.slice(0, L.maxScanChars) : content;
  const { masked, skeleton } = maskPy(text);
  const lineOf = lineStarts(text);
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base === 'urls.py' && /\b(?:re_)?path\s*\(/.test(skeleton)) out.djangoUrls = true;
  const room = () => out.imports.length + out.routes.length + out.calls.length + out.env.length < MAX_RESULTS;
  const lit = (open: number): { value: string; end: number; f: boolean } | null => {
    let p = open;
    let f = false;
    while (/[fFrRbBuU]/.test(skeleton[p] ?? '')) { if (/[fF]/.test(skeleton[p]!)) f = true; p++; }
    const q = skeleton[p];
    if (q !== '"' && q !== "'") return null;
    const close = skeleton.indexOf(q, p + 1);
    if (close === -1) return null;
    return { value: masked.slice(p + 1, close), end: close, f };
  };

  // imports (start of a line)
  const impRe = /^[ \t]*(?:import[ \t]+([\w.]+)(?:[ \t]+as[ \t]+\w+)?|from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+([^\n#]*))/gm;
  const bindings = new Map<string, string>();
  for (let m = impRe.exec(skeleton); m; m = impRe.exec(skeleton)) {
    if (!room()) { out.truncated = true; break; }
    const line = lineOf(m.index);
    if (m[1]) {
      out.imports.push({ spec: m[1], line, dots: 0, py: true });
    } else {
      let raw = m[4] ?? '';
      if (raw.includes('(') && !raw.includes(')')) {
        const close = skeleton.indexOf(')', m.index + m[0].length);
        if (close !== -1 && close - m.index < 2000) raw += ' ' + skeleton.slice(m.index + m[0].length, close);
      }
      const names = raw.replace(/[()\\]/g, ' ').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]!.trim()).filter((s) => /^\w+$/.test(s));
      out.imports.push({ spec: m[3] ?? '', line, dots: (m[2] ?? '').length, names, py: true });
      for (const nm of names) bindings.set(nm, `${m[2] ?? ''}${m[3] ?? ''}`);
    }
  }
  for (const [name, spec] of bindings) out.bindings.push({ name, spec, line: 0 });

  // bindings: X = Flask(...), Blueprint(...), FastAPI(...), APIRouter(...)
  const known = new Set<string>();
  const bindRe = /^[ \t]*(\w+)[ \t]*=[ \t]*(Flask|Blueprint|FastAPI|APIRouter)[ \t]*\(([^\n]{0,300})/gm;
  for (let m = bindRe.exec(skeleton); m; m = bindRe.exec(skeleton)) {
    known.add(m[1]!);
    const args = masked.slice(m.index, m.index + m[0].length);
    const pm = /\b(?:url_prefix|prefix)\s*=\s*(['"])([^'"]{0,200})\1/.exec(args);
    out.bindings.push({ name: m[1]!, line: lineOf(m.index), prefix: pm?.[2], router: m[2] === 'Blueprint' || m[2] === 'APIRouter' });
  }

  // route decorators
  const routeRe = /^[ \t]*@(\w+)\.(route|get|post|put|patch|delete)[ \t]*\([ \t]*(['"])/gm;
  for (let m = routeRe.exec(skeleton); m; m = routeRe.exec(skeleton)) {
    if (!known.has(m[1]!) || !room()) continue;
    const s = lit(m.index + m[0].length - 1);
    if (!s || !s.value.startsWith('/')) continue;
    const line = lineOf(m.index);
    if (m[2] === 'route') {
      const win = masked.slice(s.end, s.end + 200);
      const mm = /methods\s*=\s*\[([^\]]*)\]/.exec(win);
      const methods = mm ? [...mm[1]!.matchAll(/['"](\w+)['"]/g)].map((x) => x[1]!.toUpperCase()) : [];
      if (methods.length === 0) out.routes.push({ path: s.value, line, owner: m[1]! });
      for (const me of methods) out.routes.push({ method: me, path: s.value, line, owner: m[1]! });
    } else {
      out.routes.push({ method: m[2]!.toUpperCase(), path: s.value, line, owner: m[1]! });
    }
  }

  // mounts
  const mountRe = /\b\w+\.(?:register_blueprint|include_router)\s*\(\s*(\w+)([^\n]{0,200})/g;
  for (let m = mountRe.exec(skeleton); m; m = mountRe.exec(skeleton)) {
    const args = masked.slice(m.index, m.index + m[0].length);
    const pm = /\b(?:url_prefix|prefix)\s*=\s*(['"])([^'"]{0,200})\1/.exec(args);
    out.mounts.push({ prefix: pm?.[2] ?? '', ident: m[1]!, line: lineOf(m.index) });
  }

  // calls
  const callRe = /\b(requests|httpx)\.(get|post|put|patch|delete)\s*\(\s*(?=[fFrR]?['"])/g;
  const addCall = (at: number, method: string | undefined, index: number) => {
    const s = lit(at);
    if (!s || !room()) return;
    out.calls.push({ method, address: s.value.slice(0, L.maxDetailChars), line: lineOf(index), unknown: s.f && s.value.includes('{'), external: /^https?:\/\//i.test(s.value) });
  };
  for (let m = callRe.exec(skeleton); m; m = callRe.exec(skeleton)) addCall(m.index + m[0].length, m[2]!.toUpperCase(), m.index);
  const reqRe = /\b(?:requests|httpx)\.request\s*\(\s*(['"])\s*\1\s*,\s*(?=[fFrR]?['"])/g;
  for (let m = reqRe.exec(skeleton); m; m = reqRe.exec(skeleton)) {
    const method = masked.slice(m.index, m.index + m[0].length).match(/\(\s*['"](\w+)['"]/)?.[1]?.toUpperCase();
    addCall(m.index + m[0].length, method, m.index);
  }
  const urlRe = /\burllib\.request\.urlopen\s*\(\s*(?=[fFrR]?['"])/g;
  for (let m = urlRe.exec(skeleton); m; m = urlRe.exec(skeleton)) addCall(m.index + m[0].length, 'GET', m.index);

  // config reads
  const envRe = /\bos\.environ\s*\[\s*(['"])|\bos\.environ\.get\s*\(\s*(['"])|\bos\.getenv\s*\(\s*(['"])/g;
  for (let m = envRe.exec(skeleton); m; m = envRe.exec(skeleton)) {
    const s = lit(m.index + m[0].length - 1);
    if (s && /^\w+$/.test(s.value) && room()) out.env.push({ name: s.value, line: lineOf(m.index) });
  }
  void path;
  return out;
}
