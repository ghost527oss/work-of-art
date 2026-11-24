// @node: F1.3
import { describe, expect, it } from 'vitest';
import { buildInventory, extensionOf, type TreeEntry } from '../src/engine/repoInventory';
import { RepoInventorySchema } from '../src/types/contracts';

const opts = { truncated: false, maxEntries: 1000 };

const sampleTree: TreeEntry[] = [
  { path: 'src', type: 'tree' },
  { path: 'src/index.ts', type: 'blob', size: 120, mode: '100644' },
  { path: 'src/util', type: 'tree' },
  { path: 'src/util/math.ts', type: 'blob', size: 40 },
  { path: 'README.md', type: 'blob', size: 10 },
  { path: 'logo.png', type: 'blob', size: 5000 },
  { path: '.gitignore', type: 'blob', size: 3 },
];

describe('buildInventory: completeness', () => {
  it('creates one entry per tree item, including files whose content is never loaded', () => {
    const inv = buildInventory(sampleTree, opts);
    expect(inv.entries).toHaveLength(sampleTree.length);
    expect(new Set(inv.entries.map((e) => e.path))).toEqual(new Set(sampleTree.map((t) => t.path)));
    expect(inv.treeComplete).toBe(true);
    expect(inv.treeWarnings).toEqual([]);
  });

  it('marks blobs as files and trees as directories', () => {
    const inv = buildInventory(sampleTree, opts);
    const byPath = new Map(inv.entries.map((e) => [e.path, e]));
    expect(byPath.get('src')?.entryType).toBe('directory');
    expect(byPath.get('src/util')?.entryType).toBe('directory');
    expect(byPath.get('src/index.ts')?.entryType).toBe('file');
  });

  it('gives files an initial indexed_not_loaded status and directories none', () => {
    const inv = buildInventory(sampleTree, opts);
    for (const e of inv.entries) {
      if (e.entryType === 'file') expect(e.loadStatus).toBe('indexed_not_loaded');
      else expect(e.loadStatus).toBeUndefined();
    }
  });

  it('records extension (lower-case, no dot) and size for files', () => {
    const inv = buildInventory([{ path: 'a/B.TS', type: 'blob', size: 7 }], opts);
    expect(inv.entries[0]).toMatchObject({ extension: 'ts', sizeBytes: 7 });
  });

  it('leaves size undefined when GitHub gives none or an invalid value', () => {
    const inv = buildInventory(
      [
        { path: 'a', type: 'blob' },
        { path: 'b', type: 'blob', size: -1 },
        { path: 'c', type: 'blob', size: 1.5 },
      ],
      opts,
    );
    for (const e of inv.entries) expect(e.sizeBytes).toBeUndefined();
  });

  it('returns a valid empty inventory for an empty tree', () => {
    const inv = buildInventory([], opts);
    expect(inv).toEqual({ entries: [], treeComplete: true, treeWarnings: [] });
  });

  it('produces output that passes the contract schema', () => {
    expect(RepoInventorySchema.safeParse(buildInventory(sampleTree, opts)).success).toBe(true);
  });
});

describe('buildInventory: placeholder classification', () => {
  it('marks every entry unknown with low confidence and no evidence', () => {
    const inv = buildInventory(sampleTree, opts);
    for (const e of inv.entries) {
      expect(e.classifications).toEqual(['unknown']);
      expect(e.confidence).toBe('low');
      expect(e.evidence).toEqual([]);
    }
  });

  it('does not share array instances between entries', () => {
    const inv = buildInventory(sampleTree, opts);
    expect(inv.entries[0]!.classifications).not.toBe(inv.entries[1]!.classifications);
  });
});

describe('buildInventory: truncated tree', () => {
  it('sets treeComplete=false and adds a warning', () => {
    const inv = buildInventory(sampleTree, { ...opts, truncated: true });
    expect(inv.treeComplete).toBe(false);
    expect(inv.treeWarnings.join(' ')).toMatch(/truncated/i);
    expect(inv.entries).toHaveLength(sampleTree.length);
  });
});

