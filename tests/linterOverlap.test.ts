// @node: F12.10
import { beforeEach, describe, expect, it } from 'vitest';
import { PREVIEW_LIMITS } from '../src/config/previewLimits';
import { evaluateLint } from '../src/preview/linter';
import { box, resetIds } from './helpers/lintFixtures';

beforeEach(resetIds);
const sib = (over: Parameters<typeof box>[0]) => box({ parentKey: 1, hasText: true, ...over });
const run = (ms: ReturnType<typeof box>[]) => evaluateLint(ms, 1024, () => undefined);
const overlapping = (a: Parameters<typeof box>[0] = {}, b: Parameters<typeof box>[0] = {}) => run([sib({ left: 0, top: 0, width: 100, height: 50, ...a }), sib({ left: 50, top: 10, width: 100, height: 50, ...b })]);

describe('overlap: what is reported', () => {
  it('two in-flow visible siblings that overlap clearly', () => {
    const o = overlapping();
    expect(o.results).toHaveLength(1);
    expect(o.results[0]).toMatchObject({ kind: 'overlap', id: 1, aux: [2, 50 * 40], value: 2000, confidence: 'medium' });
  });
  it('a button next to text counts as contentful', () => {
    expect(overlapping({ hasText: false, tag: 'button' }, { hasText: false, tag: 'img' }).results[0]!.confidence).toBe('medium');
  });
  it('two empty boxes are low confidence', () => {
    expect(overlapping({ hasText: false }, { hasText: false }).results[0]!.confidence).toBe('low');
  });
  it('a transform or a negative margin makes it low, and it is never high', () => {
    expect(overlapping({ hasTransform: true }).results[0]!.confidence).toBe('low');
    resetIds();
    expect(overlapping({}, { hasNegativeMargin: true }).results[0]!.confidence).toBe('low');
    resetIds();
    for (const o of [overlapping(), overlapping({ hasText: false })]) for (const r of o.results) expect(r.confidence).not.toBe('high');
  });
  it('block-like displays only: flex, grid, inline-block, list-item, table-cell are compared', () => {
    for (const display of ['flex', 'grid', 'inline-block', 'list-item', 'table-cell']) { resetIds(); expect(overlapping({ display }, { display }).results, display).toHaveLength(1); }
  });
  it('relative position still counts', () => {
    expect(overlapping({ position: 'relative' }, { position: 'relative' }).results).toHaveLength(1);
  });
});

describe('overlap: the false-alarm filter', () => {
  it('hidden elements are ignored (display none, visibility hidden, opacity 0, zero size)', () => {
    for (const hide of [{ display: 'none' }, { visibility: 'hidden' }, { opacity: 0 }, { width: 0, height: 0 }]) { resetIds(); expect(overlapping(hide).results, JSON.stringify(hide)).toEqual([]); }
  });
  it('fixed, sticky, and absolute elements are ignored, and so is anything inside them (overlay)', () => {
    for (const position of ['fixed', 'sticky', 'absolute']) { resetIds(); expect(overlapping({ position }).results, position).toEqual([]); }
    resetIds();
    expect(overlapping({ overlay: true }).results).toEqual([]);
  });
  it('a parent and its child are never compared (different parent keys), and boxes of different parents are not siblings', () => {
    expect(run([box({ parentKey: 1, left: 0, top: 0, width: 200, height: 200 }), box({ parentKey: 2, left: 10, top: 10, width: 50, height: 50 })]).results).toEqual([]);
  });
  it('inline boxes are ignored', () => {
    expect(overlapping({ display: 'inline' }, { display: 'inline' }).results).toEqual([]);
  });
  it('a tiny or small-share overlap is ignored', () => {
    expect(run([sib({ left: 0, top: 0, width: 100, height: 100 }), sib({ left: 96, top: 96, width: 100, height: 100 })]).results).toEqual([]); // 16 px2 touches: share 0.16%
    resetIds();
    expect(run([sib({ left: 0, top: 0, width: 100, height: 100 }), sib({ left: 99, top: 0, width: 100, height: 100 })]).results).toEqual([]); // 100 px2 of 10000: 1%
    resetIds();
    expect(run([sib({ left: 0, top: 0, width: 100, height: 100 }), sib({ left: 85, top: 0, width: 100, height: 100 })]).results).toHaveLength(1); // 15%
    resetIds();
    expect(run([sib({ left: 0, top: 0, width: 100, height: 50 }), sib({ left: 100, top: 0, width: 100, height: 50 })]).results).toEqual([]); // edges touch
  });
  it('a small box fully inside a big sibling still counts (the share is of the smaller box)', () => {
    expect(run([sib({ left: 0, top: 0, width: 300, height: 300 }), sib({ left: 10, top: 10, width: 20, height: 20 })]).results).toHaveLength(1);
  });
});

describe('overlap: limits', () => {
  it('a parent with more than 60 children is not compared, and the result says so', () => {
    const ms = Array.from({ length: 61 }, () => sib({ left: 0, top: 0, width: 100, height: 100 }));
    const o = run(ms);
    expect(o.results).toEqual([]);
    expect(o.partial).toEqual(['Overlap check: 1 group of more than 60 neighbours was not compared.']);
  });
  it('exactly 60 children are compared', () => {
    const ms = Array.from({ length: 60 }, () => sib({ left: 0, top: 0, width: 100, height: 100 }));
    expect(run(ms).results.length).toBeGreaterThan(0);
  });
  it('stops at 20,000 pairs and says so', () => {
    const ms: ReturnType<typeof box>[] = [];
    for (let g = 0; g < 14; g++) for (let i = 0; i < 60; i++) ms.push(box({ parentKey: g, left: i * 1000, top: 0, width: 10, height: 10 }));
    const o = run(ms);
    expect(o.partial.join(' ')).toContain('20,000 pairs');
    expect(PREVIEW_LIMITS.maxPairs).toBe(20000);
  });
});
