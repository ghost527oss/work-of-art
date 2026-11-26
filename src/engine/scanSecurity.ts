// @node: F6.3
// Security checks (per file) and the envelope for repository-level env-file detection.
import { SCAN_LIMITS as L } from '../config/scanLimits';
import { redact, type SecretKind } from './redact';
import { at, type FileCtx } from './scanText';
import type { RawFinding } from './scanFindingTypes';

const N = L.maxPatternChars;
const KIND_WORDS: Record<SecretKind, string> = {
  private_key: 'a private key', github_token: 'a GitHub token', aws_access_key_id: 'an AWS access key', google_api_key: 'a Google API key',
  slack_token: 'a Slack token', jwt: 'a signed token (JWT)', bearer_token: 'a bearer token', assignment: 'a password or key assignment',
};

/** Scans the raw text (comments can leak too). The value is never stored: only the kind in words. */
export function scanSecrets(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const lines = ctx.text.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length && out.length < 100; i++) {
    const line = lines[i]!;
    if (line.length <= 10000) {
      if (/-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/.test(line)) out.push(at(ctx, 'scan.security.hardcoded-secret', offset, offset + line.length + 1, 'a private key'));
      else {
        const r = redact(line);
        if (r.count > 0) out.push(at(ctx, 'scan.security.hardcoded-secret', offset, offset + line.length + 1, KIND_WORDS[r.kinds[0]!] ?? 'a secret'));
      }
    }
    offset += line.length + 1;
  }
  return out;
}

export function scanDangerousHtml(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /\bdangerouslySetInnerHTML\b|\.innerHTML\s*=(?!=)|\binsertAdjacentHTML\s*\(|\bdocument\.write(?:ln)?\s*\(|\bv-html\b/g;
  for (let m = re.exec(ctx.masked); m && out.length < 100; m = re.exec(ctx.masked)) out.push(at(ctx, 'scan.security.dangerous-html', m.index, m.index + m[0].length));
  return out;
}

export function scanEval(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const py = ctx.path.endsWith('.py');
  const re = py ? /(?<![\w.])(?:eval|exec)\s*\(/g : /(?<![\w.$])eval\s*\(|\bnew\s+Function\s*\(/g;
  for (let m = re.exec(ctx.masked); m && out.length < 100; m = re.exec(ctx.masked)) out.push(at(ctx, 'scan.security.eval', m.index, m.index + m[0].length));
  return out;
}

export function scanTargetBlank(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const re = new RegExp(`<a\\b([^>]{0,${N}})>`, 'gi');
  for (let m = re.exec(ctx.masked); m && out.length < 100; m = re.exec(ctx.masked)) {
    const attrs = m[1]!;
    if (!/\btarget\s*=\s*(?:\{\s*)?["']_blank["']/i.test(attrs)) continue;
    const rel = /\brel\s*=\s*(?:\{\s*)?["']([^"']*)["']/i.exec(attrs);
    if (rel && /noopener/i.test(rel[1]!)) continue;
    out.push(at(ctx, 'scan.security.target-blank', m.index, m.index + m[0].length));
  }
  return out;
}

export function scanCorsWildcard(ctx: FileCtx): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /Access-Control-Allow-Origin['"]?\s*[,:=]\s*['"]\*['"]|\borigin\s*:\s*['"]\*['"]|\bcors\s*\(\s*\)|\bCORS\s*\(\s*app\s*\)|\ballow_origins\s*=\s*\[\s*['"]\*['"]/g;
  for (let m = re.exec(ctx.masked); m && out.length < 100; m = re.exec(ctx.masked)) out.push(at(ctx, 'scan.security.cors-wildcard', m.index, m.index + m[0].length));
  return out;
}

export function isEnvPath(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base !== '.env' && !base.startsWith('.env.')) return false;
  return !/\.(?:example|sample|template|dist)$/.test(base);
}
