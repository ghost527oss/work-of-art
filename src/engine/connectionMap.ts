// @node: F5.5
// Builds the connection map: resolves import targets, finds routes and mounts, matches calls to routes,
// and gives every edge a certainty. Pure and deterministic. Edges never hold source text.
import { UNDERSTANDING_LIMITS as L } from '../config/understandingLimits';
import { extOf } from './sourceScan';
import type { ScanCall, ScanResult } from './scanTypes';
import type { Certainty, Edge, EdgeKind } from './understandTypes';

const RESOLVE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const CODE_EXT = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py']);

export interface ConnectionInput {
  paths: ReadonlySet<string>;
  treeComplete: boolean;
  scans: ReadonlyMap<string, ScanResult>;
  /** Every file labelled backend had its content loaded (needed before a call can be Broken). */
  backendAllLoaded: boolean;
}

export interface ConnectionOutput {
  edges: Edge[];
  externals: string[];
  aliasImportsNotFollowed: number;
  partialReasons: string[];
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function normalize(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (out.length === 0) return null; out.pop(); } else out.push(seg);
  }
  return out.join('/');
}

function join(dir: string, rel: string): string | null {
  return normalize(rel.startsWith('/') ? rel : dir ? `${dir}/${rel}` : rel);
}

function pkgBase(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0]!;
}

function resolveFile(paths: ReadonlySet<string>, base: string | null): string | undefined {
  if (base === null) return undefined;
  if (paths.has(base)) return base;
  for (const e of RESOLVE_EXT) if (paths.has(base + e)) return base + e;
  for (const e of RESOLVE_EXT) if (paths.has(`${base}/index${e}`)) return `${base}/index${e}`;
  const m = /\.(m|c)?js$/.exec(base);
  if (m) {
    const stem = base.slice(0, -m[0].length);
    for (const e of ['.ts', '.tsx']) if (paths.has(stem + e)) return stem + e;
  }
  return undefined;
}

function resolvePyModule(paths: ReadonlySet<string>, dir: string, dots: number, module: string): string | undefined {
  const rel = module.split('.').filter(Boolean).join('/');
  const bases: string[] = [];
  if (dots > 0) {
    let d: string | null = dir;
    for (let i = 1; i < dots && d !== null; i++) d = d === '' ? null : dirOf(d);
    if (d === null) return undefined;
    bases.push(rel ? (d ? `${d}/${rel}` : rel) : d);
  } else {
    bases.push(rel, `src/${rel}`);
  }
  for (const b of bases) {
    if (!b) continue;
    if (paths.has(`${b}.py`)) return `${b}.py`;
    if (paths.has(`${b}/__init__.py`)) return `${b}/__init__.py`;
  }
  return undefined;
}

const isParam = (s: string) => /^(?::.+|\[.+\]|<.+>|\{.+\})$/.test(s);

