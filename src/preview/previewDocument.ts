// @node: F7.3
// The allowlist re-serializer: reads the page into tokens and writes a NEW document containing only allowed
// tags and attributes, with every value escaped. Pure: no DOM, no network, no clock.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { ALLOWED_TAGS, MEDIA_TAGS, SVG_CASE, SVG_TAGS, attrAllowed } from './htmlAllow';
import { escapeAttr, escapeText, tokenizeHtml, VOID, type HtmlAttr } from './htmlTokens';
import { sanitizeCss, styleBody } from './cssSanitize';
import { cspFor } from './previewFlags';
import { INSPECTOR_SOURCE } from './previewBridge';

export interface ElementEntry { id: number; path: string; tag: string; line: number; col: number; startOffset: number; endOffset: number; endLine: number }
export interface PreviewReport { removed: Record<string, number>; blockedExternal: string[]; placeholders: string[]; inlinedFiles: number; unknownTags: number; truncated: boolean }
export type PreviewBuild = { ok: true; html: string; elements: ElementEntry[]; report: PreviewReport; notes: string[] } | { ok: false; reason: string };

export interface StaticInput {
  entryPath: string;
  effective: (path: string) => string | undefined;
  loaded: ReadonlySet<string>;
  scripts: boolean;
  nonce: string;
  origin: string;
  /** When false (the workbench), elements are not annotated. */
  annotate?: boolean;
  idStart?: number;
  /** Entry content override (the workbench passes generated markup). */
  entrySource?: string;
}

