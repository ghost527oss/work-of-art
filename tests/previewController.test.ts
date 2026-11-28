// @node: F7.9
import { describe, expect, it, vi } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { createPreviewController, type LayoutRunner, type PreviewServices } from '../src/hooks/usePreview';
import type { BridgeEvent } from '../src/preview/previewBridge';
import { idlePreview, pvLayoutBegin, pvMode, pvScripts } from '../src/store/previewSlice';
import { createStore, initialState, reset, type StudioState } from '../src/store/useStudioStore';

const NONCE = '0123456789abcdef';
function setup(sample: 'static-site' | 'react-frontend' = 'static-site') {
  const store = createStore<StudioState>({ ...initialState(), experience: 'studio', snapshot: buildSampleSnapshot(sample, 1) });
  let listener: ((e: BridgeEvent) => void) | null = null;
  let removed = 0;
  let t = 1000;
  const timers: Array<() => void> = [];
  const services: PreviewServices = {
    now: () => t,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => undefined,
    raf: async () => undefined,
    addMessageListener: (fn) => { listener = fn; return () => { listener = null; removed++; }; },
  };
  const c = createPreviewController(store, services);
  return { store, c, send: (e: BridgeEvent) => listener?.(e), hasListener: () => listener !== null, removed: () => removed, advance: (ms: number) => { t += ms; }, timers };
}

describe('state transitions', () => {
  it('scripts are refused unless the mode is static and a mode change forces them off', () => {
    const s = idlePreview();
    expect(pvScripts({ ...s, mode: 'workbench' }, true).scripts).toBe(false);
    const on = pvScripts({ ...s, mode: 'static' }, true);
    expect(on.scripts).toBe(true);
    expect(pvMode(on, 'source', 'x').scripts).toBe(false);
    expect(pvLayoutBegin(on, [375])).toBe(on);
    expect(pvLayoutBegin({ ...s, mode: 'workbench' }, [375]).layout.status).toBe('idle');
  });
});

describe('controller', () => {
  it('init detects the mode and logs it; setMode offers only possible modes and logs; scripts follow the rules', () => {
    const { store, c } = setup();
    c.actions.init();
    expect(store.getState().preview).toMatchObject({ mode: 'static', entryPath: 'index.html', chosenBy: 'auto' });
    expect(store.getState().log.at(-1)!.message).toBe('Preview mode: Live Static Preview.');
    c.actions.setMode('workbench');
    expect(store.getState().preview.mode).toBe('static');
    c.actions.setScripts(true);
    expect(store.getState().preview.scripts).toBe(true);
    expect(store.getState().log.at(-1)!.message).toBe('Preview scripts turned on.');
    c.actions.setMode('source');
    expect(store.getState().preview).toMatchObject({ mode: 'source', scripts: false, chosenBy: 'user' });
    c.actions.setScripts(true);
    expect(store.getState().preview.scripts).toBe(false);
    c.dispose();
  });
  it('the bridge only adds console lines, ready, and counts invalid messages; it stops with scripts', () => {
    const { store, c, send, hasListener, removed, advance } = setup();
    c.actions.init(); c.actions.setScripts(true);
    const win = {};
    c.actions.startBridge(win, NONCE);
    expect(hasListener()).toBe(true);
    send({ source: win, origin: 'null', data: { v: 1, type: 'console', nonce: NONCE, level: 'warn', text: 'hello' } });
    send({ source: win, origin: 'null', data: { v: 1, type: 'ready', nonce: NONCE } });
    send({ source: win, origin: 'null', data: { v: 1, type: 'error', nonce: NONCE, message: 'boom', line: 3 } });
    expect(store.getState().preview.console).toEqual([{ level: 'warn', text: 'hello' }, { level: 'error', text: 'boom (line 3)' }]);
    expect(store.getState().preview.status).toBe('ready');
    const before = JSON.stringify({ ...store.getState().preview, console: undefined, invalidMessages: undefined });
    for (const bad of [{ source: {}, origin: 'null', data: { v: 1, type: 'ready', nonce: NONCE } }, { source: win, origin: 'https://x.test', data: { v: 1, type: 'ready', nonce: NONCE } }, { source: win, origin: 'null', data: { v: 1, type: 'navigate', to: 'https://evil.test', nonce: NONCE } }]) send(bad);
    // The wrong source is ignored outright. The other two are counted, flushed at most once a second.
    expect(store.getState().preview.invalidMessages).toBe(1);
    advance(1000);
    send({ source: win, origin: 'null', data: 'junk' });
    expect(store.getState().preview.invalidMessages).toBe(3);
    expect(JSON.stringify({ ...store.getState().preview, console: undefined, invalidMessages: undefined })).toBe(before);
    c.actions.setScripts(false);
    expect(hasListener()).toBe(false);
    expect(removed()).toBeGreaterThan(0);
    c.dispose();
  });
  it('a flood is rate limited, the console is bounded, and invalid counts are flushed once a second', () => {
    const { store, c, send, advance } = setup();
    c.actions.init(); c.actions.setScripts(true);
    const win = {};
    c.actions.startBridge(win, NONCE);
    for (let i = 0; i < 100; i++) send({ source: win, origin: 'null', data: { v: 1, type: 'console', nonce: NONCE, level: 'log', text: `m${i}` } });
    expect(store.getState().preview.console).toHaveLength(20);
    expect(store.getState().preview.invalidMessages).toBe(1);
    advance(1000);
    send({ source: win, origin: 'null', data: { v: 1, type: 'console', nonce: NONCE, level: 'log', text: 'later' } });
    expect(store.getState().preview.console.at(-1)!.text).toBe('later');
    c.dispose();
  });
  it('a second document in the frame resets scripts to look-only with the notice', () => {
    const { store, c } = setup();
    c.actions.init(); c.actions.setScripts(true);
    c.actions.onFrameLoad(1);
    expect(store.getState().preview.scripts).toBe(true);
    c.actions.onFrameLoad(2);
    expect(store.getState().preview.scripts).toBe(false);
    expect(store.getState().log.at(-1)!.message).toBe('The preview tried to leave the page and was reset.');
    c.dispose();
  });
  it('replacing the snapshot stops the bridge; dispose removes everything', () => {
    const { store, c, hasListener } = setup();
    c.actions.init(); c.actions.setScripts(true);
    c.actions.startBridge({}, NONCE);
    store.update((s) => reset(s));
    expect(hasListener()).toBe(false);
    c.actions.startBridge({}, NONCE);
    c.dispose();
    expect(hasListener()).toBe(false);
    c.actions.setScripts(true);
    expect(store.getState().preview.scripts).toBe(false);
  });
});

