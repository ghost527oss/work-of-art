// @node: F6.4
// Backend checks (per file). The no-auth-limit check is repository-level and lives in scanProject.ts.
import { at, type FileCtx } from './scanText';
import type { RawFinding } from './scanFindingTypes';

const VALIDATION = /\bzod\b|\bjoi\b|\byup\b|\bajv\b|validat|\bschema\b|safeParse|\btypeof\b|\bisinstance\b|pydantic|marshmallow/i;

export function scanInputValidation(ctx: FileCtx): RawFinding[] {
  const py = ctx.path.endsWith('.py');
  const re = py ? /\brequest\.(?:json|args|form)\b|\brequest\.get_json\s*\(/ : /\breq\.(?:body|query|params)\b/;
  const m = re.exec(ctx.masked);
  if (!m || VALIDATION.test(ctx.masked)) return [];
  return [at(ctx, 'scan.backend.input-validation', m.index, m.index + m[0].length)];
}

export function scanErrorLeak(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /\bres(?:\.status\s*\([^)]{0,20}\))?\.(?:send|json|end|write)\s*\(/g;
  for (let m = re.exec(ctx.masked); m && out.length < 100; m = re.exec(ctx.masked)) {
    const win = ctx.masked.slice(m.index + m[0].length, m.index + m[0].length + 200);
    if (/\b(?:err|error|e)\.(?:stack|message)\b/.test(win)) out.push(at(ctx, 'scan.backend.error-leak', m.index, m.index + m[0].length));
  }
  return out;
}

const SQL = /\b(?:select|insert|update|delete|where)\b/i;

export function scanSqlConcat(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /\.(?:query|execute|executemany|raw|run)\s*\(\s*([fF]?)(['"`])/g;
  const t = ctx.masked;
  for (let m = re.exec(t); m && out.length < 100; m = re.exec(t)) {
    const q = m[2]!;
    const open = m.index + m[0].length;
    let j = open;
    while (j < t.length && t[j] !== q) j += t[j] === '\\' ? 2 : 1;
    const body = t.slice(open, j);
    if (!SQL.test(body)) continue;
    const after = t.slice(j + 1, j + 30);
    const building = (q === '`' && body.includes('${')) || m[1] !== '' || /^\s*[+%]/.test(after) || /^\s*\.format\s*\(/.test(after);
    if (building) out.push(at(ctx, 'scan.backend.sql-concat', m.index, j + 1));
  }
  return out;
}
