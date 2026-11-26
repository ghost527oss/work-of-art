// @node: F5.1
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNDERSTANDING_LIMITS } from '../src/config/understandingLimits';
import { SKILLBOOK, skillById } from '../src/skillbook';
import { FileClassificationSchema } from '../src/types/contracts';

const JARGON = /\b(AST|regex|heuristic|DOM|middleware|endpoint|polymorphi|namespace|transpil|bundler)\b/i;

describe('skill-book', () => {
  it('has a version and unique stable ids with the sort.* prefix', () => {
    expect(SKILLBOOK.version).toBe(1);
    const ids = SKILLBOOK.sort.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^sort\.[a-z]+\.[a-z-]+$/);
  });
  it('every skill has a known label, a strength, a family, and plain jargon-free text', () => {
    for (const s of SKILLBOOK.sort) {
      expect(FileClassificationSchema.safeParse(s.label).success).toBe(true);
      expect(['strong', 'moderate', 'weak']).toContain(s.strength);
      expect(['name', 'folder', 'manifest', 'import', 'syntax', 'reference']).toContain(s.family);
      expect(s.explain.length).toBeGreaterThan(20);
      expect(s.explain + s.title).not.toMatch(JARGON);
      expect(skillById(s.id)).toBe(s);
    }
    expect(skillById('nope')).toBeUndefined();
  });
  it('contains every skill id from the design table', () => {
    const want = ['sort.ext.image', 'sort.name.test', 'sort.ext.docs', 'sort.folder.docs', 'sort.name.infra', 'sort.name.config', 'sort.ext.data-file', 'sort.ext.markup', 'sort.ext.style', 'sort.ext.jsx', 'sort.ext.server-lang', 'sort.ext.schema', 'sort.folder.frontend', 'sort.folder.backend', 'sort.folder.service', 'sort.folder.data', 'sort.folder.client-api', 'sort.import.frontend', 'sort.import.server', 'sort.import.node', 'sort.import.db', 'sort.import.http-client', 'sort.syntax.dom', 'sort.syntax.handler', 'sort.syntax.route-def', 'sort.syntax.route-data', 'sort.syntax.request-call', 'sort.manifest.frontend-project', 'sort.manifest.backend-project', 'sort.ref.loaded-by-html', 'sort.ref.shared'];
    expect(SKILLBOOK.sort.map((s) => s.id).sort()).toEqual(want.sort());
  });
  it('no folder or name skill gives shared', () => {
    for (const s of SKILLBOOK.sort) if (s.label === 'shared') expect(s.family).toBe('reference');
  });
  it('limits are provisional and the skill-book files do not import anything but types or fetch', () => {
    expect(UNDERSTANDING_LIMITS).toMatchObject({ provisional: true, maxScannedFiles: 2000, maxEdgesPerFile: 200, maxEdgesTotal: 5000, batchSize: 40, maxMs: 8000, maxCorrections: 500 });
    for (const f of ['src/skillbook/index.ts', 'src/skillbook/sortSkills.ts', 'src/skillbook/types.ts']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/fetch\(|from 'react|store\//);
    }
  });
});
