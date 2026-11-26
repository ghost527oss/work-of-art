// @node: F3.2
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AREAS,
  INITIAL_VIEW,
  areaLabel,
  backToSkeleton,
  backToStudio,
  isAreaId,
  openDomain,
  openSkeleton,
  toolbarVisible,
  viewWhenStudio,
  type AreaId,
  type ShellView,
} from '../src/store/shellView';
import { createStore } from '../src/store/useStudioStore';

const studio: ShellView = { screen: 'studio' };
const skeleton: ShellView = { screen: 'skeleton' };
const domain = (area: AreaId): ShellView => ({ screen: 'domain', area });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

describe('areas', () => {
  it('has exactly four areas with the approved labels', () => {
    expect(AREAS.map((a) => a.label)).toEqual(['Frontend', 'Backend', 'Security', 'APIs & Data']);
    expect(AREAS.map((a) => a.id)).toEqual(['frontend', 'backend', 'security', 'api_data']);
    expect(areaLabel('api_data')).toBe('APIs & Data');
    expect(isAreaId('security')).toBe(true);
    expect(isAreaId('hacking')).toBe(false);
  });
});

describe('allowed moves', () => {
  it('studio -> skeleton', () => expect(openSkeleton(studio)).toEqual(skeleton));
  it('skeleton -> domain, for each of the four areas', () => {
    for (const a of AREAS) expect(openDomain(skeleton, a.id)).toEqual(domain(a.id));
  });
  it('domain -> another domain, and domain -> skeleton, and back to studio', () => {
    expect(openDomain(domain('backend'), 'security')).toEqual(domain('security'));
    expect(backToSkeleton(domain('backend'))).toEqual(skeleton);
    expect(backToStudio(domain('backend'))).toEqual(studio);
    expect(backToStudio(skeleton)).toEqual(studio);
  });
});

describe('moves that are not allowed return the same object', () => {
  it('opening skeleton from skeleton or domain', () => {
    expect(openSkeleton(skeleton)).toBe(skeleton);
    const d = domain('frontend');
    expect(openSkeleton(d)).toBe(d);
  });
  it('opening a domain from the studio screen, or an unknown area', () => {
    expect(openDomain(studio, 'frontend')).toBe(studio);
    expect(openDomain(skeleton, 'nope' as AreaId)).toBe(skeleton);
  });
  it('opening the same domain again', () => {
    const d = domain('backend');
    expect(openDomain(d, 'backend')).toBe(d);
  });
  it('back to skeleton from studio or skeleton, back to studio from studio', () => {
    expect(backToSkeleton(studio)).toBe(studio);
    expect(backToSkeleton(skeleton)).toBe(skeleton);
    expect(backToStudio(studio)).toBe(studio);
  });
});

describe('toolbar and reset rules', () => {
  it('the toolbar is visible on the studio screen only', () => {
    expect(toolbarVisible(studio)).toBe(true);
    expect(toolbarVisible(skeleton)).toBe(false);
    expect(toolbarVisible(domain('security'))).toBe(false);
  });
  it('viewWhenStudio keeps the view while the Studio is shown and resets otherwise', () => {
    const d = domain('backend');
    expect(viewWhenStudio(d, true)).toBe(d);
    expect(viewWhenStudio(d, false)).toEqual(INITIAL_VIEW);
    expect(viewWhenStudio(studio, false)).toBe(studio);
  });
});

describe('purity and data shape', () => {
  it('never mutates frozen input', () => {
    const d = deepFreeze(domain('backend'));
    expect(() => {
      openSkeleton(d);
      openDomain(d, 'frontend');
      backToSkeleton(d);
      backToStudio(d);
    }).not.toThrow();
  });
  it('a seeded random sequence never leaves an invalid view', () => {
    let seed = 99;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let v: ShellView = studio;
    for (let i = 0; i < 3000; i++) {
      const r = Math.floor(rand() * 4);
      if (r === 0) v = openSkeleton(v);
      else if (r === 1) v = openDomain(v, AREAS[Math.floor(rand() * 4)]!.id);
      else if (r === 2) v = backToSkeleton(v);
      else v = backToStudio(v);
      expect(['studio', 'skeleton', 'domain']).toContain(v.screen);
      if (v.screen === 'domain') expect(isAreaId(v.area)).toBe(true);
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
  });
});

describe('the screen store (no React)', () => {
  it('store updates follow the same rules and ignored moves keep the object', () => {
    const store = createStore<ShellView>(INITIAL_VIEW);
    let notified = 0;
    store.subscribe(() => notified++);
    store.update((v) => openDomain(v, 'frontend')); // ignored from studio
    expect(notified).toBe(0);
    store.update(openSkeleton);
    store.update((v) => openDomain(v, 'backend'));
    expect(store.getState()).toEqual(domain('backend'));
    expect(notified).toBe(2);
  });
  it('leaving the Studio resets the view; a background reload (still studio) keeps it', () => {
    const store = createStore<ShellView>(domain('security'));
    // experience stays "studio" during a scoped reload
    store.update((v) => viewWhenStudio(v, true));
    expect(store.getState()).toEqual(domain('security'));
    store.update((v) => viewWhenStudio(v, false));
    expect(store.getState()).toEqual(INITIAL_VIEW);
  });
});

describe('module hygiene', () => {
  it('shellView.ts imports nothing, and useShell.ts uses no browser storage', () => {
    const pure = readFileSync(fileURLToPath(new URL('../src/store/shellView.ts', import.meta.url)), 'utf8');
    expect(pure).not.toMatch(/^import /m);
    const hook = readFileSync(fileURLToPath(new URL('../src/hooks/useShell.ts', import.meta.url)), 'utf8');
    expect(hook).not.toMatch(/localStorage|sessionStorage|fetch\(/);
  });
});
