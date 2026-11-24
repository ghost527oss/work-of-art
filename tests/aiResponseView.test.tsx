// @node: F2.7
// Tests AIResponseView using react-dom/server. No DOM environment needed.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AIResponseView } from '../src/components/AIResponseView';

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
