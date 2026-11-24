// @node: F1.3
import { describe, expect, it } from 'vitest';
import { BUDGETS, type Budgets } from '../src/config/budgets';
import { computeCoverage, exclusionFor, isInScope, planLoading, rankFor } from '../src/engine/fileSelector';
import { buildInventory, type TreeEntry } from '../src/engine/repoInventory';
import {
  assertCoverageConsistent,
  type FileLoadStatus,
  type ReasonCode,
  type RepoFile,
  type RepoInventory,
  type RepoInventoryEntry,
  type RepoSnapshot,
} from '../src/types/contracts';

function inventoryOf(files: Array<string | { path: string; size?: number; mode?: string }>): RepoInventory {
  const tree: TreeEntry[] = files.map((f) =>
    typeof f === 'string' ? { path: f, type: 'blob', size: 100 } : { path: f.path, type: 'blob', size: f.size, mode: f.mode },
  );
  return buildInventory(tree, { truncated: false, maxEntries: 100_000 });
}

function statusOf(inv: RepoInventory, path: string): RepoInventoryEntry {
  const e = inv.entries.find((x) => x.path === path);
  if (!e) throw new Error(`no entry ${path}`);
  return e;
}

const budgets: Budgets = { ...BUDGETS };

describe('exclusionFor: policy rules', () => {
  const cases: Array<[string, string | undefined]> = [
    ['node_modules/react/index.js', 'excluded_dependency'],
    ['a/vendor/lib.php', 'excluded_dependency'],
    ['.venv/lib/x.py', 'excluded_dependency'],
    ['dist/app.js', 'excluded_generated'],
    ['web/build/out.js', 'excluded_generated'],
    ['.next/server.js', 'excluded_generated'],
    ['coverage/lcov.info', 'excluded_generated'],
    ['.git/config', 'excluded_generated'],
    ['public/app.min.js', 'excluded_minified'],
    ['public/site.MIN.CSS', 'excluded_minified'],
    ['public/app.js.map', 'excluded_sourcemap'],
    ['package-lock.json', 'excluded_lockfile'],
    ['sub/yarn.lock', 'excluded_lockfile'],
    ['go.sum', 'excluded_lockfile'],
    ['img/logo.png', 'excluded_media'],
    ['img/logo.svg', 'excluded_media'],
    ['fonts/a.woff2', 'excluded_media'],
    ['docs/spec.pdf', 'excluded_media'],
    ['bin/tool.exe', 'excluded_media'],
    ['data/blob.xyz', 'unsupported_type'],
    ['Unknownfile', 'unsupported_type'],
    ['src/index.ts', undefined],
    ['styles/site.css', undefined],
    ['README.md', undefined],
    ['Dockerfile', undefined],
    ['.gitignore', undefined],
    ['.env.example', undefined],
    ['src/vendor.ts', undefined],
    ['.github/workflows/ci.yml', undefined],
    ['build.gradle.kts', undefined],
  ];
  for (const [path, expected] of cases) {
    it(`${path} -> ${expected ?? 'supported'}`, () => {
      expect(exclusionFor(path)?.reasonCode).toBe(expected);
    });
  }

  it('does not treat the file name itself as an excluded directory', () => {
    expect(exclusionFor('dist')?.reasonCode).toBe('unsupported_type');
  });
});

describe('isInScope', () => {
  it('treats no scope or an empty scope as everything', () => {
    expect(isInScope('a/b.ts', undefined)).toBe(true);
    expect(isInScope('a/b.ts', [])).toBe(true);
  });

  it('always includes root files', () => {
    expect(isInScope('package.json', ['src'])).toBe(true);
  });

  it('matches whole path segments only', () => {
    expect(isInScope('src/a.ts', ['src'])).toBe(true);
    expect(isInScope('src/deep/a.ts', ['src'])).toBe(true);
    expect(isInScope('src2/a.ts', ['src'])).toBe(false);
    expect(isInScope('other/src/a.ts', ['src'])).toBe(false);
    expect(isInScope('a/b/c.ts', ['a/b'])).toBe(true);
    expect(isInScope('a/bc/c.ts', ['a/b'])).toBe(false);
  });
});

