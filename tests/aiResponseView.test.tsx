// @node: F2.7
// Tests AIResponseView using react-dom/server. No DOM environment needed.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AIResponseView } from '../src/components/AIResponseView';
import type { AIMeta, AIResponse } from '../src/types/contracts';

function render(props: Parameters<typeof AIResponseView>[0]) {
  return renderToStaticMarkup(createElement(AIResponseView, props));
}

const XSS = '<img src=x onerror=alert(1)>';
const SCRIPT = '<script>evil()</script>';

// ---------------------------------------------------------------------------
// All four response types render their fields
// ---------------------------------------------------------------------------

describe('AIResponseView: response types', () => {
  it('clarification: renders each question as text', () => {
    const html = render({
      mode: 'mock',
      response: { type: 'clarification', questions: ['Why is this here?', 'What should it do?'] },
    });
    expect(html).toContain('Why is this here?');
    expect(html).toContain('What should it do?');
    expect(html).toContain('Mode: mock');
  });

  it('explanation: renders summary, evidence paths, and limitations', () => {
    const html = render({
      mode: 'mock',
      response: {
        type: 'explanation',
        summary: 'This module handles auth.',
        evidencePaths: ['src/auth.ts'],
        limitations: ['This is a mock.'],
      },
    });
    expect(html).toContain('This module handles auth.');
    expect(html).toContain('src/auth.ts');
    expect(html).toContain('This is a mock.');
  });

  it('plan: renders summary, affected paths, steps, and risks', () => {
    const html = render({
      mode: 'mock',
      response: {
        type: 'plan',
        summary: 'Mock plan',
        affectedPaths: ['src/a.ts', 'src/b.ts'],
        steps: ['Step 1', 'Step 2', 'Step 3'],
        risks: ['This is a mock.'],
      },
    });
    expect(html).toContain('Mock plan');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('Step 1');
    expect(html).toContain('This is a mock.');
  });

  it('patch_proposal: renders diff in a pre block and the no-apply notice', () => {
    const diff = '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1 @@\n+// MOCK\n';
    const html = render({
      mode: 'mock',
      response: {
        type: 'patch_proposal',
        summary: 'Mock patch',
        affectedPaths: ['src/a.ts'],
        unifiedDiff: diff,
        tests: ['Run tests'],
        risks: ['This is a mock.'],
      },
    });
    expect(html).toContain('Mock patch');
    expect(html).toContain('<pre');
    expect(html).toContain('// MOCK');
    expect(html).toContain('This proposal cannot be applied in this build.');
    expect(html).toContain('Run tests');
  });
});

// ---------------------------------------------------------------------------
// XSS / injection: content is escaped, never inserted as HTML
// ---------------------------------------------------------------------------

