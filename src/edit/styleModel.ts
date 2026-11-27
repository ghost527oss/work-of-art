// @node: F8.1
// What the pad can write, as data, with validators and builders. Every output is built from validated parts and
// fixed words, so it can never contain a quote, semicolon, brace, angle bracket, backslash, url(, or expression(.
export interface StyleDeclaration { prop: string; value: string }

export type FieldResult = { ok: true; decl: StyleDeclaration } | { ok: false; error: string };

const COLOR = /^#[0-9a-fA-F]{6}$/;

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

function rangeError(min: number, max: number): string {
  return `Use a number from ${min} to ${max}.`;
}

function px(prop: string, v: unknown, min: number, max: number): FieldResult {
  const n = num(v);
  if (n === null || n < min || n > max) return { ok: false, error: rangeError(min, max) };
  return { ok: true, decl: { prop, value: `${n}px` } };
}

export function color(prop: string, v: unknown): FieldResult {
  if (typeof v !== 'string' || !COLOR.test(v)) return { ok: false, error: 'Use a colour like #1a2b3c.' };
  return { ok: true, decl: { prop, value: v.toLowerCase() } };
}

export function size(prop: 'width' | 'height', value: unknown, unit: unknown): FieldResult {
  if (value === 'auto' || unit === 'auto') return { ok: true, decl: { prop, value: 'auto' } };
  if (unit === '%') {
    const n = num(value);
    if (n === null || n < 0 || n > 100) return { ok: false, error: rangeError(0, 100) };
    return { ok: true, decl: { prop, value: `${n}%` } };
  }
  if (unit !== 'px') return { ok: false, error: 'Choose px, % or auto.' };
  return px(prop, value, 0, 5000);
}

export function radius(value: unknown, unit: unknown): FieldResult {
  if (unit === '%') {
    const n = num(value);
    if (n === null || n < 0 || n > 50) return { ok: false, error: rangeError(0, 50) };
    return { ok: true, decl: { prop: 'border-radius', value: `${n}%` } };
  }
  return px('border-radius', value, 0, 500);
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

export function padding(side: Side, v: unknown): FieldResult { return px(`padding-${side}`, v, 0, 500); }
export function margin(side: Side, v: unknown): FieldResult { return px(`margin-${side}`, v, -500, 500); }
export function borderWidth(v: unknown): FieldResult { return px('border-width', v, 0, 50); }
export function fontSize(v: unknown): FieldResult { return px('font-size', v, 6, 200); }

const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'] as const;
export function borderStyle(v: unknown): FieldResult {
  return typeof v === 'string' && (BORDER_STYLES as readonly string[]).includes(v) ? { ok: true, decl: { prop: 'border-style', value: v } } : { ok: false, error: 'Choose none, solid, dashed, or dotted.' };
}

export const SHADOWS = { none: null, small: '0 1px 3px', medium: '0 4px 8px', large: '0 10px 24px' } as const;
export type ShadowPreset = keyof typeof SHADOWS;
export function shadow(preset: unknown, c: unknown): FieldResult {
  if (typeof preset !== 'string' || !Object.prototype.hasOwnProperty.call(SHADOWS, preset)) return { ok: false, error: 'Choose None, Small, Medium, or Large.' };
  const p = SHADOWS[preset as ShadowPreset];
  if (p === null) return { ok: true, decl: { prop: 'box-shadow', value: 'none' } };
  const col = color('box-shadow', c);
  if (!col.ok) return col;
  return { ok: true, decl: { prop: 'box-shadow', value: `${p} ${col.decl.value}` } };
}

export function background(v: unknown): FieldResult {
  if (v === 'transparent') return { ok: true, decl: { prop: 'background-color', value: 'transparent' } };
  return color('background-color', v);
}

export function gradient(a: unknown, b: unknown, angle: unknown): FieldResult {
  if (a === null && b === null) return { ok: true, decl: { prop: 'background-image', value: 'none' } };
  const ca = color('x', a);
  const cb = color('x', b);
  const n = num(angle);
  if (!ca.ok) return ca;
  if (!cb.ok) return cb;
  if (n === null || n < 0 || n > 360) return { ok: false, error: rangeError(0, 360) };
  return { ok: true, decl: { prop: 'background-image', value: `linear-gradient(${n}deg, ${ca.decl.value}, ${cb.decl.value})` } };
}

/** Suggestion-only values (Try a fix). */
export const SUGGESTION_DECLS = {
  'text-wider': { prop: 'overflow-wrap', value: 'anywhere' },
  'text-cut-bottom': { prop: 'height', value: 'auto' },
  'page-wider': { prop: 'max-width', value: '100%' },
} as const;

/** The fixed order new properties are appended in. */
export const PROP_ORDER: readonly string[] = [
  'width', 'height', 'max-width', 'min-width', 'min-height', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'border-width', 'border-style', 'border-color', 'box-shadow',
  'font-size', 'color', 'background-color', 'background-image', 'overflow-wrap', 'display',
];

/** True when a declaration is something this model can produce. A last guard before writing anything. */
export function isSafeDeclaration(d: StyleDeclaration): boolean {
  // 3B-1 (recipes): `display` is allowed with one value only.
  if (d.prop === 'display') return d.value === 'inline-block';
  return PROP_ORDER.includes(d.prop) && /^[#a-z0-9 .,%()-]+$/i.test(d.value) && !/url\(|expression\(/i.test(d.value) && d.value.length <= 120;
}