describe('layout check run', () => {
  const runner = (over: Partial<LayoutRunner> = {}): LayoutRunner => ({
    setWidth: vi.fn(), restore: vi.fn(), elements: [{ id: 0, path: 'index.html', tag: 'p', line: 1, col: 1, startOffset: 0, endOffset: 5, endLine: 1 }], contentKey: 'k1',
    measure: () => ({ measurements: [{ id: 0, tag: 'p', clientWidth: 100, scrollWidth: 300, clientHeight: 20, scrollHeight: 20, overflowX: 'visible', overflowY: 'visible', hasText: true }], docScrollWidth: 300 }), ...over,
  });
  it('measures at each width, restores the frame width, and stores one merged finding', async () => {
    const { store, c } = setup();
    c.actions.init();
    const r = runner();
    await c.actions.checkLayout(r, [375, 768, 1024]);
    const l = store.getState().preview.layout;
    expect(l.status).toBe('done');
    expect(l.findings).toHaveLength(1);
    expect(l.findings[0]!.extra).toContain('375, 768, 1024');
    expect(r.setWidth).toHaveBeenCalledTimes(3);
    expect(r.restore).toHaveBeenCalledTimes(1);
    expect(store.getState().log.at(-1)!.message).toBe('Layout check: 1 findings at 375, 768, 1024 px.');
    c.dispose();
  });
  it('is refused while scripts run or outside the static mode, and a missing frame stops it', async () => {
    const a = setup(); a.c.actions.init(); a.c.actions.setScripts(true);
    await a.c.actions.checkLayout(runner(), [375]);
    expect(a.store.getState().preview.layout.status).toBe('idle');
    const b = setup('react-frontend'); b.c.actions.init();
    await b.c.actions.checkLayout(runner(), [375]);
    expect(b.store.getState().preview.layout.status).toBe('idle');
    const c2 = setup(); c2.c.actions.init();
    await c2.c.actions.checkLayout(runner({ measure: () => null }), [375]);
    expect(c2.store.getState().preview.layout).toMatchObject({ status: 'stopped', message: 'The layout check took too long and was stopped.' });
  });
  it('a slow check is stopped by the timer', async () => {
    const { store, c, timers } = setup();
    c.actions.init();
    let calls = 0;
    const r = runner({ measure: () => { calls++; if (calls === 1) timers[0]?.(); return { measurements: [], docScrollWidth: 0 }; } });
    await c.actions.checkLayout(r, [375, 768, 1024]);
    expect(store.getState().preview.layout.status).toBe('stopped');
    expect(r.restore).toHaveBeenCalled();
  });
  it('results are discarded when the content key changes', async () => {
    const { store, c } = setup();
    c.actions.init();
    await c.actions.checkLayout(runner(), [375]);
    c.actions.markContent('k1');
    expect(store.getState().preview.layout.status).toBe('done');
    c.actions.markContent('k2');
    expect(store.getState().preview.layout.status).toBe('idle');
    expect(store.getState().preview.layout.findings).toEqual([]);
  });
});

