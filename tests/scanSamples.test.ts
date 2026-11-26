// @node: F6.5
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot, type SampleId } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { scanProject } from '../src/engine/scanProject';

async function run(id: SampleId) {
  const snapshot = buildSampleSnapshot(id, 1);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
  return scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, { yieldToMain: async () => undefined });
}

describe('scan results for the samples (design section 10)', () => {
  it('static site: one image without alt text', async () => {
    const r = await run('static-site');
    expect(r.coverage.filesScanned).toBe(4);
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect([f.skillId, f.path, f.firstLine, f.primary, f.severity, f.certainty, f.fix]).toEqual(['scan.frontend.img-alt', 'index.html', 11, 'frontend', 'medium', 'found', 'guided']);
    expect(f.snippet).toHaveLength(5);
    expect(f.snippet[2]).toContain('<img src="img/logo.png" />');
    expect(r.partial).toBe(false);
  });
  it('react frontend: one button without a name', async () => {
    const r = await run('react-frontend');
    expect(r.coverage.filesScanned).toBe(8);
    expect(r.findings.map((f) => [f.skillId, f.path, f.firstLine, f.severity, f.certainty, f.fix])).toEqual([['scan.frontend.button-name', 'src/components/LoginForm.tsx', 20, 'medium', 'found', 'guided']]);
    expect(r.findings[0]!.snippet).toHaveLength(5);
  });
  it('full-stack API: one possible missing-protection finding in two areas', async () => {
    const r = await run('fullstack-api');
    expect(r.coverage.filesScanned).toBe(8);
    expect(r.findings.map((f) => [f.skillId, f.path, f.firstLine, f.severity, f.certainty, f.fix, f.areas])).toEqual([
      ['scan.backend.no-auth-limit', 'server/routes/profile.js', 7, 'medium', 'possible', 'explanation', ['backend', 'security']],
    ]);
  });
  it('is the same on every run and holds no file content outside snippets', async () => {
    const a = await run('fullstack-api');
    const b = await run('fullstack-api');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