describe('rankFor', () => {
  it('orders manifests, entry points, routes, source, styles, other text', () => {
    expect(rankFor('package.json')).toBe(0);
    expect(rankFor('web/vite.config.ts')).toBe(0);
    expect(rankFor('src/main.tsx')).toBe(1);
    expect(rankFor('index.html')).toBe(1);
    expect(rankFor('server/routes/user.ts')).toBe(2);
    expect(rankFor('api/repo.ts')).toBe(2);
    expect(rankFor('src/util/math.ts')).toBe(3);
    expect(rankFor('src/site.css')).toBe(4);
    expect(rankFor('docs/guide.md')).toBe(5);
    expect(rankFor('config/settings.yaml')).toBe(5);
  });

  it('ranks non-source files in route directories as other text', () => {
    expect(rankFor('api/readme.md')).toBe(5);
  });
});

describe('planLoading: rule assignment', () => {
  it('assigns each policy rule with a reason code and message', () => {
    const inv = inventoryOf(['node_modules/x.js', 'img/a.png', 'package-lock.json', 'src/a.ts']);
    const plan = planLoading(inv, { budgets });
    expect(statusOf(plan.inventory, 'node_modules/x.js')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'excluded_dependency' });
    expect(statusOf(plan.inventory, 'img/a.png')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'excluded_media' });
    expect(statusOf(plan.inventory, 'package-lock.json')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'excluded_lockfile' });
    expect(statusOf(plan.inventory, 'node_modules/x.js').reason).toBeTruthy();
    expect(statusOf(plan.inventory, 'src/a.ts').loadStatus).toBe('indexed_not_loaded');
    expect(plan.batches).toEqual([['src/a.ts']]);
  });

  it('skips files above the hard ceiling and loads files at exactly the ceiling', () => {
    const inv = inventoryOf([
      { path: 'big.json', size: budgets.hardCeilingBytes + 1 },
      { path: 'edge.json', size: budgets.hardCeilingBytes },
    ]);
    const plan = planLoading(inv, { budgets });
    expect(statusOf(plan.inventory, 'big.json')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'over_hard_ceiling' });
    expect(statusOf(plan.inventory, 'edge.json').reasonCode).toBeUndefined();
    expect(plan.batches.flat()).toEqual(['edge.json']);
  });

  it('plans files with unknown size', () => {
    const plan = planLoading(inventoryOf([{ path: 'a.ts' }]), { budgets });
    expect(plan.batches.flat()).toEqual(['a.ts']);
  });

  it('leaves entries already decided upstream (symlinks) untouched', () => {
    const inv = inventoryOf([{ path: 'link.ts', size: 4, mode: '120000' }, 'a.ts']);
    const plan = planLoading(inv, { budgets });
    expect(statusOf(plan.inventory, 'link.ts')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'symlink' });
    expect(plan.batches.flat()).toEqual(['a.ts']);
  });

  it('leaves directory entries unchanged', () => {
    const inv = buildInventory(
      [
        { path: 'src', type: 'tree' },
        { path: 'src/a.ts', type: 'blob', size: 1 },
      ],
      { truncated: false, maxEntries: 10 },
    );
    const plan = planLoading(inv, { budgets });
    expect(statusOf(plan.inventory, 'src')).toEqual(statusOf(inv, 'src'));
  });
});

describe('planLoading: scope', () => {
  const inv = inventoryOf(['package.json', 'src/a.ts', 'src2/b.ts', 'docs/c.md', 'node_modules/z.js']);

  it('defers files outside the scope as outside_scope, but keeps root files', () => {
    const plan = planLoading(inv, { scope: ['src'], budgets });
    expect(statusOf(plan.inventory, 'src2/b.ts')).toMatchObject({ loadStatus: 'indexed_not_loaded', reasonCode: 'outside_scope' });
    expect(statusOf(plan.inventory, 'docs/c.md')).toMatchObject({ loadStatus: 'indexed_not_loaded', reasonCode: 'outside_scope' });
    expect(plan.batches.flat().sort()).toEqual(['package.json', 'src/a.ts']);
  });

  it('applies exclusion rules before scope', () => {
    const plan = planLoading(inv, { scope: ['src'], budgets });
    expect(statusOf(plan.inventory, 'node_modules/z.js').reasonCode).toBe('excluded_dependency');
  });

  it('still lists every inventory entry', () => {
    const plan = planLoading(inv, { scope: ['src'], budgets });
    expect(plan.inventory.entries).toHaveLength(inv.entries.length);
  });
});

