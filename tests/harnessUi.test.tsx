// @node: F4.8
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StudioLayout } from '../src/components/StudioLayout';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { layoutStore } from '../src/hooks/useLayout';
import { shellStore } from '../src/hooks/useShell';
import { DEFAULT_LAYOUT } from '../src/store/layoutSlice';
import { INITIAL_VIEW } from '../src/store/shellView';
import { beginIngestion, completeIngestion, initialState, studioStore } from '../src/store/useStudioStore';
import { addChat, idleWork, startRun, runOneStep } from '../src/store/workSlice';
import { buildPracticeScript } from '../src/engine/practiceScript';
import { EditPanel } from '../src/components/EditPanel';
import { HistoryPanel } from '../src/components/HistoryPanel';
import { ProposalCard } from '../src/components/ProposalCard';
import { StopBar, type StopBarRun } from '../src/components/StopBar';
import type { HistoryEntry } from '../src/store/workSlice';

const noop = () => undefined;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const bar = (run: StopBarRun | null, extra: Partial<React.ComponentProps<typeof StopBar>> = {}) =>
  html(createElement(StopBar, { mode: 'automation', run, waiting: false, onStop: noop, ...extra }));
const buttons = (markup: string) => [...markup.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);
const run = (status: StopBarRun['status'], autoAdvance = true, position = 2): StopBarRun => ({ status, position, total: 6, autoAdvance });

describe('StopBar', () => {
  it('no run', () => {
    const m = bar(null);
    expect(m).toContain('No run. Type start in AI Chat.');
    expect(m).toContain('Mode: Automation.');
    expect(m).toMatch(/<button[^>]*disabled[^>]*>Stop<\/button>/);
  });
  it('running, paused, waiting, stopped, finished', () => {
    expect(bar(run('running'))).toContain('Practice run (no AI): running, step 2 of 6.');
    expect(bar(run('running'))).not.toMatch(/disabled/);
    expect(bar(run('paused', false))).toContain('paused, step 2 of 6.');
    expect(bar(run('paused', false))).toContain('Type resume in AI Chat to continue.');
    const w = bar(run('awaiting_decision'), { waiting: true });
    expect(w).toContain('Waiting for your decision.');
    expect(w).not.toContain('Type resume');
    expect(bar(run('stopped', false))).toMatch(/disabled/);
    expect(bar(run('finished'))).toContain('finished, step 2 of 6.');
    expect(bar(run('finished'))).toMatch(/disabled/);
  });
  it('Self-editing mode and the resume hint', () => {
    const m = bar(run('paused', false), { mode: 'self_editing' });
    expect(m).toContain('Mode: Self-editing.');
    expect(m).toContain('Type resume in AI Chat to continue.');
  });
  it('Stop is enabled with a pending AI request and no run', () => {
    expect(bar(null, { aiPending: true })).not.toMatch(/disabled/);
  });
  it('has exactly one button, named Stop', () => {
    expect(buttons(bar(run('running')))).toEqual(['Stop']);
  });
});

