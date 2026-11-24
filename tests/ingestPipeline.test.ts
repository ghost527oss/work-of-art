// @node: F1.4
import { describe, expect, it } from 'vitest';
import { BUDGETS, type Budgets } from '../src/config/budgets';
import { IngestError, isAbortError, type FetchLike } from '../src/engine/githubSource';
import { buildSnapshotFromFiles, languageOf, runIngestion } from '../src/engine/ingestPipeline';
import { RepoSnapshotSchema, assertCoverageConsistent, type IngestEvent, type RepoRequest } from '../src/types/contracts';

// ---------------------------------------------------------------------------
// A fake GitHub
// ---------------------------------------------------------------------------

interface FakeRepo {
  files: Record<string, string | Uint8Array<ArrayBuffer>>;
  defaultBranch?: string;
  truncated?: boolean;
  /** Override the size the tree reports for a path. */
  sizes?: Record<string, number>;
  /** Extra tree entries (for example submodules). */
  extraTree?: Array<{ path: string; type: string; mode?: string; size?: number }>;
  emptyRepo?: boolean;
}

interface Fake {
  fetch: FetchLike;
  calls: string[];
  rawCalls: string[];
  inFlightMax: () => number;
}

interface FakeHooks {
  /** Return a Response to override a raw file answer. `n` is the 1-based raw call count. */
  raw?: (path: string, n: number) => Response | undefined;
  /** Awaited inside each raw call, to hold requests in flight. */
  rawDelay?: () => Promise<void>;
  /** Fail the tree call with this response. */
  tree?: () => Response | undefined;
  repoInfo?: () => Response | undefined;
}

function fakeGithub(repo: FakeRepo, hooks: FakeHooks = {}): Fake {
  const calls: string[] = [];
  const rawCalls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const encoder = new TextEncoder();
  const asBytes = (v: string | Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => (typeof v === 'string' ? encoder.encode(v) : v);

  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      if (u.pathname.includes('/git/trees/')) {
        const override = hooks.tree?.();
        if (override) return override;
        if (repo.emptyRepo) return new Response(JSON.stringify({ message: 'Git Repository is empty.' }), { status: 409 });
        const dirs = new Set<string>();
        const tree: Array<Record<string, unknown>> = [];
        for (const path of Object.keys(repo.files)) {
          const parts = path.split('/');
          for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
          tree.push({ path, type: 'blob', mode: '100644', size: repo.sizes?.[path] ?? asBytes(repo.files[path] as string).length });
        }
        for (const d of dirs) tree.push({ path: d, type: 'tree', mode: '040000' });
        for (const extra of repo.extraTree ?? []) tree.push(extra);
        return new Response(JSON.stringify({ tree, truncated: repo.truncated === true }), { status: 200 });
      }
      const override = hooks.repoInfo?.();
      if (override) return override;
      return new Response(JSON.stringify({ default_branch: repo.defaultBranch ?? 'main' }), { status: 200 });
    }
    // raw host
    rawCalls.push(url);
    const n = rawCalls.length;
    const path = decodeURIComponent(u.pathname.split('/').slice(4).join('/'));
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (hooks.rawDelay) await hooks.rawDelay();
      const override = hooks.raw?.(path, n);
      if (override) return override;
      const content = repo.files[path];
      if (content === undefined) return new Response('missing', { status: 404 });
      return new Response(asBytes(content));
    } finally {
      inFlight--;
    }
  };
  return { fetch: fetchImpl, calls, rawCalls, inFlightMax: () => maxInFlight };
}

const request: RepoRequest = { owner: 'octo', repo: 'demo' };

function collect() {
  const events: IngestEvent[] = [];
  return { events, emit: (e: IngestEvent) => events.push(e) };
}

const smallRepo: FakeRepo = {
  files: {
    'package.json': '{"name":"demo"}',
    'index.html': '<html></html>',
    'src/main.ts': 'console.log(1)',
    'src/util.ts': 'export const a = 1',
    'README.md': '# demo',
  },
};

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

