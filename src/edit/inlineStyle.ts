// @node: F8.1
// Reads, merges, and writes a style attribute. Refuses ("too complex") anything it cannot rewrite safely.
import { PROP_ORDER, type StyleDeclaration } from './styleModel';

export function parseInlineStyle(text: string): StyleDeclaration[] | null {
  if (/url\(|\{\{/i.test(text)) return null;
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of text) {
    if (quote) { if (ch === quote) quote = null; else if (ch === ';' || ch === ':') return null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth < 0) return null; }
    if (ch === ';' && depth === 0) { parts.push(cur); cur = ''; continue; }
    if (ch === ';' && depth > 0) return null;
    cur += ch;
  }
  if (quote || depth !== 0) return null;
  parts.push(cur);
  const out: StyleDeclaration[] = [];
  for (const p of parts) {
    if (p.trim() === '') continue;
    const i = p.indexOf(':');
    if (i === -1) return null;
    const prop = p.slice(0, i).trim().toLowerCase();
    const value = p.slice(i + 1).trim();
    if (prop === '' || /[^a-z0-9-]/.test(prop)) return null;
    out.push({ prop, value });
  }
  return out;
}

/** Keeps the existing order, replaces in place, appends new properties in the fixed order. */
export function mergeStyle(existing: readonly StyleDeclaration[], changes: readonly StyleDeclaration[]): StyleDeclaration[] {
  const out = existing.map((d) => ({ ...d }));
  const extra: StyleDeclaration[] = [];
  for (const c of changes) {
    const i = out.findIndex((d) => d.prop === c.prop);
    if (i !== -1) out[i] = { ...c };
    else if (!extra.some((d) => d.prop === c.prop)) extra.push({ ...c });
    else extra[extra.findIndex((d) => d.prop === c.prop)] = { ...c };
  }
  extra.sort((a, b) => PROP_ORDER.indexOf(a.prop) - PROP_ORDER.indexOf(b.prop));
  return [...out, ...extra];
}

export function serializeStyle(list: readonly StyleDeclaration[]): string {
  return list.map((d) => `${d.prop}: ${d.value}`).join('; ');
}