describe('ProposalCard', () => {
  const proposal = { title: 'Propose a change to a.ts', path: 'src/a.ts', diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1 @@\n+// PRACTICE: x\n' };
  it('shows title, path, diff in a pre, practice line, and two buttons', () => {
    const m = html(createElement(ProposalCard, { proposal, onApprove: noop, onReject: noop }));
    expect(m).toContain('Propose a change to a.ts');
    expect(m).toContain('src/a.ts');
    expect(m).toMatch(/<pre[^>]*>--- a\/src\/a.ts/);
    expect(m).toContain('Practice proposal: it changes only the in-memory practice copy, never your repository.');
    expect(buttons(m)).toEqual(['Approve', 'Reject']);
  });
  it('escapes markup-looking text', () => {
    const evil = { title: '<img src=x onerror=alert(1)>', path: 'a', diff: '+<script>alert(1)</script>' };
    const m = html(createElement(ProposalCard, { proposal: evil, onApprove: noop, onReject: noop }));
    expect(m).not.toContain('<img');
    expect(m).not.toContain('<script>');
    expect(m).toContain('&lt;img');
    expect(m).toContain('&lt;script&gt;');
  });
});

describe('HistoryPanel', () => {
  const e = (n: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({ id: `h${n}`, path: `f${n}.ts`, title: `Change ${n}`, at: n * 1000, diff: `DIFF${n}`, beforeHash: '00000000', afterHash: '11111111', ...over });
  it('shows the empty state', () => {
    const m = html(createElement(HistoryPanel, { applied: [], undone: [] }));
    expect(m).toContain('No changes yet.');
    expect(m).toContain('Type undo or redo in AI Chat.');
  });
  it('lists newest first with state, diff in a pre, and the hint', () => {
    const m = html(createElement(HistoryPanel, { applied: [e(1), e(2)], undone: [e(3)] }));
    expect(m.indexOf('Change 3')).toBeLessThan(m.indexOf('Change 2'));
    expect(m.indexOf('Change 2')).toBeLessThan(m.indexOf('Change 1'));
    expect(m).toContain('state: undone');
    expect(m).toContain('state: applied');
    expect(m).toMatch(/<pre[^>]*>DIFF3<\/pre>/);
    expect(m).toContain('Type undo or redo in AI Chat.');
  });
  it('escapes markup in titles and diffs', () => {
    const m = html(createElement(HistoryPanel, { applied: [e(1, { title: '<b>x</b>', diff: '<i>' })], undone: [] }));
    expect(m).not.toContain('<b>x');
    expect(m).toContain('&lt;b&gt;');
  });
});

describe('EditPanel', () => {
  it('shows mode, resume line, and the 2E line', () => {
    const m = html(createElement(EditPanel, { mode: 'self_editing' }));
    expect(m).toContain('Mode: Self-editing.');
    expect(m).toContain('Type resume in AI Chat to continue.');
    expect(m).toContain('Editing tools arrive in sub-phase 2E.');
    expect(html(createElement(EditPanel, { mode: 'automation' }))).toContain('Mode: Automation.');
  });
});

describe('no Pause, Resume, or Step button; static rules', () => {
  const files = ['StopBar', 'ProposalCard', 'HistoryPanel', 'EditPanel'].map((n) => `src/components/${n}.tsx`);
  it('buttons are only Stop, Approve, Reject', () => {
    const all = [
      bar(run('paused', false)),
      html(createElement(ProposalCard, { proposal: { title: 't', path: 'p', diff: 'd' }, onApprove: noop, onReject: noop })),
      html(createElement(HistoryPanel, { applied: [], undone: [] })),
      html(createElement(EditPanel, { mode: 'automation' })),
    ].join('');
    expect(new Set(buttons(all))).toEqual(new Set(['Stop', 'Approve', 'Reject']));
  });
  it('files carry the node tag and avoid dangerous patterns', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain('@node: F4.8');
      expect(src).not.toContain('dangerouslySetInnerHTML');
    }
  });
  it('the 2B CSS block uses only #000 and #fff, no transition, no animation', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('/* @node: F4.8'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/transition|animation/);
    const colors = block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    for (const c of colors) expect(['#000', '#fff']).toContain(c.toLowerCase());
    expect(block).not.toMatch(/rgb|hsl/i);
  });
});

