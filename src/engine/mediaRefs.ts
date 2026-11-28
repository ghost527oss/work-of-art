// @node: F12.8
// Finds the local picture files that loaded pages and stylesheets actually use, in order of first use.
// Pure: reads text only. Hostile text (huge lines, thousands of url( calls) stays within fixed caps.
import { tokenizeHtml } from '../preview/htmlTokens';
import { findEntryPage } from '../preview/previewMode';
import { isImagePath } from './imageSniff';

const MAX_READ_CHARS = 200 * 1024;
const MAX_PATHS = 200;
const MAX_URLS_PER_TEXT = 2000;

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/** Resolves a reference against the file that holds it. Returns a repository path, or undefined when it is not a local path. */
export function resolveLocalRef(fromPath: string, ref: string): string | undefined {
  const raw = ref.trim();
  if (raw === '' || raw.length > 500 || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw) || /[\u0000-\u001f\\]/.test(raw)) return undefined;
  let clean = raw.split(/[?#]/)[0]!;
  try { clean = decodeURIComponent(clean); } catch { return undefined; }
  const joined = clean.startsWith('/') ? clean.slice(1) : dirOf(fromPath) ? `${dirOf(fromPath)}/${clean}` : clean;
  const out: string[] = [];
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (!out.length) return undefined; out.pop(); } else out.push(part);
  }
  return out.length ? out.join('/') : undefined;
}

function cssUrls(css: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(['"]?)([^'")\s][^'")]*?)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null && out.length < MAX_URLS_PER_TEXT) out.push(m[2]!);
  return out;
}

interface Source { path: string; content?: string }

/** Picture paths referenced by the loaded `.html`, `.htm`, and `.css` files, entry page first, no duplicates, at most 200. */
export function referencedImages(files: readonly Source[]): string[] {
  const text = new Map<string, string>();
  for (const f of files) if (typeof f.content === 'string') text.set(f.path, f.content.length > MAX_READ_CHARS ? f.content.slice(0, MAX_READ_CHARS) : f.content);
  const htmlPaths = [...text.keys()].filter((p) => /\.html?$/i.test(p)).sort();
  const entry = findEntryPage(htmlPaths);
  const orderedHtml = entry ? [entry, ...htmlPaths.filter((p) => p !== entry)] : htmlPaths;
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (from: string, ref: string): void => {
    if (out.length >= MAX_PATHS) return;
    const p = resolveLocalRef(from, ref);
    if (p && isImagePath(p) && !seen.has(p)) { seen.add(p); out.push(p); }
  };
  const cssDone = new Set<string>();
  const doCss = (path: string): void => {
    if (cssDone.has(path) || !text.has(path)) return;
    cssDone.add(path);
    for (const u of cssUrls(text.get(path)!)) add(path, u);
  };
  for (const page of orderedHtml) {
    const html = text.get(page)!;
    const tokens = tokenizeHtml(html);
    const linked: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.type !== 'start') continue;
      const attrs = t.attrs ?? [];
      if (t.name === 'img') { const s = attrs.find((a) => a.name === 'src')?.value; if (s) add(page, s); }
      else if (t.name === 'style') { const n = tokens[i + 1]; if (n && n.type === 'text' && n.start === t.end) for (const u of cssUrls(n.text ?? '')) add(page, u); }
      else if (t.name === 'link' && (attrs.find((a) => a.name === 'rel')?.value ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) {
        const p = resolveLocalRef(page, attrs.find((a) => a.name === 'href')?.value ?? '');
        if (p) linked.push(p);
      }
      const st = attrs.find((a) => a.name === 'style')?.value;
      if (st) for (const u of cssUrls(st)) add(page, u);
    }
    for (const p of linked) doCss(p);
  }
  for (const p of [...text.keys()].filter((x) => /\.css$/i.test(x)).sort()) doCss(p);
  return out;
}
