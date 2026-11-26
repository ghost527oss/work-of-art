// @node: F5.2
// A small scanner (not a parser) for JavaScript/TypeScript, HTML, and CSS. Pure and linear-time:
// comments are masked in one pass, then short anchored patterns run on the masked text.
import { UNDERSTANDING_LIMITS as L } from '../config/understandingLimits';
import { emptyScan, type ScanResult } from './scanTypes';
import { maskPy, scanPython } from './sourceScanPy';

export const JS_EXT = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'] as const;
export const HTML_EXT = ['html', 'htm'] as const;
const MAX_RESULTS = 200;

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function languageOf(path: string): ScanResult['language'] {
  const e = extOf(path);
  if ((JS_EXT as readonly string[]).includes(e)) return 'js';
  if ((HTML_EXT as readonly string[]).includes(e)) return 'html';
  if (e === 'css') return 'css';
  if (e === 'py') return 'py';
  return 'none';
}

/** Line starts for offset-to-line lookups. */
export function lineIndex(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Blank out text but keep line breaks, so offsets and line numbers stay right. */
function blank(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

/**
 * One linear pass. Returns `masked` (comments blanked) and `skeleton` (comments and string contents
 * blanked, quote characters kept). Both have the same length as the input.
 */
export function maskJs(src: string, slashComments = true): { masked: string; skeleton: string } {
  const m: string[] = [];
  const k: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (slashComments && c === '/' && d === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      const b = blank(src.slice(i, j));
      m.push(b); k.push(b); i = j; continue;
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      const b = blank(src.slice(i, j));
      m.push(b); k.push(b); i = j; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        const e = src[j]!;
        if (e === '\\') { j += 2; continue; }
        if (e === c) break;
        if (e === '\n' && c !== '`') break;
        j++;
      }
      const closed = j < n && src[j] === c;
      const body = src.slice(i + 1, Math.min(j, n));
      m.push(c + body + (closed ? c : ''));
      k.push(c + blank(body) + (closed ? c : ''));
      i = closed ? j + 1 : Math.min(j, n);
      continue;
    }
    m.push(c); k.push(c); i++;
  }
  return { masked: m.join(''), skeleton: k.join('') };
}

function alias(spec: string): boolean {
  return spec.startsWith('@/') || spec.startsWith('~/') || spec.startsWith('#') || spec.startsWith('$lib');
}

function cut(s: string): string {
  return s.length > L.maxDetailChars ? s.slice(0, L.maxDetailChars) : s;
}

