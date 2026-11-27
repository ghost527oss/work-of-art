// @node: F7.3
// @node: F8.3 (element keys, mappable flags, and Preview Only styles)
// The allowlist re-serializer: reads the page into tokens and writes a NEW document containing only allowed
// tags and attributes, with every value escaped. Pure: no DOM, no network, no clock.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { ALLOWED_TAGS, MEDIA_TAGS, SVG_CASE, SVG_TAGS, attrAllowed } from './htmlAllow';
import { escapeAttr, escapeText, tokenizeHtml, VOID, type HtmlAttr } from './htmlTokens';
import { sanitizeCss, styleBody } from './cssSanitize';
import { cspFor } from './previewFlags';
import { INSPECTOR_SOURCE } from './previewBridge';
import { isSafeDeclaration } from '../edit/styleModel';
import { SCRIPT_HOSTS, STYLE_HOSTS } from '../config/previewHosts';
import { STORAGE_SHIM_SOURCE } from './storageShim';
import { addBlocked, type BlockedEntry } from './blockedReport';
import { matchOutsideUrl } from './hostMatch';

export interface ElementEntry {
  id: number; path: string; tag: string; line: number; col: number; startOffset: number; endOffset: number; endLine: number;
  /** `path#tag#n` (n = 1-based count of that tag name so far in the file). Stable until the structure changes. */
  key?: string;
  mappable?: boolean;
  reason?: string;
}

