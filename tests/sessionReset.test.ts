// @node: F10.4
import { describe, expect, it } from 'vitest';
import { SESSION_KEY } from '../src/store/sessionRecord';
import { RESET_NOTICE } from '../src/store/sessionStore';
import { runCommand } from '../src/store/workActions';
import { makePage, network, openSample, refresh } from './helpers/sessionHarness';
import { recordingStorage } from './helpers/sessionFakes';

const KEYS = ['patchbay.session.v1', 'patchbay.work.v1', 'patchbay.corrections.v1', 'patchbay.studio-layout.v1', 'patchbay.journal.v1'];

async function busySession() {
  const storage = recordingStorage({ 'patchbay.journal.v1': '{"version":1,"level":"deeper"}', 'patchbay.corrections.v1': '{"version":1}' });
  const net = network();
  const p = makePage(storage, net);
  await openSample(p, 'static-site');
  p.layout.setState({ openPanel: 'log', collapsed: false, width: 'wide' });
  p.harness.actions.submitText('start');
  for (let i = 0; i < 10 && !p.studio.getState().work.proposal; i++) p.advance(1300);
  p.harness.actions.run('approve');
  p.harness.actions.submitText('stop');
  await p.settle();
  return { p, storage, net };
}

describe('Back to Start', () => {
  it('deletes only the session record; work and corrections slots stay; loading the repo again brings History back', async () => {
    const { p, storage, net } = await busySession();
    expect(storage.data.get('patchbay.work.v1')).toBeTruthy();
    const removals = storage.removals.length;
    p.sessionCtl.actions.backToStart();
    expect(storage.removals.slice(removals)).toEqual([SESSION_KEY]);
    expect(storage.data.has('patchbay.work.v1')).toBe(true);
    expect(storage.data.has('patchbay.corrections.v1')).toBe(true);
    expect(p.studio.getState().experience).toBe('start');
    expect(p.session.getState().record).toBeUndefined();
    const q = await refresh(p, storage, net);
    expect(q.studio.getState().experience).toBe('start'); // nothing to restore
    await openSample(q, 'static-site');
    expect(q.studio.getState().work.applied.length).toBe(1);
    q.dispose();
  });
});

describe('Reset session', () => {
  it('removes exactly the three keys, clears memory and log, keeps layout and level, sets the notice; a refresh finds nothing', async () => {
    const { p, storage, net } = await busySession();
    const removals = storage.removals.length;
    p.sessionCtl.actions.resetSession();
    expect(storage.removals.slice(removals)).toEqual(['patchbay.session.v1', 'patchbay.work.v1', 'patchbay.corrections.v1']);
    expect([...storage.data.keys()].filter((k) => KEYS.includes(k)).sort()).toEqual(['patchbay.journal.v1', 'patchbay.studio-layout.v1']);
    const s = p.studio.getState();
    expect(s.experience).toBe('start');
    expect(s.log).toEqual([]);
    expect(s.work.applied).toEqual([]);
    expect(s.snapshot).toBeUndefined();
    expect(p.shell.getState()).toEqual({ screen: 'studio' });
    expect(p.session.getState().notice).toBe(RESET_NOTICE);
    expect(p.layout.getState()).toMatchObject({ openPanel: 'log', width: 'wide' });
    // the 2B/2C controllers write nothing back for the cleared state
    expect(storage.data.has('patchbay.work.v1')).toBe(false);
    const q = await refresh(p, storage, net);
    expect(q.studio.getState().experience).toBe('start');
    expect(q.session.getState().record).toBeUndefined();
    q.dispose();
  });
  it('aborts a running load first', async () => {
    const storage = recordingStorage();
    const p = makePage(storage, network());
    p.ingestion.actions.startSample('static-site');
    expect(p.studio.getState().ingestion.status).toBe('running');
    p.sessionCtl.actions.resetSession();
    await p.settle();
    expect(p.studio.getState().experience).toBe('start');
    expect(p.studio.getState().snapshot).toBeUndefined();
    p.dispose();
  });
  it('the 2B reset command still clears only the current work', async () => {
    const { p, storage } = await busySession();
    const s = runCommand(p.studio.getState(), { name: 'reset' }, { now: 1, mode: 'automation', newId: () => 'x' }).state;
    expect(s.work.applied).toEqual([]);
    expect(s.snapshot).toBeDefined();
    expect(storage.data.has(SESSION_KEY)).toBe(true);
    p.dispose();
  });
  it('dispose releases everything and attach works again without a second startup', async () => {
    const storage = recordingStorage();
    const p = makePage(storage, network());
    p.sessionCtl.dispose();
    const off = p.sessionCtl.attach();
    p.sessionCtl.actions.startup();
    p.sessionCtl.actions.startup();
    off();
    p.dispose();
  });
});
