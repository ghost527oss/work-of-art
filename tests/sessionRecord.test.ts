// @node: F10.1
import { describe, expect, it } from 'vitest';
import { SESSION_LIMITS } from '../src/config/sessionLimits';
import {
  SESSION_KEY, SessionRecordSchema, clearAllSession, clearSessionRecord, loadSession, saveSession, toIngestTarget, validateTarget, type SessionRecord,
} from '../src/store/sessionRecord';
import { recordingStorage, throwingStorage } from './helpers/sessionFakes';

const gh: SessionRecord = { version: 1, savedAt: 5, target: { source: 'github', owner: 'octo', repo: 'shop', ref: 'main' }, screen: { screen: 'studio' }, preview: { width: 768, mode: 'auto' }, notes: { crewWasActive: false, previewOnlyCount: 0 } };
const scoped: SessionRecord = { ...gh, target: { ...gh.target, scope: ['client', 'server'] }, screen: { screen: 'domain', area: 'backend' }, preview: { width: 375, mode: 'static', entryPath: 'client/about.html', component: 'src/App.tsx#App' } };
const sample: SessionRecord = { ...gh, target: { source: 'sample', owner: 'sample', repo: 'static-site', sampleId: 'static-site' }, screen: { screen: 'skeleton' } };
const store = (r: unknown) => recordingStorage({ [SESSION_KEY]: typeof r === 'string' ? r : JSON.stringify(r) });

describe('the session record', () => {
  it('valid GitHub, scoped GitHub, and sample records round-trip', () => {
    for (const r of [gh, scoped, sample]) {
      const s = recordingStorage();
      expect(saveSession(s, r)).not.toBeNull();
      expect(loadSession(s)).toEqual(r);
    }
  });
  it('every bad variant is ignored without a throw', () => {
    const bad: unknown[] = [
      '', 'not json', '{}', { ...gh, version: 2 }, { ...gh, extra: 1 },
      { ...gh, target: { ...gh.target, token: 'x' } }, { ...gh, screen: { screen: 'studio', x: 1 } }, { ...gh, preview: { ...gh.preview, scripts: true } }, { ...gh, notes: { ...gh.notes, more: 1 } },
      { ...gh, target: { ...gh.target, owner: '-bad-' } }, { ...gh, target: { ...gh.target, owner: 'a'.repeat(40) } }, { ...gh, target: { ...gh.target, repo: '..' } }, { ...gh, target: { ...gh.target, ref: 'a..b' } },
      { ...gh, target: { ...gh.target, scope: Array.from({ length: 21 }, (_, i) => `d${i}`) } }, { ...gh, target: { ...gh.target, scope: ['../etc'] } }, { ...gh, target: { ...gh.target, scope: ['a'.repeat(251)] } },
      { ...sample, target: { ...sample.target, sampleId: 'nope', repo: 'nope' } }, { ...gh, preview: { ...gh.preview, width: 500 } }, { ...gh, preview: { ...gh.preview, mode: 'live' } },
      { ...gh, preview: { ...gh.preview, entryPath: '../x.html' } }, { ...gh, preview: { ...gh.preview, component: '<script>' } }, { ...gh, screen: { screen: 'domain', area: 'nowhere' } },
      { ...gh, screen: { screen: 'domain' } }, { ...gh, screen: { screen: 'studio', area: 'backend' } }, { ...gh, notes: { ...gh.notes, previewOnlyCount: 51 } }, { ...gh, notes: { ...gh.notes, previewOnlyCount: -1 } },
      JSON.stringify(gh).replace('}', `,"pad":"${'x'.repeat(5000)}"}`),
    ];
    for (const b of bad) expect(loadSession(store(b)), JSON.stringify(b).slice(0, 80)).toBeNull();
    expect(loadSession(undefined)).toBeNull();
    expect(loadSession(throwingStorage)).toBeNull();
  });
  it('no schema key name contains token, key, secret, password, or auth (walked over the shape)', () => {
    const names: string[] = [];
    const walk = (s: unknown) => {
      const def = (s as { def?: Record<string, unknown> })?.def ?? (s as { _def?: Record<string, unknown> })?._def;
      if (!def) return;
      const shape = (def.shape ?? (typeof (s as { shape?: unknown }).shape === 'object' ? (s as { shape: unknown }).shape : undefined)) as Record<string, unknown> | undefined;
      if (shape) for (const [k, v] of Object.entries(shape)) { names.push(k); walk(v); }
      for (const inner of ['innerType', 'schema', 'in', 'out', 'element']) if (def[inner]) walk(def[inner]);
    };
    walk(SessionRecordSchema);
    expect(names).toEqual(expect.arrayContaining(['version', 'savedAt', 'target', 'owner', 'scope', 'screen', 'area', 'preview', 'component', 'notes', 'previewOnlyCount']));
    for (const n of names) expect(n.toLowerCase()).not.toMatch(/token|key|secret|password|auth/);
  });
  it('the stored text holds only the allowed fields; save never throws; at most 4 KB', () => {
    const s = recordingStorage();
    const text = saveSession(s, scoped)!;
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'savedAt', 'target', 'screen', 'preview', 'notes']);
    expect(text.length).toBeLessThanOrEqual(SESSION_LIMITS.recordBytes);
    expect(saveSession(throwingStorage, gh)).toBeNull();
    expect(saveSession(undefined, gh)).toBeNull();
    expect(saveSession(s, { ...gh, extra: 1 } as never)).toBeNull();
  });
  it('clear helpers remove exactly their keys and survive blocked storage', () => {
    const s = recordingStorage({ [SESSION_KEY]: '1', 'patchbay.work.v1': '1', 'patchbay.corrections.v1': '1', 'patchbay.studio-layout.v1': '1', 'patchbay.journal.v1': '1' });
    clearSessionRecord(s);
    expect(s.removals).toEqual([SESSION_KEY]);
    clearAllSession(s);
    expect(s.removals.slice(1)).toEqual([SESSION_KEY, 'patchbay.work.v1', 'patchbay.corrections.v1']);
    expect([...s.data.keys()].sort()).toEqual(['patchbay.journal.v1', 'patchbay.studio-layout.v1']);
    expect(() => { clearSessionRecord(throwingStorage); clearAllSession(throwingStorage); clearAllSession(undefined); }).not.toThrow();
  });
  it('toIngestTarget and validateTarget', () => {
    expect(toIngestTarget(scoped.target)).toEqual({ owner: 'octo', repo: 'shop', ref: 'main', scope: ['client', 'server'], source: 'github' });
    expect(toIngestTarget(sample.target)).toEqual({ owner: 'sample', repo: 'static-site', source: 'sample', sampleId: 'static-site' });
    expect(validateTarget(gh.target)).toBeNull();
    expect(validateTarget({ ...gh.target, owner: 'bad owner' })).toBe('The saved repository address is not valid.');
    expect(validateTarget({ ...gh.target, scope: ['a/../b'] })).not.toBeNull();
    expect(validateTarget({ source: 'sample', owner: 'sample', repo: 'x', sampleId: 'x' })).not.toBeNull();
  });
  it('limits are the design values and provisional', () => {
    expect(SESSION_LIMITS).toMatchObject({ provisional: true, recordBytes: 4096, folders: 20, pathChars: 250, applyWaitMs: 3000 });
  });
});