function scanJs(content: string): ScanResult {
  const out = emptyScan('js');
  const text = content.length > L.maxScanChars ? content.slice(0, L.maxScanChars) : content;
  if (text.length < content.length) out.truncated = true;
  const { masked, skeleton } = maskJs(text);
  const lineOf = lineIndex(text);
  const room = () => out.imports.length + out.calls.length + out.routes.length + out.env.length < MAX_RESULTS;
  const str = (open: number): { value: string; end: number } | null => {
    const q = skeleton[open];
    if (q !== '"' && q !== "'" && q !== '`') return null;
    const close = skeleton.indexOf(q, open + 1);
    if (close === -1) return null;
    return { value: masked.slice(open + 1, close), end: close };
  };
  const addImport = (spec0: string, offset: number) => {
    const spec = spec0.startsWith('.') || spec0.startsWith('/') ? spec0.split(/[?#]/)[0]! : spec0;
    if (alias(spec)) { out.aliasImports++; return; }
    if (room()) out.imports.push({ spec: cut(spec), line: lineOf(offset) });
  };

  // imports: import x from '..', import '..', export .. from '..', import('..'), require('..')
  const importRe = /\b(?:import|export)\b[^;'"`]{0,300}?\bfrom\s*(['"])|\bimport\s*(['"])|\bimport\s*\(\s*(['"])|\brequire\s*\(\s*(['"])/g;
  const idents = new Map<string, string>();
  for (let m = importRe.exec(skeleton); m; m = importRe.exec(skeleton)) {
    const quoteAt = m.index + m[0].length - 1;
    const s = str(quoteAt);
    if (!s) continue;
    addImport(s.value, m.index);
    // default import binding: import name from '..'
    const def = /\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*$/.exec(skeleton.slice(m.index, quoteAt).replace(/\s+/g, ' '));
    if (def) idents.set(def[1]!, s.value);
  }
  // require bindings: const x = require('..')
  const bindRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*(['"])/g;
  for (let m = bindRe.exec(skeleton); m; m = bindRe.exec(skeleton)) {
    const s = str(m.index + m[0].length - 1);
    if (s) idents.set(m[1]!, s.value);
  }
  for (const [name, spec] of idents) out.bindings.push({ name, spec, line: 0 });

  // router bindings
  const routerNames = new Set<string>(['app', 'router']);
  const routerRe = /\b([A-Za-z_$][\w$]*)\s*=\s*(?:express\s*\(\s*\)|express\.Router\s*\(|Router\s*\(|new\s+Hono\s*\(|fastify\s*\()/g;
  for (let m = routerRe.exec(skeleton); m; m = routerRe.exec(skeleton)) routerNames.add(m[1]!);

  // calls
  const methodNear = (from: number): string | undefined => {
    let win = masked.slice(from, from + 200);
    const semi = win.indexOf(';');
    if (semi !== -1) win = win.slice(0, semi);
    const mm = /\bmethod\s*:\s*['"]([A-Za-z]+)['"]/.exec(win);
    return mm ? mm[1]!.toUpperCase() : undefined;
  };
  const addCall = (open: number, offset: number, method: string | undefined) => {
    const s = str(open);
    if (!s || !room()) return;
    const external = /^https?:\/\//i.test(s.value);
    // Text after the closing quote that is not "," or ")" means the address is built at run time (for example "/a/" + id).
    const next = /^\s*(.)/.exec(skeleton.slice(s.end + 1, s.end + 40))?.[1];
    const concatenated = next !== undefined && next !== ',' && next !== ')';
    out.calls.push({ method, address: cut(s.value), line: lineOf(offset), unknown: s.value.includes('${') || concatenated, external });
  };
  /** Whether the call has a second (options) argument after the address string. */
  const hasOptions = (open: number): boolean => {
    const s = str(open);
    return !!s && /^\s*,/.test(skeleton.slice(s.end + 1, s.end + 40));
  };
  const callRe = /\b(fetch|axios|ky)(?:\.(get|post|put|patch|delete))?\s*\(\s*(['"`])/g;
  for (let m = callRe.exec(skeleton); m; m = callRe.exec(skeleton)) {
    const open = m.index + m[0].length - 1;
    // Only a one-argument call is certainly GET. With options and no literal method the method is unknown.
    const method = m[2] ? m[2].toUpperCase() : (methodNear(open) ?? (hasOptions(open) ? undefined : 'GET'));
    addCall(open, m.index, method);
  }
  const openRe = /\.open\s*\(\s*(['"])[A-Za-z]+\1\s*,\s*(['"`])/g;
  for (let m = openRe.exec(skeleton); m; m = openRe.exec(skeleton)) {
    const open = m.index + m[0].length - 1;
    const mm = /\.open\s*\(\s*['"]([A-Za-z]+)['"]/.exec(masked.slice(m.index, m.index + 40));
    addCall(open, m.index, mm ? mm[1]!.toUpperCase() : undefined);
  }

  // routes and mounts
  const routeRe = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete)\s*\(\s*(['"`])/g;
  for (let m = routeRe.exec(skeleton); m; m = routeRe.exec(skeleton)) {
    if (!routerNames.has(m[1]!)) continue;
    const s = str(m.index + m[0].length - 1);
    if (!s || !s.value.startsWith('/') || !room()) continue;
    out.routes.push({ method: m[2]!.toUpperCase(), path: cut(s.value), line: lineOf(m.index), owner: m[1]! });
  }
  const mountRe = /\b[A-Za-z_$][\w$]*\.use\s*\(\s*(['"])/g;
  for (let m = mountRe.exec(skeleton); m; m = mountRe.exec(skeleton)) {
    const s = str(m.index + m[0].length - 1);
    if (!s) continue;
    const after = /^\s*,\s*([A-Za-z_$][\w$]*)\s*\)/.exec(skeleton.slice(s.end + 1, s.end + 80));
    if (after && s.value.startsWith('/')) out.mounts.push({ prefix: cut(s.value), ident: after[1]!, line: lineOf(m.index) });
  }

  // config reads (names only)
  const envRe = /\bprocess\.env\.([A-Za-z_][\w]*)|\bimport\.meta\.env\.([A-Za-z_][\w]*)|\bprocess\.env\[\s*(['"])/g;
  for (let m = envRe.exec(skeleton); m; m = envRe.exec(skeleton)) {
    let name = m[1] ?? m[2];
    if (!name && m[3]) name = str(m.index + m[0].length - 1)?.value;
    if (name && room()) out.env.push({ name: cut(name), line: lineOf(m.index) });
  }

  // patterns
  out.patterns.dom = /\b(?:document|window)\.|\blocalStorage\b|\bsessionStorage\b/.test(skeleton);
  const handlerRe = /\bexport\s+default\s+(?:async\s+)?function\s+handler\s*\(\s*req|\bexports\.handler\s*=|\bexport\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  for (let m = handlerRe.exec(skeleton); m; m = handlerRe.exec(skeleton)) {
    out.patterns.handler = true;
    if (m[1] && !out.patterns.handlerMethods.includes(m[1])) out.patterns.handlerMethods.push(m[1]);
  }
  if (!room()) out.capped = true;
  return out;
}

function scanHtml(content: string): ScanResult {
  const out = emptyScan('html');
  const text = content.length > L.maxScanChars ? content.slice(0, L.maxScanChars) : content;
  const clean = text.replace(/<!--[\s\S]*?-->/g, blank);
  const lineOf = lineIndex(text);
  const add = (target: string, offset: number) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(target) || out.loads.length >= MAX_RESULTS) return;
    out.loads.push({ target: cut(target.split(/[?#]/)[0]!), line: lineOf(offset) });
  };
  const tagRe = /<(script|img|link)\b([^>]{0,500})>/gi;
  for (let m = tagRe.exec(clean); m; m = tagRe.exec(clean)) {
    const tag = m[1]!.toLowerCase();
    const attrs = m[2]!;
    if (tag === 'link') {
      if (!/\brel\s*=\s*["']?stylesheet/i.test(attrs)) continue;
      const h = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
      if (h) add(h[1]!, m.index);
    } else {
      const s = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
      if (s) add(s[1]!, m.index);
    }
  }
  return out;
}

function scanCss(content: string): ScanResult {
  const out = emptyScan('css');
  const text = content.length > L.maxScanChars ? content.slice(0, L.maxScanChars) : content;
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  const lineOf = lineIndex(text);
  const re = /@import\s+(?:url\(\s*)?["']?([^"')\s;]{1,250})/gi;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const t = m[1]!;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(t) || out.loads.length >= MAX_RESULTS) continue;
    out.loads.push({ target: t, line: lineOf(m.index) });
  }
  return out;
}

/** Scans one file. Never throws. Lines over 10,000 characters are replaced by blanks first. */
export function scanSource(path: string, content: string): ScanResult {
  try {
    const lang = languageOf(path);
    if (lang === 'none') return emptyScan('none');
    const safe = content.split('\n').some((l) => l.length > L.maxLineChars)
      ? content.split('\n').map((l) => (l.length > L.maxLineChars ? ' '.repeat(l.length) : l)).join('\n')
      : content;
    if (lang === 'js') return scanJs(safe);
    if (lang === 'html') return scanHtml(safe);
    if (lang === 'css') return scanCss(safe);
    return scanPython(path, safe);
  } catch {
    return emptyScan('none');
  }
}

/** Text with comments blanked (line breaks kept). Strings stay. Used by the 2D checks. Never throws. */
export function maskComments(path: string, text: string): string {
  try {
    const lang = languageOf(path);
    if (lang === 'js') return maskJs(text).masked;
    if (lang === 'html') return text.replace(/<!--[\s\S]*?-->/g, blank);
    if (lang === 'css') return text.replace(/\/\*[\s\S]*?\*\//g, blank);
    if (lang === 'py') return maskPy(text).masked;
    return text;
  } catch {
    return text;
  }
}
