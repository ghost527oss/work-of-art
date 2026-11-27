// @node: F12.10
// "Picture with no size limit", read from the page text. Only used for a picture the browser could not measure (a
// placeholder, one still loading, or a broken one). Always low confidence: a reading of text can be wrong.
import { splitCssRules } from '../engine/checks/cssCheck';
import type { ElementEntry } from './previewDocument';
import { tokenizeHtml } from './htmlTokens';

const SIZE_PROP = /(?:^|[;{\s])(?:max-)?width\s*:/i;

/** Rule texts (selector and body) of every loaded stylesheet and style block, for the "constrained by a style" test. */
export function cssRulesOf(cssTexts: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (css: string, depth: number): void => {
    for (const it of splitCssRules(css).items) {
      if (it.kind === 'rule') out.push(it.text);
      else if (it.kind === 'block-at' && depth < 3) {
        // A group such as @media: the rules inside it count too.
        const open = it.text.indexOf('{');
        const close = it.text.lastIndexOf('}');
        if (open !== -1 && close > open) walk(it.text.slice(open + 1, close), depth + 1);
      }
    }
  };
  for (const css of cssTexts) walk(css, 0);
  return out;
}

export function constrainedBySheets(tag: string, classes: readonly string[], id: string | undefined, rules: readonly string[]): boolean {
  for (const rule of rules) {
    const brace = rule.indexOf('{');
    if (brace === -1) continue;
    const selector = rule.slice(0, brace);
    const body = rule.slice(brace);
    if (!SIZE_PROP.test(body)) continue;
    if (new RegExp(`(?:^|[\\s,>+~])${tag}(?![\\w-])`, 'i').test(selector)) return true;
    const word = (prefix: string, name: string) => new RegExp(`${prefix}${name.replace(/[^\w-]/g, '\\$&')}(?![\\w-])`).test(selector);
    if (id && word('#', id)) return true;
    if (classes.some((c) => word('\\.', c))) return true;
  }
  return false;
}

export interface UnsizedPicture { id: number }

/** Pictures (by element id) that have no width and height written, no width style, and no sheet rule limiting them. */
export function unsizedPictures(entries: readonly ElementEntry[], ids: ReadonlySet<number>, effective: (path: string) => string | undefined, rules: readonly string[]): UnsizedPicture[] {
  const out: UnsizedPicture[] = [];
  for (const e of entries) {
    if (!ids.has(e.id) || !['img', 'video', 'canvas', 'picture'].includes(e.tag)) continue;
    const text = effective(e.path);
    if (text === undefined) continue;
    const tok = tokenizeHtml(text.slice(e.startOffset, e.endOffset)).find((t) => t.type === 'start');
    const attrs = tok?.attrs ?? [];
    const has = (n: string) => attrs.some((a) => a.name === n && a.value.trim() !== '');
    if (has('width') && has('height')) continue;
    const style = attrs.find((a) => a.name === 'style')?.value ?? '';
    if (SIZE_PROP.test(style)) continue;
    const classes = (attrs.find((a) => a.name === 'class')?.value ?? '').split(/\s+/).filter(Boolean);
    if (constrainedBySheets(e.tag, classes, attrs.find((a) => a.name === 'id')?.value, rules)) continue;
    out.push({ id: e.id });
  }
  return out;
}