const BASE_STYLE = '.pb-img{display:inline-block;border:1px dashed #000;font:12px monospace;box-sizing:border-box;overflow:hidden;padding:2px}.pb-expr{border:1px dashed #000;font:12px monospace}.pb-box{display:block;border:1px dashed #000;font:12px monospace;padding:4px}';
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function resolve(entry: string, ref: string, loaded: ReadonlySet<string>): string | undefined {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return undefined;
  const clean = ref.split(/[?#]/)[0]!;
  const parts = (clean.startsWith('/') ? clean.slice(1) : dirOf(entry) ? `${dirOf(entry)}/${clean}` : clean).split('/');
  const out: string[] = [];
  for (const p of parts) { if (p === '' || p === '.') continue; if (p === '..') { if (!out.length) return undefined; out.pop(); } else out.push(p); }
  const path = out.join('/');
  return loaded.has(path) ? path : undefined;
}

const count = (r: PreviewReport, k: string) => { r.removed[k] = (r.removed[k] ?? 0) + 1; };

export function buildStaticPreview(input: StaticInput): PreviewBuild {
  try {
    const source = input.entrySource ?? input.effective(input.entryPath);
    if (source === undefined) return { ok: false, reason: 'The page could not be read.' };
    const annotate = input.annotate !== false && !input.scripts;
    const report: PreviewReport = { removed: {}, blockedExternal: [], placeholders: [], inlinedFiles: 0, unknownTags: 0, truncated: false };
    const elements: ElementEntry[] = [];
    const styles: string[] = [];
    const body: string[] = [];
    const tokens = tokenizeHtml(source);
    let title = '';
    let id = input.idStart ?? 0;
    const open: Array<{ tag: string }> = [];
    let skipDepth: string | null = null;
    let inSvg = 0;
    let bodyAttrs = '';
    let scriptBodies: string[] = [];
    const inline = (path: string) => { report.inlinedFiles++; return input.effective(path) ?? ''; };

    const writeAttrs = (attrs: HtmlAttr[], tag: string): string => {
      let s = '';
      for (const a of attrs) {
        const n = a.name;
        if (/^on[a-z]+$/.test(n)) { if (input.scripts) s += ` ${n}="${escapeAttr(a.value)}"`; else count(report, 'event handler'); continue; }
        if (n === 'style') { s += ` style="${escapeAttr(sanitizeCss(a.value))}"`; continue; }
        if (n === 'href' && tag === 'a') { s += ' href="#"'; if (a.value && !a.value.startsWith('#')) report.blockedExternal.push(a.value.slice(0, 80)); continue; }
        if (n.startsWith('data-')) { s += ` data-x-${escapeAttr(n.slice(5))}="${escapeAttr(a.value)}"`; continue; }
        if (!attrAllowed(n, inSvg > 0)) { count(report, n); continue; }
        s += a.hasValue ? ` ${SVG_CASE[n] ?? n}="${escapeAttr(a.value)}"` : ` ${n}`;
      }
      return s;
    };

    let skipText: number | undefined;
    for (let ti = 0; ti < tokens.length; ti++) {
      const tok = tokens[ti]!;
      const nextTok = tokens[ti + 1];
      const rawNext = nextTok && nextTok.type === 'text' && nextTok.start === tok.end ? nextTok : undefined;
      if (tok.type === 'comment' || tok.type === 'doctype') continue;
      if (skipDepth) {
        if (tok.type === 'end' && tok.name === skipDepth) skipDepth = null;
        continue;
      }
      if (tok.type === 'text') {
        if (skipText === tok.start) continue;
        const parent = open[open.length - 1]?.tag;
        if (parent === 'script') continue;
        body.push(escapeText(tok.text ?? ''));
        continue;
      }
      const name = tok.name!;
      if (tok.type === 'end') {
        if (name === 'title' || name === 'style' || name === 'script' || name === 'noscript') continue;
        const idx = open.map((o) => o.tag).lastIndexOf(name);
        if (idx !== -1) { while (open.length > idx) { const t = open.pop()!.tag; body.push(`</${SVG_CASE[t] ?? t}>`); if (SVG_TAGS.has(t)) inSvg = Math.max(0, inSvg - 1); } }
        continue;
      }
      // start tags
      const attrs = tok.attrs ?? [];
      if (name === 'html' || name === 'head') continue;
      if (name === 'body') { bodyAttrs = writeAttrs(attrs.filter((a) => ['class', 'id', 'style', 'lang', 'dir'].includes(a.name)), 'body'); continue; }
      if (name === 'title') { if (rawNext) { title = (rawNext.text ?? '').trim().slice(0, 200); skipText = rawNext.start; } continue; }
      if (name === 'style') {
        if (rawNext) { styles.push(styleBody(rawNext.text ?? '')); skipText = rawNext.start; }
        continue;
      }
      if (name === 'link') {
        const rel = attrs.find((a) => a.name === 'rel')?.value.toLowerCase() ?? '';
        const href = attrs.find((a) => a.name === 'href')?.value ?? '';
        if (rel.split(/\s+/).includes('stylesheet')) {
          const p = resolve(input.entryPath, href, input.loaded);
          if (p && report.inlinedFiles < L.maxInlinedFiles) styles.push(styleBody(inline(p)));
          else { report.blockedExternal.push(href.slice(0, 80)); count(report, 'stylesheet'); }
        } else count(report, 'link');
        continue;
      }
      if (name === 'script') {
        if (!input.scripts) { count(report, 'script'); if (rawNext) skipText = rawNext.start; continue; }
        if (rawNext) skipText = rawNext.start;
        const src = attrs.find((a) => a.name === 'src')?.value;
        if (src) {
          const p = resolve(input.entryPath, src, input.loaded);
          if (p && report.inlinedFiles < L.maxInlinedFiles) scriptBodies.push(inline(p));
          else { report.blockedExternal.push(src.slice(0, 80)); count(report, 'script'); }
        } else {
          if (rawNext) scriptBodies.push(rawNext.text ?? '');
        }
        continue;
      }
      if (name === 'noscript') { if (input.scripts) { count(report, 'noscript'); skipDepth = 'noscript'; } else { body.push('<div>'); open.push({ tag: 'div' }); } continue; }
      if (MEDIA_TAGS.has(name)) {
        const src = attrs.find((a) => a.name === 'src')?.value ?? '';
        const p = name === 'img' ? resolve(input.entryPath, src, input.loaded) : undefined;
        const svg = p && /\.svg$/i.test(p) ? input.effective(p) : undefined;
        if (svg !== undefined && svg.length <= L.svgDataBytes) {
          const safe = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
          body.push(`<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(safe)}"${writeAttrs(attrs.filter((a) => ['alt', 'width', 'height', 'class', 'id', 'style'].includes(a.name)), 'img')}>`);
        } else {
          const w = attrs.find((a) => a.name === 'width')?.value ?? '120';
          const h = attrs.find((a) => a.name === 'height')?.value ?? '80';
          report.placeholders.push(src.slice(0, 80) || name);
          const keep = attrs.filter((a) => ['id', 'class', 'style'].includes(a.name));
          body.push(`<span class="pb-img"${writeAttrs(keep, 'span')} style="width:${/^\d{1,4}$/.test(w) ? w : 120}px;height:${/^\d{1,4}$/.test(h) ? h : 80}px">${escapeText(`image not loaded: ${src.slice(0, 80) || name}`)}</span>`);
        }
        continue;
      }
      const known = ALLOWED_TAGS.has(name) || SVG_TAGS.has(name);
      if (!known && !/^[a-z][a-z0-9-]*$/.test(name)) { count(report, name); continue; }
      let tag = name;
      if (!known) {
        if (['iframe', 'object', 'embed', 'frame', 'frameset', 'applet', 'portal', 'template', 'foreignobject', 'use', 'image', 'meta', 'base'].includes(name)) { count(report, name); if (!tok.selfClosing && !VOID.has(name)) skipDepth = name; continue; }
        tag = 'span';
        report.unknownTags++;
      }
      if (elements.length >= L.maxElements) { report.truncated = true; continue; }
      const isSvg = SVG_TAGS.has(tag);
      if (isSvg && tag === 'svg') inSvg++;
      let marker = '';
      if (annotate) {
        marker = ` data-pb="${id}"`;
        const endLine = tokens.length ? tok.line + (source.slice(tok.start, tok.end).match(/\n/g)?.length ?? 0) : tok.line;
        elements.push({ id, path: input.entryPath, tag, line: tok.line, col: tok.col, startOffset: tok.start, endOffset: tok.end, endLine });
        id++;
      }
      body.push(`<${SVG_CASE[tag] ?? tag}${writeAttrs(attrs, tag)}${marker}>`);
      if (!(tok.selfClosing || VOID.has(tag))) open.push({ tag }); else if (isSvg && tag === 'svg') inSvg = Math.max(0, inSvg - 1);
    }
    while (open.length) { const t = open.pop()!.tag; body.push(`</${SVG_CASE[t] ?? t}>`); }
    scriptBodies = scriptBodies.map((s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'));
    const scriptTags = input.scripts ? `<script>${INSPECTOR_SOURCE(input.nonce, input.origin)}</script>${scriptBodies.map((s) => `<script>${s}</script>`).join('')}` : '';
    const html =
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${escapeAttr(cspFor(input.scripts))}"><meta charset="utf-8">` +
      `<style>${BASE_STYLE}</style><title>${escapeText(title)}</title>${styles.map((s) => `<style>${s}</style>`).join('')}</head>` +
      `<body${bodyAttrs}>${input.scripts ? scriptTags : ''}${body.join('')}</body></html>`;
    if (html.length > L.maxDocBytes) return { ok: false, reason: 'The page is too large to preview.' };
    if (report.inlinedFiles > L.maxInlinedFiles) return { ok: false, reason: 'The page loads too many files to preview.' };
    return { ok: true, html, elements, report, notes: notesFrom(report) };
  } catch {
    return { ok: false, reason: 'The preview could not be built.' };
  }
}

function notesFrom(r: PreviewReport): string[] {
  const notes: string[] = [];
  if (r.blockedExternal.length) notes.push(`${r.blockedExternal.length} outside address${r.blockedExternal.length === 1 ? '' : 'es'} blocked.`);
  if (r.placeholders.length) notes.push(`${r.placeholders.length} image${r.placeholders.length === 1 ? '' : 's'} or media shown as placeholders because they were not loaded.`);
  const removed = Object.values(r.removed).reduce((a, b) => a + b, 0);
  if (removed) notes.push(`${removed} risky or unsupported item${removed === 1 ? '' : 's'} removed.`);
  if (r.unknownTags) notes.push(`${r.unknownTags} unknown tag${r.unknownTags === 1 ? '' : 's'} shown as plain text boxes.`);
  if (r.truncated) notes.push('The page has more elements than the preview annotates.');
  return notes;
}