function segs(p: string): string[] {
  return p.split(/[?#]/)[0]!.split('/').filter(Boolean);
}

interface Route { method?: string; path: string; file: string; line: number; unresolvedMount: boolean; note?: string }

function matches(route: string, address: string): { ok: boolean; unknown: boolean } {
  const r = segs(route);
  const a = segs(address);
  if (r.length !== a.length) return { ok: false, unknown: false };
  let unknown = false;
  for (let i = 0; i < r.length; i++) {
    const unk = a[i]!.includes('${') || /\{[^}]*\}/.test(a[i]!);
    if (isParam(r[i]!)) { if (unk) unknown = true; continue; }
    if (unk) { unknown = true; continue; }
    if (r[i] !== a[i]) return { ok: false, unknown: false };
  }
  return { ok: true, unknown };
}

function joinPath(prefix: string, path: string): string {
  const p = `${prefix.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  return p === '/' ? '/' : p.replace(/\/+$/, '') || '/';
}

function placementRoutes(paths: ReadonlySet<string>, scans: ReadonlyMap<string, ScanResult>): Route[] {
  const out: Route[] = [];
  for (const p of [...paths].sort()) {
    const ext = extOf(p);
    if (!CODE_EXT.has(ext) || ext === 'py') continue;
    const parts = p.split('/');
    const stem = (s: string) => s.replace(/\.[^.]+$/, '');
    let route: string | undefined;
    if (parts[0] === 'api' && parts.length === 2) route = `/api/${stem(parts[1]!)}`;
    else if (parts[0] === 'pages' && parts[1] === 'api') {
      const rest = parts.slice(2);
      rest[rest.length - 1] = stem(rest[rest.length - 1]!);
      if (rest[rest.length - 1] === 'index') rest.pop();
      route = '/api' + (rest.length ? '/' + rest.join('/') : '');
    } else if (parts[0] === 'app' && stem(parts[parts.length - 1]!) === 'route') {
      const folders = parts.slice(1, -1).filter((s) => !/^\(.*\)$/.test(s));
      route = '/' + folders.join('/');
    }
    if (route === undefined) continue;
    const methods = scans.get(p)?.patterns.handlerMethods ?? [];
    if (methods.length > 0 && parts[0] === 'app') for (const m of methods) out.push({ method: m, path: route, file: p, line: 1, unresolvedMount: false });
    else out.push({ path: route, file: p, line: 1, unresolvedMount: false });
  }
  return out;
}

export function buildConnections(input: ConnectionInput): ConnectionOutput {
  const { paths, scans } = input;
  const files = [...scans.keys()].sort();
  const edges: Edge[] = [];
  const externals = new Set<string>();
  let alias = 0;
  const unresolvedNote = 'the tree is incomplete, so the file may exist';
  const push = (e: Omit<Edge, 'id'>) => edges.push({ ...e, id: `${e.from}:${e.line}:${e.kind}:${e.target}` });
  const fileEdge = (kind: EdgeKind, from: string, line: number, target: string, resolved: string | undefined) => {
    if (resolved) push({ kind, from, line, target: resolved, targetPath: resolved, certainty: 'confirmed' });
    else if (input.treeComplete) push({ kind, from, line, target, certainty: 'broken' });
    else push({ kind, from, line, target, certainty: 'inferred', note: unresolvedNote });
  };

  // 1. imports, loads, config reads
  const importTargets = new Map<string, Map<string, string>>(); // file -> ident -> resolved file
  for (const from of files) {
    const scan = scans.get(from)!;
    alias += scan.aliasImports;
    const dir = dirOf(from);
    for (const imp of scan.imports) {
      if (scan.language === 'py') {
        const dots = imp.dots ?? 0;
        if (imp.names && imp.names.length > 0 && (dots > 0 || imp.spec)) {
          const subs = imp.names.map((n) => resolvePyModule(paths, dir, dots, imp.spec ? `${imp.spec}.${n}` : n)).filter((x): x is string => !!x);
          if (subs.length > 0) { for (const s of new Set(subs)) fileEdge('imports', from, imp.line, s, s); continue; }
        } else if (imp.names && imp.names.length > 0 && !imp.spec) {
          continue;
        }
        const r = resolvePyModule(paths, dir, dots, imp.spec);
        if (r) fileEdge('imports', from, imp.line, r, r);
        else if (dots > 0) fileEdge('imports', from, imp.line, `${'.'.repeat(dots)}${imp.spec}`, undefined);
        else externals.add(imp.spec.split('.')[0]!);
        continue;
      }
      const spec = imp.spec;
      if (spec.startsWith('.') || spec.startsWith('/')) fileEdge('imports', from, imp.line, spec, resolveFile(paths, join(dir, spec)));
      else if (!spec.startsWith('node:')) externals.add(pkgBase(spec));
    }
    for (const ld of scan.loads) fileEdge('loads', from, ld.line, ld.target, resolveFile(paths, join(dir, ld.target)));
    for (const ev of scan.env) push({ kind: 'reads_config', from, line: ev.line, target: ev.name, certainty: 'confirmed' });
    const targets = new Map<string, string>();
    for (const b of scan.bindings) {
      if (!b.spec) continue;
      if (scan.language === 'py') {
        const dots = /^\.*/.exec(b.spec)![0].length;
        const mod = b.spec.slice(dots);
        const r = resolvePyModule(paths, dir, dots, mod ? `${mod}.${b.name}` : b.name) ?? resolvePyModule(paths, dir, dots, mod);
        if (r) targets.set(b.name, r);
      } else if (b.spec.startsWith('.') || b.spec.startsWith('/')) {
        const r = resolveFile(paths, join(dir, b.spec));
        if (r) targets.set(b.name, r);
      }
    }
    importTargets.set(from, targets);
  }

  // 2. routes (with mounts)
  const routes: Route[] = [...placementRoutes(paths, scans)];
  const mountsOf = new Map<string, Array<{ prefix: string; by: string; line: number }>>();
  for (const from of files) {
    const scan = scans.get(from)!;
    for (const m of scan.mounts) {
      const local = scan.bindings.find((b) => b.name === m.ident && b.router);
      const target = importTargets.get(from)?.get(m.ident) ?? (local ? from : undefined);
      if (!target) continue;
      mountsOf.set(target, [...(mountsOf.get(target) ?? []), { prefix: m.prefix, by: from, line: m.line }]);
    }
  }
  for (const from of files) {
    const scan = scans.get(from)!;
    const mounts = mountsOf.get(from) ?? [];
    for (const r of scan.routes) {
      const own = scan.bindings.find((b) => b.name === r.owner);
      const needsMount = scan.language === 'py' ? !!own?.router : r.owner !== 'app';
      const ownPrefix = own?.prefix ?? '';
      if (needsMount && mounts.length === 0) {
        routes.push({ method: r.method, path: joinPath(ownPrefix, r.path), file: from, line: r.line, unresolvedMount: true, note: 'mount path unknown' });
      } else if (needsMount) {
        for (const mt of mounts) routes.push({ method: r.method, path: joinPath(mt.prefix, joinPath(ownPrefix, r.path)), file: from, line: r.line, unresolvedMount: false, note: `mounted at ${mt.prefix || '/'} by ${mt.by}:${mt.line}` });
      } else {
        routes.push({ method: r.method, path: joinPath(ownPrefix, r.path), file: from, line: r.line, unresolvedMount: false });
      }
    }
  }
  for (const r of routes) push({ kind: 'defines_route', from: r.file, line: r.line, target: `${r.method ?? 'ANY'} ${r.path}`, certainty: 'confirmed', ...(r.note ? { note: r.note } : {}) });

  // 3. calls
  const hasRoutes = routes.length > 0;
  const host = (a: string) => /^https?:\/\/([^/?#]+)/i.exec(a)?.[1] ?? a.slice(0, 60);
  for (const from of files) {
    for (const c of scans.get(from)!.calls as ScanCall[]) {
      if (c.external) { push({ kind: 'calls_external', from, line: c.line, target: host(c.address), certainty: 'confirmed' }); continue; }
      const method = c.method ?? 'GET';
      const hits = routes.map((r) => ({ r, m: matches(r.path, c.address) })).filter((x) => x.m.ok);
      const compatible = hits.filter((x) => !x.r.method || x.r.method === method);
      const address = c.address.split(/[?#]/)[0]!;
      if (hits.length > 0 && compatible.length === 0) {
        push({ kind: 'calls_api', from, line: c.line, target: `${method} ${address}`, certainty: 'broken', note: 'method differs' });
      } else if (compatible.length > 0) {
        const best = compatible[0]!;
        const inferred = c.unknown || compatible.every((x) => x.r.unresolvedMount) || best.m.unknown;
        push({
          kind: 'calls_api', from, line: c.line, target: `${method} ${best.r.path}`, targetPath: best.r.file,
          certainty: inferred ? 'inferred' : 'confirmed',
          ...(inferred ? { note: best.r.unresolvedMount ? 'mount path unknown' : 'the address has a part that is not known until it runs' } : {}),
        });
      } else if (!hasRoutes) {
        push({ kind: 'calls_api', from, line: c.line, target: `${method} ${address}`, certainty: 'inferred', note: 'No backend routes were found in this repository; the route may live elsewhere.' });
      } else if (input.backendAllLoaded) {
        push({ kind: 'calls_api', from, line: c.line, target: `${method} ${address}`, certainty: 'broken', note: 'No route matches this address.' });
      } else {
        push({ kind: 'calls_api', from, line: c.line, target: `${method} ${address}`, certainty: 'inferred', note: 'A backend file was not read, so the route may exist.' });
      }
    }
  }

  // 4. order and caps
  const cmp = (a: Edge, b: Edge) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
  edges.sort(cmp);
  const perFile = new Map<string, number>();
  const kept: Edge[] = [];
  const cappedFiles = new Set<string>(files.filter((f) => scans.get(f)!.capped));
  let droppedTotal = 0;
  for (const e of edges) {
    const n = perFile.get(e.from) ?? 0;
    if (n >= L.maxEdgesPerFile) { cappedFiles.add(e.from); continue; }
    if (kept.length >= L.maxEdgesTotal) { droppedTotal++; continue; }
    perFile.set(e.from, n + 1);
    kept.push(e);
  }
  const partialReasons: string[] = [];
  if (droppedTotal > 0) partialReasons.push(`Connection limit (${L.maxEdgesTotal.toLocaleString('en-US')}) reached: ${droppedTotal} later connections are missing.`);
  if (cappedFiles.size > 0) partialReasons.push(`Limit of ${L.maxEdgesPerFile} connections per file reached in ${cappedFiles.size} file${cappedFiles.size === 1 ? '' : 's'}.`);
  return { edges: kept, externals: [...externals].sort(), aliasImportsNotFollowed: alias, partialReasons };
}

export type { Certainty };
