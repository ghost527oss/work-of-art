// @node: F10.8
// Storage privacy (requirements R7, acceptance item 10): a full scripted session writes only the five keys,
// and no stored value carries file contents, secrets, AI text, preview documents, snippets, or key names.
import { describe, expect, it } from 'vitest';
import { hashText } from '../src/engine/diffApply';
import { practiceContent } from '../src/engine/practiceScript';
import { mergedFindings } from '../src/engine/scanView';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { beginAIRequest, completeAIRequest } from '../src/store/aiActions';
import { applyUserEdit } from '../src/store/workActions';
import { SESSION_LIMITS } from '../src/config/sessionLimits';
import type { RepoSnapshot } from '../src/types/contracts';
import { githubFixture, makePage, network, openSample, refresh, type Page } from './helpers/sessionHarness';
import { recordingStorage } from './helpers/sessionFakes';

const GHP = 'ghp_' + 'Z1y2X3w4V5u6T7s8R9q0P1o2N3m4L5k6J7i8';
const AWS = 'AKIA' + 'IOSFODNN7EXAMPLE';
const PEM = '-----BEGIN RSA PRIVATE KEY-----';
const INSTRUCTION = 'INSTRUCTION_SENTINEL_7781 please explain the login';
const AI_TEXT = 'AI_ANSWER_SENTINEL_5521';
const FIVE = ['patchbay.session.v1', 'patchbay.work.v1', 'patchbay.corrections.v1', 'patchbay.studio-layout.v1', 'patchbay.journal.v1'];

const SECRETS = {
  'index.html': '<!doctype html>\n<p>Secret shop page body text</p>\n<a href="https://x.test" target="_blank">help</a>\n<button class="b">Buy now please</button>\n',
  'server/config.js': `const token = "${GHP}";\nconst aws = "${AWS}";\nmodule.exports = { token, aws };\n`,
  'server/key.pem': `${PEM}\nMIIEowIBAAKCAQEA7mysecretkeymaterialline\n-----END RSA PRIVATE KEY-----\n`,
};

async function scripted(p: Page) {
  // practice run and approve
  p.harness.actions.submitText('start');
  for (let i = 0; i < 20 && !p.studio.getState().work.proposal; i++) { p.advance(1300); await p.settle(2); }
  if (p.studio.getState().work.proposal) p.harness.actions.run('approve');
  p.harness.actions.submitText('stop');
  // AI Chat: an instruction (a non-command goes to the AI path, never stored) and an AI result in state
  p.harness.actions.submitText(INSTRUCTION);
  p.studio.update((s) => beginAIRequest(s, 'r1', { taskType: 'explain', selectedCount: 1, includesContent: true }, p.now()));
  p.studio.update((s) => completeAIRequest(s, 'r1', { mode: 'mock', response: { type: 'explanation', text: AI_TEXT, summary: AI_TEXT, notes: [AI_TEXT] } } as never, p.now()));
  // scan, crew where possible, an Edit pad change, labels, layout and Sandbox settings
  p.scan.actions.ensure(); await p.settle();
  p.harness.actions.submitText('start crew');
  for (let i = 0; i < 20 && !p.studio.getState().work.proposal; i++) { p.advance(1000); await p.settle(2); }
  if (p.studio.getState().work.proposal) p.harness.actions.run('approve');
  p.harness.actions.submitText('stop');
  const s = p.studio.getState();
  const page = s.snapshot!.files.find((f) => /\.html$/.test(f.path) && typeof f.content === 'string');
  if (page) {
    const cur = practiceContent(s.snapshot!, s.work.applied, page.path)!;
    p.studio.update((st) => applyUserEdit(st, { path: page.path, baseHash: hashText(cur), newContent: cur.replace(/<p(?=[ >])/, '<p style="width: 200px"'), editKey: `edit:${page.path}:k`, title: 'Style' }, { now: p.now(), mode: 'self_editing', newId: () => 'ue' }).state);
  }
  p.understanding.actions.setLabels(s.snapshot!.files[0]!.path, ['backend']);
  p.layout.setState({ openPanel: 'journal', collapsed: false, width: 'wide' });
  p.preview.actions.setWidth(375);
  p.preview.actions.setScripts(true);
  p.shell.setState({ screen: 'skeleton' });
  await p.settle();
}

