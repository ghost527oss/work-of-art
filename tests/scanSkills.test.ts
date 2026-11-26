// @node: F6.1
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCAN_LIMITS } from '../src/config/scanLimits';
import { SKILLBOOK, scanSkillById } from '../src/skillbook';

const JARGON = /\b(AST|regex|heuristic|DOM|middleware|endpoint|polymorphi|namespace|transpil|bundler)\b/i;

describe('scan skills', () => {
  it('there are exactly 17 (16 text checks and one measured) with unique stable ids, areas, severities, and plain text', () => {
    const ids = SKILLBOOK.scan.map((s) => s.id);
    expect(ids).toHaveLength(17);
    expect(new Set(ids).size).toBe(17);
    expect(SKILLBOOK.scan.filter((s) => s.kind === 'measured').map((s) => s.id)).toEqual(['scan.frontend.layout-overflow']);
    for (const s of SKILLBOOK.scan) {
      expect(s.id).toMatch(/^scan\.(frontend|backend|security|api)\.[a-z-]+$/);
      expect(['frontend', 'backend', 'security', 'api_data']).toContain(s.primary);
      expect(['high', 'medium', 'low']).toContain(s.severity);
      expect(['found', 'possible']).toContain(s.certainty);
      expect(s.how.length).toBeGreaterThan(0);
      expect(s.explain + s.why + s.how.join(' ')).not.toMatch(JARGON);
      expect(scanSkillById(s.id)).toBe(s);
    }
  });
  it('exactly one skill is Auto-supported, and Possible checks are never High', () => {
    expect(SKILLBOOK.scan.filter((s) => s.fix === 'auto').map((s) => s.id)).toEqual(['scan.security.target-blank']);
    expect(SKILLBOOK.scan.filter((s) => s.certainty === 'possible').every((s) => s.severity !== 'high')).toBe(true);
  });
  it('the 31 sort skills are unchanged and limits are provisional', () => {
    expect(SKILLBOOK.sort).toHaveLength(31);
    expect(SCAN_LIMITS).toMatchObject({ provisional: true, maxFiles: 2000, maxMs: 8000, maxFindings: 500, maxPerCheck: 50, batchSize: 40, snippetLines: 12, crewPerArea: 12, crewSteps: 150, crewTickMs: 1000 });
  });
  it('no 2D engine file imports React, a store (except types), or the network', () => {
    for (const f of readdirSync('src/engine').filter((x) => /^scan|^crewScript/.test(x))) {
      const src = readFileSync(`src/engine/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from 'react|fetch\(\s*['"`]|XMLHttpRequest|mockAssistant|aiAssistant/);
      for (const m of src.matchAll(/^import (?!type)[^\n]*from '\.\.\/store\/([^']+)'/gm)) expect(['shellView', 'workSlice', 'useStudioStore']).toContain(m[1]);
    }
  });
});
