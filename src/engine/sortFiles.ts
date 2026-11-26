// @node: F5.4
// Sorts files with the skill-book. Every label comes from a skill. Pure and deterministic.
import type { ClassificationEvidence, RepoInventoryEntry, ReasonCode } from '../types/contracts';
import { FileClassificationSchema } from '../types/contracts';
import { UNDERSTANDING_LIMITS as L } from '../config/understandingLimits';
import { skillById } from '../skillbook';
import type { SortSkill } from '../skillbook';
import { redact } from './redact';
import { extOf } from './sourceScan';
import type { ScanResult } from './scanTypes';
import type { Edge, FileUnderstanding, Label, ManifestFacts } from './understandTypes';

const LABEL_ORDER = FileClassificationSchema.options as readonly Label[];
const STRENGTH_RANK = { strong: 0, moderate: 1, weak: 2 } as const;

/** Entries skipped on purpose and therefore not part of the project's own code. */
const IGNORE_REASONS: Partial<Record<ReasonCode, string>> = {
  excluded_dependency: 'dependency folder',
  excluded_generated: 'generated code',
  excluded_minified: 'minified file',
  excluded_lockfile: 'lock file',
  excluded_sourcemap: 'source map',
  symlink: 'symbolic link',
};

interface Hit { id: string; detail: string }

const IMAGE = new Set('png jpg jpeg gif webp svg ico bmp avif woff woff2 ttf otf eot mp3 mp4 webm'.split(' '));
const DOC_EXT = new Set(['md', 'mdx', 'rst', 'txt']);
const SERVER_LANG = new Set('py rb go rs java kt php cs ex'.split(' '));
const SCHEMA = new Set('sql prisma graphql gql proto'.split(' '));
const DATA_EXT = new Set('json yml yaml toml ini'.split(' '));
const FRONT_PKG = new Set(['react', 'react-dom', 'vue', 'svelte', 'solid-js', 'preact', '@angular/core']);
const SERVER_PKG = new Set(['express', 'fastify', 'koa', 'hono', '@hapi/hapi', 'next/server']);
const PY_SERVER = new Set('flask fastapi django starlette tornado bottle sanic'.split(' '));
const NODE_PKG = new Set(['fs', 'path', 'child_process', 'http', 'net']);
const DB_PKG = new Set('pg mysql mysql2 mongodb mongoose sqlite3 redis knex sequelize typeorm drizzle-orm @prisma/client sqlalchemy psycopg2 asyncpg pymongo peewee'.split(' '));
const HTTP_PKG = new Set('axios ky got node-fetch swr @tanstack/react-query requests httpx urllib3'.split(' '));
const FRONT_DIRS = new Set('components views pages screens public static client frontend web'.split(' '));
const BACK_DIRS = new Set('server backend routes controllers middleware handlers'.split(' '));
const DATA_DIRS = new Set('models schemas migrations prisma db database repositories'.split(' '));
const TEST_DIRS = new Set(['__tests__', 'tests', 'test', 'spec', 'e2e']);
const JS_FAMILY = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx']);

function cutDetail(s: string): string {
  return redact(s.length > L.maxDetailChars ? s.slice(0, L.maxDetailChars) : s).text;
}

