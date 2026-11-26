// @node: F6.2
// API checks (per file). The route-mismatch check works from the 2C connections in scanProject.ts.
import { at, type FileCtx } from './scanText';
import type { RawFinding } from './scanFindingTypes';

export function scanFetchNoOk(ctx: FileCtx): RawFinding[] {
  const f = /\bfetch\s*\(/.exec(ctx.masked);
  if (!f) return [];
  if (!/\.(?:json|text)\s*\(/.test(ctx.masked)) return [];
  if (/\.ok\b|\.status\b/.test(ctx.masked)) return [];
  return [at(ctx, 'scan.api.fetch-no-ok-check', f.index, f.index + f[0].length)];
}

const LOCAL = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

export function scanInsecureUrl(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /\b(?:fetch|axios(?:\.(?:get|post|put|patch|delete))?|ky|requests\.(?:get|post|put|patch|delete)|httpx\.(?:get|post|put|patch|delete)|urlopen)\s*\(\s*[fF]?(['"])http:\/\/([^/'"?#:\s]+)/g;
  for (let m = re.exec(ctx.masked); m && out.length < 100; m = re.exec(ctx.masked)) {
    const host = m[2]!.replace(/^[^@]*@/, '').toLowerCase();
    if (LOCAL.has(host)) continue;
    out.push(at(ctx, 'scan.api.insecure-url', m.index, m.index + m[0].length, host));
  }
  return out;
}
