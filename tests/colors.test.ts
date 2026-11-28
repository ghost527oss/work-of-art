// @node: F12.10
import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, isLargeText, parseCssColor, relativeLuminance, stepToward, toHex } from '../src/preview/colors';

describe('computed colour text', () => {
  it('parses rgb, rgba, and the space-separated form', () => {
    expect(parseCssColor('rgb(10, 20, 30)')).toEqual({ rgb: [10, 20, 30], alpha: 1 });
    expect(parseCssColor('rgba(10, 20, 30, 0.5)')).toEqual({ rgb: [10, 20, 30], alpha: 0.5 });
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toEqual({ rgb: [0, 0, 0], alpha: 0 });
    expect(parseCssColor('rgb(10 20 30 / 50%)')).toEqual({ rgb: [10, 20, 30], alpha: 0.5 });
    expect(parseCssColor(' RGB(300, 20, 30) ')!.rgb[0]).toBe(255);
  });
  it('anything else is unparsed, never guessed', () => {
    for (const s of ['color(srgb 1 0 0)', 'oklch(0.5 0.1 20)', '#fff', 'red', 'hsl(0, 0%, 0%)', 'rgb(a, b, c)', '', 'rgb(1,2)', 'rgba(1, 2, 3, x)']) expect(parseCssColor(s), s).toBeNull();
  });
});

describe('contrast', () => {
  it('matches the published values', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 1); // #777 on white is just under 4.5
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeGreaterThanOrEqual(4.5); // #767676 passes
    expect(contrastRatio([0, 0, 255], [255, 255, 255])).toBeCloseTo(8.59, 1);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
  });
  it('is symmetric', () => {
    expect(contrastRatio([10, 200, 30], [250, 250, 20])).toBeCloseTo(contrastRatio([250, 250, 20], [10, 200, 30]), 10);
  });
  it('large text is 24 px, or 18.66 px and bold', () => {
    expect(isLargeText(24, false)).toBe(true);
    expect(isLargeText(23.9, false)).toBe(false);
    expect(isLargeText(18.66, true)).toBe(true);
    expect(isLargeText(18.6, true)).toBe(false);
    expect(isLargeText(18.66, false)).toBe(false);
  });
  it('a see-through colour is mixed over the background', () => {
    expect(blend({ rgb: [0, 0, 0], alpha: 0.5 }, [255, 255, 255])).toEqual([128, 128, 128]);
    expect(blend({ rgb: [10, 20, 30], alpha: 1 }, [200, 200, 200])).toEqual([10, 20, 30]);
    expect(blend({ rgb: [10, 20, 30], alpha: 0 }, [200, 200, 200])).toEqual([200, 200, 200]);
  });
});

describe('stepToward (the contrast recipe)', () => {
  it('darkens light grey on white to the first colour that reaches 4.5', () => {
    const r = stepToward([170, 170, 170], [255, 255, 255], 4.5)!;
    expect(contrastRatio(r, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(r[0]).toBeLessThan(170);
    const one = [r[0] + 6, r[1] + 6, r[2] + 6] as const; // 5% of the way back is below the minimum
    expect(contrastRatio(one, [255, 255, 255])).toBeLessThan(4.5 + 0.6);
  });
  it('lightens dark grey on black, and picks white or black by what works better on a mid background', () => {
    const r = stepToward([60, 60, 60], [0, 0, 0], 4.5)!;
    expect(r[0]).toBeGreaterThan(60);
    expect(contrastRatio(r, [0, 0, 0])).toBeGreaterThanOrEqual(4.5);
    const mid = stepToward([120, 120, 120], [128, 128, 128], 4.5)!;
    expect(contrastRatio(mid, [128, 128, 128])).toBeGreaterThanOrEqual(4.5);
  });
  it('returns the same colour when it already passes at the first step, and null when nothing can reach the threshold', () => {
    expect(stepToward([0, 0, 0], [255, 255, 255], 4.5)).toEqual([0, 0, 0]);
    expect(stepToward([120, 120, 120], [128, 128, 128], 22)).toBeNull();
  });
  it('toHex writes six lowercase digits', () => {
    expect(toHex([0, 15, 255])).toBe('#000fff');
    expect(toHex([300, -5, 16.4])).toBe('#ff0010');
  });
});