export interface PreviewStyle { elementKey: string; property: string; value: string }
export interface PreviewReport {
  removed: Record<string, number>; blockedExternal: string[]; placeholders: string[]; inlinedFiles: number; unknownTags: number; truncated: boolean;
  /** 3B-1: what was not loaded and why (plain words, at most 200). */
  blocked: BlockedEntry[];
  /** 3B-1: outside stylesheet hosts written into the preview. */
  outsideStyles: string[];
  /** 3B-1: outside script hosts written into a Run-scripts preview. */
  outsideScripts: string[];
}
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
  /** Preview Only styles written as inline style on the matching elements (validated before use). */
  previewStyles?: readonly PreviewStyle[];
  /** Set by the workbench: elements are annotated but never mappable. */
  approximate?: boolean;
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
    const tagCounts = new Map<string, number>();
    const styleFor = new Map<string, string>();
    for (const ps of input.previewStyles ?? []) {
      if (!isSafeDeclaration({ prop: ps.property, value: ps.value })) continue;
      styleFor.set(ps.elementKey, `${styleFor.get(ps.elementKey) ?? ''};${ps.property}:${ps.value}`);
    }
    const report: PreviewReport = { removed: {}, blockedExternal: [], placeholders: [], inlinedFiles: 0, unknownTags: 0, truncated: false, blocked: [], outsideStyles: [], outsideScripts: [] };
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
    const scriptList: Array<{ src: string } | { body: string }> = [];
    const isModuleWithImports = (type: string | undefined, code: string): boolean => (type ?? '').trim().toLowerCase() === 'module' && /^\s*(?:import|export)\b/m.test(code);
    const inline = (path: string) => { report.inlinedFiles++; return input.effective(path) ?? ''; };

    const writeAttrs = (attrs: HtmlAttr[], tag: string): string => {
      let s = '';
      for (const a of attrs) {
        const n = a.name;
        if (/^on[a-z]+$/.test(n)) { if (input.scripts) s += ` ${n}="${escapeAttr(a.value)}"`; else { count(report, 'event handler'); addBlocked(report, `${tag} ${n}`, 'event_handler'); } continue; }
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
        if (rawNext) { styles.push(`<style>${styleBody(rawNext.text ?? '')}</style>`); skipText = rawNext.start; }
        continue;
      }
      if (name === 'link') {
        const rel = attrs.find((a) => a.name === 'rel')?.value.toLowerCase() ?? '';
        const href = attrs.find((a) => a.name === 'href')?.value ?? '';
        if (rel.split(/\s+/).includes('stylesheet')) {
          const p = resolve(input.entryPath, href, input.loaded);
          if (p && report.inlinedFiles < L.maxInlinedFiles) styles.push(`<style>${styleBody(inline(p))}</style>`);
          else {
            const outside = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href) ? matchOutsideUrl(href, STYLE_HOSTS) : null;
            if (outside && report.outsideStyles.length < L.maxExternalStyles) {
              styles.push(`<link rel="stylesheet" href="${escapeAttr(outside)}">`);
              report.outsideStyles.push(new URL(outside).hostname);
            } else {
              report.blockedExternal.push(href.slice(0, 80));
              count(report, 'stylesheet');
              const absolute = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
              addBlocked(report, href, !absolute ? 'local_missing' : outside ? 'too_many_outside' : href.length > L.maxOutsideUrlChars ? 'too_long' : /^https:/i.test(href) ? 'not_on_list' : 'not_https');
            }
          }
        } else count(report, 'link');
        continue;
      }
      if (name === 'script') {
        if (!input.scripts) { count(report, 'script'); addBlocked(report, attrs.find((a) => a.name === 'src')?.value ?? 'inline script', 'scripts_off'); if (rawNext) skipText = rawNext.start; continue; }
        if (rawNext) skipText = rawNext.start;
        const src = attrs.find((a) => a.name === 'src')?.value;
        const stype = attrs.find((a) => a.name === 'type')?.value;
        if (src) {
          const p = resolve(input.entryPath, src, input.loaded);
          const absolute = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src);
          if (p && report.inlinedFiles < L.maxInlinedFiles) {
            const code = inline(p);
            if (isModuleWithImports(stype, code)) { count(report, 'script'); addBlocked(report, src, 'module_script'); }
            else scriptList.push({ body: code });
          } else {
            const outside = absolute ? matchOutsideUrl(src, SCRIPT_HOSTS) : null;
            if (outside) {
              if (isModuleWithImports(stype, 'import x')) { count(report, 'script'); addBlocked(report, src, 'module_script'); }
              else { scriptList.push({ src: outside }); report.outsideScripts.push(new URL(outside).hostname); }
            } else {
              report.blockedExternal.push(src.slice(0, 80)); count(report, 'script');
              addBlocked(report, src, !absolute ? 'local_missing' : src.length > L.maxOutsideUrlChars ? 'too_long' : /^https:/i.test(src) ? 'not_on_list' : 'not_https');
            }
          }
        } else if (rawNext) {
          const code = rawNext.text ?? '';
          if (isModuleWithImports(stype, code)) { count(report, 'script'); addBlocked(report, 'inline module script', 'module_script'); }
          else scriptList.push({ body: code });
        }
        continue;
      }
      if (name === 'noscript') { if (input.scripts) { count(report, 'noscript'); skipDepth = 'noscript'; } else { body.push('<div>'); open.push({ tag: 'div' }); } continue; }
      if (MEDIA_TAGS.has(name)) {
        // Media is annotated too (2E-2), so a placeholder image can be selected and its start tag edited.
        let mediaMarker = '';
        if (annotate && elements.length < L.maxElements) {
          const n = (tagCounts.get(name) ?? 0) + 1;
          tagCounts.set(name, n);
          const endLine = tok.line + (source.slice(tok.start, tok.end).match(/\n/g)?.length ?? 0);
          const reason = input.approximate ? 'This element comes from a component picture, which is approximate.' : !/\.html?$/i.test(input.entryPath) ? 'Only plain HTML pages can be written to the practice copy.' : undefined;
          elements.push({ id, path: input.entryPath, tag: name, line: tok.line, col: tok.col, startOffset: tok.start, endOffset: tok.end, endLine, key: `${input.entryPath}#${name}#${n}`, mappable: reason === undefined, ...(reason ? { reason } : {}) });
          mediaMarker = ` data-pb="${id}"`;
          id++;
        }
        const src = attrs.find((a) => a.name === 'src')?.value ?? '';
        const p = name === 'img' ? resolve(input.entryPath, src, input.loaded) : undefined;
        const svg = p && /\.svg$/i.test(p) ? input.effective(p) : undefined;
        if (svg !== undefined && svg.length <= L.svgDataBytes) {
          const safe = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
          body.push(`<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(safe)}"${writeAttrs(attrs.filter((a) => ['alt', 'width', 'height', 'class', 'id', 'style'].includes(a.name)), 'img')}${mediaMarker}>`);
        } else {
          const w = attrs.find((a) => a.name === 'width')?.value ?? '120';
          const h = attrs.find((a) => a.name === 'height')?.value ?? '80';
          const label = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src) ? 'outside address' : src.slice(0, 80) || name;
          report.placeholders.push(label);
          addBlocked(report, label, 'image_not_loaded');
          const keep = attrs.filter((a) => ['id', 'class'].includes(a.name));
          const own = sanitizeCss(attrs.find((a) => a.name === 'style')?.value ?? '');
          const mediaKey = `${input.entryPath}#${name}#${tagCounts.get(name) ?? 0}`;
          const po = styleFor.get(mediaKey);
          // Default size first, the page's own style after it, then Preview Only values, so recorded sizes win.
          body.push(`<span class="pb-img"${writeAttrs(keep, 'span')} style="width:${/^\d{1,4}$/.test(w) ? w : 120}px;height:${/^\d{1,4}$/.test(h) ? h : 80}px;${escapeAttr(own)}${po ? escapeAttr(po) : ''}"${mediaMarker}>${escapeText(`image not loaded: ${label}`)}</span>`);
        }
        continue;
      }
      const known = ALLOWED_TAGS.has(name) || SVG_TAGS.has(name);
      if (!known && !/^[a-z][a-z0-9-]*$/.test(name)) { count(report, name); continue; }
      let tag = name;
      if (!known) {
        if (['iframe', 'object', 'embed', 'frame', 'frameset', 'applet', 'portal', 'template', 'foreignobject', 'use', 'image', 'meta', 'base'].includes(name)) { count(report, name); addBlocked(report, `<${name}>`, 'removed_tag'); if (!tok.selfClosing && !VOID.has(name)) skipDepth = name; continue; }
        tag = 'span';
        report.unknownTags++;
      }
      if (elements.length >= L.maxElements) { report.truncated = true; continue; }
      const isSvg = SVG_TAGS.has(tag);
      if (isSvg && tag === 'svg') inSvg++;
      let marker = '';
      const n = (tagCounts.get(name) ?? 0) + 1;
      tagCounts.set(name, n);
      const key = `${input.entryPath}#${name}#${n}`;
      if (annotate) {
        marker = ` data-pb="${id}"`;
        const endLine = tok.line + (source.slice(tok.start, tok.end).match(/\n/g)?.length ?? 0);
        const reason = input.approximate ? 'This element comes from a component picture, which is approximate.'
          : inSvg > 0 || isSvg ? 'This element is inside an SVG.'
          : !known ? 'This tag was not recognised.'
          : !/\.html?$/i.test(input.entryPath) ? 'Only plain HTML pages can be written to the practice copy.' : undefined;
        elements.push({ id, path: input.entryPath, tag, line: tok.line, col: tok.col, startOffset: tok.start, endOffset: tok.end, endLine, key, mappable: reason === undefined, ...(reason ? { reason } : {}) });
        id++;
      }
      const extraStyle = styleFor.get(key);
      const attrsOut = extraStyle ? withExtraStyle(writeAttrs(attrs, tag), extraStyle) : writeAttrs(attrs, tag);
      body.push(`<${SVG_CASE[tag] ?? tag}${attrsOut}${marker}>`);
      if (!(tok.selfClosing || VOID.has(tag))) open.push({ tag }); else if (isSvg && tag === 'svg') inSvg = Math.max(0, inSvg - 1);
    }
    while (open.length) { const t = open.pop()!.tag; body.push(`</${SVG_CASE[t] ?? t}>`); }
    // Run-scripts: the inspector and the storage stand-in first, then the page content, then the project scripts in page order.
    const escapeScript = (s: string): string => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
    const headScripts = input.scripts ? `<script>${INSPECTOR_SOURCE(input.nonce, input.origin)}</script><script>${STORAGE_SHIM_SOURCE}</script>` : '';
    const tailScripts = input.scripts ? scriptList.map((s) => ('src' in s ? `<script src="${escapeAttr(s.src)}"></script>` : `<script>${escapeScript(s.body)}</script>`)).join('') : '';
    const html =
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${escapeAttr(cspFor(input.scripts))}"><meta charset="utf-8">` +
      `<style>${BASE_STYLE}</style><title>${escapeText(title)}</title>${styles.join('')}</head>` +
      `<body${bodyAttrs}>${headScripts}${body.join('')}${tailScripts}</body></html>`;
    if (html.length > L.maxDocBytes) return { ok: false, reason: 'The page is too large to preview.' };
    if (report.inlinedFiles > L.maxInlinedFiles) return { ok: false, reason: 'The page loads too many files to preview.' };
    return { ok: true, html, elements, report, notes: notesFrom(report) };
  } catch {
    return { ok: false, reason: 'The preview could not be built.' };
  }
}

/** Adds Preview Only declarations to the written attribute string (they win over the page's own inline style). */
function withExtraStyle(attrs: string, extra: string): string {
  const m = / style="([^"]*)"/.exec(attrs);
  const add = escapeAttr(extra.replace(/^;/, ''));
  // Slice by index: a string replacement would interpret "$&" and friends inside the page's own text.
  return m ? `${attrs.slice(0, m.index)} style="${m[1]};${add}"${attrs.slice(m.index + m[0].length)}` : `${attrs} style="${add}"`;
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