// @node: F12.11 (3B-1: the Full check reads the extra values, waits for fonts and pictures, and keeps what it could not measure)
describe('Full check with the Visual Linter', () => {
  const ELEMENTS = [
    { id: 0, path: 'index.html', tag: 'button', line: 1, col: 1, startOffset: 0, endOffset: 5, endLine: 1 },
    { id: 1, path: 'index.html', tag: 'p', line: 2, col: 1, startOffset: 6, endOffset: 9, endLine: 2 },
  ];
  const m = (over: object) => ({
    id: 0, tag: 'button', clientWidth: 30, scrollWidth: 30, clientHeight: 30, scrollHeight: 30, overflowX: 'visible', overflowY: 'visible', hasText: true,
    parentKey: 1, left: 0, top: 0, width: 30, height: 30, display: 'block', position: 'static', visibility: 'visible', opacity: 1, fontSize: 16, color: 'rgb(0, 0, 0)', bg: { color: 'rgb(255, 255, 255)' }, hasHref: true, ...over,
  });
  const lintRunner = (over: Partial<LayoutRunner> = {}): LayoutRunner => ({
    setWidth: vi.fn(), restore: vi.fn(), elements: ELEMENTS, contentKey: 'k1',
    measure: () => ({ measurements: [m({}), m({ id: 1, tag: 'p', parentKey: 2, width: 200, height: 20, color: 'rgb(200, 200, 200)', bg: { unknown: 'picture' } })], docScrollWidth: 375, outsideStyleFailed: 1 }), ...over,
  });
  it('stores new findings with confidence, the can\'t-measure counts, and the outside-style note; waits at every width', async () => {
    const { store, c } = setup();
    c.actions.init();
    const ready = vi.fn(async () => ({ pendingImages: 0 }));
    await c.actions.checkLayout(lintRunner({ ready }), [375, 768, 1024]);
    const l = store.getState().preview.layout;
    expect(l.status).toBe('done');
    expect(l.findings.map((f) => f.measure?.kind)).toEqual(['tap-target']);
    expect(l.findings[0]).toMatchObject({ confidence: 'high', skillId: 'scan.frontend.tap-target' });
    expect(l.findings[0]!.extra).toContain('measured at 375, 768 px wide previews (static render, scripts off)');
    expect(l.cantMeasure).toEqual({ picture: 1 });
    expect(l.outsideStyleFailed).toBe(1);
    expect(ready).toHaveBeenCalledTimes(3);
    c.dispose();
  });
  it('nothing about the measurements is written to the Log except the count line', async () => {
    const { store, c } = setup();
    c.actions.init();
    await c.actions.checkLayout(lintRunner(), [375]);
    expect(store.getState().log.at(-1)!.message).toBe('Layout check: 1 findings at 375 px.');
    expect(JSON.stringify(store.getState().log)).not.toContain('rgb(');
    c.dispose();
  });
  it('a runner without ready() still works, and a check that hangs in ready() is stopped by the timer', async () => {
    const a = setup(); a.c.actions.init();
    await a.c.actions.checkLayout(lintRunner(), [375]);
    expect(a.store.getState().preview.layout.status).toBe('done');
    const b = setup(); b.c.actions.init();
    const r = lintRunner({ ready: async () => { b.timers[0]?.(); } });
    await b.c.actions.checkLayout(r, [375, 768]);
    expect(b.store.getState().preview.layout.status).toBe('stopped');
    expect(r.restore).toHaveBeenCalled();
  });
  it('findings and counts are dropped with the layout when the content changes', async () => {
    const { store, c } = setup();
    c.actions.init();
    await c.actions.checkLayout(lintRunner(), [375]);
    c.actions.markContent('other');
    expect(store.getState().preview.layout).toMatchObject({ status: 'idle', findings: [] });
    expect(store.getState().preview.layout.cantMeasure).toBeUndefined();
  });
});
