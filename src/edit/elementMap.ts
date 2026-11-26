// @node: F8.2
// Decides whether an element can be written to the practice copy, and rewrites only its start tag.
import { hashText } from '../engine/diffApply';
import { tokenizeHtml } from '../preview/htmlTokens';
import type { ElementEntry } from '../preview/previewDocument';
import { mergeStyle, parseInlineStyle, serializeStyle } from './inlineStyle';
import { isSafeDeclaration, type StyleDeclaration } from './styleModel';

export const REASONS = {
  picture: 'This element comes from a component picture, which is approximate.',
  complex: "This element's style is too complex to rewrite safely.",
  changed: 'The page changed after the preview was built; reload the preview.',
  svg: 'This element is inside an SVG.',
  unknown: 'This tag was not recognised.',
  secret: 'The lines around this element contain a likely secret, so the change is not recorded.',
  large: 'The change is too large to record (limit 2,000 characters).',
  full: 'History is full (50 changes). Undo some changes first.',
  notHtml: 'Only plain HTML pages can be written to the practice copy.',
} as const;

function startTag(content: string, entry: ElementEntry) {
  const text = content.slice(entry.startOffset, entry.endOffset);
  if (!text.toLowerCase().startsWith(`<${entry.tag}`) && !/^<[a-z]/i.test(text)) return null;
  const tok = tokenizeHtml(text).find((t) => t.type === 'start');
  if (!tok || tok.start !== 0 || tok.end !== text.length) return null;
  return { text, tok };
}

export function mapElement(entry: ElementEntry, content: string | undefined, tableHash: string): { ok: true } | { ok: false; reason: string } {
  if (entry.mappable === false) return { ok: false, reason: entry.reason ?? REASONS.unknown };
  if (!/\.html?$/i.test(entry.path)) return { ok: false, reason: REASONS.notHtml };
  if (content === undefined || hashText(content) !== tableHash) return { ok: false, reason: REASONS.changed };
  const st = startTag(content, entry);
  if (!st) return { ok: false, reason: REASONS.changed };
  const style = st.tok.attrs?.find((a) => a.name === 'style');
  if (style && (parseInlineStyle(style.value) === null || /["']|!important/i.test(style.value))) return { ok: false, reason: REASONS.complex };
  return { ok: true };
}

/** New content where only the start tag changed, or null when the tag is not where the table says. */
export function rewriteStartTag(content: string, entry: ElementEntry, changes: readonly StyleDeclaration[]): string | null {
  if (!changes.every(isSafeDeclaration)) return null;
  const st = startTag(content, entry);
  if (!st) return null;
  const attrs = st.tok.attrs ?? [];
  const styleAttr = attrs.find((a) => a.name === 'style');
  const existing = styleAttr ? parseInlineStyle(styleAttr.value) : [];
  if (existing === null || (styleAttr && /["']|!important/i.test(styleAttr.value))) return null;
  const value = serializeStyle(mergeStyle(existing, changes)).replace(/"/g, '');
  const text = st.text;
  let next: string;
  if (styleAttr) {
    const re = /(\s)style\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+)/i;
    const m = re.exec(text);
    if (!m) return null;
    next = text.slice(0, m.index) + `${m[1]}style="${value}"` + text.slice(m.index + m[0].length);
  } else {
    // After the last attribute (or the tag name), before any "/>" or ">".
    const close = /\s*\/?>$/.exec(text)!;
    next = text.slice(0, close.index) + ` style="${value}"` + text.slice(close.index);
  }
  return content.slice(0, entry.startOffset) + next + content.slice(entry.endOffset);
}
