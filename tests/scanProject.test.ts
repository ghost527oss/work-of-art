// @node: F6.5
import { describe, expect, it } from 'vitest';
import { SCAN_LIMITS } from '../src/config/scanLimits';
import { ScanAbortError, rescanPaths, labelsKeyOf } from '../src/engine/scanProject';
import { scanFiles } from './helpers/scanFixture';

const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${String(i).padStart(4, '0')}.html`, '<img src="a">\n']));

describe('scan run', () => {
  it('reports progress per batch and yields between batches', async () => {
    const seen: number[] = [];
    let yields = 0;
    await scanFiles(many(100), {}, { onProgress: (p) => seen.push(p.done), yieldToMain: async () => { yields++; } });
    expect(seen.slice(0, 3)).toEqual([40, 80, 100]);
    expect(yields).toBe(3);
  });
  it('is stopped by an abort', async () => {
    const ac = new AbortController();
    await expect(scanFiles(many(100), {}, { signal: ac.signal, yieldToMain: async () => { ac.abort(); } })).rejects.toBeInstanceOf(ScanAbortError);
  });
  it('the time limit gives a Partial result with the reason', async () => {
    let t = 0;
    const { result } = await scanFiles(many(100), {}, { now: () => (t += 4000), yieldToMain: async () => undefined });
    expect(result.partial).toBe(true);
    expect(result.partialReasons[0]).toMatch(/^Time limit \(8 seconds\) reached: \d+ files were not checked\.$/);
  });
  it('the per-check cap and the total cap name the limit and the amount', async () => {
    const { result } = await scanFiles(many(60));
    expect(result.findings).toHaveLength(SCAN_LIMITS.maxPerCheck);
    expect(result.partialReasons).toContain('Limit of 50 findings for Image without a text description reached: 10 more were not listed.');
    expect(result.ruleCounts['scan.frontend.img-alt']).toBe(50);
  });
  it('sorts by severity, then path, then line', async () => {
    const { result } = await scanFiles({ 'b.html': '<img src="1">\n', 'a.html': '<img src="1">\n<a href="x" target="_blank">x</a>\n', 'k.js': 'eval("1");\n' });
    expect(result.findings.map((f) => `${f.severity}:${f.path}:${f.firstLine}`)).toEqual(['high:k.js:1', 'medium:a.html:1', 'medium:b.html:1', 'low:a.html:2']);
  });
  it('counts file types with no checks and files not read', async () => {
    const { result } = await scanFiles({ 'a.md': '# x', 'b.png': { size: 5 }, 'c.go': 'package main\n', 'd.html': '<p>x</p>' });
    expect(result.coverage.notChecked).toEqual({ md: 1, go: 1 });
    expect(result.coverage.filesNotRead).toBe(1);
    expect(result.coverage.filesScanned).toBe(1);
  });
  it('rescanPaths replaces only those paths, in sync, keeping partial and labelsKey', async () => {
    const files = { 'a.html': '<a href="x" target="_blank">x</a>\n', 'b.html': '<img src="1">\n' };
    const { result, inputs } = await scanFiles(files);
    expect(result.findings).toHaveLength(2);
    const fixed = rescanPaths(result, ['a.html'], { ...inputs, effective: (p) => (p === 'a.html' ? '<a href="x" target="_blank" rel="noopener noreferrer">x</a>\n' : inputs.effective(p)) });
    expect(fixed.findings.map((f) => f.skillId)).toEqual(['scan.frontend.img-alt']);
    expect(fixed.labelsKey).toBe(result.labelsKey);
    expect(fixed.ruleCounts).toEqual({ 'scan.frontend.img-alt': 1 });
    expect(result.findings).toHaveLength(2);
  });
  it('labelsKey changes with corrections', () => {
    expect(labelsKeyOf({})).not.toBe(labelsKeyOf({ a: ['backend'] }));
    expect(labelsKeyOf({ a: ['backend'], b: ['tests'] })).toBe(labelsKeyOf({ b: ['tests'], a: ['backend'] }));
  });
  it('an auto finding whose fix cannot be built is shown as Guided with the note', async () => {
    const { result } = await scanFiles({ 'a.jsx': '<a target="_blank" rel={r} href="x">x</a>\n', 'b.html': '<a href="x" target="_blank">x</a>\n' });
    expect(result.findings.find((f) => f.path === 'b.html')!.fix).toBe('auto');
  });
});
