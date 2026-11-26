// @node: F5.6
// The batched analysis run: scan files, build connections, sort files. No network, no AI, no snapshot changes.
import { UNDERSTANDING_LIMITS as L } from '../config/understandingLimits';
import { SKILLBOOK } from '../skillbook';
import type { RepoSnapshot } from '../types/contracts';
import { buildConnections } from './connectionMap';
import { languageOf, extOf } from './sourceScan';
import { scanSource } from './sourceScan';
import type { ScanResult } from './scanTypes';
import { sortAll } from './sortFiles';
import type { AnalysisResult, ManifestFacts } from './understandTypes';

export class AnalysisAbortError extends Error {
  constructor() {
    super('Analysis was cancelled.');
    this.name = 'AbortError';
  }
}

export interface AnalyzeOptions {
  signal?: AbortSignal;
  yieldToMain?: () => Promise<void>;
  now?: () => number;
  onProgress?: (p: { done: number; total: number }) => void;
}

const NOT_SCANNED_EXT = new Set('go php java rb rs c cpp h hpp cs kt swift vue svelte scss sass less ex dart lua'.split(' '));
const FRONT_PKG = ['react', 'react-dom', 'vue', 'svelte', 'solid-js', 'preact', '@angular/core', 'next'];
const SERVER_PKG = ['express', 'fastify', 'koa', 'hono', '@hapi/hapi'];
const PY_SERVER = ['flask', 'fastapi', 'django', 'starlette', 'tornado', 'bottle', 'sanic'];

function manifestFacts(snapshot: RepoSnapshot): ManifestFacts {
  const facts: ManifestFacts = { pkgFrontend: false, pkgServer: false, pyServer: false };
  for (const f of snapshot.files) {
    if (typeof f.content !== 'string') continue;
    const base = f.path.slice(f.path.lastIndexOf('/') + 1);
    if (base === 'package.json') {
      try {
        const j = JSON.parse(f.content) as Record<string, unknown>;
        const names = new Set<string>([...Object.keys((j.dependencies as object) ?? {}), ...Object.keys((j.devDependencies as object) ?? {})]);
        if (FRONT_PKG.some((n) => names.has(n))) facts.pkgFrontend = true;
        if (SERVER_PKG.some((n) => names.has(n))) facts.pkgServer = true;
      } catch { /* not valid JSON: no facts */ }
    } else if (/^requirements.*\.txt$/.test(base)) {
      for (const line of f.content.split('\n')) {
        const name = /^\s*([A-Za-z0-9_.-]+)/.exec(line)?.[1]?.toLowerCase();
        if (name && PY_SERVER.includes(name)) facts.pyServer = true;
      }
    }
  }
  return facts;
}

const num = (n: number) => n.toLocaleString('en-US');

export async function analyzeProject(snapshot: RepoSnapshot, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
  const now = options.now ?? (() => Date.now());
  const yieldToMain = options.yieldToMain ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const start = now();
  const check = () => { if (options.signal?.aborted) throw new AnalysisAbortError(); };
  check();

  let entries = snapshot.inventory.entries.filter((e) => e.entryType === 'file').sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const partialReasons: string[] = [];
  const allEntries = entries.length;
  if (entries.length > L.maxFileResults) {
    entries = entries.slice(0, L.maxFileResults);
    partialReasons.push(`File result limit (${num(L.maxFileResults)}) reached: ${num(allEntries - L.maxFileResults)} files are not listed.`);
  }
  const contentOf = new Map<string, string>();
  for (const f of snapshot.files) if (f.loadStatus !== 'failed' && typeof f.content === 'string') contentOf.set(f.path, f.content);
  const entryPaths = new Set(entries.map((e) => e.path));
  const loaded = new Set([...contentOf.keys()].filter((p) => entryPaths.has(p)));
  const facts = manifestFacts(snapshot);

  const scanTargets = [...loaded].filter((p) => languageOf(p) !== 'none').sort();
  const scans = new Map<string, ScanResult>();
  const notAnalysed = new Set<string>();
  let done = 0;
  const total = scanTargets.length;
  const limited = scanTargets.slice(0, L.maxScannedFiles);
  if (scanTargets.length > L.maxScannedFiles) {
    partialReasons.push(`File scan limit (${num(L.maxScannedFiles)}) reached: ${num(scanTargets.length - L.maxScannedFiles)} files were not scanned for connections.`);
  }
  let timedOut = false;
  for (let i = 0; i < limited.length; i += L.batchSize) {
    if (now() - start > L.maxMs) { timedOut = true; for (const p of limited.slice(i)) notAnalysed.add(p); break; }
    for (const p of limited.slice(i, i + L.batchSize)) {
      try { scans.set(p, scanSource(p, contentOf.get(p) as string)); } catch { /* one file failing never stops the run */ }
    }
    done = Math.min(i + L.batchSize, total);
    options.onProgress?.({ done, total });
    await yieldToMain();
    check();
  }
  if (timedOut) partialReasons.push(`Time limit (${L.maxMs / 1000} seconds) reached: ${num(notAnalysed.size)} files were not analysed.`);
  options.onProgress?.({ done: total, total });

  const first = sortAll({ entries, loaded, scans, facts, notAnalysed });
  const backendAllLoaded = first.filter((f) => f.labels.includes('backend')).every((f) => loaded.has(f.path));
  const conn = buildConnections({ paths: entryPaths, treeComplete: snapshot.inventory.treeComplete, scans, backendAllLoaded });
  partialReasons.push(...conn.partialReasons);
  const files = sortAll({ entries, loaded, scans, facts, edges: conn.edges, notAnalysed });

  const notScanned: Record<string, number> = {};
  for (const p of loaded) {
    const ext = extOf(p);
    if (languageOf(p) === 'none' && NOT_SCANNED_EXT.has(ext)) notScanned[ext] = (notScanned[ext] ?? 0) + 1;
  }
  const ignored = files.filter((f) => f.ignored).length;
  const read = files.filter((f) => !f.ignored && loaded.has(f.path)).length;
  return {
    snapshotId: snapshot.id,
    skillbookVersion: SKILLBOOK.version,
    files,
    edges: conn.edges,
    externals: conn.externals,
    coverage: {
      fileEntries: entries.length, read, pathOnly: files.length - ignored - read, ignored, scanned: scans.size,
      notScanned, aliasImportsNotFollowed: conn.aliasImportsNotFollowed,
      djangoUrlFilesSeen: [...scans.values()].some((s) => s.djangoUrls),
      partial: partialReasons.length > 0, partialReasons, notAnalysed: notAnalysed.size,
    },
  };
}
