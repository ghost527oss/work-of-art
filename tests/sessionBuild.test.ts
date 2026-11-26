// @node: F10.1
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { buildSessionRecord } from '../src/store/sessionRecord';
import { initialState, type StudioState } from '../src/store/useStudioStore';

const studio = (over: Partial<StudioState> = {}): StudioState => {
  const s0 = initialState();
  const snapshot = buildSampleSnapshot('static-site', 1);
  return { ...s0, experience: 'studio', snapshot, ingestion: { ...s0.ingestion, status: 'done', target: { owner: 'sample', repo: 'static-site', source: 'sample', sampleId: 'static-site' } }, preview: { ...s0.preview, mode: 'static', reason: 'r', entryPath: 'index.html', width: 768 }, ...over };
};
const b = (state: StudioState, view: Parameters<typeof buildSessionRecord>[0]['view'] = { screen: 'studio' }, restoreStatus: Parameters<typeof buildSessionRecord>[0]['restoreStatus'] = 'idle') => buildSessionRecord({ state, view, detectedEntry: 'index.html', restoreStatus });

describe('buildSessionRecord', () => {
  it('a sample load', () => {
    expect(b(studio())).toEqual({ version: 1, target: { source: 'sample', owner: 'sample', repo: 'static-site', sampleId: 'static-site' }, screen: { screen: 'studio' }, preview: { width: 768, mode: 'auto' }, notes: { crewWasActive: false, previewOnlyCount: 0 } });
  });
  it('GitHub and scoped GitHub loads use the snapshot identity and the last scope', () => {
    const snap = { ...buildSampleSnapshot('static-site', 1), source: 'github' as const, owner: 'octo', name: 'shop', ref: 'dev' };
    const s = studio({ snapshot: snap, ingestion: { ...initialState().ingestion, runId: 3, status: 'done', target: { owner: 'octo', repo: 'shop', source: 'github' } } });
    expect(b(s)!.target).toEqual({ source: 'github', owner: 'octo', repo: 'shop', ref: 'dev' });
    const sc = { ...s, ingestion: { ...s.ingestion, target: { owner: 'octo', repo: 'shop', ref: 'dev', source: 'github' as const, scope: ['client'] } } };
    expect(b(sc)!.target).toEqual({ source: 'github', owner: 'octo', repo: 'shop', ref: 'dev', scope: ['client'] });
  });
  it('mode only when the user chose it; page only when different; component only when set; screen from the view', () => {
    const s = studio();
    expect(b({ ...s, preview: { ...s.preview, chosenBy: 'user', mode: 'source' } })!.preview).toEqual({ width: 768, mode: 'source' });
    expect(b({ ...s, preview: { ...s.preview, chosenBy: 'auto', mode: 'source' } })!.preview.mode).toBe('auto');
    expect(b({ ...s, preview: { ...s.preview, entryPath: 'about.html' } })!.preview).toEqual({ width: 768, mode: 'auto', entryPath: 'about.html' });
    expect(b({ ...s, preview: { ...s.preview, component: 'src/App.tsx#App' } })!.preview.component).toBe('src/App.tsx#App');
    expect(b(s, { screen: 'domain', area: 'security' })!.screen).toEqual({ screen: 'domain', area: 'security' });
    expect(b(s, { screen: 'skeleton' })!.screen).toEqual({ screen: 'skeleton' });
  });
  it('notes: crew active for running, paused, waiting; not for finished, stopped, or practice; Preview Only count', () => {
    const s = studio();
    const run = (kind: 'crew' | 'practice', status: string) => ({ ...s, work: { ...s.work, run: { id: 'r', kind, status, autoAdvance: false, position: 0, steps: [] } } }) as unknown as StudioState;
    for (const st of ['running', 'paused', 'awaiting_decision']) expect(b(run('crew', st))!.notes.crewWasActive).toBe(true);
    for (const st of ['finished', 'stopped']) expect(b(run('crew', st))!.notes.crewWasActive).toBe(false);
    expect(b(run('practice', 'running'))!.notes.crewWasActive).toBe(false);
    const po = { ...s, edit: { ...s.edit, previewOnly: [{}, {}, {}] } } as unknown as StudioState;
    expect(b(po)!.notes.previewOnlyCount).toBe(3);
  });
  it('null for Start, Loading, no snapshot, a running load (foreground or background), and a pending or applying restore', () => {
    const s = studio();
    expect(b({ ...s, experience: 'start' })).toBeNull();
    expect(b({ ...s, experience: 'loading' })).toBeNull();
    expect(b({ ...s, snapshot: undefined })).toBeNull();
    expect(b({ ...s, ingestion: { ...s.ingestion, status: 'running', background: false } })).toBeNull();
    expect(b({ ...s, ingestion: { ...s.ingestion, status: 'running', background: true } })).toBeNull();
    expect(b(s, { screen: 'studio' }, 'pending')).toBeNull();
    expect(b(s, { screen: 'studio' }, 'applying')).toBeNull();
    expect(b(s, { screen: 'studio' }, 'done')).not.toBeNull();
    expect(b(s)).not.toHaveProperty('savedAt');
  });
});