/** Host and path only: no credentials and no query string. */
function safeAddress(a: string): string {
  return a.replace(/^(https?:\/\/)[^@/?#]*@/i, '$1').split(/[?#]/)[0]!;
}

function pkgBase(spec: string): string {
  if (spec.startsWith('node:')) return spec;
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0]!;
}

function pathHits(path: string): Hit[] {
  const hits: Hit[] = [];
  const parts = path.split('/');
  const base = parts[parts.length - 1]!;
  const lower = base.toLowerCase();
  const ext = extOf(path);
  const dirs = parts.slice(0, -1);
  const add = (id: string, detail: string) => { if (!hits.some((h) => h.id === id)) hits.push({ id, detail }); };

  if (IMAGE.has(ext)) add('sort.ext.image', `.${ext}`);
  const dirTest = dirs.find((d) => TEST_DIRS.has(d));
  if (/\.(test|spec)\./.test(lower)) add('sort.name.test', 'test file name');
  else if (/^test_.*\.py$/.test(lower) || /_test\.py$/.test(lower) || lower === 'conftest.py') add('sort.name.test', base);
  else if (dirTest) add('sort.name.test', `folder ${dirTest}`);
  if (DOC_EXT.has(ext) || /^(license|changelog|contributing)(\.|$)/i.test(base)) add('sort.ext.docs', ext ? `.${ext}` : base);
  const docDir = dirs.find((d) => d === 'docs' || d === 'documentation');
  if (docDir) add('sort.folder.docs', `folder ${docDir}`);
  const infra = lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower.startsWith('docker-compose.') || lower === 'procfile' ||
    ['vercel.json', 'netlify.toml', 'render.yaml'].includes(lower) || ext === 'tf' || path.startsWith('.github/workflows/');
  if (infra) add('sort.name.infra', base);
  const config = lower === 'package.json' || /^tsconfig.*\.json$/.test(lower) || /\.config\./.test(lower) || /^\.eslintrc/.test(lower) ||
    /^\.prettierrc/.test(lower) || ['.gitignore', '.editorconfig', '.nvmrc', '.babelrc', 'pipfile', 'pyproject.toml', 'setup.cfg'].includes(lower) ||
    lower.startsWith('.env') || /^requirements.*\.txt$/.test(lower);
  if (config) add('sort.name.config', base);
  else if (!infra && DATA_EXT.has(ext)) add('sort.ext.data-file', `.${ext}`);
  if (['html', 'htm', 'vue', 'svelte'].includes(ext)) add('sort.ext.markup', `.${ext}`);
  if (['css', 'scss', 'sass', 'less'].includes(ext)) add('sort.ext.style', `.${ext}`);
  if (ext === 'jsx' || ext === 'tsx') add('sort.ext.jsx', `.${ext}`);
  if (SERVER_LANG.has(ext)) add('sort.ext.server-lang', `.${ext}`);
  if (SCHEMA.has(ext)) add('sort.ext.schema', `.${ext}`);

  const pagesApi = parts[0] === 'pages' && parts[1] === 'api';
  const appApi = parts[0] === 'app' && parts[1] === 'api';
  const rootApi = parts[0] === 'api' && parts.length > 1;
  const frontDir = dirs.find((d, i) => FRONT_DIRS.has(d) && !(d === 'pages' && i === 0 && parts[1] === 'api'));
  if (frontDir) add('sort.folder.frontend', `folder ${frontDir}`);
  const backDir = dirs.find((d) => BACK_DIRS.has(d));
  if (backDir) add('sort.folder.backend', `folder ${backDir}`);
  else if (rootApi || pagesApi || appApi) add('sort.folder.backend', 'api folder');
  if (dirs.includes('services')) add('sort.folder.service', 'folder services');
  const dataDir = dirs.find((d) => DATA_DIRS.has(d));
  if (dataDir) add('sort.folder.data', `folder ${dataDir}`);
  if (dirs.some((d, i) => d === 'api' && i > 0) && !pagesApi && !appApi) add('sort.folder.client-api', 'api folder');
  return hits;
}

function contentHits(path: string, scan: ScanResult | undefined, facts: ManifestFacts): Hit[] {
  const hits: Hit[] = [];
  const ext = extOf(path);
  const add = (id: string, detail: string) => { if (!hits.some((h) => h.id === id)) hits.push({ id, detail }); };
  if (scan) {
    for (const imp of scan.imports) {
      if (scan.language === 'py' && (imp.dots ?? 0) > 0) continue;
      const spec = imp.spec;
      const base = scan.language === 'py' ? spec.split('.')[0]! : pkgBase(spec);
      if (scan.language === 'js' && (spec.startsWith('.') || spec.startsWith('/'))) continue;
      if (scan.language === 'js' && (FRONT_PKG.has(base) || (spec.startsWith('next/') && spec !== 'next/server'))) add('sort.import.frontend', base);
      if ((scan.language === 'js' && (SERVER_PKG.has(base) || spec === 'next/server')) || (scan.language === 'py' && PY_SERVER.has(base))) add('sort.import.server', base);
      if (scan.language === 'js' && (NODE_PKG.has(base) || spec.startsWith('node:'))) add('sort.import.node', base);
      if (DB_PKG.has(base) || spec.startsWith('django.db')) add('sort.import.db', base);
      if (HTTP_PKG.has(base)) add('sort.import.http-client', base);
    }
    if (scan.patterns.dom) add('sort.syntax.dom', 'uses the page or browser');
    if (scan.patterns.handler) add('sort.syntax.handler', 'request handler');
    if (scan.routes.length > 0) {
      add('sort.syntax.route-def', scan.routes[0]!.path);
      add('sort.syntax.route-data', scan.routes[0]!.path);
    }
    if (scan.calls.length > 0) add('sort.syntax.request-call', safeAddress(scan.calls[0]!.address));
  }
  if (JS_FAMILY.has(ext) && facts.pkgFrontend && !facts.pkgServer && path.startsWith('src/')) add('sort.manifest.frontend-project', 'package.json lists a screen library');
  if ((JS_FAMILY.has(ext) && facts.pkgServer && !facts.pkgFrontend) || (ext === 'py' && facts.pyServer)) add('sort.manifest.backend-project', 'project lists a server library');
  return hits;
}

function labelsFrom(hits: Hit[]): { labels: Label[]; confidence: 'high' | 'medium' | 'low'; used: Hit[] } {
  const skills = hits.map((h) => ({ h, s: skillById(h.id) as SortSkill }));
  const strongOther = skills.some(({ s }) => s.strength === 'strong' && ['assets', 'tests', 'documentation', 'configuration', 'infrastructure'].includes(s.label));
  const kept = skills.filter(({ s }) => !(strongOther && ['frontend', 'backend', 'api_data'].includes(s.label) && s.strength !== 'strong'));
  const byLabel = new Map<Label, typeof kept>();
  for (const k of kept) byLabel.set(k.s.label, [...(byLabel.get(k.s.label) ?? []), k]);
  const conf = (items: typeof kept): 'high' | 'medium' | 'low' => {
    const count = (st: string) => items.filter((i) => i.s.strength === st).length;
    if (count('strong') >= 1 || count('moderate') >= 2) return 'high';
    if (count('moderate') === 1 || count('weak') >= 2) return 'medium';
    return 'low';
  };
  const rank = { high: 2, medium: 1, low: 0 } as const;
  const perLabel = [...byLabel.entries()].map(([label, items]) => ({ label, items, c: conf(items) }));
  const anyHigher = perLabel.some((p) => p.c !== 'low');
  const final = anyHigher ? perLabel.filter((p) => p.c !== 'low') : perLabel;
  if (final.length === 0) return { labels: ['unknown'], confidence: 'low', used: [] };
  const labels = final.map((p) => p.label).sort((a, b) => LABEL_ORDER.indexOf(a) - LABEL_ORDER.indexOf(b));
  const confidence = final.reduce<'high' | 'medium' | 'low'>((m, p) => (rank[p.c] < rank[m] ? p.c : m), 'high');
  const used = final.flatMap((p) => p.items.map((i) => i.h));
  return { labels, confidence, used };
}

function evidenceFor(used: Hit[]): ClassificationEvidence[] {
  return used
    .map((h) => ({ h, s: skillById(h.id) as SortSkill }))
    .sort((a, b) => LABEL_ORDER.indexOf(a.s.label) - LABEL_ORDER.indexOf(b.s.label) || STRENGTH_RANK[a.s.strength] - STRENGTH_RANK[b.s.strength] || (a.s.id < b.s.id ? -1 : 1))
    .map(({ h, s }) => ({
      source: s.family === 'name' ? (s.id.startsWith('sort.ext') ? 'extension' : 'path') : s.family === 'folder' ? 'path' : s.family,
      description: `[${s.id}] ${s.explain} (${cutDetail(h.detail)})`,
    })) as ClassificationEvidence[];
}

export interface SortInput {
  entries: readonly RepoInventoryEntry[];
  /** Paths whose content was loaded. */
  loaded: ReadonlySet<string>;
  scans: ReadonlyMap<string, ScanResult>;
  facts: ManifestFacts;
  edges?: readonly Edge[];
  /** Files not analysed because of the time limit. */
  notAnalysed?: ReadonlySet<string>;
}

function build(entry: RepoInventoryEntry, hits: Hit[], hasContent: boolean): FileUnderstanding {
  const { labels, confidence, used } = labelsFrom(hits);
  const evidence = evidenceFor(used);
  const unknown = labels.length === 1 && labels[0] === 'unknown';
  if (unknown) evidence.push({ source: 'path', description: 'No clue found. Extension and folder do not say what this file is.' });
  if (!hasContent) evidence.push({ source: 'path', description: 'Not read; sorted by its path and type.' });
  return {
    path: entry.path, labels, confidence, evidence,
    needsReview: unknown || confidence === 'low', basis: hasContent ? 'content' : 'path_only', ignored: false,
  };
}

/** Sorts every file entry. With `edges`, also runs the reference skills (loaded-by-html, shared). */
export function sortAll(input: SortInput): FileUnderstanding[] {
  const out: FileUnderstanding[] = [];
  const loadedBy = new Map<string, string>();
  for (const e of input.edges ?? []) if (e.kind === 'loads' && e.targetPath && !loadedBy.has(e.targetPath)) loadedBy.set(e.targetPath, e.from);
  const files = input.entries.filter((e) => e.entryType === 'file').slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const own = new Map<string, Hit[]>();
  for (const entry of files) {
    const ignoredWhy = entry.reasonCode ? IGNORE_REASONS[entry.reasonCode] : undefined;
    if (ignoredWhy) {
      out.push({ path: entry.path, labels: [], confidence: 'low', evidence: [], needsReview: false, basis: 'path_only', ignored: true, ignoredReason: `Not part of the project's own code: ${ignoredWhy}.` });
      continue;
    }
    if (input.notAnalysed?.has(entry.path)) {
      out.push({ path: entry.path, labels: ['unknown'], confidence: 'low', evidence: [{ source: 'path', description: 'Not analysed: time limit.' }], needsReview: true, basis: 'path_only', ignored: false });
      continue;
    }
    try {
      const hasContent = input.loaded.has(entry.path);
      const hits = pathHits(entry.path);
      if (hasContent) hits.push(...contentHits(entry.path, input.scans.get(entry.path), input.facts));
      const by = loadedBy.get(entry.path);
      if (by) hits.push({ id: 'sort.ref.loaded-by-html', detail: `loaded by ${by}` });
      own.set(entry.path, hits);
      out.push(build(entry, hits, hasContent));
    } catch {
      out.push({ path: entry.path, labels: ['unknown'], confidence: 'low', evidence: [{ source: 'path', description: 'Could not be analysed.' }], needsReview: true, basis: 'path_only', ignored: false });
    }
  }
  if (input.edges) {
    // Second pass, once, in path order: `shared` from real import proof.
    const byPath = new Map(out.map((f) => [f.path, f]));
    const importersOf = new Map<string, string[]>();
    for (const e of input.edges) if (e.kind === 'imports' && e.certainty === 'confirmed' && e.targetPath) importersOf.set(e.targetPath, [...(importersOf.get(e.targetPath) ?? []), e.from]);
    const strongSide = (p: string, label: Label) => {
      const f = byPath.get(p);
      return !!f && !f.ignored && f.labels.includes(label) && (f.confidence === 'high' || f.confidence === 'medium');
    };
    for (const entry of files) {
      const f = byPath.get(entry.path);
      const hits = own.get(entry.path);
      if (!f || f.ignored || !hits) continue;
      if (hits.some((h) => ['frontend', 'backend'].includes((skillById(h.id) as SortSkill).label))) continue;
      const importers = [...new Set(importersOf.get(entry.path) ?? [])].sort();
      const front = importers.filter((p) => strongSide(p, 'frontend'));
      const back = importers.filter((p) => strongSide(p, 'backend'));
      if (front.length === 0 || back.length === 0) continue;
      const list = [...front, ...back].filter((p, i, a) => a.indexOf(p) === i).sort().slice(0, 3).join(', ');
      const next = build(entry, [...hits, { id: 'sort.ref.shared', detail: `imported by ${list}` }], input.loaded.has(entry.path));
      byPath.set(entry.path, next);
      out[out.findIndex((x) => x.path === entry.path)] = next;
    }
  }
  return out;
}
