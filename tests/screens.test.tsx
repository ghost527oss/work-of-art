// @node: F3.4
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DomainScreen } from '../src/components/DomainScreen';
import { SandboxPlaceholder } from '../src/components/SandboxPlaceholder';
import { SkeletonCrewScreen } from '../src/components/SkeletonCrewScreen';
import { AREAS } from '../src/store/shellView';

const noop = () => undefined;

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

describe('SandboxPlaceholder', () => {
  it('shows the label inside a section named Sandbox', () => {
    const html = renderToStaticMarkup(createElement(SandboxPlaceholder));
    expect(html).toContain('aria-label="Sandbox"');
    expect(html).toContain('Sandbox (coming in sub-phase 2E)');
  });
});

describe('SkeletonCrewScreen (Screen 4)', () => {
  const html = renderToStaticMarkup(createElement(SkeletonCrewScreen, { onOpenArea: noop, onBack: noop }));
  it('has the heading, the 2D sentence, four area buttons, and Back to Studio', () => {
    expect(html).toContain('>Skeleton Crew</h1>');
    expect(html).toContain('The four-area map and the worker slots arrive in sub-phase 2D.');
    for (const a of AREAS) expect(html).toContain(`>${a.label.replace('&', '&amp;')}</button>`);
    expect(html).toContain('>Back to Studio</button>');
  });
  it('renders no toolbar', () => {
    expect(html).not.toContain('Studio tools');
    expect(html).not.toContain('class="toolbar"');
    expect(html).not.toMatch(/>(Edit|AI Chat|Log|History|Journal)</);
  });
});

describe('DomainScreen (Screen 5)', () => {
  it('shows each area name as its heading with the 2D sentence and both Back buttons', () => {
    for (const a of AREAS) {
      const html = renderToStaticMarkup(createElement(DomainScreen, { area: a.id, onBackToSkeleton: noop, onBackToStudio: noop }));
      expect(html).toContain(`>${a.label.replace('&', '&amp;')}</h1>`);
      expect(html).toContain('Findings and live debugging arrive in sub-phase 2D.');
      expect(html).toContain('>Back to Skeleton Crew</button>');
      expect(html).toContain('>Back to Studio</button>');
      expect(html).not.toContain('Studio tools');
    }
  });
});

describe('static checks', () => {
  it('files are tagged and use no dangerouslySetInnerHTML', () => {
    for (const f of ['SandboxPlaceholder', 'SkeletonCrewScreen', 'DomainScreen']) {
      const text = read(`../src/components/${f}.tsx`);
      expect(text).toContain('@node: F3.4');
      expect(text).not.toContain('dangerouslySetInnerHTML');
    }
  });
  it('the Screens 4 and 5 CSS block is black and white with no transition or animation', () => {
    const css = read('../src/styles.css');
    const start = css.indexOf('/* @node: F3.4');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 5);
    const next = rest.search(/\/\* @node: /);
    const raw = next === -1 ? css.slice(start) : css.slice(start, start + 5 + next);
    const block = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/transition|animation/);
    for (const c of block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(['#000', '#fff']).toContain(c.toLowerCase());
  });
});
