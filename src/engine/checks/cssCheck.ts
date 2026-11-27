// @node: F12.3
// CSS check: braces that do not match (own counter) and "Possible invalid CSS" (rules the browser dropped).
// The browser part is the injected probe; nothing is applied to any page.
import { CHECK_LIMITS as L } from '../../config/checkLimits';
import { tokenizeHtml } from '../../preview/htmlTokens';
import { redact } from '../redact';
import type { CssProbe } from './cssProbe';
import { hasTemplateSyntax } from './inlineScripts';
import type { CodeIssue } from './jsSyntax';

export interface CssItem { kind: 'rule' | 'block-at' | 'line-at'; text: string; startLine: number }
export interface BraceProblem { line: number; kind: 'extra_close' | 'unclosed_open' }

/** Splits CSS into top-level items (skipping comments and quoted text) and finds brace problems. */
export function splitCssRules(css: string): { items: CssItem[]; braceProblems: BraceProblem[] } {
  const items: CssItem[] = [];
  const braceProblems: BraceProblem[] = [];
  const n = css.length;
  let i = 0;
  let line = 1;
  let depth = 0;
  const openLines: number[] = [];
  let itemStart = -1;
  let itemLine = 1;
  const flush = (end: number, block: boolean): void => {
    if (itemStart === -1) return;
    const text = css.slice(itemStart, end).trim();
    itemStart = -1;
    if (text === '') return;
    items.push({ kind: text.startsWith('@') ? (block ? 'block-at' : 'line-at') : 'rule', text, startLine: itemLine });
  };
  while (i < n) {
    const c = css[i]!;
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k++) if (css[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (depth === 0 && itemStart === -1 && !/\s/.test(c) && c !== '}') { itemStart = i; itemLine = line; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      i = Math.min(j + 1, n);
      continue;
    }
    if (c === '{') { depth++; openLines.push(line); i++; continue; }
    if (c === '}') {
      if (depth === 0) { braceProblems.push({ line, kind: 'extra_close' }); i++; continue; }
      depth--;
      openLines.pop();
      i++;
      if (depth === 0) flush(i, true);
      continue;
    }
    if (c === ';' && depth === 0) { i++; flush(i, false); continue; }
    i++;
  }
  if (depth > 0) braceProblems.push({ line: openLines[openLines.length - 1] ?? line, kind: 'unclosed_open' });
  else flush(n, false);
  return { items, braceProblems };
}

const selectorOf = (text: string): string => {
  const head = text.slice(0, text.indexOf('{') === -1 ? text.length : text.indexOf('{')).replace(/\s+/g, ' ').trim();
  return redact(head.slice(0, L.maxSelectorChars)).text;
};

export interface CssCheckResult {
  issues: CodeIssue[];
  notChecked: Array<'too_large' | 'no_probe' | 'template'>;
}

/** Checks one CSS text. `lineOffset` shifts lines (for a <style> block). */
export function checkCssText(css: string, probe: CssProbe | null, lineOffset = 0): CssCheckResult {
  const result: CssCheckResult = { issues: [], notChecked: [] };
  const { items, braceProblems } = splitCssRules(css);
  const add = (i: CodeIssue): void => { if (result.issues.length < L.maxCssFindings) result.issues.push(i); };
  for (const b of braceProblems) {
    const line = b.line + lineOffset;
    add({ skillId: 'scan.frontend.css-braces', line, extra: b.kind === 'extra_close' ? `A closing curly bracket on line ${line} has nothing to close.` : `A curly bracket opened on line ${line} is never closed.` });
  }
  if (braceProblems.length > 0) return result; // the rules cannot be told apart reliably
  if (!probe) { result.notChecked.push('no_probe'); return result; }
  let probed = 0;
  for (const it of items) {
    if (it.kind === 'line-at') continue;
    if (probed >= L.maxCssRules) break;
    probed++;
    let kept = true;
    try { kept = probe(it.text); } catch { kept = true; }
    if (!kept) add({ skillId: 'scan.frontend.css-possible-invalid', line: it.startLine + lineOffset, extra: `The browser dropped the rule starting "${selectorOf(it.text)}" (line ${it.startLine + lineOffset}). It may be misspelled, or newer than this browser.` });
  }
  return result;
}

/** Style blocks of an HTML page, with the line of their first character. */
export function styleBlocks(html: string): Array<{ css: string; line: number }> {
  const tokens = tokenizeHtml(html);
  const out: Array<{ css: string; line: number }> = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== 'start' || t.name !== 'style') continue;
    const next = tokens[i + 1];
    if (!next || next.type !== 'text' || next.start !== t.end) continue;
    out.push({ css: html.slice(next.start, next.end), line: next.line });
  }
  return out;
}

export function checkCssFile(path: string, text: string, probe: CssProbe | null): CssCheckResult {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (/\.html?$/i.test(base)) {
    const result: CssCheckResult = { issues: [], notChecked: [] };
    if (text.length > L.maxHtmlBytes) { result.notChecked.push('too_large'); return result; }
    for (const b of styleBlocks(text)) {
      if (hasTemplateSyntax(b.css)) { if (!result.notChecked.includes('template')) result.notChecked.push('template'); continue; }
      const r = checkCssText(b.css, probe, b.line - 1);
      result.issues.push(...r.issues);
      for (const nc of r.notChecked) if (!result.notChecked.includes(nc)) result.notChecked.push(nc);
    }
    result.issues.splice(L.maxCssFindings);
    return result;
  }
  if (!base.endsWith('.css') || base.endsWith('.min.css')) return { issues: [], notChecked: [] };
  if (text.length > L.maxCssBytes) return { issues: [], notChecked: ['too_large'] };
  return checkCssText(text, probe);
}
