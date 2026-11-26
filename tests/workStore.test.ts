// @node: F4.5
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { DEFAULT_LAYOUT, openPanelById, setCollapsed, togglePanel, type LayoutState } from '../src/store/layoutSlice';
import { beginIngestion, cancelIngestion, completeIngestion, initialState, reset, type StudioState } from '../src/store/useStudioStore';
import { idleWork, type WorkState } from '../src/store/workSlice';

const busy: WorkState = {
  ...idleWork(), runSeq: 3,
  run: { id: 'r', status: 'paused', autoAdvance: false, position: 1, steps: [{ kind: 'info', title: 't' }] },
};
const target = { owner: 'sample', repo: 'x', source: 'sample' as const, sampleId: 'x' };

describe('work in the studio store', () => {
  it('initial state has idle work', () => expect(initialState().work).toEqual(idleWork()));
  it('beginIngestion (non-background) clears work', () => {
    const s: StudioState = { ...initialState(), work: busy };
    expect(beginIngestion(s, target, 1).work).toEqual(idleWork());
  });
  it('completeIngestion clears work', () => {
    const begun = beginIngestion(initialState(), target, 1);
    const snap = buildSampleSnapshot('static-site', 1);
    const done = completeIngestion({ ...begun, work: busy }, begun.ingestion.runId, snap, 2);
    expect(done.work).toEqual(idleWork());
  });
  it('cancelIngestion (not background) clears work', () => {
    const begun = beginIngestion(initialState(), target, 1);
    expect(cancelIngestion({ ...begun, work: busy }, 2).work).toEqual(idleWork());
  });
  it('reset clears work', () => expect(reset({ ...initialState(), work: busy }).work).toEqual(idleWork()));
  it('a background (scoped) reload keeps the work in place', () => {
    const snap = buildSampleSnapshot('static-site', 1);
    const s: StudioState = { ...initialState(), experience: 'studio', snapshot: snap, work: busy };
    expect(beginIngestion(s, target, 1, { keepSnapshot: true }).work).toBe(busy);
  });
});

describe('openPanelById', () => {
  const closed: LayoutState = { openPanel: null, collapsed: false, width: 'wide' };
  it('opens a closed panel and keeps width', () => expect(openPanelById(closed, 'log')).toEqual({ openPanel: 'log', collapsed: false, width: 'wide' }));
  it('switches panels', () => expect(openPanelById(DEFAULT_LAYOUT, 'history').openPanel).toBe('history'));
  it('expands a collapsed panel', () => {
    const c = setCollapsed(DEFAULT_LAYOUT, true);
    expect(openPanelById(c, 'ai')).toEqual({ ...DEFAULT_LAYOUT, collapsed: false });
  });
  it('same object when already open and expanded, never toggles closed', () => {
    expect(openPanelById(DEFAULT_LAYOUT, 'ai')).toBe(DEFAULT_LAYOUT);
    expect(openPanelById(openPanelById(DEFAULT_LAYOUT, 'ai'), 'ai').openPanel).toBe('ai');
    expect(togglePanel(DEFAULT_LAYOUT, 'ai').openPanel).toBeNull();
  });
});

describe('module wiring', () => {
  it('every module imports without a cycle error', async () => {
    for (const m of ['../src/store/workSlice', '../src/store/useStudioStore', '../src/store/workActions', '../src/engine/practiceScript']) {
      await expect(import(m)).resolves.toBeDefined();
    }
  });
  it('useStudioStore imports only idleWork (and the type) from workSlice', () => {
    const src = readFileSync('src/store/useStudioStore.ts', 'utf8');
    const imports = src.match(/import[^;]*workSlice';/g) ?? [];
    expect(imports).toEqual(["import { idleWork, type WorkState } from './workSlice';"]);
    expect(src).not.toMatch(/workActions/);
  });
  it('workSlice and practiceScript do not import the studio store', () => {
    for (const f of ['src/store/workSlice.ts', 'src/engine/practiceScript.ts', 'src/engine/diffApply.ts', 'src/engine/commands.ts']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/from '\.\/useStudioStore'|from '\.\.\/store\/useStudioStore'/);
    }
  });
});