describe('planLoading: ordering and batches', () => {
  it('orders by rank, then depth, then path', () => {
    const inv = inventoryOf([
      'docs/guide.md',
      'src/z/deep/util.ts',
      'src/util.ts',
      'src/site.css',
      'api/users.ts',
      'src/main.tsx',
      'package.json',
    ]);
    const plan = planLoading(inv, { budgets });
    expect(plan.batches.flat()).toEqual([
      'package.json',
      'src/main.tsx',
      'api/users.ts',
      'src/util.ts',
      'src/z/deep/util.ts',
      'src/site.css',
      'docs/guide.md',
    ]);
  });

  it('is deterministic regardless of inventory input order', () => {
    const files = ['b.ts', 'a.ts', 'c/d.ts', 'README.md', 'package.json'];
    const a = planLoading(inventoryOf(files), { budgets });
    const b = planLoading(inventoryOf([...files].reverse()), { budgets });
    expect(b.batches).toEqual(a.batches);
    expect(b.inventory).toEqual(a.inventory);
  });

  it('never exceeds batchSize and keeps every planned file', () => {
    const files = Array.from({ length: 60 }, (_, i) => `src/f${String(i).padStart(2, '0')}.ts`);
    const plan = planLoading(inventoryOf(files), { budgets: { ...budgets, batchSize: 25 } });
    expect(plan.batches.map((b) => b.length)).toEqual([25, 25, 10]);
    expect(plan.batches.flat()).toHaveLength(60);
    expect(plan.candidateCount).toBe(60);
  });

  it('returns no batches for an empty inventory', () => {
    const plan = planLoading(inventoryOf([]), { budgets });
    expect(plan.batches).toEqual([]);
    expect(plan.candidateCount).toBe(0);
  });
});

describe('planLoading: total budget', () => {
  const small: Budgets = { ...budgets, maxFilePrefixBytes: 100, hardCeilingBytes: 1000, maxTotalLoadedBytes: 250 };

  it('defers the first overflowing file and everything after it', () => {
    const inv = inventoryOf([
      { path: 'package.json', size: 100 },
      { path: 'a.ts', size: 100 },
      { path: 'b.ts', size: 100 },
      { path: 'c.ts', size: 10 },
    ]);
    const plan = planLoading(inv, { budgets: small });
    expect(plan.batches.flat()).toEqual(['package.json', 'a.ts']);
    expect(statusOf(plan.inventory, 'b.ts')).toMatchObject({ loadStatus: 'indexed_not_loaded', reasonCode: 'budget_reached' });
    expect(statusOf(plan.inventory, 'c.ts')).toMatchObject({ loadStatus: 'indexed_not_loaded', reasonCode: 'budget_reached' });
    expect(plan.warnings.join(' ')).toMatch(/2 supported files were not loaded/);
  });

  it('counts large files at the prefix limit, not their full size', () => {
    const inv = inventoryOf([
      { path: 'a.ts', size: 900 },
      { path: 'b.ts', size: 900 },
    ]);
    const plan = planLoading(inv, { budgets: small });
    expect(plan.batches.flat()).toEqual(['a.ts', 'b.ts']);
    expect(plan.warnings).toEqual([]);
  });

  it('counts unknown sizes at the prefix limit', () => {
    const inv = inventoryOf([{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }]);
    const plan = planLoading(inv, { budgets: small });
    expect(plan.batches.flat()).toEqual(['a.ts', 'b.ts']);
    expect(statusOf(plan.inventory, 'c.ts').reasonCode).toBe('budget_reached');
  });

  it('does not defer anything when everything fits exactly', () => {
    const inv = inventoryOf([{ path: 'a.ts', size: 125 }, { path: 'b.ts', size: 125 }]);
    const plan = planLoading(inv, { budgets: { ...small, maxFilePrefixBytes: 125 } });
    expect(plan.batches.flat()).toHaveLength(2);
    expect(plan.warnings).toEqual([]);
  });
});

