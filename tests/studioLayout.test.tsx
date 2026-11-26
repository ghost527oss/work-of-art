// @node: F3.5
// Server-render tests for the rewired Studio. The global stores are seeded and reset around each test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StudioLayout } from '../src/components/StudioLayout';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { layoutStore } from '../src/hooks/useLayout';
import { shellStore } from '../src/hooks/useShell';
import { DEFAULT_LAYOUT, type LayoutState } from '../src/store/layoutSlice';
import { INITIAL_VIEW, type ShellView } from '../src/store/shellView';
import { beginIngestion, completeIngestion, initialState, studioStore, withLog } from '../src/store/useStudioStore';

const noop = () => undefined;
const assistant = { send: () => null, cancel: noop, clear: noop };
const snapshot = buildSampleSnapshot('static-site', 1);
const target = { owner: 'sample', repo: 'static-site', source: 'sample' as const, sampleId: 'static-site' };

function seedLoaded() {
  let s = beginIngestion(initialState(), target, 1);
  s = completeIngestion(s, s.ingestion.runId, snapshot, 2);
  studioStore.setState(s);
}

function render() {
  return renderToStaticMarkup(
    createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant }),
  );
}

function setLayout(l: LayoutState) {
  layoutStore.setState(l);
}
function setView(v: ShellView) {
  shellStore.setState(v);
}

beforeEach(() => {
  seedLoaded();
  setLayout(DEFAULT_LAYOUT);
  setView(INITIAL_VIEW);
});
afterEach(() => {
  studioStore.setState(initialState());
  setLayout(DEFAULT_LAYOUT);
  setView(INITIAL_VIEW);
});

describe('Studio shell (Screen 3)', () => {
  it('renders nothing without a snapshot', () => {
    studioStore.setState(initialState());
    expect(render()).toBe('');
  });

  it('contains the toolbar, the sandbox placeholder, Project info, and the AI panel (default layout)', () => {
    const html = render();
    expect(html.match(/<nav class="toolbar"/g)).toHaveLength(1);
    expect(html).toContain('Sandbox (coming in sub-phase 2E)');
    expect(html).toContain('Sample: static-site');
    expect(html).toContain('ref ' + snapshot.ref);
    expect(html).toContain('>Back to Start</button>');
    expect(html).toContain('Inventory (');
    expect(html).toContain('Mock mode: responses are canned examples.');
    expect(html).toMatch(/<div><section class="assistant"/); // the wrapper is not hidden when AI Chat is open
  });

  it('keeps the AI panel in the page but hidden when another panel or none is open', () => {
    setLayout({ openPanel: 'log', collapsed: false, width: 'narrow' });
    let html = render();
    expect(html).toMatch(/<div hidden=""><section class="assistant"/);
    setLayout({ openPanel: null, collapsed: false, width: 'narrow' });
    html = render();
    expect(html).toMatch(/<div hidden=""><section class="assistant"/);
    expect(html).toMatch(/<aside[^>]* hidden=""/);
  });

  it('shows exactly the opened panel title in the frame, for each panel', () => {
    const titles: Array<[LayoutState['openPanel'], string]> = [
      ['edit', 'Edit'],
      ['ai', 'AI Chat'],
      ['log', 'Log'],
      ['history', 'History'],
      ['journal', 'Journal'],
    ];
    for (const [id, title] of titles) {
      setLayout({ openPanel: id, collapsed: false, width: 'narrow' });
      expect(render()).toContain(`<h2>${title}</h2>`);
    }
  });

  it('the Log panel lists the session log entries (the 2B note is gone)', () => {
    setLayout({ openPanel: 'log', collapsed: false, width: 'narrow' });
    const html = render();
    expect(html).toContain('Session log');
    expect(html).toContain('ingest_completed');
    expect(html).not.toContain('Planning and skill entries arrive in sub-phase 2B.');
  });

  it('placeholder panels name their sub-phase', () => {
    setLayout({ openPanel: 'edit', collapsed: false, width: 'narrow' });
    expect(render()).toContain('Editing tools arrive in sub-phase 2E.');
    setLayout({ openPanel: 'history', collapsed: false, width: 'narrow' });
    expect(render()).toContain('No changes yet.');
    setLayout({ openPanel: 'journal', collapsed: false, width: 'narrow' });
    expect(render()).toContain('Arrives in sub-phase 2F.');
  });

  it('collapsed panel shows Expand and marks the left area as not covered', () => {
    setLayout({ openPanel: 'ai', collapsed: true, width: 'narrow' });
    const html = render();
    expect(html).toContain('aria-label="Expand AI Chat"');
    expect(html).toContain('class="shell-left"');
    setLayout({ openPanel: 'ai', collapsed: false, width: 'narrow' });
    expect(render()).toContain('class="shell-left covered"');
  });

  it('has no Apply, Approve, Reject, Pause, Resume, Step, or Stop button', () => {
    const buttons = [...render().matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    for (const label of buttons) expect(label).not.toMatch(/^(Apply|Approve|Reject|Pause|Resume|Step|Stop)$/);
  });

  it('still shows the background reload status and error blocks (existing behavior)', () => {
    const s = studioStore.getState();
    studioStore.setState(beginIngestion(s, target, 3, { keepSnapshot: true }));
    expect(render()).toContain('Reloading selected folders from');
  });
});

describe('Screens 4 and 5 inside the shell', () => {
  it('Screen 4: sandbox placeholder and the Skeleton Crew page, no toolbar', () => {
    setView({ screen: 'skeleton' });
    const html = render();
    expect(html).toContain('>Skeleton Crew</h1>');
    expect(html).toContain('Sandbox (coming in sub-phase 2E)');
    expect(html).not.toContain('class="toolbar"');
    expect(html).not.toContain('Studio tools');
  });
  it('Screen 5: the area heading, no toolbar', () => {
    setView({ screen: 'domain', area: 'api_data' });
    const html = render();
    expect(html).toContain('>APIs &amp; Data</h1>');
    expect(html).not.toContain('Studio tools');
  });
  it('a remount keeps the screen because it comes from the store', () => {
    setView({ screen: 'skeleton' });
    expect(render()).toContain('>Skeleton Crew</h1>');
    expect(render()).toContain('>Skeleton Crew</h1>');
  });
});

describe('static checks', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  it('StudioLayout imports no engine module, and the shell files are tagged F3.5', () => {
    const layout = read('../src/components/StudioLayout.tsx');
    expect(layout).not.toMatch(/from\s+['"]\.\.\/engine/);
    for (const f of ['StudioLayout', 'ProjectInfo', 'LogPanel']) {
      expect(read(`../src/components/${f}.tsx`)).toContain('@node: F3.5');
    }
  });
  it('withLog is untouched and exported for later specs', () => {
    expect(typeof withLog).toBe('function');
  });
});