describe('wiring into the Studio (B9)', () => {
  const snapshot = buildSampleSnapshot('fullstack-api', 1);
  const harness = { submitText: () => false, run: noop, stop: noop };
  const assistant = { send: () => null, cancel: noop, clear: noop };
  const render = () =>
    renderToStaticMarkup(
      createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant, harness }),
    );
  function seed(work = idleWork()) {
    const target = { owner: 'sample', repo: 'x', source: 'sample' as const, sampleId: 'x' };
    let st = beginIngestion(initialState(), target, 1);
    st = completeIngestion(st, st.ingestion.runId, snapshot, 2);
    studioStore.setState({ ...st, work });
  }
  beforeEach(() => {
    layoutStore.setState(DEFAULT_LAYOUT);
    shellStore.setState(INITIAL_VIEW);
  });
  afterEach(() => {
    studioStore.setState(initialState());
    layoutStore.setState(DEFAULT_LAYOUT);
    shellStore.setState(INITIAL_VIEW);
  });

  it('the Stop bar is on Screens 3, 4, and 5', () => {
    seed();
    expect(render()).toContain('stop-bar');
    shellStore.setState({ screen: 'skeleton' } as typeof INITIAL_VIEW);
    expect(render()).toContain('stop-bar');
    shellStore.setState({ screen: 'domain', area: 'frontend' } as typeof INITIAL_VIEW);
    expect(render()).toContain('stop-bar');
  });
  it('without a harness there is no Stop bar (2A look)', () => {
    seed();
    const m = renderToStaticMarkup(createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant }));
    expect(m).not.toContain('stop-bar');
  });
  it('AI Chat shows the hint, the replies list, and a waiting proposal card', () => {
    const steps = buildPracticeScript(snapshot)!;
    let w = startRun(idleWork(), 'r1', steps, false);
    for (let i = 0; i < 4; i++) w = runOneStep(w, 'p1');
    w = addChat(w, 'help', 'LINE ONE', true);
    seed(w);
    const m = render();
    expect(m).toContain('Type help for commands.');
    expect(m).toContain('chat-replies');
    expect(m).toContain('LINE ONE');
    expect(m).toContain('proposal-card');
    expect(m).toContain('Waiting for your decision.');
    expect(buttons(m)).toEqual(expect.arrayContaining(['Approve', 'Reject', 'Stop']));
  });
  it('History and Edit panels show their new content, Log has no placeholder note', () => {
    seed();
    layoutStore.setState({ openPanel: 'history', collapsed: false, width: 'narrow' });
    expect(render()).toContain('No changes yet.');
    layoutStore.setState({ openPanel: 'edit', collapsed: false, width: 'narrow' });
    const edit = render();
    expect(edit).toContain('Editing tools arrive in sub-phase 2E.');
    expect(edit).toContain('Mode: Self-editing.');
    layoutStore.setState({ openPanel: 'log', collapsed: false, width: 'narrow' });
    expect(render()).not.toContain('arrive in sub-phase 2B');
  });
});

// ---------------------------------------------------------------------------
// @node: F11.10 Phase 3A: the AI proposal card
// ---------------------------------------------------------------------------

describe('ProposalCard: AI-proposed change', () => {
  const proposal = { title: 'AI-proposed change to a.ts', path: 'a.ts', diff: '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n', source: 'ai' as const, byline: 'Answered by Groq (heavy). Answered by a lighter model; review carefully.' };
  it('is labelled, shows the byline and the lighter warning, keeps the practice-copy promise, and has only Approve and Reject', () => {
    const m = html(createElement(ProposalCard, { proposal, onApprove: noop, onReject: noop }));
    expect(m).toContain('<h3>AI-proposed change</h3>');
    expect(m).toContain('Answered by a lighter model; review carefully.');
    expect(m).toContain('AI-proposed change: it changes only the in-memory practice copy, never your repository.');
    expect(buttons(m)).toEqual(['Approve', 'Reject']);
  });
  it('the practice and crew cards are unchanged', () => {
    const base = { title: 'T', path: 'a.ts', diff: 'd' };
    expect(html(createElement(ProposalCard, { proposal: { ...base, source: 'crew' }, onApprove: noop, onReject: noop }))).toContain('Skeleton Crew fix: it changes only');
    expect(html(createElement(ProposalCard, { proposal: base, onApprove: noop, onReject: noop }))).toContain('Practice proposal: it changes only');
    expect(html(createElement(ProposalCard, { proposal: base, onApprove: noop, onReject: noop }))).toContain('<h3>T</h3>');
  });
});
