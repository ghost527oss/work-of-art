// @node: F12.13
// The 3B-1 exit gate at store level: the real controllers and engines, a fake measuring function, no browser.
import { describe, expect, it } from 'vitest';
import { BUDGETS } from '../src/config/budgets';
import { analyzeProject } from '../src/engine/analyzeProject';
import { parseCommand } from '../src/engine/commands';
import { hashText } from '../src/engine/diffApply';
import { runIngestion } from '../src/engine/ingestPipeline';
import { practiceContent } from '../src/engine/practiceScript';
import { scanProject } from '../src/engine/scanProject';
import { POLICY_LOOK, POLICY_SCRIPTS, cspFor, sandboxFlags } from '../src/preview/previewFlags';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { runCommand, tickRun, type WorkCtx } from '../src/store/workActions';
import { idleScan } from '../src/store/scanSlice';
import { understandingDone } from '../src/store/understandingSlice';
import { initialState, type StudioState } from '../src/store/useStudioStore';
import { box } from './helpers/lintFixtures';
import { createGate } from './helpers/lintHarness';
import { snapshotOf } from './helpers/analyzeFixture';
import { fakeGithub, REAL_1X1_PNG } from './helpers/tinyImages';

let n = 0;
const ctx = (): WorkCtx => ({ now: 1000, mode: 'automation', newId: () => `id-${++n}` });
const cmd = (s: StudioState, text: string) => { const p = parseCommand(text); if (p.kind !== 'command') throw new Error(text); return runCommand(s, { name: p.name, arg: p.arg }, ctx()).state; };

describe('gate (a): a syntax mistake is found, fixed with one candidate, approved, re-scanned, and undone', () => {
  it('works through the crew and the Approve path', async () => {
    const source = 'const a = 1;\nif (a > 0 {\n  go();\n}\n';
    const snapshot = snapshotOf({ 'app.js': source });
    const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
    const base: StudioState = { ...initialState(), experience: 'studio', snapshot, understanding: understandingDone(analysis, {}) };
    const result = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => practiceContent(snapshot, [], p) }, { yieldToMain: async () => undefined });
    let s = cmd({ ...base, scan: { ...idleScan(), status: 'done', runId: 1, snapshotId: snapshot.id, result } }, 'start crew');
    expect(s.scan.result!.findings.map((f) => [f.skillId, f.fix])).toEqual([['scan.frontend.js-syntax', 'auto']]);
    while (!s.work.proposal) s = tickRun(s, s.work.run!.id, s.work.run!.position, ctx());
    s = cmd(s, 'approve');
    expect(s.scan.result!.findings).toEqual([]);
    s = cmd(cmd(s, 'pause'), 'undo');
    expect(hashText(practiceContent(s.snapshot!, s.work.applied, 'app.js')!)).toBe(hashText(source));
    expect(s.scan.result!.findings.map((f) => f.skillId)).toEqual(['scan.frontend.js-syntax']);
  });
});

const HTML = '<p>a</p>\n<button class="b">Go</button>\n<p>c</p>\n';
const buttons = (extra = false) => (content: string, elements: readonly { id: number; tag: string; startOffset: number; endOffset: number }[]) =>
  elements.map((e) => {
    const tag = content.slice(e.startOffset, e.endOffset);
    const big = /min-height:\s*44px/.test(tag);
    if (e.tag === 'button') return box({ id: e.id, tag: 'button', hasText: true, width: big ? 44 : 30, height: big ? 44 : 30 });
    return box({ id: e.id, tag: e.tag, hasText: true, width: 300, height: 20, fontSize: extra && /min-height/.test(content) ? 10 : 16 });
  });

