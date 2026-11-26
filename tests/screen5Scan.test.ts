// @node: F10.5
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SESSION_KEY, type SessionRecord } from '../src/store/sessionRecord';
import { findingsForArea, mergedFindings } from '../src/engine/scanView';
import { makePage, network } from './helpers/sessionHarness';
import { recordingStorage } from './helpers/sessionFakes';

describe('the scan on Screen 5', () => {
  it('DomainScreen calls ensure() in an effect when live (as Screen 4 does); StudioLayout passes the scan actions', () => {
    const t = readFileSync('src/components/DomainScreen.tsx', 'utf8');
    expect(t).toMatch(/useEffect\(\(\) => \{\s*live\.scan\?\.ensure\(\);\s*\}, \[live\.scan, analysisStatus, snapshotId\]\);/);
    expect(readFileSync('src/components/StudioLayout.tsx', 'utf8')).toContain('onLearnMore: journal?.actions.openLesson, scan }');
  });
  it('a restore straight to Screen 5 ends with a finished scan and Screen 5 findings (ensure as the screen calls it, twice)', async () => {
    const r: SessionRecord = { version: 1, savedAt: 1, target: { source: 'sample', owner: 'sample', repo: 'static-site', sampleId: 'static-site' }, screen: { screen: 'domain', area: 'frontend' }, preview: { width: 768, mode: 'auto' }, notes: { crewWasActive: false, previewOnlyCount: 0 } };
    const p = makePage(recordingStorage({ [SESSION_KEY]: JSON.stringify(r) }), network());
    p.sessionCtl.actions.startup();
    await p.settle();
    expect(p.shell.getState()).toEqual({ screen: 'domain', area: 'frontend' });
    expect(p.studio.getState().scan.status).not.toBe('done');
    p.scan.actions.ensure(); p.scan.actions.ensure();
    await p.settle();
    const s = p.studio.getState();
    expect(s.scan.status).toBe('done');
    expect(s.scan.runId).toBe(1);
    expect(findingsForArea(mergedFindings(s), 'frontend').map((f) => f.skillId)).toContain('scan.frontend.img-alt');
    p.dispose();
  });
});
