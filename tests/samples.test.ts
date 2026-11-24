// @node: F1.6
import { describe, expect, it } from 'vitest';
import { BUDGETS } from '../src/config/budgets';
import { SAMPLES, buildSampleSnapshot, isSampleId, type SampleId } from '../src/data/sampleRepos';
import { POLICY_SKIP_REASONS, RepoSnapshotSchema, assertCoverageConsistent } from '../src/types/contracts';

const ids = SAMPLES.map((s) => s.id);

describe('sample list', () => {
  it('offers exactly three samples with labels and descriptions', () => {
    expect(ids).toEqual(['static-site', 'react-frontend', 'fullstack-api']);
    for (const s of SAMPLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it('recognises valid ids only', () => {
    expect(isSampleId('static-site')).toBe(true);
    expect(isSampleId('nope')).toBe(false);
    expect(isSampleId(undefined)).toBe(false);
    expect(isSampleId(42)).toBe(false);
  });
});

describe.each(ids)('sample "%s"', (id: SampleId) => {
  const snapshot = buildSampleSnapshot(id, 1000);

  it('is a valid snapshot that passes the coverage consistency check', () => {
    expect(RepoSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
  });

  it('is labelled as a sample and has no GitHub URL', () => {
    expect(snapshot.source).toBe('sample');
    expect(snapshot.owner).toBe('sample');
    expect(snapshot.name).toBe(id);
    expect(snapshot.repoUrl).toBeUndefined();
    expect(snapshot.loadedAt).toBe(1000);
  });

  it('has a complete tree and nothing deferred, truncated, or failed', () => {
    const c = snapshot.coverage;
    expect(c.treeComplete).toBe(true);
    expect(snapshot.inventory.treeComplete).toBe(true);
    expect(c.deferredSourceFiles).toBe(0);
    expect(c.truncatedFiles).toBe(0);
    expect(c.failedFiles).toBe(0);
    expect(c.sourceAnalysisComplete).toBe(true);
    expect(c.loadedSourceFiles).toBeGreaterThanOrEqual(5);
  });

  it('includes policy-skipped paths so coverage is not trivial', () => {
    const reasons = snapshot.coverage.skippedReasons;
    expect(reasons.length).toBeGreaterThanOrEqual(2);
    const codes = snapshot.inventory.entries.filter((e) => e.loadStatus === 'skipped').map((e) => e.reasonCode);
    for (const code of codes) expect(POLICY_SKIP_REASONS).toContain(code);
    for (const r of reasons) expect(r.reason.length).toBeGreaterThan(0);
  });

  it('lists every file and directory in the inventory, including unread ones', () => {
    const files = snapshot.inventory.entries.filter((e) => e.entryType === 'file');
    const dirs = snapshot.inventory.entries.filter((e) => e.entryType === 'directory');
    expect(files.length).toBe(snapshot.coverage.loadedSourceFiles + snapshot.coverage.skippedFiles);
    expect(dirs.length).toBeGreaterThan(0);
    expect(snapshot.coverage.indexedPaths).toBe(files.length + dirs.length);
    const paths = snapshot.inventory.entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('loads real, non-empty text for every loaded file and stays under the per-file limit', () => {
    expect(snapshot.files.length).toBe(snapshot.coverage.loadedSourceFiles);
    for (const f of snapshot.files) {
      expect(f.content?.length ?? 0, f.path).toBeGreaterThan(0);
      expect(new TextEncoder().encode(f.content ?? '').length, f.path).toBeLessThanOrEqual(BUDGETS.maxFilePrefixBytes);
      expect(f.loadStatus).toBe('loaded');
      expect(f.truncated).toBe(false);
    }
  });

  it('uses placeholder classification until spec 03', () => {
    for (const e of snapshot.inventory.entries) {
      expect(e.classifications).toEqual(['unknown']);
      expect(e.confidence).toBe('low');
    }
  });

  it('is deterministic for a fixed loadedAt and returns independent objects each time', () => {
    const a = buildSampleSnapshot(id, 5);
    const b = buildSampleSnapshot(id, 5);
    expect(b).toEqual(a);
    a.coverage.warnings.push('changed');
    a.inventory.entries.pop();
    expect(buildSampleSnapshot(id, 5)).toEqual(b);
  });
});

describe('sample content', () => {
  it('static-site has HTML, CSS, JS and an unread image', () => {
    const s = buildSampleSnapshot('static-site', 1);
    const loaded = s.files.map((f) => f.path);
    expect(loaded).toEqual(expect.arrayContaining(['index.html', 'css/styles.css', 'js/app.js']));
    expect(s.inventory.entries.find((e) => e.path === 'img/logo.png')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'excluded_media' });
    expect(s.files.some((f) => f.path === 'img/logo.png')).toBe(false);
  });

  it('react-frontend skips its lockfile and favicon but loads the components', () => {
    const s = buildSampleSnapshot('react-frontend', 1);
    expect(s.inventory.entries.find((e) => e.path === 'package-lock.json')?.reasonCode).toBe('excluded_lockfile');
    expect(s.inventory.entries.find((e) => e.path === 'public/favicon.ico')?.reasonCode).toBe('excluded_media');
    expect(s.files.map((f) => f.path)).toEqual(expect.arrayContaining(['src/App.tsx', 'src/components/LoginForm.tsx', 'src/api/auth.ts']));
    expect(s.files.find((f) => f.path === 'src/App.tsx')?.language).toBe('typescript');
  });

  it('fullstack-api loads its route, middleware, and service, and skips node_modules', () => {
    const s = buildSampleSnapshot('fullstack-api', 1);
    expect(s.files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['server/routes/profile.js', 'server/middleware/validate.js', 'server/services/profileService.js', '.env.example']),
    );
    expect(s.inventory.entries.find((e) => e.path === 'node_modules/express/index.js')?.reasonCode).toBe('excluded_dependency');
  });

  it('keeps secret values out of the samples: .env.example holds names only', () => {
    const s = buildSampleSnapshot('fullstack-api', 1);
    const env = s.files.find((f) => f.path === '.env.example')?.content ?? '';
    expect(env).toMatch(/SESSION_SECRET=\s*$/m);
    expect(env).not.toMatch(/SESSION_SECRET=\S/);
    expect(env).not.toMatch(/DATABASE_URL=\S/);
  });
});
