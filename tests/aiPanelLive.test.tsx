// @node: F11.10
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { AIAssistantPanel } from '../src/components/AIAssistantPanel';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import type { AIStatusState } from '../src/engine/aiStatus';
import type { AssistantActions, AssistantUiState } from '../src/hooks/useAssistant';
import { createStore, initialState, studioStore } from '../src/store/useStudioStore';
import type { Finding } from '../src/engine/scanFindingTypes';
import { idleScan } from '../src/store/scanSlice';
import { aiBegin, aiComplete, idleAI } from '../src/store/aiSlice';

const snapshot = buildSampleSnapshot('static-site', 1);
const noop = () => undefined;
function stub(status: AIStatusState | null, noticeOpen = false): AssistantActions {
  const base: AssistantActions = { send: () => null, cancel: noop, clear: noop };
  if (status === null) return base;
  return { ...base, ui: createStore<AssistantUiState>({ status, noticeOpen }), discardHeld: noop, acceptNotice: noop };
}
const render = (assistant: AssistantActions) => renderToStaticMarkup(createElement(AIAssistantPanel, { snapshot, assistant }));
const buttons = (m: string) => [...m.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((x) => x[1]);
const LIVE: AIStatusState = { kind: 'live', ready: true, providers: [{ id: 'gemini', configured: true }, { id: 'groq', configured: true }, { id: 'openrouter', configured: false }] };

afterEach(() => studioStore.setState(initialState()));

describe('banner', () => {
  it('a controller without a status store behaves as mock mode, with the exact Phase 2 line and no notice', () => {
    const m = render(stub(null));
    expect(m).toContain('Mock mode: responses are canned examples. No AI model is used and nothing is sent to an AI provider.');
    expect(m).not.toContain('Before the first live request');
  });
  it('live and ready: the live line and the provider order; not the mock line', () => {
    const m = render(stub(LIVE));
    expect(m).toContain('Live AI: answers come from a free outside AI provider.');
    expect(m).toContain('Order tried: Gemini, then Groq.');
    expect(m).not.toContain('Mock mode');
  });
  it('live but not set up: says so, shows the hint, and disables Send', () => {
    const m = render(stub({ kind: 'live', ready: false, providers: [] }));
    expect(m).toContain('Live AI is not set up.');
    expect(m).toContain('GEMINI_API_KEY');
    expect(m).toMatch(/<button type="submit" disabled[^>]*>Send<\/button>/);
  });
  it('could not check the mode: says so and leaves Send enabled', () => {
    const m = render(stub({ kind: 'unknown' }));
    expect(m).toContain('Could not check the AI mode.');
    expect(m).toMatch(/<button type="submit"[^>]*>Send<\/button>/);
    expect(m).not.toMatch(/<button type="submit" disabled/);
  });
  it('checking: a short line', () => {
    expect(render(stub({ kind: 'checking' }))).toContain('Checking the AI mode...');
  });
});

describe('notice', () => {
  it('open: the five points, one OK button, and Cancel; the question is on hold', () => {
    const m = render(stub(LIVE, true));
    expect(m).toContain('Before the first live request');
    expect(m).toContain('outside AI company');
    expect(m).toContain('Free plans may let that company keep or use what you send.');
    expect(m).toContain('File contents stay off unless you tick');
    expect(m).toContain('Secrets are removed first');
    expect(m).toContain('unless you press Approve');
    expect(m).toContain('Your question is on hold. It is sent only when you press OK.');
    expect(buttons(m)).toContain('OK');
    expect(buttons(m).filter((b) => b === 'OK')).toHaveLength(1);
  });
  it('closed: no notice', () => {
    expect(render(stub(LIVE, false))).not.toContain('Before the first live request');
  });
});

describe('form', () => {
  it('offers the Do something task and keeps the existing three', () => {
    const m = render(stub(LIVE));
    for (const label of ['Explain', 'Suggest a change', 'Review a finding', 'Do something (safe actions)']) expect(m).toContain(`>${label}</option>`);
  });
  it('the contents box is off by default', () => {
    const m = render(stub(LIVE));
    expect(m).toMatch(/<input type="checkbox"(?![^>]*checked)[^>]*\/>\s*Include the contents of the selected files in the request/);
  });
  it('without scan results the finding list is hidden with a plain line', () => {
    const m = render(stub(LIVE));
    expect(m).toContain('No scan results yet, so findings are not listed.');
    expect(m).not.toContain('id="ai-finding"');
  });
  it('with scan results: a list of findings, at most 50 shown', () => {
    const mk = (i: number): Finding => ({ id: `f${i}`, skillId: 'scan.frontend.img-alt', primary: 'frontend', areas: ['frontend'], severity: 'medium', certainty: 'found', fix: 'guided', path: `p${i}.html`, firstLine: i + 1, lastLine: i + 1, snippet: ['x'] });
    const findings = Array.from({ length: 60 }, (_, i) => mk(i));
    studioStore.setState({ ...initialState(), scan: { ...idleScan(), status: 'done', result: { findings } as never } });
    const m = render(stub(LIVE));
    expect(m).toContain('id="ai-finding"');
    expect((m.match(/<option value="f\d+"/g) ?? []).length).toBe(50);
    expect(m).toContain('Showing the first 50 of 60 findings.');
    expect(m).toContain('Image without a text description - p0.html:1');
  });
  it('a scan with no findings says so', () => {
    studioStore.setState({ ...initialState(), scan: { ...idleScan(), status: 'done', result: { findings: [] } as never } });
    expect(render(stub(LIVE))).toContain('The scan found nothing to ask about.');
  });
});

describe('answers in the panel', () => {
  const resultState = (over: Record<string, unknown> = {}) => {
    const summary = { taskType: 'explain', selectedCount: 1, includesContent: false };
    const done = aiComplete(aiBegin(idleAI(), 'r1', summary), 'r1', {
      requestId: 'r1', mode: 'live',
      response: { type: 'explanation', summary: 'S', evidencePaths: [], limitations: ['L'] },
      meta: { tier: 'heavy', provider: 'openrouter', model: 'openrouter/free', lighter: true, attempts: [{ provider: 'gemini', outcome: 'rate_limited' }, { provider: 'groq', outcome: 'timeout' }] },
    });
    studioStore.setState({ ...initialState(), ai: { ...done, ...over } });
  };
  it('shows who answered, the fallback sentence, and the lighter warning', () => {
    resultState();
    const m = render(stub(LIVE));
    expect(m).toContain('Answered by OpenRouter (heavy).');
    expect(m).toContain('Gemini was busy and Groq took too long, so OpenRouter answered.');
    expect(m).toContain('Answered by a lighter model; review carefully.');
  });
  it('a saved answer carries its label', () => {
    resultState({ fromCache: true });
    expect(render(stub(LIVE))).toContain('Saved answer from earlier in this session.');
  });
  it('the patch note appears for a live patch and an AI text sentinel is escaped', () => {
    const summary = { taskType: 'suggest_change', selectedCount: 1, includesContent: true };
    const done = aiComplete(aiBegin(idleAI(), 'r1', summary), 'r1', {
      requestId: 'r1', mode: 'live',
      response: { type: 'patch_proposal', summary: '<b>SENT</b>', affectedPaths: ['a.ts'], unifiedDiff: '--- a/a.ts\n+++ b/a.ts\n', tests: ['t'], risks: ['r'] },
    });
    studioStore.setState({ ...initialState(), ai: { ...done, proposalNote: 'Not queued: A run is active. Type stop first, then ask again.' } });
    const m = render(stub(LIVE));
    expect(m).toContain('Not queued: A run is active.');
    expect(m).not.toContain('<b>SENT</b>');
    expect(m).toContain('&lt;b&gt;SENT');
  });
  it('the empty and failed states still render', () => {
    expect(render(stub(LIVE))).toContain('No response yet.');
    studioStore.setState({ ...initialState(), ai: { status: 'failed', requestId: 'r', error: { code: 'rate_limited', message: 'Gemini and Groq are at their free limit right now. Try again in a minute.' } } });
    const m = render(stub(LIVE));
    expect(m).toContain('rate_limited');
    expect(m).toContain('at their free limit');
    expect(buttons(m)).toContain('Retry');
  });
});

describe('wireframe rules for the new parts', () => {
  it('the CSS block uses only black and white, with no transition or animation', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('@node: F11.10'));
    expect(block).not.toMatch(/transition|animation/i);
    const colours = block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    for (const c of colours) expect(['#000', '#fff']).toContain(c.toLowerCase());
    expect(block).not.toMatch(/rgb\(|hsl\(/);
    expect(block).toContain('min-height: 44px');
  });
});
