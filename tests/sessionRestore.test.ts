// @node: F10.7
// End-to-end store-level restores over a fake storage (design 11, K7).
import { describe, expect, it } from 'vitest';
import { mergedFindings } from '../src/engine/scanView';
import { SESSION_KEY, loadSession } from '../src/store/sessionRecord';
import { githubFixture, makePage, network, openSample, refresh, type Page } from './helpers/sessionHarness';
import { recordingStorage } from './helpers/sessionFakes';

const SHOP = { 'index.html': '<!doctype html>\n<p>one</p>\n<p>two</p>\n<a href="https://x.test" target="_blank">x</a>\n<p>three</p>\n', 'server/app.js': "const express = require('express');\n" };

async function crewFix(p: Page) {
  p.harness.actions.submitText('start crew');
  for (let i = 0; i < 40 && !p.studio.getState().work.proposal; i++) { p.advance(1000); await p.settle(2); }
  expect(p.studio.getState().work.proposal).not.toBeNull();
  p.harness.actions.run('approve');
  for (let i = 0; i < 40 && p.studio.getState().work.run?.status === 'running'; i++) { p.advance(1000); await p.settle(2); }
  if (p.studio.getState().work.run) p.harness.actions.submitText('stop');
  await p.settle();
}

describe('session restore end to end', () => {
  it('static sample on Screen 3 with a chosen width and the Journal panel open', async () => {
    const storage = recordingStorage();
    const net = network();
    let p = makePage(storage, net);
    await openSample(p, 'static-site');
    p.preview.actions.setWidth(375);
    p.layout.setState({ openPanel: 'journal', collapsed: false, width: 'wide' });
    expect(loadSession(storage)).toMatchObject({ target: { sampleId: 'static-site' }, screen: { screen: 'studio' }, preview: { width: 375 } });
    // the Loading screen is shown first after the refresh
    p.dispose();
    p = makePage(storage, net);
    p.sessionCtl.actions.startup();
    expect(p.studio.getState().experience).toBe('loading');
    expect(p.session.getState().status).toBe('pending');
    await p.settle(); p.mountSandbox(); await p.settle();
    const s = p.studio.getState();
    expect(s.experience).toBe('studio');
    expect(p.shell.getState()).toEqual({ screen: 'studio' });
    expect(s.preview.width).toBe(375);
    expect(p.layout.getState()).toEqual({ openPanel: 'journal', collapsed: false, width: 'wide' });
    expect(s.log.at(-1)!.message).toBe('Session restored: static-site, screen 3.');
    expect(loadSession(storage)).toMatchObject({ preview: { width: 375 } });
    p.dispose();
  });

  it('a GitHub project on Screen 5 (Security) with a crew fix: History restored, the finding gone after the new scan', async () => {
    const storage = recordingStorage();
    const net = network();
    net.repos.set('shop/demo', githubFixture('shop', 'demo', 'main', SHOP));
    let p = makePage(storage, net);
    p.ingestion.actions.submitInput('https://github.com/shop/demo');
    await p.settle(); p.mountSandbox(); await p.settle();
    p.scan.actions.ensure(); await p.settle();
    const before = mergedFindings(p.studio.getState()).filter((f) => f.skillId === 'scan.security.target-blank');
    expect(before).toHaveLength(1);
    await crewFix(p);
    expect(p.studio.getState().work.applied).toHaveLength(1);
    p.shell.setState({ screen: 'skeleton' });
    p.shell.setState({ screen: 'domain', area: 'security' });
    expect(loadSession(storage)?.screen).toEqual({ screen: 'domain', area: 'security' });
    p = await refresh(p, storage, net);
    expect(p.shell.getState()).toEqual({ screen: 'domain', area: 'security' });
    const s = p.studio.getState();
    expect(s.work.applied).toHaveLength(1);
    p.scan.actions.ensure(); await p.settle();
    expect(p.studio.getState().scan.status).toBe('done');
    expect(mergedFindings(p.studio.getState()).filter((f) => f.skillId === 'scan.security.target-blank')).toHaveLength(0);
    expect(p.studio.getState().log.some((e) => e.message === 'Session restored: shop/demo, screen 5.')).toBe(true);
    p.dispose();
  });

  it('a scoped GitHub load: the restore request carries the scope and the ref', async () => {
    const storage = recordingStorage();
    const net = network();
    net.repos.set('shop/demo', githubFixture('shop', 'demo', 'main', SHOP));
    let p = makePage(storage, net);
    p.ingestion.actions.submitInput('https://github.com/shop/demo');
    await p.settle();
    p.ingestion.actions.loadFolders(['server']);
    await p.settle();
    expect(loadSession(storage)?.target).toEqual({ source: 'github', owner: 'shop', repo: 'demo', ref: 'main', scope: ['server'] });
    p = await refresh(p, storage, net);
    expect(net.requests.at(-1)).toEqual({ owner: 'shop', repo: 'demo', ref: 'main', scope: ['server'] });
    expect(p.session.getState().status).toBe('done');
    p.dispose();
  });

  it('Back to Start and Reset session follow the table of design section 9', async () => {
    const storage = recordingStorage();
    const net = network();
    const p = makePage(storage, net);
    await openSample(p, 'static-site');
    p.layout.setState({ openPanel: 'log', collapsed: false, width: 'narrow' });
    storage.setItem('patchbay.work.v1', 'W'); storage.setItem('patchbay.corrections.v1', 'C'); storage.setItem('patchbay.journal.v1', 'J');
    p.sessionCtl.actions.backToStart();
    expect(storage.data.has(SESSION_KEY)).toBe(false);
    expect(['patchbay.work.v1', 'patchbay.corrections.v1', 'patchbay.journal.v1'].every((k) => storage.data.has(k))).toBe(true);
    await openSample(p, 'static-site');
    p.sessionCtl.actions.resetSession();
    expect([...storage.data.keys()].sort()).toEqual(['patchbay.journal.v1', 'patchbay.studio-layout.v1']);
    p.dispose();
  });
});

