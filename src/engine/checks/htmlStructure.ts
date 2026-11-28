// @node: F12.3
// HTML structure check: tags that do not close properly, stray closing tags, repeated ids, and missing required
// attributes. Reads the text with the existing tokenizer; nothing is run.
import { CHECK_LIMITS as L } from '../../config/checkLimits';
import { tokenizeHtml, VOID } from '../../preview/htmlTokens';
import { containsSecret } from '../redact';
import type { CodeIssue } from './jsSyntax';
import { hasTemplateSyntax } from './inlineScripts';

/** Tags whose closing tag may be left out in HTML. */
export const OPTIONAL_CLOSE = new Set('p li td th tr dt dd option optgroup thead tbody tfoot colgroup caption head body html rp rt'.split(' '));

export interface HtmlProblem {
  kind: 'closed_late' | 'unclosed' | 'stray_close';
  tag: string;
  /** Line and offset of the start tag (for stray_close: of the closing tag). */
  line: number;
  startOffset: number;
  /** For closed_late: the closing tag that closed it and where that tag starts. */
  closer?: string;
  closerOffset?: number;
}

/** Tag problems only (used by the check and by the automatic fix). */
export function analyzeHtml(text: string): HtmlProblem[] {
  const tokens = tokenizeHtml(text);
  const out: HtmlProblem[] = [];
  const stack: Array<{ tag: string; line: number; offset: number }> = [];
  for (const tok of tokens) {
    if (tok.type === 'start') {
      const name = tok.name!;
      if (tok.selfClosing || VOID.has(name)) continue;
      stack.push({ tag: name, line: tok.line, offset: tok.start });
    } else if (tok.type === 'end') {
      const name = tok.name!;
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.tag === name) { idx = i; break; }
      if (idx === -1) {
        if (name !== 'p' && name !== 'br' && !VOID.has(name)) out.push({ kind: 'stray_close', tag: name, line: tok.line, startOffset: tok.start });
        continue;
      }
      while (stack.length - 1 > idx) {
        const inner = stack.pop()!;
        if (!OPTIONAL_CLOSE.has(inner.tag)) out.push({ kind: 'closed_late', tag: inner.tag, line: inner.line, startOffset: inner.offset, closer: name, closerOffset: tok.start });
      }
      stack.pop();
    }
  }
  for (const open of stack) if (!OPTIONAL_CLOSE.has(open.tag)) out.push({ kind: 'unclosed', tag: open.tag, line: open.line, startOffset: open.offset });
  return out;
}

const SAFE_ID = /^[\w:.-]{1,40}$/;
const idWords = (id: string): string => (SAFE_ID.test(id) && !containsSecret(id) ? `"${id}"` : 'an id');

export interface HtmlCheckResult {
  issues: CodeIssue[];
  notChecked: Array<'too_large' | 'template'>;
}

function isHtml(path: string): boolean {
  return /\.html?$/i.test(path);
}

export function checkHtml(path: string, text: string): HtmlCheckResult {
  const result: HtmlCheckResult = { issues: [], notChecked: [] };
  if (!isHtml(path)) return result;
  if (text.length > L.maxHtmlBytes) { result.notChecked.push('too_large'); return result; }
  if (hasTemplateSyntax(text)) { result.notChecked.push('template'); return result; }
  const add = (i: CodeIssue): void => { if (result.issues.length < L.maxHtmlFindings) result.issues.push(i); };

  for (const p of analyzeHtml(text)) {
    const tag = `<${p.tag}>`;
    if (p.kind === 'stray_close') add({ skillId: 'scan.frontend.html-structure', line: p.line, extra: `A closing </${p.tag}> has no opening ${tag} to close (line ${p.line}).` });
    else if (p.kind === 'unclosed') add({ skillId: 'scan.frontend.html-structure', line: p.line, extra: `The ${tag} on line ${p.line} is never closed.` });
    else add({ skillId: 'scan.frontend.html-structure', line: p.line, extra: `The ${tag} on line ${p.line} is closed late, by the </${p.closer}> that closes an outer tag.` });
  }

  const ids = new Map<string, number>();
  for (const tok of tokenizeHtml(text)) {
    if (tok.type !== 'start') continue;
    const attrs = tok.attrs ?? [];
    const id = attrs.find((a) => a.name === 'id')?.value;
    if (id !== undefined && id !== '' && !/\{|<|\$\{/.test(id)) {
      const first = ids.get(id);
      if (first === undefined) ids.set(id, tok.line);
      else add({ skillId: 'scan.frontend.html-id-duplicate', line: tok.line, extra: `The id ${idWords(id)} is used again (first on line ${first}).` });
    }
    if (tok.name === 'img' && !attrs.some((a) => a.name === 'src')) add({ skillId: 'scan.frontend.html-attr-missing', line: tok.line, extra: 'An <img> tag has no src attribute.' });
    if (tok.name === 'link') {
      const rel = (attrs.find((a) => a.name === 'rel')?.value ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('stylesheet') && !attrs.some((a) => a.name === 'href')) add({ skillId: 'scan.frontend.html-attr-missing', line: tok.line, extra: 'A stylesheet <link> tag has no href attribute.' });
    }
  }
  return result;
}
