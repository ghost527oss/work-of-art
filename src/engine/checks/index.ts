// @node: F12.4
// One entry point for the 3B-1 code checks. Reads text only; nothing is run. Uses the parser and the CSS probe if they
// are loaded; otherwise the affected part reports a plain "not checked" reason (never "fine").
import { getAcorn } from './acornLoader';
import { checkBalance } from './balance';
import { checkCssFile } from './cssCheck';
import { getCssProbe } from './cssProbe';
import { checkHtml } from './htmlStructure';
import { checkJsFile, type CodeIssue } from './jsSyntax';

export type NotCheckedReason = 'too_large' | 'minified' | 'template' | 'no_checker' | 'no_probe' | 'too_many_scripts';

export interface CodeCheckResult {
  issues: CodeIssue[];
  /** Distinct plain reasons that part of the file was not checked. */
  notChecked: NotCheckedReason[];
}

const CODE_EXT = new Set(['js', 'mjs', 'cjs', 'html', 'htm', 'css', 'jsx', 'ts', 'tsx']);

export function codeExtOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1);
}

/** True when any code check applies to this file type (whatever the file's label). */
export function hasCodeChecks(path: string): boolean {
  return CODE_EXT.has(codeExtOf(path));
}

export function runCodeChecks(path: string, text: string): CodeCheckResult {
  const issues: CodeIssue[] = [];
  const notChecked = new Set<NotCheckedReason>();
  if (!hasCodeChecks(path)) return { issues, notChecked: [] };
  const js = checkJsFile(path, text, getAcorn());
  issues.push(...js.issues);
  js.notChecked.forEach((r) => notChecked.add(r));
  issues.push(...checkBalance(path, text));
  const html = checkHtml(path, text);
  issues.push(...html.issues);
  html.notChecked.forEach((r) => notChecked.add(r));
  const css = checkCssFile(path, text, getCssProbe());
  issues.push(...css.issues);
  css.notChecked.forEach((r) => notChecked.add(r));
  issues.sort((a, b) => a.line - b.line || (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0));
  return { issues, notChecked: [...notChecked] };
}