function linesOf(snaps: RepoSnapshot[]): string[] {
  const out = new Set<string>();
  for (const s of snaps) for (const f of s.files) if (typeof f.content === 'string') for (const l of f.content.split(/\r?\n/)) { const t = l.trim(); if (t.length >= 8) out.add(t); }
  return [...out];
}

describe('storage privacy', () => {
  it('a full session on the three samples and a fixture with secret-looking lines stores nothing it must not', async () => {
    const storage = recordingStorage();
    const net = network();
    net.repos.set('shop/vault', githubFixture('shop', 'vault', 'main', SECRETS));
    let p = makePage(storage, net);
    const snaps: RepoSnapshot[] = [];
    const snippets: string[] = [];
    const previews: string[] = [];
    for (const id of ['static-site', 'react-frontend', 'fullstack-api', 'github']) {
      if (id === 'github') { p.ingestion.actions.submitInput('https://github.com/shop/vault'); await p.settle(); p.mountSandbox(); await p.settle(); }
      else await openSample(p, id);
      await scripted(p);
      const st = p.studio.getState();
      snaps.push(st.snapshot!);
      for (const f of mergedFindings(st)) snippets.push(...f.snippet.map((x) => x.trim()).filter((x) => x.length >= 8));
      const entry = st.snapshot!.files.find((f) => f.path.endsWith('index.html'));
      if (entry) {
        const b = buildStaticPreview({ entryPath: entry.path, effective: (x) => st.snapshot!.files.find((f) => f.path === x)?.content, loaded: new Set(st.snapshot!.files.map((f) => f.path)), scripts: false, nonce: 'n', origin: 'http://localhost', previewStyles: [] });
        if (b.ok) previews.push(...b.html.split(/\n|(?=<meta)|(?=<script)/).map((x) => x.trim()).filter((x) => x.length >= 20 && x.includes('<')));
      }
      p = await refresh(p, storage, net);
      p.sessionCtl.actions.backToStart();
    }
    p.dispose();

    // only the five keys were ever written
    expect([...new Set(storage.writes.map((w) => w.key))].sort()).toEqual([...FIVE].filter((k) => storage.writes.some((w) => w.key === k)).sort());
    for (const w of storage.writes) expect(FIVE).toContain(w.key);
    expect(storage.writes.some((w) => w.key === 'patchbay.session.v1')).toBe(true);

    // every value ever written (not only the final ones)
    const fileLines = linesOf(snaps);
    for (const w of storage.writes) {
      let text = w.value;
      if (w.key === 'patchbay.work.v1') {
        // 2B saves small History diffs by design ("addresses and small diffs, as before"); check them separately.
        const rec = JSON.parse(text);
        const diffs = [...rec.applied, ...rec.undone].map((e: { diff: string }) => e.diff).concat(rec.proposal ? [rec.proposal.diff] : []);
        for (const d of diffs) for (const bad of [GHP, AWS, PEM]) expect(d).not.toContain(bad);
        text = JSON.stringify({ ...rec, applied: rec.applied.map((e: object) => ({ ...e, diff: '' })), undone: rec.undone.map((e: object) => ({ ...e, diff: '' })), proposal: rec.proposal ? { ...rec.proposal, diff: '' } : null });
      }
      for (const bad of [GHP, AWS, PEM, 'INSTRUCTION_SENTINEL_7781', AI_TEXT]) expect(text, `${w.key} contains ${bad.slice(0, 10)}`).not.toContain(bad);
      for (const line of fileLines) expect(text.includes(line), `${w.key} contains file line: ${line}`).toBe(false);
      for (const sn of snippets) expect(text.includes(sn), `${w.key} contains a snippet`).toBe(false);
      for (const h of previews) expect(text.includes(h), `${w.key} contains preview HTML`).toBe(false);
      if (w.key === 'patchbay.session.v1') {
        expect(w.value.length).toBeLessThanOrEqual(SESSION_LIMITS.recordBytes);
        for (const k of Object.keys(JSON.parse(w.value))) expect(k.toLowerCase()).not.toMatch(/token|key|secret|password|auth/);
        expect(w.value).not.toContain('scripts');
      }
    }
    // the five saved parts together stay small
    const total = storage.writes.reduce((m, w) => m.set(w.key, w.value.length), new Map<string, number>());
    expect([...total.values()].reduce((a, b) => a + b, 0)).toBeLessThan(1024 * 1024);
    expect(fileLines.length).toBeGreaterThan(40);
    expect(snippets.length).toBeGreaterThan(0);
  }, 120_000);
});
