// @node: F12.10
// Colours for the Visual Linter: parse the browser's computed colour text, WCAG contrast, and a small step toward black
// or white for the contrast recipe. Pure. Anything the reader can't parse is "unparsed", never guessed.
export type Rgb = readonly [number, number, number];
export interface RgbaColor { rgb: Rgb; alpha: number }

const clamp255 = (n: number): number => Math.max(0, Math.min(255, n));

/** Parses `rgb(r, g, b)`, `rgba(r, g, b, a)`, and `rgb(r g b / a)` (the forms browsers write for computed colours). */
export function parseCssColor(text: string): RgbaColor | null {
  const m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(text.trim());
  if (!m) return null;
  const nums = [m[1], m[2], m[3]].map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  let alpha = 1;
  if (m[4] !== undefined) {
    alpha = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (!Number.isFinite(alpha)) return null;
  }
  return { rgb: [clamp255(nums[0]!), clamp255(nums[1]!), clamp255(nums[2]!)], alpha: Math.max(0, Math.min(1, alpha)) };
}

const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A see-through colour mixed over a solid one. */
export function blend(fg: RgbaColor, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => Math.round(fg.rgb[i]! * fg.alpha + bg[i]! * (1 - fg.alpha))) as unknown as Rgb;
}

/** WCAG "large text": 24 px, or 18.66 px and bold. */
export function isLargeText(fontSizePx: number, bold: boolean): boolean {
  return fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(clamp255(c)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Moves the text colour toward black or white (whichever gives the higher contrast on that background) in 5% steps and
 * returns the first colour that reaches `threshold`, or null when none does.
 */
export function stepToward(fg: Rgb, bg: Rgb, threshold: number): Rgb | null {
  const black: Rgb = [0, 0, 0];
  const white: Rgb = [255, 255, 255];
  const target = contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const next = [0, 1, 2].map((i) => Math.round(fg[i]! + (target[i]! - fg[i]!) * Math.min(1, t))) as unknown as Rgb;
    if (contrastRatio(next, bg) >= threshold) return next;
  }
  return contrastRatio(target, bg) >= threshold ? target : null;
}