describe('buildInventory: entry cap', () => {
  const big: TreeEntry[] = [
    { path: 'a', type: 'tree' },
    { path: 'b', type: 'tree' },
    { path: 'a/x', type: 'tree' },
    { path: 'a/x/deep1.ts', type: 'blob' },
    { path: 'a/x/deep2.ts', type: 'blob' },
    { path: 'root.ts', type: 'blob' },
  ];

  it('does nothing at exactly the cap', () => {
    const inv = buildInventory(big, { truncated: false, maxEntries: big.length });
    expect(inv.entries).toHaveLength(big.length);
    expect(inv.treeComplete).toBe(true);
  });

  it('reports the exact omitted count and marks the tree incomplete', () => {
    const inv = buildInventory(big, { truncated: false, maxEntries: 4 });
    expect(inv.entries).toHaveLength(4);
    expect(inv.treeComplete).toBe(false);
    expect(inv.treeWarnings.join(' ')).toMatch(/2 deeper entries are not represented/);
  });

  it('keeps shallow paths and drops the deepest first', () => {
    const inv = buildInventory(big, { truncated: false, maxEntries: 4 });
    const paths = inv.entries.map((e) => e.path);
    expect(paths).toEqual(['a', 'a/x', 'b', 'root.ts']);
  });

  it('adds both warnings when the tree is truncated and over the cap', () => {
    const inv = buildInventory(big, { truncated: true, maxEntries: 4 });
    expect(inv.treeWarnings).toHaveLength(2);
  });
});

describe('buildInventory: special entries', () => {
  it('lists submodules as directories with a warning', () => {
    const inv = buildInventory([{ path: 'vendor/lib', type: 'commit', mode: '160000' }, { path: 'a.ts', type: 'blob' }], opts);
    const sub = inv.entries.find((e) => e.path === 'vendor/lib');
    expect(sub?.entryType).toBe('directory');
    expect(inv.treeWarnings.join(' ')).toMatch(/Submodules .* vendor\/lib/);
    expect(inv.treeComplete).toBe(true);
  });

  it('caps the number of submodule names listed in the warning', () => {
    const subs: TreeEntry[] = Array.from({ length: 8 }, (_, i) => ({ path: `m${i}`, type: 'commit' }));
    const inv = buildInventory(subs, opts);
    expect(inv.treeWarnings.join(' ')).toMatch(/and 3 more/);
    expect(inv.entries).toHaveLength(8);
  });

  it('marks symlinks as skipped with the symlink reason', () => {
    const inv = buildInventory([{ path: 'link', type: 'blob', mode: '120000', size: 4 }], opts);
    expect(inv.entries[0]).toMatchObject({ entryType: 'file', loadStatus: 'skipped', reasonCode: 'symlink' });
    expect(inv.entries[0]!.reason).toBeTruthy();
  });

  it('counts duplicates, empty paths, and unknown types in a warning instead of dropping them silently', () => {
    const inv = buildInventory(
      [
        { path: 'a.ts', type: 'blob' },
        { path: 'a.ts', type: 'blob' },
        { path: '', type: 'blob' },
        { path: 'weird', type: 'mystery' },
      ],
      opts,
    );
    expect(inv.entries).toHaveLength(1);
    const warning = inv.treeWarnings.join(' ');
    expect(warning).toMatch(/3 tree entries were not represented/);
    expect(warning).toMatch(/1 duplicate paths/);
    expect(warning).toMatch(/1 entries with an empty path/);
    expect(warning).toMatch(/1 entries of unknown type/);
    // The inventory no longer matches what GitHub returned, so it cannot be called complete.
    expect(inv.treeComplete).toBe(false);
  });

  it('keeps treeComplete true when every entry is represented', () => {
    expect(buildInventory([{ path: 'a.ts', type: 'blob' }], opts).treeComplete).toBe(true);
  });
});

describe('buildInventory: determinism', () => {
  it('sorts by path regardless of input order', () => {
    const shuffled = [...sampleTree].reverse();
    const a = buildInventory(sampleTree, opts);
    const b = buildInventory(shuffled, opts);
    expect(b).toEqual(a);
    const paths = a.entries.map((e) => e.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('does not mutate its input', () => {
    const input: TreeEntry[] = [{ path: 'b', type: 'blob' }, { path: 'a', type: 'blob' }];
    const copy = structuredClone(input);
    buildInventory(input, { truncated: false, maxEntries: 1 });
    expect(input).toEqual(copy);
  });
});

describe('extensionOf', () => {
  it('handles normal, multi-dot, dotfile, and extensionless names', () => {
    expect(extensionOf('a/b.TS')).toBe('ts');
    expect(extensionOf('a/b.test.tsx')).toBe('tsx');
    expect(extensionOf('.gitignore')).toBeUndefined();
    expect(extensionOf('dir.d/Makefile')).toBeUndefined();
    expect(extensionOf('trailing.')).toBeUndefined();
  });
});