describe('AIResponseView: no HTML injection', () => {
  it('clarification: XSS is escaped', () => {
    const html = render({ mode: 'mock', response: { type: 'clarification', questions: [XSS, SCRIPT] } });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('explanation: XSS in all fields is escaped', () => {
    const html = render({
      mode: 'mock',
      response: {
        type: 'explanation',
        summary: XSS,
        evidencePaths: [XSS],
        limitations: [SCRIPT],
      },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
  });

  it('plan: XSS in all fields is escaped', () => {
    const html = render({
      mode: 'mock',
      response: {
        type: 'plan',
        summary: XSS,
        affectedPaths: [XSS],
        steps: [SCRIPT],
        risks: [XSS],
      },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
  });

  it('patch_proposal: XSS in all fields is escaped', () => {
    const html = render({
      mode: 'mock',
      response: {
        type: 'patch_proposal',
        summary: XSS,
        affectedPaths: [XSS],
        unifiedDiff: `+++ ${XSS}`,
        tests: [SCRIPT],
        risks: [XSS],
      },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// No Apply, Approve, or Reject controls
// ---------------------------------------------------------------------------

describe('AIResponseView: no dangerous controls', () => {
  const types = [
    { type: 'clarification' as const, questions: ['q'] },
    { type: 'explanation' as const, summary: 'x', evidencePaths: ['a.ts'], limitations: ['l'] },
    { type: 'plan' as const, summary: 'x', affectedPaths: ['a.ts'], steps: ['s'], risks: ['r'] },
    { type: 'patch_proposal' as const, summary: 'x', affectedPaths: ['a.ts'], unifiedDiff: 'd', tests: ['t'], risks: ['r'] },
  ];
  for (const response of types) {
    it(`${response.type}: no Apply, Approve, or Reject`, () => {
      const html = render({ mode: 'mock', response });
      expect(html.toLowerCase()).not.toContain('>apply<');
      expect(html.toLowerCase()).not.toContain('>approve<');
      expect(html.toLowerCase()).not.toContain('>reject<');
    });
  }
});

// ---------------------------------------------------------------------------
// Mode label is always present
// ---------------------------------------------------------------------------

describe('AIResponseView: mock label', () => {
  it('shows the mode', () => {
    const html = render({ mode: 'mock', response: { type: 'clarification', questions: ['q'] } });
    expect(html).toContain('Mode: mock');
  });
});

// ---------------------------------------------------------------------------
// @node: F11.10 Phase 3A: provider line, fallback sentence, lighter warning, saved label, action, patch note
// ---------------------------------------------------------------------------

describe('AIResponseView: live answers', () => {
  const explanation: AIResponse = { type: 'explanation', summary: 'S', evidencePaths: [], limitations: ['L'] };
  const meta: AIMeta = { tier: 'light', provider: 'groq', model: 'm', lighter: false, attempts: [{ provider: 'gemini', outcome: 'rate_limited' }] };
  const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

  it('shows the provider and tier and the calm fallback sentence', () => {
    const html = render({ mode: 'live', response: explanation, meta });
    expect(html).toContain('Answered by Groq (light).');
    expect(html).toContain('Gemini was busy, so Groq answered.');
    expect(html).not.toContain('lighter model');
  });
  it('shows the lighter-model warning only when true', () => {
    expect(render({ mode: 'live', response: explanation, meta: { ...meta, lighter: true } })).toContain('Answered by a lighter model; review carefully.');
    expect(render({ mode: 'live', response: explanation, meta })).not.toContain('review carefully');
  });
  it('a saved answer has its label and one Ask again button', () => {
    const html = render({ mode: 'live', response: explanation, meta, fromCache: true, onAskAgain: () => undefined });
    expect(html).toContain('Saved answer from earlier in this session.');
    expect(buttons(html)).toEqual(['Ask again']);
    expect(render({ mode: 'live', response: explanation, meta })).not.toContain('Saved answer');
  });
  it('a mock answer shows none of the live lines', () => {
    const html = render({ mode: 'mock', response: explanation });
    expect(html).not.toContain('Answered by');
    expect(html).not.toContain('Saved answer');
  });
  it('an action answer names the action and says where the result is', () => {
    const html = render({ mode: 'live', meta, response: { type: 'action', action: 'start', arg: 'crew', summary: 'Starting the crew' } });
    expect(html).toContain('The AI asked PatchBay to run: <code>start crew</code>');
    expect(html).toContain('Starting the crew');
    expect(html).toContain('command replies');
    expect(buttons(html)).toEqual([]);
  });
  it('a live patch shows the note (queued or why not) and never an Approve button', () => {
    const response: AIResponse = { type: 'patch_proposal', summary: 's', affectedPaths: ['a.ts'], unifiedDiff: '--- a/a.ts\n+++ b/a.ts\n', tests: ['t'], risks: ['r'] };
    const queued = render({ mode: 'live', response, proposalNote: 'Queued for your approval. Use Approve or Reject on the card above.' });
    expect(queued).toContain('Queued for your approval.');
    const refused = render({ mode: 'live', response, proposalNote: 'Not queued: A run is active. Type stop first, then ask again.' });
    expect(refused).toContain('Not queued: A run is active.');
    expect(buttons(refused)).toEqual([]);
    expect(render({ mode: 'live', response })).toContain('This change is shown only.');
    expect(render({ mode: 'mock', response })).toContain('This proposal cannot be applied in this build.');
  });
  it('all AI text is escaped, never markup', () => {
    const html = render({ mode: 'live', meta, response: { type: 'action', action: 'help', summary: '<img src=x onerror=alert(1)>' } });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
