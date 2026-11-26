// @node: F3.3
// Server-render tests for the toolbar and the panel frame. No DOM environment needed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelFrame, type PanelFrameProps } from '../src/components/PanelFrame';
import { StudioToolbar, TOOLBAR_PANELS } from '../src/components/StudioToolbar';

const noop = () => undefined;
const XSS = '<img src=x onerror=alert(1)>';

function toolbar(openPanel: Parameters<typeof StudioToolbar>[0]['openPanel']) {
  return renderToStaticMarkup(createElement(StudioToolbar, { openPanel, onTogglePanel: noop, onSkeleton: noop }));
}

function frame(props: Partial<PanelFrameProps> = {}, children: string = 'BODY') {
  return renderToStaticMarkup(
    createElement(
      PanelFrame,
      { title: 'AI Chat', open: true, collapsed: false, width: 'narrow', onToggleCollapsed: noop, onToggleWidth: noop, onClose: noop, ...props },
      children,
    ),
  );
}

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

describe('StudioToolbar', () => {
  it('renders six buttons in the approved order inside a labelled nav', () => {
    const html = toolbar(null);
    expect(html).toContain('<nav class="toolbar" aria-label="Studio tools">');
    const labels = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(labels).toEqual(['Edit', 'AI Chat', 'Log', 'History', 'Journal', 'Skeleton Crew']);
    expect(TOOLBAR_PANELS.map((p) => p.id)).toEqual(['edit', 'ai', 'log', 'history', 'journal']);
  });
  it('marks only the open panel as pressed and gives Skeleton Crew no aria-pressed', () => {
    const html = toolbar('log');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true">Log</);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
    expect(html).toMatch(/<button type="button">Skeleton Crew<\/button>/);
  });
  it('gives each panel button a data-panel id so focus can return to it', () => {
    const html = toolbar(null);
    for (const id of ['edit', 'ai', 'log', 'history', 'journal']) expect(html).toContain(`data-panel="${id}"`);
  });
  it('shows nothing pressed when no panel is open', () => {
    expect(toolbar(null)).not.toContain('aria-pressed="true"');
  });
  it('has no Apply, Approve, Reject, Pause, Resume, Step, or Stop control', () => {
    expect(toolbar('ai')).not.toMatch(/Apply|Approve|Reject|Pause|Resume|Step|Stop/);
  });
});

describe('PanelFrame', () => {
  it('expanded narrow: title and the Collapse, Wide, and Close buttons', () => {
    const html = frame();
    expect(html).toContain('aria-label="AI Chat"');
    expect(html).toContain('panel-narrow');
    expect(html).toContain('<h2>AI Chat</h2>');
    expect(html).toContain('>Collapse<');
    expect(html).toContain('>Wide<');
    expect(html).toContain('>Close<');
    expect(html).not.toContain('Expand');
    expect(html).not.toMatch(/<aside[^>]* hidden/);
  });
  it('the collapse/expand toggle is the same button in the same place in both states (keeps keyboard focus)', () => {
    const expanded = frame();
    const collapsed = frame({ collapsed: true });
    const firstButton = (html: string) => html.match(/<button[^>]*>[^<]*<\/button>/)![0];
    expect(firstButton(expanded)).toContain('>Collapse<');
    expect(firstButton(collapsed)).toContain('>Expand<');
  });
  it('wide shows the Narrow button and the wide class', () => {
    const html = frame({ width: 'wide' });
    expect(html).toContain('panel-wide');
    expect(html).toContain('>Narrow<');
    expect(html).not.toContain('>Wide<');
  });
  it('collapsed: one Expand button named with the title, and a hidden body that still holds the children', () => {
    const html = frame({ collapsed: true });
    expect(html).toContain('aria-label="Expand AI Chat"');
    expect(html).not.toContain('>Collapse<');
    expect(html).toMatch(/<div class="panel-body" hidden="">BODY<\/div>/);
    expect(html).toContain('panel-collapsed');
  });
  it('closed: the whole aside is hidden but its children are still rendered', () => {
    const html = frame({ open: false });
    expect(html).toMatch(/<aside[^>]* hidden=""/);
    expect(html).toContain('BODY');
  });
  it('escapes markup-looking text in the title and children', () => {
    const html = frame({ title: XSS }, XSS);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('static checks for the 2A shell files', () => {
  const files = ['../src/components/StudioToolbar.tsx', '../src/components/PanelFrame.tsx'];
  it('no dangerouslySetInnerHTML, and every file carries @node: F3.3', () => {
    for (const f of files) {
      const text = read(f);
      expect(text).not.toContain('dangerouslySetInnerHTML');
      expect(text).toContain('@node: F3.3');
    }
  });
  it('the shell CSS block uses only #000 and #fff, with no transition or animation', () => {
    const css = read('../src/styles.css');
    const start = css.indexOf('/* @node: F3.3');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 5);
    const next = rest.search(/\/\* @node: /);
    const raw = next === -1 ? css.slice(start) : css.slice(start, start + 5 + next);
    const block = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/transition|animation/);
    const colors = block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    for (const c of colors) expect(['#000', '#fff']).toContain(c.toLowerCase());
    expect(block).not.toMatch(/rgb\(|hsl\(/);
  });
});