describe('planLoading: purity', () => {
  it('does not mutate the input inventory', () => {
    const inv = inventoryOf(['node_modules/x.js', 'a.ts']);
    const copy = structuredClone(inv);
    planLoading(inv, { scope: ['zzz'], budgets });
    expect(inv).toEqual(copy);
  });

  it('keeps tree completeness and warnings', () => {
    const inv = { ...inventoryOf(['a.ts']), treeComplete: false, treeWarnings: ['w'] };
    const plan = planLoading(inv, { budgets });
    expect(plan.inventory.treeComplete).toBe(false);
    expect(plan.inventory.treeWarnings).toEqual(['w']);
  });
});

// ---------------------------------------------------------------------------
// computeCoverage
// ---------------------------------------------------------------------------

interface Spec {
  path: string;
  status: FileLoadStatus;
  reasonCode?: ReasonCode;
  content?: string;
}

/** Builds an inventory and matching files[] from explicit per-file statuses. */
function scenario(specs: Spec[], opts: { treeComplete?: boolean; treeWarnings?: string[]; withDir?: boolean } = {}) {
  const entries: RepoInventoryEntry[] = specs.map((s) => ({
    path: s.path,
    entryType: 'file',
    loadStatus: s.status,
    classifications: ['unknown'],
    confidence: 'low',
    evidence: [],
    ...(s.reasonCode ? { reasonCode: s.reasonCode, reason: `reason for ${s.reasonCode}` } : {}),
  }));
  if (opts.withDir) {
    entries.push({ path: 'src', entryType: 'directory', classifications: ['unknown'], confidence: 'low', evidence: [] });
  }
  const inventory: RepoInventory = {
    entries,
    treeComplete: opts.treeComplete ?? true,
    treeWarnings: opts.treeWarnings ?? [],
  };
  const files: RepoFile[] = specs
    .filter((s) => s.status === 'loaded' || s.status === 'truncated')
    .map((s) => ({
      path: s.path,
      content: s.content ?? 'x',
      language: 'text',
      loadStatus: s.status,
      classifications: ['unknown'],
      classificationConfidence: 'low',
      classificationEvidence: [],
      needsUserReview: false,
      truncated: s.status === 'truncated',
    }));
  return { inventory, files };
}

function snapshotOf(inventory: RepoInventory, files: RepoFile[], extra: string[] = []): RepoSnapshot {
  return {
    id: 'o/r@main#1',
    owner: 'o',
    name: 'r',
    ref: 'main',
    source: 'github',
    inventory,
    files,
    coverage: computeCoverage(inventory, files, extra),
    loadedAt: 1,
  };
}