describe('review fixes', () => {
  it('the saved scope is the one that was loaded: a failed, dismissed, or cancelled folder reload does not change it', async () => {
    const storage = recordingStorage(); const net = network();
    net.repos.set('o/r', githubFixture('o', 'r', 'main', { 'a/x.js': 'x\n', 'b/y.js': 'y\n', 'README.md': 'hi\n' }));
    const p = makePage(storage, net);
    p.ingestion.actions.submitInput('https://github.com/o/r');
    await p.settle(); p.mountSandbox(); await p.settle();
    p.ingestion.actions.loadFolders(['a']); await p.settle(); p.mountSandbox(); await p.settle();
    const scope = () => loadSession(storage)?.target.scope;
    expect(scope()).toEqual(['a']);
    net.fail = { code: 'upstream_failure', message: 'down' };
    p.ingestion.actions.loadFolders(['b']); await p.settle();
    expect(p.studio.getState().ingestion.status).toBe('failed');
    expect(scope()).toEqual(['a']);
    p.ingestion.actions.dismissError(); await p.settle();
    p.preview.actions.setWidth(1024); // any later save keeps the loaded scope
    expect(scope()).toEqual(['a']);
    net.fail = undefined;
    p.ingestion.actions.loadFolders(['b']);
    p.ingestion.actions.cancel(); await p.settle();
    p.preview.actions.setWidth(375);
    expect(scope()).toEqual(['a']);
    p.dispose();
  });
  it('the app starts the restore after the mount settles (StrictMode double effect cannot cancel it)', async () => {
    const { readFileSync } = await import('node:fs');
    const t = readFileSync('src/hooks/useSessionRestore.ts', 'utf8');
    expect(t).toContain('const t = setTimeout(() => controller.actions.startup(), 0);');
    expect(t).toContain('return () => { clearTimeout(t); detach(); detachSave(); controller.dispose(); };');
    // controller level: an ingestion dispose before the start (the StrictMode cleanup) does not stop the later start
    const r = { version: 1 as const, savedAt: 1, target: { source: 'sample' as const, owner: 'sample', repo: 'static-site', sampleId: 'static-site' }, screen: { screen: 'studio' as const }, preview: { width: 768 as const, mode: 'auto' as const }, notes: { crewWasActive: false, previewOnlyCount: 0 } };
    const p = makePage(recordingStorage({ [SESSION_KEY]: JSON.stringify(r) }), network());
    p.ingestion.dispose();
    p.sessionCtl.actions.startup();
    await p.settle(); p.mountSandbox(); await p.settle();
    expect(p.session.getState().status).toBe('done');
    p.dispose();
  });
});
