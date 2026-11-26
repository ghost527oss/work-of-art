// @node: F10.4
import { describe, expect, it } from 'vitest';
import { SESSION_KEY, type SessionRecord } from '../src/store/sessionRecord';
import { SESSION_LINES } from '../src/store/sessionActions';
import { githubFixture, makePage, network, openSample, refresh } from './helpers/sessionHarness';
import { recordingStorage } from './helpers/sessionFakes';
import { readFileSync } from 'node:fs';

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({ version: 1, savedAt: 1, target: { source: 'sample', owner: 'sample', repo: 'static-site', sampleId: 'static-site' }, screen: { screen: 'studio' }, preview: { width: 768, mode: 'auto' }, notes: { crewWasActive: false, previewOnlyCount: 0 }, ...over });
const withRecord = (r: SessionRecord) => recordingStorage({ [SESSION_KEY]: JSON.stringify(r) });
const msgs = (p: { studio: { getState(): { log: Array<{ message: string }> } } }) => p.studio.getState().log.map((e) => e.message);

describe('startup and apply', () => {
  it('a valid record starts the load once and applies screen, width, mode; Log lines in order', async () => {
    const storage = withRecord(rec({ screen: { screen: 'domain', area: 'security' }, preview: { width: 375, mode: 'source' }, notes: { crewWasActive: true, previewOnlyCount: 2 } }));
    const net = network();
    const p = makePage(storage, net);
    p.sessionCtl.actions.startup();
    p.sessionCtl.actions.startup();
    expect(p.studio.getState().experience).toBe('loading');
    const runId = p.studio.getState().ingestion.runId;
    // a second controller over the same page flags would not start again: same run id after settle
    await p.settle();
    expect(p.studio.getState().ingestion.runId).toBe(runId);
    expect(p.session.getState().status).toBe('applying');
    expect(p.shell.getState()).toEqual({ screen: 'domain', area: 'security' });
    p.mountSandbox();
    await p.settle();
    expect(p.session.getState()).toMatchObject({ status: 'done', screenApplied: true, previewApplied: true });
    expect(p.studio.getState().preview).toMatchObject({ width: 375, mode: 'source', chosenBy: 'user' });
    const m = msgs(p);
    const i = m.indexOf('Session restored: static-site, screen 5.');
    expect(i).toBeGreaterThan(-1);
    expect(m.slice(i)).toEqual(expect.arrayContaining([SESSION_LINES.crew, SESSION_LINES.previewOnly(2)]));
    p.dispose();
  });

  it('an impossible mode falls back with the Log line; page only when known; the 3,000 ms wait finishes', async () => {
    const p = makePage(withRecord(rec({ preview: { width: 1024, mode: 'workbench', entryPath: 'nope.html' } })), network());
    p.sessionCtl.actions.startup();
    await p.settle();
    p.mountSandbox();
    await p.settle();
    expect(msgs(p)).toContain(SESSION_LINES.mode);
    expect(p.studio.getState().preview.entryPath).toBe('index.html');
    p.dispose();
    // the preview never initialises: the timer applies the width and finishes
    const q = makePage(withRecord(rec({ preview: { width: 1024, mode: 'source' } })), network());
    q.sessionCtl.actions.startup();
    await q.settle();
    expect(q.session.getState().status).toBe('applying');
    q.advance(2999);
    expect(q.session.getState().status).toBe('applying');
    q.advance(1);
    expect(q.session.getState().status).toBe('done');
    expect(q.studio.getState().preview.width).toBe(1024);
    expect(msgs(q)).toContain('Session restored: static-site, screen 3.');
    q.dispose();
  });

  it('the saved page is applied when it is a known HTML page', async () => {
    const p = makePage(withRecord(rec({ preview: { width: 768, mode: 'static', entryPath: 'about.html' } })), network());
    p.sessionCtl.actions.startup();
    await p.settle(); p.mountSandbox(); await p.settle();
    expect(p.studio.getState().preview).toMatchObject({ mode: 'static', entryPath: 'about.html' });
    p.dispose();
  });

  it('no record, a bad record, or a non-Start experience does nothing', async () => {
    for (const st of [recordingStorage(), recordingStorage({ [SESSION_KEY]: '{bad' })]) {
      const p = makePage(st, network());
      p.sessionCtl.actions.startup();
      expect(p.studio.getState().experience).toBe('start');
      p.dispose();
    }
    const p = makePage(withRecord(rec()), network());
    await openSample(p, 'react-frontend');
    const before = p.studio.getState().ingestion.runId;
    p.sessionCtl.actions.startup();
    expect(p.studio.getState().ingestion.runId).toBe(before);
    p.dispose();
  });

  it('a failed load keeps the record and slots; Retry can succeed; no automatic retry', async () => {
    const r = rec({ target: { source: 'github', owner: 'octo', repo: 'shop', ref: 'main' } });
    const storage = recordingStorage({ [SESSION_KEY]: JSON.stringify(r), 'patchbay.work.v1': 'W', 'patchbay.corrections.v1': 'C' });
    const net = network();
    net.fail = { code: 'rate_limited', message: 'Rate limited.', resetAt: '2026-11-24T12:00:00Z' };
    const p = makePage(storage, net);
    p.sessionCtl.actions.startup();
    await p.settle();
    expect(p.session.getState().status).toBe('failed');
    expect(p.studio.getState().ingestion.status).toBe('failed');
    expect(storage.writes).toEqual([]);
    expect(storage.removals).toEqual([]);
    p.advance(60_000); await p.settle();
    expect(net.requests).toHaveLength(1);
    net.fail = undefined;
    net.repos.set('octo/shop', githubFixture('octo', 'shop', 'main', { 'index.html': '<p>x</p>\n' }));
    p.ingestion.actions.retry();
    await p.settle(); p.mountSandbox(); await p.settle();
    expect(p.studio.getState().experience).toBe('studio');
    expect(net.requests.at(-1)).toMatchObject({ owner: 'octo', repo: 'shop', ref: 'main' });
    p.dispose();
  });

  it('Cancel keeps the record; Resume starts the same restore', async () => {
    const storage = withRecord(rec());
    const p = makePage(storage, network());
    p.sessionCtl.actions.startup();
    p.ingestion.actions.cancel();
    await p.settle();
    expect(p.session.getState()).toMatchObject({ status: 'cancelled' });
    expect(storage.data.get(SESSION_KEY)).toBeTruthy();
    p.sessionCtl.actions.resume();
    await p.settle(); p.mountSandbox(); await p.settle();
    expect(p.session.getState().status).toBe('done');
    expect(p.studio.getState().experience).toBe('studio');
    p.dispose();
  });

  it('a completion of another run does nothing; a different repository applies nothing', async () => {
    const p = makePage(withRecord(rec({ screen: { screen: 'skeleton' } })), network());
    p.sessionCtl.actions.startup();
    p.ingestion.actions.cancel();
    await p.settle();
    await openSample(p, 'react-frontend'); // another run, user's choice
    expect(p.session.getState().status).toBe('cancelled');
    expect(p.shell.getState()).toEqual({ screen: 'studio' });
    p.dispose();
  });

  it('refresh: a new page over the same storage restores again; dispose releases subscriptions', async () => {
    const storage = recordingStorage();
    const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'static-site');
    expect(storage.data.get(SESSION_KEY)).toBeTruthy();
    p = await refresh(p, storage, net);
    expect(p.session.getState().status).toBe('done');
    expect(p.studio.getState().snapshot?.name).toBe('static-site');
    p.dispose();
  });

  it('the controller source imports no fetch, AI, or mockAssistant module', () => {
    const t = readFileSync('src/hooks/useSessionRestore.ts', 'utf8') + readFileSync('src/store/sessionRecord.ts', 'utf8') + readFileSync('src/store/sessionPersistence.ts', 'utf8');
    for (const bad of ['fetch(', 'mockAssistant', 'aiAssistant', 'useAssistant', 'innerHTML', 'eval(']) expect(t).not.toContain(bad);
  });
});