describe('computeCoverage: expected figures', () => {
  const table: Array<{
    name: string;
    specs: Spec[];
    opts?: Parameters<typeof scenario>[1];
    complete: boolean;
    counts: Partial<Record<'loaded' | 'deferred' | 'skipped' | 'truncated' | 'failed', number>>;
  }> = [
    {
      name: 'everything loaded',
      specs: [{ path: 'a.ts', status: 'loaded' }, { path: 'b.ts', status: 'loaded' }],
      complete: true,
      counts: { loaded: 2 },
    },
    {
      name: 'one deferred (budget)',
      specs: [
        { path: 'a.ts', status: 'loaded' },
        { path: 'b.ts', status: 'indexed_not_loaded', reasonCode: 'budget_reached' },
      ],
      complete: false,
      counts: { loaded: 1, deferred: 1 },
    },
    {
      name: 'one deferred (outside scope)',
      specs: [{ path: 'a.ts', status: 'indexed_not_loaded', reasonCode: 'outside_scope' }],
      complete: false,
      counts: { deferred: 1 },
    },
    {
      name: 'one truncated',
      specs: [{ path: 'a.ts', status: 'truncated', reasonCode: 'over_file_prefix' }],
      complete: false,
      counts: { truncated: 1 },
    },
    {
      name: 'one failed',
      specs: [{ path: 'a.ts', status: 'loaded' }, { path: 'b.ts', status: 'failed', reasonCode: 'fetch_failed' }],
      complete: false,
      counts: { loaded: 1, failed: 1 },
    },
    {
      name: 'skipped over the hard ceiling',
      specs: [{ path: 'a.ts', status: 'loaded' }, { path: 'big.json', status: 'skipped', reasonCode: 'over_hard_ceiling' }],
      complete: false,
      counts: { loaded: 1, skipped: 1 },
    },
    {
      name: 'policy exclusions only',
      specs: [
        { path: 'a.ts', status: 'loaded' },
        { path: 'img.png', status: 'skipped', reasonCode: 'excluded_media' },
        { path: 'node_modules/x.js', status: 'skipped', reasonCode: 'excluded_dependency' },
        { path: 'link', status: 'skipped', reasonCode: 'symlink' },
        { path: 'notes.xyz', status: 'skipped', reasonCode: 'unsupported_type' },
      ],
      complete: true,
      counts: { loaded: 1, skipped: 4 },
    },
    {
      name: 'a supported file that turned out to be binary',
      specs: [
        { path: 'a.ts', status: 'loaded' },
        { path: 'utf16.cs', status: 'skipped', reasonCode: 'binary_content' },
      ],
      complete: false,
      counts: { loaded: 1, skipped: 1 },
    },
    {
      name: 'needs_review',
      specs: [{ path: 'a.ts', status: 'needs_review' }],
      complete: false,
      counts: {},
    },
    {
      name: 'truncated tree with everything else loaded',
      specs: [{ path: 'a.ts', status: 'loaded' }],
      opts: { treeComplete: false, treeWarnings: ['tree truncated'] },
      complete: false,
      counts: { loaded: 1 },
    },
    {
      name: 'empty repository',
      specs: [],
      complete: true,
      counts: {},
    },
  ];

  for (const row of table) {
    it(row.name, () => {
      const { inventory, files } = scenario(row.specs, row.opts);
      const cov = computeCoverage(inventory, files);
      expect(cov.loadedSourceFiles).toBe(row.counts.loaded ?? 0);
      expect(cov.deferredSourceFiles).toBe(row.counts.deferred ?? 0);
      expect(cov.skippedFiles).toBe(row.counts.skipped ?? 0);
      expect(cov.truncatedFiles).toBe(row.counts.truncated ?? 0);
      expect(cov.failedFiles).toBe(row.counts.failed ?? 0);
      expect(cov.sourceAnalysisComplete).toBe(row.complete);
      expect(cov.treeComplete).toBe(inventory.treeComplete);
      expect(cov.indexedPaths).toBe(inventory.entries.length);
      expect(() => assertCoverageConsistent(snapshotOf(inventory, files))).not.toThrow();
    });
  }
});

describe('computeCoverage: details', () => {
  it('counts directories in indexedPaths but not in file counts', () => {
    const { inventory, files } = scenario([{ path: 'src/a.ts', status: 'loaded' }], { withDir: true });
    const cov = computeCoverage(inventory, files);
    expect(cov.indexedPaths).toBe(2);
    expect(cov.loadedSourceFiles).toBe(1);
  });

  it('records one skippedReasons item per skipped file, using the entry reason', () => {
    const { inventory, files } = scenario([
      { path: 'a.png', status: 'skipped', reasonCode: 'excluded_media' },
      { path: 'b.png', status: 'skipped', reasonCode: 'excluded_media' },
    ]);
    const cov = computeCoverage(inventory, files);
    expect(cov.skippedReasons).toEqual([
      { path: 'a.png', reason: 'reason for excluded_media' },
      { path: 'b.png', reason: 'reason for excluded_media' },
    ]);
  });

  it('falls back to the reason code, then a generic word, when no reason text exists', () => {
    const inventory: RepoInventory = {
      entries: [
        { path: 'a', entryType: 'file', loadStatus: 'skipped', reasonCode: 'symlink', classifications: ['unknown'], confidence: 'low', evidence: [] },
        { path: 'b', entryType: 'file', loadStatus: 'skipped', classifications: ['unknown'], confidence: 'low', evidence: [] },
      ],
      treeComplete: true,
      treeWarnings: [],
    };
    expect(computeCoverage(inventory, []).skippedReasons).toEqual([
      { path: 'a', reason: 'symlink' },
      { path: 'b', reason: 'skipped' },
    ]);
  });

  it('sums UTF-8 bytes of loaded and truncated content', () => {
    const { inventory, files } = scenario([
      { path: 'a.ts', status: 'loaded', content: 'abc' },
      { path: 'b.ts', status: 'truncated', reasonCode: 'over_file_prefix', content: 'é' },
    ]);
    expect(computeCoverage(inventory, files).totalLoadedBytes).toBe(5);
  });

  it('puts tree warnings first, then extra warnings', () => {
    const { inventory, files } = scenario([], { treeWarnings: ['tree'] });
    expect(computeCoverage(inventory, files, ['budget']).warnings).toEqual(['tree', 'budget']);
  });

  it('counts a file entry with no status as deferred, never as analysed', () => {
    const inventory: RepoInventory = {
      entries: [{ path: 'a', entryType: 'file', classifications: ['unknown'], confidence: 'low', evidence: [] }],
      treeComplete: true,
      treeWarnings: [],
    };
    const cov = computeCoverage(inventory, []);
    expect(cov.deferredSourceFiles).toBe(1);
    expect(cov.sourceAnalysisComplete).toBe(false);
  });
});

