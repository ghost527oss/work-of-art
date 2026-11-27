// @node: F12.2
// JavaScript syntax check with acorn. Reads the text only: nothing is ever run.
import { CHECK_LIMITS as L } from '../../config/checkLimits';
import { containsSecret } from '../redact';
import type { AcornModule } from './acornLoader';
import { extractInlineScripts } from './inlineScripts';

export interface CodeIssue {
  skillId: string;
  line: number;
  column?: number;
  /** Fixed words, numbers, and safe names only. */
  extra: string;
}

export interface JsFileResult {
  issues: CodeIssue[];
  /** Plain reasons for parts that were not checked. */
  notChecked: Array<'too_large' | 'minified' | 'template' | 'no_checker' | 'too_many_scripts'>;
}

export interface RawSyntaxError { pos: number; line: number; column: number; message: string; mode: 'module' | 'script' }

const SAFE_NAME = /^[A-Za-z_$][\w$]{0,39}$/;
const name = (n: string | undefined): string => (n && SAFE_NAME.test(n) && !containsSecret(n) ? `"${n}"` : 'a name');

/** The plain sentence for an acorn message. Names are copied only when they look like a safe identifier. */
export function explainAcornError(message: string): string {
  const m = message.replace(/\s*\(\d+:\d+\)\s*$/, '');
  let r: RegExpExecArray | null;
  if (/^Unterminated string constant/.test(m)) return 'A quote was opened and not closed on this line.';
  if (/^Unterminated template/.test(m)) return 'A backtick text was opened and not closed.';
  if (/^Unterminated regular expression/.test(m)) return 'A pattern between slashes was opened and not closed.';
  if (/^Unterminated comment/.test(m)) return 'A comment was opened and not closed.';
  if ((r = /^Identifier '(.*)' has already been declared/.exec(m))) return `The name ${name(r[1])} is declared twice.`;
  if (/^Unexpected character/.test(m)) return 'A character JavaScript cannot read was found.';
  if (/^The keyword '.*' is reserved/.test(m) || /^Unexpected reserved word/.test(m)) return 'A reserved word is used as a name.';
  if (/^'return' outside of function/.test(m)) return 'A return is used outside a function.';
  if (/^Missing catch or finally after try/.test(m)) return 'A try block has no catch or finally.';
  if (/^'import' and 'export' may/.test(m) || /^Cannot use import statement/.test(m)) return 'An import or export is used where it is not allowed.';
  if (/^Unexpected token/.test(m)) return 'A symbol was found where JavaScript did not expect one.';
  return 'JavaScript could not read this part.';
}

function tryParse(acorn: AcornModule, code: string, mode: 'module' | 'script'): RawSyntaxError | null {
  try {
    acorn.parse(code, { ecmaVersion: 'latest', sourceType: mode, allowHashBang: true, allowReturnOutsideFunction: mode === 'script', locations: true });
    return null;
  } catch (e) {
    const err = e as { pos?: unknown; loc?: { line?: unknown; column?: unknown }; message?: unknown };
    const pos = typeof err.pos === 'number' ? err.pos : 0;
    const line = typeof err.loc?.line === 'number' ? err.loc.line : 1;
    const column = typeof err.loc?.column === 'number' ? err.loc.column : 0;
    return { pos, line, column, message: typeof err.message === 'string' ? err.message : '', mode };
  }
}

/**
 * Parses as the requested kind. `.mjs` and `type="module"` are module only, `.cjs` is script only, anything else is
 * module first and then script. When both fail, the error that got further into the text is returned (a tie gives the
 * module error). Returns null when the text reads cleanly.
 */
export function parseJs(acorn: AcornModule, code: string, kind: 'module' | 'script' | 'either'): RawSyntaxError | null {
  if (kind === 'module') return tryParse(acorn, code, 'module');
  if (kind === 'script') return tryParse(acorn, code, 'script');
  const asModule = tryParse(acorn, code, 'module');
  if (!asModule) return null;
  const asScript = tryParse(acorn, code, 'script');
  if (!asScript) return null;
  return asScript.pos > asModule.pos ? asScript : asModule;
}

function ext(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1);
}

const issueFrom = (err: RawSyntaxError, line: number, column: number): CodeIssue => ({
  skillId: 'scan.frontend.js-syntax', line, column, extra: `${explainAcornError(err.message)} (line ${line}, column ${column})`,
});

/** Checks one file: a JavaScript file, or the inline scripts of an HTML page. `acorn` null means "could not check". */
export function checkJsFile(path: string, text: string, acorn: AcornModule | null): JsFileResult {
  const e = ext(path);
  const result: JsFileResult = { issues: [], notChecked: [] };
  const isJs = e === 'js' || e === 'mjs' || e === 'cjs';
  const isHtml = e === 'html' || e === 'htm';
  if (!isJs && !isHtml) return result;
  if (isJs && /\.min\.(?:js|mjs|cjs)$/i.test(path)) { result.notChecked.push('minified'); return result; }
  if (text.length > L.maxJsBytes) { result.notChecked.push('too_large'); return result; }
  if (!acorn) { result.notChecked.push('no_checker'); return result; }
  if (isJs) {
    const err = parseJs(acorn, text, e === 'mjs' ? 'module' : e === 'cjs' ? 'script' : 'either');
    if (err) result.issues.push(issueFrom(err, err.line, err.column + 1));
    return result;
  }
  if (text.length > L.maxHtmlBytes) { result.notChecked.push('too_large'); return result; }
  const found = extractInlineScripts(text);
  if (found.skippedTemplate > 0) result.notChecked.push('template');
  if (found.overLimit) result.notChecked.push('too_many_scripts');
  for (const s of found.scripts) {
    const err = parseJs(acorn, s.code, s.module ? 'module' : 'either');
    if (!err) continue;
    const line = s.startLine + err.line - 1;
    const column = err.line === 1 ? s.startCol + err.column : err.column + 1;
    result.issues.push(issueFrom(err, line, column));
  }
  return result;
}
