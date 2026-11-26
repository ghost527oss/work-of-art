// @node: F4.3
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { applyUnifiedDiff, reverseUnifiedDiff } from '../src/engine/diffApply';
import { PRACTICE_COMMENT, buildPracticeDiff, buildPracticeScript, practiceContent } from '../src/engine/practiceScript';
import type { RepoFile, RepoSnapshot } from '../src/types/contracts';

const IDS = ['static-site', 'react-frontend', 'fullstack-api'] as const;
const snap = (id: (typeof IDS)[number] = 'fullstack-api') => buildSampleSnapshot(id, 1);

function withFiles(s: RepoSnapshot, files: RepoFile[]): RepoSnapshot {
  return { ...s, files };
}
function mk(path: string, content: string | undefined, over: Partial<RepoFile> = {}): RepoFile {
  return {
    path, content, language: 'text', loadStatus: 'loaded', classifications: [], classificationConfidence: 'high',
    classificationEvidence: [], needsUserReview: false, truncated: false, ...over,
  };
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

describe('buildPracticeScript', () => {
  it('is byte-identical for the same snapshot, also with the file array reversed', () => {
    for (const id of IDS) {
      const s = snap(id);
      const a = JSON.stringify(buildPracticeScript(s));
      expect(JSON.stringify(buildPracticeScript(s))).toBe(a);
      expect(JSON.stringify(buildPracticeScript(withFiles(s, [...s.files].reverse())))).toBe(a);
    }
  });
  it('gives 6 steps for one suitable file', () => {
    const s = withFiles(snap(), [mk('b.ts', 'x\n')]);
    const steps = buildPracticeScript(s)!;
    expect(steps.map((x) => x.kind)).toEqual(['info', 'info', 'plan', 'propose', 'verify', 'finish']);
  });
  it('gives 8 steps for two or more, using the first two sorted paths', () => {
    const s = withFiles(snap(), [mk('z.ts', 'z\n'), mk('b.ts', 'b\n'), mk('a.ts', 'a\n')]);
    const steps = buildPracticeScript(s)!;
    expect(steps.map((x) => x.kind)).toEqual(['info', 'info', 'plan', 'propose', 'verify', 'propose', 'verify', 'finish']);
    expect(steps.filter((x) => x.kind === 'propose').map((x) => x.path)).toEqual(['a.ts', 'b.ts']);
  });
  it('skips unsuitable files and returns null when none is left', () => {
    const secret = 'token = ghp_' + 'a'.repeat(36) + '\n';
    const bad = [
      mk('t.ts', 'x', { truncated: true, loadStatus: 'truncated' }),
      mk('n.ts', 'x', { loadStatus: 'indexed_not_loaded' }),
      mk('c.ts', undefined),
      mk('e.ts', ''),
      mk('big.ts', 'x'.repeat(20 * 1024 + 1)),
      mk('s.ts', secret),
      mk('../evil.ts', 'x'),
    ];
    expect(buildPracticeScript(withFiles(snap(), bad))).toBeNull();
    const steps = buildPracticeScript(withFiles(snap(), [...bad, mk('ok.ts', 'ok\n'), mk('exact.ts', 'x'.repeat(20 * 1024))]))!;
    expect(steps.filter((x) => x.kind === 'propose').map((x) => x.path)).toEqual(['exact.ts', 'ok.ts']);
  });
  it('titles are non-empty, path steps carry the path, nothing carries file content', () => {
    for (const id of IDS) {
      const s = snap(id);
      const steps = buildPracticeScript(s)!;
      expect(steps).not.toBeNull();
      for (const st of steps) {
        expect(st.title.length).toBeGreaterThan(0);
        if (st.kind === 'propose' || st.kind === 'verify') expect(st.path).toBeTruthy();
        for (const f of s.files) {
          const firstLine = (f.content ?? '').split('\n').find((l) => l.trim().length > 12);
          if (firstLine) {
            expect(st.title).not.toContain(firstLine.trim());
            expect(st.skill ?? '').not.toContain(firstLine.trim());
          }
        }
      }
    }
  });
  it('a sample file with a secret content is skipped', () => {
    const s = snap();
    const first = s.files.find((f) => typeof f.content === 'string')!;
    const poisoned = s.files.map((f) => (f.path === first.path ? { ...f, content: `${f.content}\nk=ghp_${'b'.repeat(36)}\n` } : f));
    const steps = buildPracticeScript(withFiles(s, poisoned));
    expect(steps?.some((x) => x.path === first.path) ?? false).toBe(false);
  });
});

describe('buildPracticeDiff', () => {
  it('is a zero-context one-line insert of the PRACTICE comment for every sample file', () => {
    for (const id of IDS) {
      for (const f of snap(id).files) {
        const d = buildPracticeDiff(f.path);
        expect(d).toContain('@@ -0,0 +1 @@');
        const plus = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
        expect(plus).toHaveLength(1);
        expect(plus[0]).toContain('PRACTICE:');
        expect(plus[0]).toContain(PRACTICE_COMMENT.replace(/^PRACTICE: /, ''));
        expect(d.split('\n').filter((l) => l.startsWith(' ') || (l.startsWith('-') && !l.startsWith('---')))).toHaveLength(0);
        for (const line of (f.content ?? '').split('\n')) if (line.trim().length > 12) expect(d).not.toContain(line);
      }
    }
  });
  it('uses the right comment syntax', () => {
    expect(buildPracticeDiff('a.py')).toContain('+# PRACTICE:');
    expect(buildPracticeDiff('a.ts')).toContain('+// PRACTICE:');
    expect(buildPracticeDiff('a.css')).toContain('+/* PRACTICE:');
    expect(buildPracticeDiff('a.html')).toContain('+<!-- PRACTICE:');
  });
});

describe('practiceContent', () => {
  const s = snap();
  const f = s.files.find((x) => typeof x.content === 'string')!;
  it('returns loaded content with no history', () => expect(practiceContent(s, [], f.path)).toBe(f.content));
  it('applies applied diffs in order', () => {
    const d1 = buildPracticeDiff(f.path);
    const d2 = d1.replace('PRACTICE:', 'PRACTICE: second');
    const out = practiceContent(s, [{ path: f.path, diff: d1 }, { path: f.path, diff: d2 }, { path: 'other', diff: 'junk' }], f.path)!;
    const lines = out.split('\n');
    expect(lines[0]).toContain('PRACTICE: second');
    expect(lines[1]).toContain('PRACTICE:');
    expect(out.endsWith(f.content!)).toBe(true);
  });
  it('is undefined for a missing file or a diff that does not apply', () => {
    expect(practiceContent(s, [], 'nope.ts')).toBeUndefined();
    expect(practiceContent(s, [{ path: f.path, diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-zzzz\n+y\n' }], f.path)).toBeUndefined();
  });
  it('round trip with reverse restores the content', () => {
    const d = buildPracticeDiff(f.path);
    const after = practiceContent(s, [{ path: f.path, diff: d }], f.path)!;
    const back = applyUnifiedDiff(after, reverseUnifiedDiff(d)!);
    expect(back).toEqual({ ok: true, text: f.content });
  });
  it('never mutates a deep-frozen snapshot', () => {
    const frozen = deepFreeze(snap());
    expect(() => {
      buildPracticeScript(frozen);
      practiceContent(frozen, [{ path: f.path, diff: buildPracticeDiff(f.path) }], f.path);
    }).not.toThrow();
  });
});

describe('imports', () => {
  it('no React, store, network, or mockAssistant import', () => {
    const src = readFileSync('src/engine/practiceScript.ts', 'utf8');
    expect(src).not.toMatch(/from '(react|react-dom)'|store|mockAssistant|aiAssistant|useAssistant|fetch\(/);
  });
});