describe('computeCoverage: agrees with assertCoverageConsistent', () => {
  it('holds for the real inventory, plan, and simulated load flow', () => {
    const inv = inventoryOf([
      'package.json',
      'src/main.tsx',
      'src/util.ts',
      'img/logo.png',
      'node_modules/x.js',
      { path: 'link.ts', mode: '120000', size: 3 },
      { path: 'huge.json', size: budgets.hardCeilingBytes + 1 },
    ]);
    const plan = planLoading(inv, { budgets });
    const planned = new Set(plan.batches.flat());
    const entries = plan.inventory.entries.map((e) =>
      planned.has(e.path) ? { ...e, loadStatus: 'loaded' as const } : e,
    );
    const inventory: RepoInventory = { ...plan.inventory, entries };
    const files: RepoFile[] = entries
      .filter((e) => e.loadStatus === 'loaded')
      .map((e) => ({
        path: e.path,
        content: 'content of ' + e.path,
        language: 'text',
        loadStatus: 'loaded',
        classifications: ['unknown'],
        classificationConfidence: 'low',
        classificationEvidence: [],
        needsUserReview: false,
        truncated: false,
      }));
    const snapshot = snapshotOf(inventory, files, plan.warnings);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
    expect(snapshot.coverage.loadedSourceFiles).toBe(3);
    expect(snapshot.coverage.skippedFiles).toBe(4);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
  });

  it('holds across 300 randomly generated inventories (seeded)', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const statuses: FileLoadStatus[] = ['loaded', 'truncated', 'indexed_not_loaded', 'skipped', 'failed', 'needs_review'];
    for (let n = 0; n < 300; n++) {
      const count = Math.floor(rand() * 12);
      const specs: Spec[] = Array.from({ length: count }, (_, i) => {
        const status = statuses[Math.floor(rand() * statuses.length)]!;
        const skipReasons: ReasonCode[] = ['over_hard_ceiling', 'binary_content', 'excluded_media', 'unsupported_type', 'symlink'];
        const reasonCode: ReasonCode | undefined =
          status === 'skipped' ? skipReasons[Math.floor(rand() * skipReasons.length)] : undefined;
        return { path: `f${i}.ts`, status, reasonCode, content: 'x'.repeat(Math.floor(rand() * 5)) };
      });
      const { inventory, files } = scenario(specs, { treeComplete: rand() < 0.8, withDir: rand() < 0.5 });
      const snapshot = snapshotOf(inventory, files);
      expect(() => assertCoverageConsistent(snapshot), `case ${n}`).not.toThrow();

      const anyIncomplete = specs.some(
        (s) =>
          s.status === 'truncated' ||
          s.status === 'indexed_not_loaded' ||
          s.status === 'failed' ||
          s.status === 'needs_review' ||
          s.reasonCode === 'over_hard_ceiling' ||
          s.reasonCode === 'binary_content',
      );
      expect(snapshot.coverage.sourceAnalysisComplete, `case ${n}`).toBe(inventory.treeComplete && !anyIncomplete);
    }
  });
});
