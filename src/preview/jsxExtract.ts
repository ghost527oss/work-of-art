// @node: F7.5
// JSX/TSX component discovery and a static JSX-to-HTML conversion. Nothing is evaluated: expressions become
// visible placeholders. Bounded and failure-isolated. Pure.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { maskJs } from '../engine/sourceScan';
import { escapeAttr, escapeText } from './htmlTokens';

export interface JsxNode {
  tag: string; // '' for a fragment
  attrs: Array<{ name: string; value?: string; expr?: string; spread?: boolean }>;
  children: Array<JsxNode | { text: string } | { expr: true }>;
  selfClosing: boolean;
}

export interface FoundComponent { name: string; path: string; exported: boolean; markup?: string; error?: string }

const MAX_NODES = 2000;

/** Parses one JSX element from `src` (strings kept, comments blanked) starting at the '<'. */
export function parseJsx(src: string, start: number): { node: JsxNode; end: number } | null {
  let count = 0;
  const skipBraces = (i: number): number => {
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        i++;
        while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
      } else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    }
    return -1;
  };
  const parseEl = (i: number, level: number): { node: JsxNode; end: number } | null => {
    if (++count > MAX_NODES || level > 60 || src[i] !== '<') return null;
    i++;
    const nameM = /^[A-Za-z_$][\w.$:-]*/.exec(src.slice(i, i + 120));
    const tag = nameM ? nameM[0] : '';
    i += tag.length;
    const attrs: JsxNode['attrs'] = [];
    for (;;) {
      while (/\s/.test(src[i] ?? '')) i++;
      if (i >= src.length) return null;
      if (src.startsWith('/>', i)) return { node: { tag, attrs, children: [], selfClosing: true }, end: i + 2 };
      if (src[i] === '>') { i++; break; }
      if (src[i] === '{') { const e = skipBraces(i); if (e < 0) return null; attrs.push({ name: '', spread: true }); i = e; continue; }
      const an = /^[A-Za-z_$][\w:$-]*/.exec(src.slice(i, i + 120));
      if (!an) return null;
      i += an[0].length;
      while (/\s/.test(src[i] ?? '')) i++;
      if (src[i] === '=') {
        i++;
        while (/\s/.test(src[i] ?? '')) i++;
        if (src[i] === '"' || src[i] === "'") { const q = src[i]!; const e = src.indexOf(q, i + 1); if (e < 0) return null; attrs.push({ name: an[0], value: src.slice(i + 1, e) }); i = e + 1; }
        else if (src[i] === '{') { const e = skipBraces(i); if (e < 0) return null; attrs.push({ name: an[0], expr: src.slice(i + 1, e - 1) }); i = e; }
        else return null;
      } else attrs.push({ name: an[0], value: '' });
    }
    const children: JsxNode['children'] = [];
    for (;;) {
      if (i >= src.length) return null;
      if (src.startsWith('</', i)) {
        const e = src.indexOf('>', i);
        if (e < 0) return null;
        return { node: { tag, attrs, children, selfClosing: false }, end: e + 1 };
      }
      if (src[i] === '<') { const r = parseEl(i, level + 1); if (!r) return null; children.push(r.node); i = r.end; continue; }
      if (src[i] === '{') { const e = skipBraces(i); if (e < 0) return null; children.push({ expr: true }); i = e; continue; }
      let j = i;
      while (j < src.length && src[j] !== '<' && src[j] !== '{') j++;
      children.push({ text: src.slice(i, j) });
      i = j;
    }
  };
  const first = parseEl(start, 0);
  return first;
}

