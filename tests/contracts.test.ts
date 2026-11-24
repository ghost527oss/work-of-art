// @node: F1.1
import { describe, expect, it } from 'vitest';
import { BUDGETS, FALLBACK_ENABLED } from '../src/config/budgets';
import {
  IngestEventSchema,
  RepoRequestSchema,
  RepoSnapshotSchema,
  assertCoverageConsistent,
  type RepoInventoryEntry,
  type RepoSnapshot,
} from '../src/types/contracts';

const placeholder = { classifications: ['unknown'] as const, confidence: 'low' as const, evidence: [] };

function fileEntry(
  path: string,
  loadStatus: RepoInventoryEntry['loadStatus'],
  extra: Partial<RepoInventoryEntry> = {},
): RepoInventoryEntry {
  return {
    path,
    entryType: 'file',
    loadStatus,
    ...placeholder,
    classifications: [...placeholder.classifications],
    ...extra,
  };
}

function loadedFile(path: string, content: string, truncated = false): RepoSnapshot['files'][number] {
  return {
    path,
    content,
    language: 'text',
    loadStatus: truncated ? 'truncated' : 'loaded',
    classifications: ['unknown'],
    classificationConfidence: 'low',
    classificationEvidence: [],
    needsUserReview: false,
    truncated,
  };
}

/** A consistent snapshot: one loaded file, one policy-skipped file, one directory. */
function baseSnapshot(): RepoSnapshot {
  return {
    id: 'o/r@main#1',
    owner: 'o',
    name: 'r',
    ref: 'main',
    source: 'github',
    inventory: {
      entries: [
        { path: 'src', entryType: 'directory', ...placeholder, classifications: ['unknown'] },
        fileEntry('src/a.ts', 'loaded', { extension: 'ts', sizeBytes: 5 }),
        fileEntry('logo.png', 'skipped', { reasonCode: 'excluded_media', reason: 'media file' }),
      ],
      treeComplete: true,
      treeWarnings: [],
    },
    files: [loadedFile('src/a.ts', 'hello')],
    coverage: {
      indexedPaths: 3,
      loadedSourceFiles: 1,
      deferredSourceFiles: 0,
      skippedFiles: 1,
      truncatedFiles: 0,
      failedFiles: 0,
      totalLoadedBytes: 5,
      skippedReasons: [{ path: 'logo.png', reason: 'media file' }],
      warnings: [],
      treeComplete: true,
      sourceAnalysisComplete: true,
    },
    loadedAt: 1,
  };
}

