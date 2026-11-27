// @node: F12.2
// Brackets and quotes balance for files PatchBay cannot fully read (.jsx, .ts, .tsx). One lexical pass that skips
// comments, strings, template text, and a regex guess, and keeps a stack of open brackets. A hint, never "valid".
import { CHECK_LIMITS as L } from '../../config/checkLimits';
import type { CodeIssue } from './jsSyntax';

interface Pass { kind: 'mismatch' | 'unclosed' | 'quote'; line: number }

const OPEN = '([{';
const CLOSE: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const REGEX_AFTER = '(,=:[!&|?{};+-*%~^';
const REGEX_WORDS = /(?:^|[^\w$])(?:return|typeof|case|in|of|delete|void|throw|yield|await)$/;

/** `always`: every quote starts a string. `contextual`: a quote starts a string only where code expects a value (not in page text such as Don't). */
function run(text: string, quotes: 'always' | 'contextual', reportQuotes: boolean): Pass | null {
  const stack: Array<{ ch: string; line: number }> = [];
  let line = 1;
  let i = 0;
  const n = text.length;
  let last = ''; // last significant character in code
  let inTemplate = false;
  let prevWordEnd = '';
  const tplStack: number[] = []; // depth of the bracket stack at each open "${"
  const readTemplate = (): void => {
    // inside template text: runs until a backtick or "${"
    while (i < n) {
      const c = text[i]!;
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') line++;
      if (c === '`') { i++; inTemplate = false; last = '`'; return; }
      if (c === '$' && text[i + 1] === '{') { i += 2; stack.push({ ch: '{', line }); tplStack.push(stack.length); inTemplate = false; last = '{'; return; }
      i++;
    }
  };
  if (text.startsWith('#!')) while (i < n && text[i] !== '\n') i++;
  while (i < n) {
    if (inTemplate) { readTemplate(); continue; }
    const c = text[i]!;
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k++) if (text[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '`') { i++; inTemplate = true; continue; }
    if ((c === '"' || c === "'") && (quotes === 'always' || last === '' || REGEX_AFTER.includes(last) || REGEX_WORDS.test(prevWordEnd))) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const d = text[j]!;
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') break;
        if (d === c) { closed = true; break; }
        j++;
      }
      if (!closed) {
        if (reportQuotes) return { kind: 'quote', line };
        i = j; // React files: a multi-line attribute text or an apostrophe in page text is not an error
        continue;
      }
      i = j + 1;
      last = c;
      continue;
    }
    if (c === '/') {
      const regexOk = last === '' || REGEX_AFTER.includes(last) || REGEX_WORDS.test(prevWordEnd);
      if (regexOk) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < n && text[j] !== '\n') {
          const d = text[j]!;
          if (d === '\\') { j += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { closed = true; break; }
          j++;
        }
        if (closed) { i = j + 1; last = '/'; while (i < n && /[a-z]/i.test(text[i]!)) i++; continue; }
      }
      i++; last = '/'; continue;
    }
    if (OPEN.includes(c)) { stack.push({ ch: c, line }); last = c; i++; continue; }
    if (c in CLOSE) {
      const top = stack[stack.length - 1];
      if (!top || top.ch !== CLOSE[c]) return { kind: 'mismatch', line };
      stack.pop();
      if (c === '}' && tplStack.length > 0 && tplStack[tplStack.length - 1] === stack.length + 1) { tplStack.pop(); i++; inTemplate = true; last = '}'; continue; }
      last = c; i++; continue;
    }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(text[j]!)) j++;
      prevWordEnd = text.slice(Math.max(0, j - 12), j);
      last = 'a';
      i = j;
      continue;
    }
    last = c; i++;
  }
  if (inTemplate) return { kind: 'unclosed', line };
  if (stack.length > 0) return { kind: 'unclosed', line: stack[stack.length - 1]!.line };
  return null;
}

const MSG: Record<Pass['kind'], string> = {
  mismatch: 'A closing bracket does not match the one that was opened last',
  unclosed: 'A bracket or backtick text may be opened and never closed',
  quote: 'A quote may not close on its line',
};

function ext(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1);
}

/** Findings for .jsx, .ts, .tsx files (nothing for other types). Wording: "may", never "valid". */
export function checkBalance(path: string, text: string): CodeIssue[] {
  const e = ext(path);
  if (e !== 'jsx' && e !== 'ts' && e !== 'tsx') return [];
  if (text.length > L.maxJsBytes) return [];
  let issue: Pass | null;
  if (e === 'ts') issue = run(text, 'always', true);
  else {
    // React files: page text has apostrophes, so report only when the strict and the lenient reading both disagree.
    const withQuotes = run(text, 'always', false);
    const without = withQuotes ? run(text, 'contextual', false) : null;
    issue = withQuotes && without ? without : null;
  }
  if (!issue) return [];
  return [{ skillId: 'scan.frontend.balance', line: issue.line, extra: `${MSG[issue.kind]} (line ${issue.line}). This is a count of pairs, not a full check.` }].slice(0, L.maxBalanceFindings);
}