/** Finds components that return JSX. Never throws; a component that cannot be read carries `error`. */
export function findComponents(path: string, content: string): Array<FoundComponent & { jsx?: JsxNode }> {
  const out: Array<FoundComponent & { jsx?: JsxNode }> = [];
  try {
    const { masked, skeleton } = maskJs(content);
    const seen = new Set<string>();
    const add = (name: string, exported: boolean, from: number) => {
      if (seen.has(name) || out.length >= L.maxComponents) return;
      seen.add(name);
      const rest = skeleton.slice(from, from + L.componentBytes);
      const ret = /\breturn\s*\(?\s*</.exec(rest) ?? /=>\s*\(?\s*</.exec(rest);
      if (!ret) { out.push({ name, path, exported, error: 'could not be read' }); return; }
      const lt = from + ret.index + ret[0].lastIndexOf('<');
      const parsed = parseJsx(masked, lt);
      if (!parsed) out.push({ name, path, exported, error: 'could not be read' });
      else out.push({ name, path, exported, jsx: parsed.node });
    };
    const fn = /(export\s+default\s+|export\s+)?(?:async\s+)?function\s+([A-Z]\w*)\s*\(/g;
    for (let m = fn.exec(skeleton); m; m = fn.exec(skeleton)) add(m[2]!, !!m[1], m.index + m[0].length);
    const arrow = /(export\s+)?const\s+([A-Z]\w*)\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:function\b[^{]*|\([^)]*\)\s*(?::[^=>\n]+)?\s*=>|[A-Za-z_]\w*\s*=>)/g;
    for (let m = arrow.exec(skeleton); m; m = arrow.exec(skeleton)) add(m[2]!, !!m[1], m.index + m[0].length - 1);
  } catch {
    /* an unreadable file yields no components */
  }
  return out;
}

const VOID = new Set('area br col hr img input source track wbr'.split(' '));
const RENAME: Record<string, string> = { classname: 'class', htmlfor: 'for' };
const TEXT_ATTRS = new Set(['alt', 'title', 'placeholder', 'value']);

function styleLiteral(expr: string): string | null {
  const m = /^\s*\{([\s\S]*)\}\s*$/.exec(expr);
  if (!m) return null;
  const parts = m[1]!.split(',').map((s) => s.trim()).filter(Boolean);
  const css: string[] = [];
  for (const p of parts) {
    const kv = /^([A-Za-z_$][\w$]*)\s*:\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))$/.exec(p);
    if (!kv) return null;
    const key = kv[1]!.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const val = kv[2] ?? kv[3] ?? `${kv[4]}${/^(?:opacity|z-index|flex|font-weight|line-height)$/.test(key) ? '' : 'px'}`;
    css.push(`${key}:${val}`);
  }
  return css.join(';');
}

export interface ConvertCtx {
  /** Looks up a component by name (same file or an imported file). */
  lookup(name: string): (FoundComponent & { jsx?: JsxNode }) | undefined;
}

/** JSX to HTML text. Expressions become dashed placeholders; unknown components become labelled boxes. */
export function jsxToHtml(node: JsxNode, ctx: ConvertCtx, depth = 0, visited: ReadonlySet<string> = new Set()): string {
  const kids = (n: JsxNode) => n.children.map((c) => {
    if ('expr' in c) return '<span class="pb-expr">{...}</span>';
    if ('text' in c) { const t = c.text.replace(/\s+/g, ' '); return t.trim() === '' ? (t.includes(' ') ? ' ' : '') : escapeText(t); }
    return jsxToHtml(c, ctx, depth, visited);
  }).join('');
  if (node.tag === '') return kids(node);
  if (/^[A-Z]/.test(node.tag)) {
    const comp = ctx.lookup(node.tag);
    if (comp?.jsx && depth < L.inlineLevels && !visited.has(comp.name)) return jsxToHtml(comp.jsx, ctx, depth + 1, new Set([...visited, comp.name]));
    return `<div class="pb-box">${escapeText(`<${node.tag} />`)}</div>`;
  }
  let attrs = '';
  for (const a of node.attrs) {
    if (a.spread) continue;
    const lname = a.name.toLowerCase();
    if (/^on[a-z]/.test(lname) || lname === 'ref' || lname === 'key') continue;
    const name = RENAME[lname] ?? lname;
    if (name === 'style') {
      const css = a.expr !== undefined ? styleLiteral(a.expr) : a.value;
      if (css) attrs += ` style="${escapeAttr(css)}"`;
      continue;
    }
    if (a.expr !== undefined) { if (TEXT_ATTRS.has(name)) attrs += ` ${name}="{...}"`; continue; }
    attrs += a.value === '' && !/=/.test(name) ? ` ${name}` : ` ${name}="${escapeAttr(a.value ?? '')}"`;
  }
  const tag = node.tag.toLowerCase();
  if (node.selfClosing || VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${kids(node)}</${tag}>`;
}
