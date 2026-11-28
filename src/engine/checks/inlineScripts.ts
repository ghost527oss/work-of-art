// @node: F12.2
// Finds the inline <script> blocks of an HTML page that are plain JavaScript, with their place in the file.
import { CHECK_LIMITS as L } from '../../config/checkLimits';
import { tokenizeHtml } from '../../preview/htmlTokens';

export interface InlineScript {
  code: string;
  /** Offset in the file of the first character of the code. */
  startOffset: number;
  /** 1-based line and column of the first character of the code. */
  startLine: number;
  startCol: number;
  module: boolean;
}

export interface InlineScriptsResult {
  scripts: InlineScript[];
  /** Blocks skipped because they contain template syntax. */
  skippedTemplate: number;
  /** More blocks than the limit: the later ones were not looked at. */
  overLimit: boolean;
}

const CHECKED_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript']);
const TEMPLATE = /\{\{|\{%|<%|<\?/;

export function hasTemplateSyntax(text: string): boolean {
  return TEMPLATE.test(text);
}

export function extractInlineScripts(html: string): InlineScriptsResult {
  const tokens = tokenizeHtml(html);
  const scripts: InlineScript[] = [];
  let skippedTemplate = 0;
  let overLimit = false;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.type !== 'start' || tok.name !== 'script') continue;
    const attrs = tok.attrs ?? [];
    if (attrs.some((a) => a.name === 'src')) continue;
    const type = (attrs.find((a) => a.name === 'type')?.value ?? '').trim().toLowerCase();
    if (!CHECKED_TYPES.has(type)) continue;
    const next = tokens[i + 1];
    if (!next || next.type !== 'text' || next.start !== tok.end) continue;
    const code = html.slice(next.start, next.end);
    if (code.trim() === '') continue;
    if (TEMPLATE.test(code)) { skippedTemplate++; continue; }
    if (scripts.length >= L.maxInlineScripts) { overLimit = true; continue; }
    scripts.push({ code, startOffset: next.start, startLine: next.line, startCol: next.col, module: type === 'module' });
  }
  return { scripts, skippedTemplate, overLimit };
}