// ---------------------------------------------------------------------------
// Happy path and events
// ---------------------------------------------------------------------------

describe('runIngestion: happy path', () => {
  it('returns a consistent, schema-valid snapshot with every file loaded', async () => {
    const fake = fakeGithub(smallRepo);
    const snapshot = await runIngestion(request, { fetch: fake.fetch });
    expect(RepoSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
    expect(snapshot).toMatchObject({ owner: 'octo', name: 'demo', ref: 'main', source: 'github' });
    expect(snapshot.files.map((f) => f.path)).toEqual(['README.md', 'index.html', 'package.json', 'src/main.ts', 'src/util.ts']);
    expect(snapshot.files.find((f) => f.path === 'src/main.ts')?.content).toBe('console.log(1)');
    expect(snapshot.files.find((f) => f.path === 'src/main.ts')?.language).toBe('typescript');
    expect(snapshot.coverage).toMatchObject({
      loadedSourceFiles: 5,
      deferredSourceFiles: 0,
      failedFiles: 0,
      treeComplete: true,
      sourceAnalysisComplete: true,
      indexedPaths: 6, // 5 files + 1 directory
    });
    expect(snapshot.repoUrl).toBe('https://github.com/octo/demo');
  });

  it('emits events in order and never emits result or error', async () => {
    const { events, emit } = collect();
    await runIngestion(request, { fetch: fakeGithub(smallRepo).fetch, emit });
    expect(events.map((e) => (e.type === 'stage' ? `${e.stage}:${e.status}` : e.type))).toEqual([
      'resolving_ref:started',
      'resolving_ref:finished',
      'fetching_tree:started',
      'fetching_tree:finished',
      'loading_sources:started',
      'progress',
      'progress',
      'loading_sources:finished',
    ]);
    expect(events.some((e) => e.type === 'result' || e.type === 'error')).toBe(false);
  });

  it('reports progress per batch with known totals', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 7; i++) files[`src/f${i}.ts`] = 'x';
    const { events, emit } = collect();
    const budgets: Budgets = { ...BUDGETS, batchSize: 3 };
    await runIngestion(request, { fetch: fakeGithub({ files }).fetch, emit, budgets });
    const progress = events.filter((e) => e.type === 'progress').map((e) => (e.type === 'progress' ? [e.loaded, e.total] : []));
    expect(progress).toEqual([[0, 7], [3, 7], [6, 7], [7, 7]]);
  });

  it('uses a provided ref without calling the repository endpoint and emits resolving_ref as skipped', async () => {
    const fake = fakeGithub(smallRepo);
    const { events, emit } = collect();
    const snapshot = await runIngestion({ ...request, ref: 'dev' }, { fetch: fake.fetch, emit });
    expect(snapshot.ref).toBe('dev');
    expect(fake.calls.filter((u) => u.endsWith('/repos/octo/demo'))).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: 'stage', stage: 'resolving_ref', status: 'skipped' });
  });

  it('works without an emit callback', async () => {
    await expect(runIngestion(request, { fetch: fakeGithub(smallRepo).fetch })).resolves.toBeTruthy();
  });

  it('sends the token only to the API host', async () => {
    const seen: Array<{ host: string; auth: string | undefined }> = [];
    const inner = fakeGithub(smallRepo).fetch;
    const spy: FetchLike = (url, init) => {
      const h = init?.headers as Record<string, string> | undefined;
      seen.push({ host: new URL(url).hostname, auth: h?.Authorization });
      return inner(url, init);
    };
    await runIngestion(request, { fetch: spy, token: 'tok' });
    expect(seen.filter((s) => s.host === 'api.github.com').every((s) => s.auth === 'Bearer tok')).toBe(true);
    expect(seen.filter((s) => s.host === 'raw.githubusercontent.com').every((s) => s.auth === undefined)).toBe(true);
    expect(seen.some((s) => s.host === 'raw.githubusercontent.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tree shapes
// ---------------------------------------------------------------------------

describe('runIngestion: tree edge cases', () => {
  it('returns a valid snapshot with a notice for an empty repository', async () => {
    const snapshot = await runIngestion(request, { fetch: fakeGithub({ files: {}, emptyRepo: true }).fetch });
    expect(snapshot.inventory.entries).toEqual([]);
    expect(snapshot.files).toEqual([]);
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/no files/i);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
  });

  it('marks everything incomplete when GitHub truncates the tree', async () => {
    const snapshot = await runIngestion(request, { fetch: fakeGithub({ ...smallRepo, truncated: true }).fetch });
    expect(snapshot.inventory.treeComplete).toBe(false);
    expect(snapshot.coverage.treeComplete).toBe(false);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/truncated/i);
    expect(snapshot.coverage.loadedSourceFiles).toBe(5);
  });

  it('lists submodules without following them', async () => {
    const repo: FakeRepo = { ...smallRepo, extraTree: [{ path: 'libs/sub', type: 'commit', mode: '160000' }] };
    const fake = fakeGithub(repo);
    const snapshot = await runIngestion(request, { fetch: fake.fetch });
    expect(snapshot.inventory.entries.find((e) => e.path === 'libs/sub')?.entryType).toBe('directory');
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/Submodules/);
    expect(fake.rawCalls.some((u) => u.includes('libs'))).toBe(false);
  });

  it('applies the inventory entry cap and reports it', async () => {
    const budgets: Budgets = { ...BUDGETS, maxInventoryEntries: 3 };
    const snapshot = await runIngestion(request, { fetch: fakeGithub(smallRepo).fetch, budgets });
    expect(snapshot.inventory.entries).toHaveLength(3);
    expect(snapshot.coverage.treeComplete).toBe(false);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// File-level outcomes
// ---------------------------------------------------------------------------

describe('runIngestion: file outcomes', () => {
  it('loads a truncated prefix for a file above the prefix limit but under the ceiling', async () => {
    const budgets: Budgets = { ...BUDGETS, maxFilePrefixBytes: 100, hardCeilingBytes: 1000 };
    const repo: FakeRepo = { files: { 'src/big.ts': 'a'.repeat(500), 'src/small.ts': 'ok' } };
    const snapshot = await runIngestion(request, { fetch: fakeGithub(repo).fetch, budgets });
    const entry = snapshot.inventory.entries.find((e) => e.path === 'src/big.ts');
    expect(entry).toMatchObject({ loadStatus: 'truncated', reasonCode: 'over_file_prefix' });
    const file = snapshot.files.find((f) => f.path === 'src/big.ts');
    expect(file?.truncated).toBe(true);
    expect(file?.content).toHaveLength(100);
    expect(snapshot.coverage).toMatchObject({ truncatedFiles: 1, loadedSourceFiles: 1, sourceAnalysisComplete: false });
  });

  it('skips a file above the hard ceiling without fetching it', async () => {
    const budgets: Budgets = { ...BUDGETS, maxFilePrefixBytes: 100, hardCeilingBytes: 1000 };
    const repo: FakeRepo = { files: { 'data.json': 'x', 'src/a.ts': 'ok' }, sizes: { 'data.json': 5000 } };
    const fake = fakeGithub(repo);
    const snapshot = await runIngestion(request, { fetch: fake.fetch, budgets });
    expect(snapshot.inventory.entries.find((e) => e.path === 'data.json')).toMatchObject({
      loadStatus: 'skipped',
      reasonCode: 'over_hard_ceiling',
    });
    expect(fake.rawCalls.some((u) => u.endsWith('data.json'))).toBe(false);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
  });

  it('marks a failed file and keeps going', async () => {
    const fake = fakeGithub(smallRepo, { raw: (path) => (path === 'src/util.ts' ? new Response('boom', { status: 500 }) : undefined) });
    const snapshot = await runIngestion(request, { fetch: fake.fetch });
    expect(snapshot.inventory.entries.find((e) => e.path === 'src/util.ts')).toMatchObject({
      loadStatus: 'failed',
      reasonCode: 'fetch_failed',
    });
    expect(snapshot.coverage).toMatchObject({ failedFiles: 1, loadedSourceFiles: 4, sourceAnalysisComplete: false });
    expect(snapshot.files.find((f) => f.path === 'src/util.ts')).toBeUndefined();
  });

  it('marks a missing file (404 on raw) as failed', async () => {
    const fake = fakeGithub(smallRepo, { raw: (path) => (path === 'README.md' ? new Response('', { status: 404 }) : undefined) });
    const snapshot = await runIngestion(request, { fetch: fake.fetch });
    expect(snapshot.coverage.failedFiles).toBe(1);
  });

  it('skips binary content found after fetching and reports the analysis as incomplete', async () => {
    const repo: FakeRepo = { files: { 'src/a.ts': 'ok', 'src/weird.ts': new Uint8Array([1, 2, 0, 3]) } };
    const snapshot = await runIngestion(request, { fetch: fakeGithub(repo).fetch });
    expect(snapshot.inventory.entries.find((e) => e.path === 'src/weird.ts')).toMatchObject({
      loadStatus: 'skipped',
      reasonCode: 'binary_content',
    });
    expect(snapshot.files.map((f) => f.path)).toEqual(['src/a.ts']);
    // A supported-type file that could not be read is not analysed, so the run is not complete.
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
    expect(snapshot.coverage.skippedFiles).toBe(1);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
  });

  it('applies policy exclusions without fetching those files', async () => {
    const repo: FakeRepo = {
      files: { 'src/a.ts': 'ok', 'node_modules/x/index.js': 'x', 'logo.png': 'png', 'package-lock.json': '{}' },
    };
    const fake = fakeGithub(repo);
    const snapshot = await runIngestion(request, { fetch: fake.fetch });
    expect(fake.rawCalls).toHaveLength(1);
    expect(snapshot.coverage.skippedFiles).toBe(3);
    expect(snapshot.coverage.skippedReasons.map((r) => r.path).sort()).toEqual(['logo.png', 'node_modules/x/index.js', 'package-lock.json']);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(true);
  });

  it('defers files past the total content budget', async () => {
    const budgets: Budgets = { ...BUDGETS, maxFilePrefixBytes: 10, maxTotalLoadedBytes: 25, hardCeilingBytes: 100 };
    const repo: FakeRepo = { files: { 'a.ts': 'aaaaaaaaaa', 'b.ts': 'bbbbbbbbbb', 'c.ts': 'cccccccccc' } };
    const fake = fakeGithub(repo);
    const snapshot = await runIngestion(request, { fetch: fake.fetch, budgets });
    expect(snapshot.coverage).toMatchObject({ loadedSourceFiles: 2, deferredSourceFiles: 1, sourceAnalysisComplete: false });
    expect(snapshot.inventory.entries.find((e) => e.path === 'c.ts')?.reasonCode).toBe('budget_reached');
    expect(fake.rawCalls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

describe('runIngestion: scope', () => {
  it('loads only the chosen folders plus root files, and lists the rest as outside_scope', async () => {
    const repo: FakeRepo = {
      files: { 'package.json': '{}', 'src/a.ts': 'a', 'docs/guide.md': 'g', 'src2/b.ts': 'b' },
    };
    const fake = fakeGithub(repo);
    const snapshot = await runIngestion({ ...request, scope: ['src'] }, { fetch: fake.fetch });
    expect(snapshot.files.map((f) => f.path)).toEqual(['package.json', 'src/a.ts']);
    expect(snapshot.inventory.entries.find((e) => e.path === 'docs/guide.md')).toMatchObject({
      loadStatus: 'indexed_not_loaded',
      reasonCode: 'outside_scope',
    });
    expect(fake.rawCalls).toHaveLength(2);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
    expect(snapshot.inventory.entries.length).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Degraded runs: rate limit and deadline
// ---------------------------------------------------------------------------

describe('runIngestion: degrade rules', () => {
  const many: FakeRepo = { files: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`src/f${i}.ts`, `v${i}`])) };
  const serial: Budgets = { ...BUDGETS, fetchConcurrency: 1, batchSize: 2 };

  it('stops at a mid-run rate limit and returns a partial, honestly incomplete snapshot', async () => {
    const reset = '1900000000';
    const fake = fakeGithub(many, {
      raw: (_p, n) => (n > 2 ? new Response('', { status: 429, headers: { 'x-ratelimit-reset': reset } }) : undefined),
    });
    const snapshot = await runIngestion(request, { fetch: fake.fetch, budgets: serial });
    expect(snapshot.coverage.loadedSourceFiles).toBe(2);
    expect(snapshot.coverage.deferredSourceFiles).toBe(4);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
    const deferred = snapshot.inventory.entries.filter((e) => e.loadStatus === 'indexed_not_loaded');
    expect(deferred.every((e) => e.reasonCode === 'rate_limited')).toBe(true);
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/rate limit/i);
    expect(snapshot.coverage.warnings.join(' ')).toContain(new Date(1_900_000_000 * 1000).toISOString());
    expect(fake.rawCalls).toHaveLength(3); // stopped right after the first 429
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
  });

  it('stops at the total deadline and defers the rest with deadline_reached', async () => {
    let t = 0;
    const budgets: Budgets = { ...serial, totalDeadlineMs: 2500 };
    const fake = fakeGithub(many, {
      raw: () => {
        t += 1000;
        return undefined;
      },
    });
    const snapshot = await runIngestion(request, { fetch: fake.fetch, budgets, now: () => t });
    expect(snapshot.coverage.loadedSourceFiles).toBe(3);
    expect(snapshot.coverage.deferredSourceFiles).toBe(3);
    const deferred = snapshot.inventory.entries.filter((e) => e.loadStatus === 'indexed_not_loaded');
    expect(deferred.every((e) => e.reasonCode === 'deadline_reached')).toBe(true);
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/Time limit/);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
  });

  it('never exceeds fetchConcurrency in flight', async () => {
    const budgets: Budgets = { ...BUDGETS, fetchConcurrency: 3, batchSize: 10 };
    const fake = fakeGithub(many, { rawDelay: () => new Promise((r) => setTimeout(r, 5)) });
    await runIngestion(request, { fetch: fake.fetch, budgets });
    expect(fake.inFlightMax()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Errors and cancellation
// ---------------------------------------------------------------------------

describe('runIngestion: errors', () => {
  it('propagates a not_found tree error after the earlier stage events, with no result', async () => {
    const { events, emit } = collect();
    const fake = fakeGithub(smallRepo, { tree: () => new Response('{}', { status: 404 }) });
    const err = (await rejection(runIngestion(request, { fetch: fake.fetch, emit }))) as IngestError;
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe('not_found');
    expect(events.map((e) => (e.type === 'stage' ? `${e.stage}:${e.status}` : e.type))).toEqual([
      'resolving_ref:started',
      'resolving_ref:finished',
      'fetching_tree:started',
    ]);
  });

  it('propagates a rate limit on the tree call as rate_limited with reset time', async () => {
    const fake = fakeGithub(smallRepo, {
      tree: () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' } }),
    });
    const err = (await rejection(runIngestion(request, { fetch: fake.fetch }))) as IngestError;
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBeTruthy();
  });

  it('propagates not_found for the repository lookup', async () => {
    const fake = fakeGithub(smallRepo, { repoInfo: () => new Response('{}', { status: 404 }) });
    const err = (await rejection(runIngestion(request, { fetch: fake.fetch }))) as IngestError;
    expect(err.code).toBe('not_found');
  });

  it('rejects invalid requests before any network call', async () => {
    const fake = fakeGithub(smallRepo);
    const bad: RepoRequest[] = [
      { owner: '-bad', repo: 'r' },
      { owner: 'o', repo: '..' },
      { owner: 'o', repo: 'r', ref: '../x' },
      { owner: 'o', repo: 'r', scope: ['../etc'] },
      { owner: 'o', repo: 'r', scope: Array.from({ length: 21 }, (_, i) => `d${i}`) },
    ];
    for (const req of bad) {
      const err = (await rejection(runIngestion(req, { fetch: fake.fetch }))) as IngestError;
      expect(err.code, JSON.stringify(req)).toBe('invalid_request');
    }
    expect(fake.calls).toHaveLength(0);
  });
});

describe('runIngestion: requirePublic', () => {
  const info = (body: Record<string, unknown>) => () => new Response(JSON.stringify(body));

  it('loads a repository GitHub confirms as public, and still resolves the default branch', async () => {
    const fake = fakeGithub(smallRepo, { repoInfo: info({ default_branch: 'main', private: false }) });
    const snapshot = await runIngestion(request, { fetch: fake.fetch, requirePublic: true });
    expect(snapshot.ref).toBe('main');
    expect(snapshot.files).toHaveLength(5);
  });

  it('rejects a private repository as not_found before fetching the tree or any file', async () => {
    const fake = fakeGithub(smallRepo, { repoInfo: info({ default_branch: 'main', private: true }) });
    const { events, emit } = collect();
    const err = (await rejection(runIngestion(request, { fetch: fake.fetch, requirePublic: true, emit }))) as IngestError;
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('The repository was not found, or the repository is private.');
    expect(fake.calls.some((u) => u.includes('/git/trees/'))).toBe(false);
    expect(fake.rawCalls).toHaveLength(0);
    expect(events.some((e) => e.type === 'result')).toBe(false);
  });

  it('fails closed when GitHub does not report the private flag', async () => {
    const fake = fakeGithub(smallRepo, { repoInfo: info({ default_branch: 'main' }) });
    const err = (await rejection(runIngestion(request, { fetch: fake.fetch, requirePublic: true }))) as IngestError;
    expect(err.code).toBe('not_found');
    expect(fake.rawCalls).toHaveLength(0);
  });

  it('checks visibility even when a ref is given, and reports the stage as run, not skipped', async () => {
    const fake = fakeGithub(smallRepo, { repoInfo: info({ default_branch: 'main', private: false }) });
    const { events, emit } = collect();
    const snapshot = await runIngestion({ ...request, ref: 'dev' }, { fetch: fake.fetch, requirePublic: true, emit });
    expect(snapshot.ref).toBe('dev');
    expect(fake.calls.filter((u) => u.endsWith('/repos/octo/demo'))).toHaveLength(1);
    expect(events.slice(0, 2)).toEqual([
      { type: 'stage', stage: 'resolving_ref', status: 'started' },
      { type: 'stage', stage: 'resolving_ref', status: 'finished', detail: 'Using "dev".' },
    ]);
  });

  it('rejects a private repository even when a ref is given', async () => {
    const fake = fakeGithub(smallRepo, { repoInfo: info({ default_branch: 'main', private: true }) });
    const err = (await rejection(runIngestion({ ...request, ref: 'dev' }, { fetch: fake.fetch, requirePublic: true }))) as IngestError;
    expect(err.code).toBe('not_found');
  });

  it('does not make the extra repository call when requirePublic is off and a ref is given', async () => {
    const fake = fakeGithub(smallRepo);
    await runIngestion({ ...request, ref: 'dev' }, { fetch: fake.fetch });
    expect(fake.calls.filter((u) => u.endsWith('/repos/octo/demo'))).toHaveLength(0);
  });
});

describe('runIngestion: cancellation', () => {
  it('rejects with AbortError when aborted mid-load, and emits no result', async () => {
    const controller = new AbortController();
    const { events, emit } = collect();
    const many = { files: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`src/f${i}.ts`, `v${i}`])) };
    const budgets: Budgets = { ...BUDGETS, fetchConcurrency: 1, batchSize: 2 };
    const fake = fakeGithub(many, {
      raw: (_p, n) => {
        if (n === 2) controller.abort();
        return undefined;
      },
    });
    const err = await rejection(runIngestion(request, { fetch: fake.fetch, signal: controller.signal, emit, budgets }));
    expect(isAbortError(err)).toBe(true);
    expect(events.some((e) => e.type === 'result' || e.type === 'error')).toBe(false);
    expect(fake.rawCalls.length).toBeLessThan(6);
  });

  it('rejects with AbortError and calls nothing when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = fakeGithub(smallRepo);
    const err = await rejection(runIngestion(request, { fetch: fake.fetch, signal: controller.signal }));
    expect(isAbortError(err)).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildSnapshotFromFiles
// ---------------------------------------------------------------------------

describe('buildSnapshotFromFiles', () => {
  const meta = { owner: 'sample', name: 'static-site', ref: 'main', source: 'sample' as const, loadedAt: 42 };
  const files = {
    'index.html': '<h1>hi</h1>',
    'css/site.css': 'h1{margin:0}',
    'js/app.js': 'console.log(1)',
    'img/logo.png': { size: 2048 },
    'node_modules/dep/index.js': 'x',
  };

  it('builds a consistent snapshot with directories, policy skips, and loaded files', () => {
    const snapshot = buildSnapshotFromFiles(meta, files);
    expect(RepoSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
    expect(snapshot).toMatchObject({ source: 'sample', owner: 'sample', name: 'static-site', loadedAt: 42 });
    expect(snapshot.files.map((f) => f.path)).toEqual(['css/site.css', 'index.html', 'js/app.js']);
    expect(snapshot.inventory.entries.filter((e) => e.entryType === 'directory').map((e) => e.path)).toEqual([
      'css',
      'img',
      'js',
      'node_modules',
      'node_modules/dep',
    ]);
    expect(snapshot.coverage).toMatchObject({ loadedSourceFiles: 3, skippedFiles: 2, treeComplete: true, sourceAnalysisComplete: true });
  });

  it('matches what a real ingestion produces for the same files', async () => {
    const textOnly = { 'index.html': '<h1>hi</h1>', 'src/a.ts': 'export {}', 'README.md': '# r' };
    const real = await runIngestion(request, { fetch: fakeGithub({ files: textOnly }).fetch, now: () => 42 });
    const sample = buildSnapshotFromFiles({ ...meta, owner: 'octo', name: 'demo', loadedAt: 42 }, textOnly);
    expect(sample.inventory).toEqual(real.inventory);
    expect(sample.files).toEqual(real.files);
    expect(sample.coverage).toEqual(real.coverage);
  });

  it('throws for a size-only file that the plan wants to load', () => {
    expect(() => buildSnapshotFromFiles(meta, { 'src/a.ts': { size: 10 } })).toThrow(/text content/);
  });

  it('throws for a supported sample file above the per-file limit', () => {
    const budgets: Budgets = { ...BUDGETS, maxFilePrefixBytes: 5 };
    expect(() => buildSnapshotFromFiles(meta, { 'a.ts': 'too long for the limit' }, budgets)).toThrow(/larger than/);
  });

  it('reports a deferred file when the budget is too small, and stays consistent', () => {
    const budgets: Budgets = { ...BUDGETS, maxFilePrefixBytes: 20, maxTotalLoadedBytes: 21, hardCeilingBytes: 100 };
    const snapshot = buildSnapshotFromFiles(meta, { 'a.ts': 'aaaaaaaaaa', 'b.ts': 'bbbbbbbbbb', 'c.ts': 'cc' }, budgets);
    expect(snapshot.coverage.deferredSourceFiles).toBe(1);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
  });
});

describe('languageOf', () => {
  it('maps known extensions and defaults to text', () => {
    expect(languageOf('a/b.tsx')).toBe('typescript');
    expect(languageOf('a/b.py')).toBe('python');
    expect(languageOf('Dockerfile')).toBe('text');
    expect(languageOf('x.unknown')).toBe('text');
  });
});
