// @node: F10.8
// The refresh matrix (requirements section 6, item 8): build a session, refresh over the same storage,
// and compare everything restorable. Non-restorable items are absent, with their Log lines.
import { describe, expect, it } from 'vitest';
import { hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import { mergedFindings } from '../src/engine/scanView';
import { applyUserEdit } from '../src/store/workActions';
import { SESSION_KEY, loadSession } from '../src/store/sessionRecord';
import { SESSION_LINES } from '../src/store/sessionActions';
import { redact } from '../src/engine/redact';
import { githubFixture, makePage, network, openSample, refresh, type Network, type Page, type Storage } from './helpers/sessionHarness';
import { recordingStorage } from './helpers/sessionFakes';

/** Everything a refresh must bring back. */
function capture(p: Page) {
  const s = p.studio.getState();
  const snap = s.snapshot!;
  const edited = [...new Set([...s.work.applied, ...s.work.undone].map((e) => e.path))].sort();
  const run = s.work.run && s.work.run.kind === 'practice' ? { kind: s.work.run.kind, status: s.work.run.status === 'running' ? 'paused' : s.work.run.status, position: s.work.run.position } : null;
  return {
    repo: `${snap.source}:${snap.owner}/${snap.name}@${snap.ref}`,
    screen: p.shell.getState(),
    layout: p.layout.getState(),
    preview: { width: s.preview.width, mode: s.preview.chosenBy === 'user' ? s.preview.mode : 'auto', entry: s.preview.entryPath },
    applied: s.work.applied.map((e) => [e.id, e.path, e.diff]),
    undone: s.work.undone.map((e) => e.id),
    copies: edited.map((path) => [path, practiceContent(snap, s.work.applied, path)]),
    corrections: s.understanding.corrections,
    run,
    proposal: s.work.proposal && s.work.proposal.source === 'practice' ? s.work.proposal.id : null,
    log: s.log.slice(-200).map((e) => redact(e.message).text),
  };
}

function compare(before: ReturnType<typeof capture>, p: Page) {
  const after = capture(p);
  const { log, ...rest } = before;
  const { log: log2, ...rest2 } = after;
  expect(rest2).toEqual(rest);
  expect(log2.slice(0, log.length)).toEqual(log);
  expect(p.session.getState().status).toBe('done');
}

async function cycle(storage: Storage, net: Network, p: Page) {
  const before = capture(p);
  const q = await refresh(p, storage, net);
  if (q.shell.getState().screen !== 'studio') { q.scan.actions.ensure(); await q.settle(); }
  compare(before, q);
  return q;
}

const SHOP = { 'index.html': '<!doctype html>\n<p>one</p>\n<p>two</p>\n<a href="https://x.test" target="_blank">x</a>\n<button class="b">Buy</button>\n<p>three</p>\n', 'server/app.js': "const express = require('express');\n" };
async function loadShop(p: Page) { p.ingestion.actions.submitInput('https://github.com/shop/demo'); await p.settle(); p.mountSandbox(); await p.settle(); }
async function practiceToProposal(p: Page) {
  p.harness.actions.submitText('start');
  for (let i = 0; i < 20 && !p.studio.getState().work.proposal; i++) { p.advance(1300); await p.settle(2); }
}

describe('refresh matrix', () => {
  it('Studio with the Journal panel open (screen 3) and a Sandbox width', async () => {
    const storage = recordingStorage(); const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'static-site');
    p.layout.setState({ openPanel: 'journal', collapsed: false, width: 'narrow' });
    p.preview.actions.setWidth(1024);
    p = await cycle(storage, net, p);
    p.dispose();
  });

  it('Skeleton Crew (screen 4) with a finished scan', async () => {
    const storage = recordingStorage(); const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'fullstack-api');
    p.shell.setState({ screen: 'skeleton' });
    p.scan.actions.ensure(); await p.settle();
    expect(p.studio.getState().scan.status).toBe('done');
    const findings = mergedFindings(p.studio.getState()).map((f) => f.id);
    p = await cycle(storage, net, p);
    expect(p.studio.getState().scan.status).toBe('done');
    expect(mergedFindings(p.studio.getState()).map((f) => f.id)).toEqual(findings);
    p.dispose();
  });

  for (const area of ['frontend', 'backend', 'security', 'api_data'] as const) {
    it(`Domain screen: ${area}`, async () => {
      const storage = recordingStorage(); const net = network();
      let p = makePage(storage, net);
      await openSample(p, 'react-frontend');
      p.shell.setState({ screen: 'skeleton' }); p.shell.setState({ screen: 'domain', area });
      p = await cycle(storage, net, p);
      expect(p.studio.getState().log.some((e) => e.message === 'Session restored: react-frontend, screen 5.')).toBe(true);
      p.dispose();
    });
  }

  it('after approving a crew fix: History restored, the finding gone after the new scan', async () => {
    const storage = recordingStorage(); const net = network();
    net.repos.set('shop/demo', githubFixture('shop', 'demo', 'main', SHOP));
    let p = makePage(storage, net);
    await loadShop(p);
    p.scan.actions.ensure(); await p.settle();
    p.harness.actions.submitText('start crew');
    for (let i = 0; i < 40 && !p.studio.getState().work.proposal; i++) { p.advance(1000); await p.settle(2); }
    p.harness.actions.run('approve');
    for (let i = 0; i < 40 && p.studio.getState().work.run?.status === 'running'; i++) { p.advance(1000); await p.settle(2); }
    expect(p.studio.getState().work.applied).toHaveLength(1);
    expect(loadSession(storage)?.notes.crewWasActive).toBe(false);
    p = await cycle(storage, net, p);
    p.scan.actions.ensure(); await p.settle();
    expect(mergedFindings(p.studio.getState()).some((f) => f.skillId === 'scan.security.target-blank')).toBe(false);
    p.dispose();
  });

  it('a crew run in progress is not restored, with its Log line', async () => {
    const storage = recordingStorage(); const net = network();
    net.repos.set('shop/demo', githubFixture('shop', 'demo', 'main', SHOP));
    let p = makePage(storage, net);
    await loadShop(p);
    p.scan.actions.ensure(); await p.settle();
    p.harness.actions.submitText('start crew');
    expect(loadSession(storage)?.notes.crewWasActive).toBe(true);
    p = await refresh(p, storage, net);
    expect(p.studio.getState().work.run).toBeNull();
    expect(p.studio.getState().log.at(-1)!.message).toBe(SESSION_LINES.crew);
    p.dispose();
  });

  it('a paused practice run with a pending proposal', async () => {
    const storage = recordingStorage(); const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'static-site');
    await practiceToProposal(p);
    p.harness.actions.submitText('pause');
    expect(p.studio.getState().work.proposal).not.toBeNull();
    p = await cycle(storage, net, p);
    expect(p.studio.getState().work.run?.status).toBe('awaiting_decision');
    p.dispose();
  });

  it('an Edit pad change, an undo, and a redo', async () => {
    const storage = recordingStorage(); const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'static-site');
    const s = p.studio.getState();
    const before = practiceContent(s.snapshot!, s.work.applied, 'index.html')!;
    const after = before.replace('<button id="order" class="btn">', '<button id="order" class="btn" style="width: 200px">');
    p.studio.update((st) => applyUserEdit(st, { path: 'index.html', baseHash: hashText(before), newContent: after, editKey: 'edit:index.html:abc', title: 'Style: button' }, { now: p.now(), mode: 'self_editing', newId: () => 'e1' }).state);
    p.harness.actions.submitText('undo');
    p.harness.actions.submitText('redo');
    expect(p.studio.getState().work.applied.map((e) => e.editKey)).toEqual(['edit:index.html:abc#u']);
    p = await cycle(storage, net, p);
    p.dispose();
  });

  it('label corrections', async () => {
    const storage = recordingStorage(); const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'static-site');
    expect(p.understanding.actions.setLabels('README.md', ['backend'])).toBeNull();
    await p.settle();
    expect(p.studio.getState().understanding.corrections).toEqual({ 'README.md': ['backend'] });
    p = await cycle(storage, net, p);
    p.dispose();
  });

  it('a scoped GitHub load', async () => {
    const storage = recordingStorage(); const net = network();
    net.repos.set('shop/demo', githubFixture('shop', 'demo', 'main', SHOP));
    let p = makePage(storage, net);
    await loadShop(p);
    p.ingestion.actions.loadFolders(['server']); await p.settle();
    p.mountSandbox(); await p.settle(); // the mounted Sandbox initialises the preview for the new snapshot
    p = await cycle(storage, net, p);
    expect(net.requests.at(-1)).toMatchObject({ scope: ['server'] });
    p.dispose();
  });

  it('a failed restore keeps the record and slots; Retry succeeds later', async () => {
    const storage = recordingStorage(); const net = network();
    net.repos.set('shop/demo', githubFixture('shop', 'demo', 'main', SHOP));
    let p = makePage(storage, net);
    await loadShop(p);
    await practiceToProposal(p); p.harness.actions.run('approve'); p.harness.actions.submitText('stop'); await p.settle();
    const before = capture(p);
    const saved = new Map(storage.data);
    net.fail = { code: 'network_error' as never, message: 'Network is offline.' };
    p = await refresh(p, storage, net);
    expect(p.session.getState().status).toBe('failed');
    expect(new Map(storage.data)).toEqual(saved);
    net.fail = undefined;
    p.sessionCtl.actions.retry();
    await p.settle(); p.mountSandbox(); await p.settle();
    compare(before, p);
    p.dispose();
  });

  it('a cancelled restore; Resume works', async () => {
    const storage = recordingStorage(); const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'static-site');
    p.preview.actions.setWidth(375);
    const before = capture(p);
    p.dispose();
    p = makePage(storage, net);
    p.sessionCtl.actions.startup();
    p.ingestion.actions.cancel();
    await p.settle();
    expect(p.session.getState().status).toBe('cancelled');
    expect(storage.data.has(SESSION_KEY)).toBe(true);
    p.sessionCtl.actions.resume();
    await p.settle(); p.mountSandbox(); await p.settle();
    compare(before, p);
    p.dispose();
  });

  it('an invalid record gives the plain Start screen, and is replaced at the next save', async () => {
    const storage = recordingStorage({ [SESSION_KEY]: '{"version":1,"target":"<script>"}' }); const net = network();
    const p = await refresh(null, storage, net);
    expect(p.studio.getState().experience).toBe('start');
    expect(p.session.getState().record).toBeUndefined();
    await openSample(p, 'static-site');
    expect(loadSession(storage)).not.toBeNull();
    p.dispose();
  });

  it('blocked storage: no saving, no error, nothing to restore', async () => {
    const blocked = { data: new Map(), writes: [], removals: [], getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    const net = network();
    let p = makePage(blocked, net);
    await openSample(p, 'static-site');
    p.shell.setState({ screen: 'skeleton' });
    p = await refresh(p, blocked, net);
    expect(p.studio.getState().experience).toBe('start');
    p.dispose();
  });

  it('a moved branch: a changed file discards History with the 2B line; the session is still restored', async () => {
    const storage = recordingStorage(); const net = network();
    const files = { ...SHOP };
    net.repos.set('shop/demo', githubFixture('shop', 'demo', 'main', files));
    let p = makePage(storage, net);
    await loadShop(p);
    await practiceToProposal(p); p.harness.actions.run('approve'); p.harness.actions.submitText('stop'); await p.settle();
    const edited = p.studio.getState().work.applied[0]!.path;
    p.shell.setState({ screen: 'skeleton' });
    (files as Record<string, string>)[edited] = 'changed upstream\n';
    p = await refresh(p, storage, net);
    expect(p.studio.getState().work.applied).toEqual([]);
    expect(p.studio.getState().log.some((e) => e.message === 'Saved changes did not match the loaded files, so they were not restored.')).toBe(true);
    expect(p.shell.getState()).toEqual({ screen: 'skeleton' });
    expect(p.session.getState().status).toBe('done');
    p.dispose();
  });

  it('a bundled sample: no network request at all', async () => {
    const storage = recordingStorage(); const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'react-frontend');
    p = await cycle(storage, net, p);
    expect(net.requests).toEqual([]);
    p.dispose();
  });
});