describe('gate (b) and (c): a too-small button is measured, fixed by its recipe, and kept; a regression is undone', () => {
  it('(b) the Full check finds the button, the recipe is applied, measured again, and kept', async () => {
    const g = createGate({ html: HTML, measure: buttons() });
    await g.open();
    const f = g.layout().findings.find((x) => x.measure?.kind === 'tap-target')!;
    expect(f).toMatchObject({ confidence: 'high', firstLine: 2 });
    expect(g.layout().widths).toEqual([375, 768, 1024]);
    g.recipe.actions.start(f.id);
    await g.settle();
    expect(g.store.getState().preview.recipe).toMatchObject({ status: 'kept' });
    expect(g.content()).toContain('min-height: 44px');
    expect(g.layout().findings.filter((x) => x.measure?.kind === 'tap-target')).toEqual([]);
    expect(g.store.getState().work.applied).toHaveLength(1);
    g.dispose();
  });
  it('(c) a recipe that makes something else worse is undone and the practice copy matches the original', async () => {
    const g = createGate({ html: HTML, measure: buttons(true) });
    await g.open();
    const f = g.layout().findings.find((x) => x.measure?.kind === 'tap-target')!;
    g.recipe.actions.start(f.id);
    await g.settle();
    expect(g.store.getState().preview.recipe).toMatchObject({ status: 'undone', message: expect.stringContaining('a new problem appeared') });
    expect(hashText(g.content())).toBe(hashText(HTML));
    expect(g.store.getState().work.applied).toHaveLength(0);
    g.dispose();
  });
});

describe('gate (d): the two documents have the exact policy and sandbox flags', () => {
  it('Look-only: same-origin, no scripts, the exact policy; Run-scripts: opaque origin, the exact policy', () => {
    const page = (scripts: boolean) => { const r = buildStaticPreview({ entryPath: 'index.html', effective: () => '<p>x</p><script>var a=1</script>', loaded: new Set(['index.html']), scripts, nonce: '0123456789abcdef', origin: 'http://a' }); if (!r.ok) throw new Error('x'); return r.html; };
    const esc = (p: string) => p.replace(/'/g, '&#39;');
    expect(page(false)).toContain(`content="${esc(POLICY_LOOK)}"`);
    expect(page(true)).toContain(`content="${esc(POLICY_SCRIPTS)}"`);
    expect(sandboxFlags(false)).toBe('allow-same-origin');
    expect(sandboxFlags(true)).toBe('allow-scripts');
    expect(cspFor(true)).toContain("connect-src 'none'");
    expect(cspFor(false)).not.toContain('script-src');
  });
});

describe('gate (e): a small referenced picture loads, shows in the preview, and a wide one is measured and fixed', () => {
  it('end to end through the loader, the preview, the Full check, and a kept recipe', async () => {
    const gh = fakeGithub({ files: { 'index.html': '<div id="box"><img src="wide.png" alt=""></div>\n', 'wide.png': REAL_1X1_PNG } });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: BUDGETS, now: () => 1 });
    expect(snapshot.media).toHaveLength(1);
    const media = (p: string) => snapshot.media!.find((m) => m.path === p);
    const g = createGate({
      html: '', snapshot, media,
      measure: (content, elements) => elements.map((e) => {
        if (e.tag === 'img') {
          const limited = /max-width:\s*100%/.test(content.slice(e.startOffset, e.endOffset));

          return box({ id: e.id, tag: 'img', width: limited ? 300 : 900, height: 100, parentKey: 7, img: { naturalWidth: 900, naturalHeight: 100, complete: true, local: true, parentClientWidth: 375 } });
        }
        return box({ id: e.id, tag: e.tag, width: 375, height: 100, parentKey: 8 });
      }),
    });
    expect(g.build().html).toContain('<img src="data:image/png;base64,');
    expect(g.build().html).not.toContain('image not loaded');
    await g.open();
    const f = g.layout().findings.find((x) => x.measure?.kind === 'media-wide')!;
    expect(f).toMatchObject({ skillId: 'scan.frontend.media-unsized', confidence: 'high' });
    g.recipe.actions.start(f.id);
    await g.settle();
    expect(g.store.getState().preview.recipe).toMatchObject({ status: 'kept' });
    expect(g.content()).toContain('max-width: 100%');
    g.dispose();
  });
});