describe('RepoRequestSchema', () => {
  it('accepts owner/repo, optional ref and scope', () => {
    expect(RepoRequestSchema.safeParse({ owner: 'o', repo: 'r' }).success).toBe(true);
    expect(RepoRequestSchema.safeParse({ owner: 'o', repo: 'r', ref: 'main', scope: ['src', 'api'] }).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(RepoRequestSchema.safeParse({ owner: 'o', repo: 'r', url: 'https://evil.example' }).success).toBe(false);
    expect(RepoRequestSchema.safeParse({ owner: 'o', repo: 'r', token: 'x' }).success).toBe(false);
  });

  it('rejects scope with more than 20 entries', () => {
    const scope = Array.from({ length: 21 }, (_, i) => `d${i}`);
    expect(RepoRequestSchema.safeParse({ owner: 'o', repo: 'r', scope }).success).toBe(false);
    expect(RepoRequestSchema.safeParse({ owner: 'o', repo: 'r', scope: scope.slice(0, 20) }).success).toBe(true);
  });

  it('rejects empty, missing, and non-string values', () => {
    expect(RepoRequestSchema.safeParse({ owner: '', repo: 'r' }).success).toBe(false);
    expect(RepoRequestSchema.safeParse({ repo: 'r' }).success).toBe(false);
    expect(RepoRequestSchema.safeParse({ owner: 1, repo: 'r' }).success).toBe(false);
  });
});

describe('IngestEventSchema', () => {
  it('accepts each event type', () => {
    expect(IngestEventSchema.safeParse({ type: 'stage', stage: 'fetching_tree', status: 'started' }).success).toBe(true);
    expect(IngestEventSchema.safeParse({ type: 'progress', stage: 'loading_sources', loaded: 1, total: 4 }).success).toBe(true);
    expect(IngestEventSchema.safeParse({ type: 'notice', code: 'fallback_in_use', message: 'm' }).success).toBe(true);
    expect(IngestEventSchema.safeParse({ type: 'error', error: { code: 'timeout', message: 'm' } }).success).toBe(true);
    expect(IngestEventSchema.safeParse({ type: 'result', response: { snapshot: baseSnapshot() } }).success).toBe(true);
  });

  it('rejects unknown types, bad stages, and bad error codes', () => {
    expect(IngestEventSchema.safeParse({ type: 'other' }).success).toBe(false);
    expect(IngestEventSchema.safeParse({ type: 'stage', stage: 'nope', status: 'started' }).success).toBe(false);
    expect(IngestEventSchema.safeParse({ type: 'error', error: { code: 'boom', message: 'm' } }).success).toBe(false);
    expect(IngestEventSchema.safeParse({ type: 'progress', stage: 'loading_sources', loaded: -1, total: 1 }).success).toBe(false);
  });
});

describe('RepoSnapshotSchema', () => {
  it('parses a valid snapshot', () => {
    expect(RepoSnapshotSchema.safeParse(baseSnapshot()).success).toBe(true);
  });

  it('rejects an invalid load status', () => {
    const bad = baseSnapshot() as unknown as { inventory: { entries: Array<{ loadStatus: string }> } };
    bad.inventory.entries[1]!.loadStatus = 'done';
    expect(RepoSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});

describe('assertCoverageConsistent', () => {
  it('passes for a consistent snapshot', () => {
    expect(() => assertCoverageConsistent(baseSnapshot())).not.toThrow();
  });

  it('fails when a count is wrong', () => {
    const s = baseSnapshot();
    s.coverage.loadedSourceFiles = 2;
    expect(() => assertCoverageConsistent(s)).toThrow(/loadedSourceFiles/);
  });

  it('fails when indexedPaths does not match the entries', () => {
    const s = baseSnapshot();
    s.coverage.indexedPaths = 2;
    expect(() => assertCoverageConsistent(s)).toThrow(/indexedPaths/);
  });

  it('fails when a deferred file exists but sourceAnalysisComplete is true', () => {
    const s = baseSnapshot();
    s.inventory.entries.push(fileEntry('src/b.ts', 'indexed_not_loaded', { reasonCode: 'budget_reached' }));
    s.coverage.indexedPaths = 4;
    s.coverage.deferredSourceFiles = 1;
    expect(() => assertCoverageConsistent(s)).toThrow(/sourceAnalysisComplete/);
    s.coverage.sourceAnalysisComplete = false;
    expect(() => assertCoverageConsistent(s)).not.toThrow();
  });

  it('fails when the tree is incomplete but sourceAnalysisComplete is true', () => {
    const s = baseSnapshot();
    s.inventory.treeComplete = false;
    s.coverage.treeComplete = false;
    expect(() => assertCoverageConsistent(s)).toThrow(/sourceAnalysisComplete/);
  });

  it('treats an over_hard_ceiling skip as incomplete but a policy skip as complete', () => {
    const s = baseSnapshot();
    s.inventory.entries.push(fileEntry('big.json', 'skipped', { reasonCode: 'over_hard_ceiling', reason: 'too big' }));
    s.coverage.indexedPaths = 4;
    s.coverage.skippedFiles = 2;
    s.coverage.skippedReasons.push({ path: 'big.json', reason: 'too big' });
    expect(() => assertCoverageConsistent(s)).toThrow(/sourceAnalysisComplete/);
    s.coverage.sourceAnalysisComplete = false;
    expect(() => assertCoverageConsistent(s)).not.toThrow();
  });

  it('treats a binary_content skip as incomplete too (supported type, not analysed)', () => {
    const s = baseSnapshot();
    s.inventory.entries.push(fileEntry('utf16.cs', 'skipped', { reasonCode: 'binary_content', reason: 'binary' }));
    s.coverage.indexedPaths = 4;
    s.coverage.skippedFiles = 2;
    s.coverage.skippedReasons.push({ path: 'utf16.cs', reason: 'binary' });
    expect(() => assertCoverageConsistent(s)).toThrow(/sourceAnalysisComplete/);
    s.coverage.sourceAnalysisComplete = false;
    expect(() => assertCoverageConsistent(s)).not.toThrow();
  });

  it('fails when a skipped file has no skippedReasons record', () => {
    const s = baseSnapshot();
    s.coverage.skippedReasons = [];
    expect(() => assertCoverageConsistent(s)).toThrow(/skippedReasons/);
  });

  it('fails when totalLoadedBytes is wrong', () => {
    const s = baseSnapshot();
    s.coverage.totalLoadedBytes = 6;
    expect(() => assertCoverageConsistent(s)).toThrow(/totalLoadedBytes/);
  });

  it('counts bytes, not characters', () => {
    const s = baseSnapshot();
    s.files = [loadedFile('src/a.ts', 'é')];
    s.coverage.totalLoadedBytes = 2;
    expect(() => assertCoverageConsistent(s)).not.toThrow();
  });

  it('fails when files[] contains a path missing from the inventory', () => {
    const s = baseSnapshot();
    s.files.push(loadedFile('ghost.ts', 'x'));
    expect(() => assertCoverageConsistent(s)).toThrow(/not in the inventory/);
  });

  it('fails when a loaded entry has no content in files[]', () => {
    const s = baseSnapshot();
    s.files = [];
    s.coverage.totalLoadedBytes = 0;
    expect(() => assertCoverageConsistent(s)).toThrow(/files has 0 items/);
  });

  it('fails when the truncated flag disagrees with the status', () => {
    const s = baseSnapshot();
    s.files[0]!.truncated = true;
    expect(() => assertCoverageConsistent(s)).toThrow(/truncated flag/);
  });

  it('fails when a file entry has no loadStatus', () => {
    const s = baseSnapshot();
    delete s.inventory.entries[1]!.loadStatus;
    expect(() => assertCoverageConsistent(s)).toThrow(/no loadStatus/);
  });

  it('reports truncated and failed files as incomplete', () => {
    const s = baseSnapshot();
    s.inventory.entries.push(fileEntry('t.ts', 'truncated', { reasonCode: 'over_file_prefix' }));
    s.files.push(loadedFile('t.ts', 'abc', true));
    s.coverage.indexedPaths = 4;
    s.coverage.truncatedFiles = 1;
    s.coverage.totalLoadedBytes = 8;
    expect(() => assertCoverageConsistent(s)).toThrow(/sourceAnalysisComplete/);
    s.coverage.sourceAnalysisComplete = false;
    expect(() => assertCoverageConsistent(s)).not.toThrow();

    s.inventory.entries.push(fileEntry('f.ts', 'failed', { reasonCode: 'fetch_failed' }));
    s.coverage.indexedPaths = 5;
    expect(() => assertCoverageConsistent(s)).toThrow(/failedFiles/);
    s.coverage.failedFiles = 1;
    expect(() => assertCoverageConsistent(s)).not.toThrow();
  });
});

describe('BUDGETS', () => {
  it('holds the approved values and stays provisional', () => {
    expect(BUDGETS.provisional).toBe(true);
    expect(BUDGETS.maxFilePrefixBytes).toBe(200 * 1024);
    expect(BUDGETS.maxTotalLoadedBytes).toBe(3 * 1024 * 1024);
    expect(BUDGETS.batchSize).toBe(25);
    expect(BUDGETS.requestTimeoutMs).toBe(15_000);
    expect(BUDGETS.hardCeilingBytes).toBeGreaterThan(BUDGETS.maxFilePrefixBytes);
    expect(BUDGETS.maxScopeEntries).toBe(20);
  });

  it('exposes a boolean fallback flag', () => {
    expect(typeof FALLBACK_ENABLED).toBe('boolean');
  });
});
