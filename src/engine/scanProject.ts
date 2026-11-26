// @node: F6.5
// The scan engine: runs the 16 checks over loaded files in batches, plus the repository-level checks.
// Pure over its inputs; never changes the snapshot, the analysis, or the work state.
import { SCAN_LIMITS as L } from '../config/scanLimits';
import { scanSkillById } from '../skillbook';
import type { RepoSnapshot } from '../types/contracts';
import { hashText } from './diffApply';
import { buildFixProposal, FIX_NOTE } from './scanFix';
import { scanFetchNoOk, scanInsecureUrl } from './scanApi';
import { scanErrorLeak, scanInputValidation, scanSqlConcat } from './scanBackend';
import type { Finding, RawFinding, ScanResult, Severity } from './scanFindingTypes';
import { scanButtonName, scanImgAlt, scanListenerCleanup } from './scanFrontend';
import { isEnvPath, scanCorsWildcard, scanDangerousHtml, scanEval, scanSecrets, scanTargetBlank } from './scanSecurity';
import { makeCtx, makeFindingId, snippetFor, type FileCtx } from './scanText';
import { extOf, maskComments } from './sourceScan';
import { applyCorrections } from './understandingView';
import type { AnalysisResult, FileUnderstanding, Label } from './understandTypes';

export class ScanAbortError extends Error {
  constructor() {
    super('Scan was cancelled.');
    this.name = 'AbortError';
  }
}

const set = (s: string) => new Set(s.split(' '));
const MARKUP = set('html htm jsx tsx vue');
const SEC_EXT = set('js jsx ts tsx mjs cjs py html htm css json yml yaml toml ini sh');
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

type Area = 'frontend' | 'backend' | 'api' | 'security';
interface Check { id: string; area: Area; exts: Set<string>; run: (ctx: FileCtx) => RawFinding[] }

const CHECKS: readonly Check[] = [
  { id: 'scan.frontend.img-alt', area: 'frontend', exts: MARKUP, run: scanImgAlt },
  { id: 'scan.frontend.button-name', area: 'frontend', exts: MARKUP, run: scanButtonName },
  { id: 'scan.frontend.listener-cleanup', area: 'frontend', exts: set('js jsx ts tsx'), run: scanListenerCleanup },
  { id: 'scan.backend.input-validation', area: 'backend', exts: set('js jsx ts tsx mjs cjs py'), run: scanInputValidation },
  { id: 'scan.backend.error-leak', area: 'backend', exts: set('js ts mjs cjs'), run: scanErrorLeak },
  { id: 'scan.backend.sql-concat', area: 'backend', exts: set('js ts mjs cjs py'), run: scanSqlConcat },
  { id: 'scan.api.fetch-no-ok-check', area: 'api', exts: set('js jsx ts tsx mjs cjs'), run: scanFetchNoOk },
  { id: 'scan.api.insecure-url', area: 'api', exts: set('js jsx ts tsx mjs cjs py'), run: scanInsecureUrl },
  { id: 'scan.security.hardcoded-secret', area: 'security', exts: SEC_EXT, run: scanSecrets },
  { id: 'scan.security.dangerous-html', area: 'security', exts: set('js jsx ts tsx html htm vue'), run: scanDangerousHtml },
  { id: 'scan.security.eval', area: 'security', exts: set('js jsx ts tsx mjs cjs html htm py'), run: scanEval },
  { id: 'scan.security.target-blank', area: 'security', exts: set('html htm jsx tsx vue'), run: scanTargetBlank },
  { id: 'scan.security.cors-wildcard', area: 'security', exts: set('js ts mjs cjs py'), run: scanCorsWildcard },
];

export const CHECK_COUNT = 16;

export interface ScanInputs {
  snapshot: RepoSnapshot;
  analysis: AnalysisResult;
  corrections: Readonly<Record<string, readonly Label[]>>;
  /** The practice copy (2B) or the loaded content; undefined when the file is not available. */
  effective: (path: string) => string | undefined;
}

export interface ScanOptions {
  signal?: AbortSignal;
  yieldToMain?: () => Promise<void>;
  now?: () => number;
  onProgress?: (p: { done: number; total: number }) => void;
}

export function labelsKeyOf(corrections: Readonly<Record<string, readonly Label[]>>): string {
  return hashText(JSON.stringify(Object.keys(corrections).sort().map((k) => [k, corrections[k]])));
}

function isConfigName(path: string): boolean {
  return path.slice(path.lastIndexOf('/') + 1).startsWith('.env');
}

function applicable(path: string, labels: readonly Label[], hasCalls: boolean): Check[] {
  const ext = extOf(path);
  const unsure = labels.length === 1 && labels[0] === 'unknown';
  const secType = SEC_EXT.has(ext) || isConfigName(path);
  const front = labels.includes('frontend') || labels.includes('shared');
  const back = labels.includes('backend') || labels.includes('shared') || labels.includes('api_data');
  const api = hasCalls || labels.includes('api_data');
  return CHECKS.filter((c) => {
    if (c.area === 'security') return secType && (c.exts.has(ext) || c.id === 'scan.security.hardcoded-secret');
    if (!c.exts.has(ext) || unsure) return false;
    return c.area === 'frontend' ? front : c.area === 'backend' ? back : api;
  });
}

function toFinding(raw: RawFinding, lines: readonly string[], seen: Map<string, number>): Finding {
  const skill = scanSkillById(raw.skillId)!;
  const firstText = lines[raw.firstLine - 1] ?? '';
  const key = `${raw.skillId}|${raw.path}|${hashText(firstText.trim())}`;
  const k = seen.get(key) ?? 0;
  seen.set(key, k + 1);
  const areas = [skill.primary, ...skill.also.filter((a) => a !== skill.primary)];
  return {
    id: makeFindingId(raw.skillId, raw.path, firstText, k), skillId: raw.skillId, primary: skill.primary, areas, severity: skill.severity,
    certainty: skill.certainty, fix: skill.fix, path: raw.path, firstLine: raw.firstLine, lastLine: raw.lastLine,
    snippet: snippetFor(lines, raw.firstLine, raw.lastLine), ...(raw.extra ? { extra: raw.extra } : {}),
  };
}

interface FileScan { findings: Finding[]; couldNot: string[] }

function scanOneFile(path: string, text: string, labels: readonly Label[], hasCalls: boolean): FileScan {
  const lines = text.split('\n');
  const ctx = makeCtx(path, text, maskComments(path, text));
  const seen = new Map<string, number>();
  const findings: Finding[] = [];
  const couldNot: string[] = [];
  for (const check of applicable(path, labels, hasCalls)) {
    try {
      for (const raw of check.run(ctx)) findings.push(toFinding(raw, lines, seen));
    } catch {
      couldNot.push(check.id);
    }
  }
  return { findings, couldNot };
}

/** Runs every check that applies to a path on the given text (used by the fix safety check and the crew verify step). */
export function scanFile(inputs: Pick<ScanInputs, 'analysis' | 'corrections'>, path: string, text: string): Finding[] {
  const files = applyCorrections(inputs.analysis, inputs.corrections);
  const f = files.find((x) => x.path === path);
  const hasCalls = inputs.analysis.edges.some((e) => e.from === path && (e.kind === 'calls_api' || e.kind === 'calls_external'));
  return scanOneFile(path, text, f?.labels ?? ['unknown'], hasCalls).findings;
}

function repoFindings(inputs: ScanInputs, loadedTexts: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, number>();
  const linesOf = (p: string) => (loadedTexts.get(p) ?? inputs.effective(p) ?? '').split('\n');
  const push = (raw: RawFinding) => out.push(toFinding(raw, linesOf(raw.path), seen));
  // no-auth-limit
  const write = inputs.analysis.edges.find((e) => e.kind === 'defines_route' && /^(?:POST|PUT|PATCH|DELETE) /.test(e.target));
  if (write) {
    const guard = /(?:^|[^a-z])(?:auth|passport|jwt|jsonwebtoken|session|login|bearer|ratelimit|rate-limit|rate_limit|limiter|throttle|helmet|csrf)/i;
    let found = false;
    for (const [p, t] of loadedTexts) {
      if (!['js', 'ts', 'mjs', 'cjs', 'py'].includes(extOf(p))) continue;
      if (guard.test(maskComments(p, t))) { found = true; break; }
    }
    if (!found) push({ skillId: 'scan.backend.no-auth-limit', path: write.from, firstLine: write.line, lastLine: write.line });
  }
  // route-mismatch
  for (const e of inputs.analysis.edges) if (e.kind === 'calls_api' && e.certainty === 'broken') push({ skillId: 'scan.api.route-mismatch', path: e.from, firstLine: e.line, lastLine: e.line, extra: e.note });
  // env-file (works for files that were not read)
  for (const entry of inputs.snapshot.inventory.entries) {
    if (entry.entryType === 'file' && isEnvPath(entry.path) && !entry.reasonCode?.startsWith('excluded_')) out.push({
      id: makeFindingId('scan.security.env-file', entry.path, entry.path, 0), skillId: 'scan.security.env-file', primary: 'security', areas: ['security'], severity: 'high',
      certainty: 'found', fix: 'guided', path: entry.path, firstLine: 1, lastLine: 1, snippet: [],
    });
  }
  return out;
}

function finish(findings: Finding[], inputs: ScanInputs, extra: Pick<ScanResult, 'coverage' | 'partial' | 'partialReasons'>): ScanResult {
  const sorted = findings.slice().sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.firstLine - b.firstLine || (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0));
  const ruleCounts: Record<string, number> = {};
  for (const f of sorted) ruleCounts[f.skillId] = (ruleCounts[f.skillId] ?? 0) + 1;
  return { findings: sorted, ruleCounts, labelsKey: labelsKeyOf(inputs.corrections), ...extra };
}

function applyFixLabels(findings: Finding[], inputs: ScanInputs): Finding[] {
  return findings.map((f) => {
    if (f.fix !== 'auto') return f;
    const content = inputs.effective(f.path);
    if (content === undefined) return { ...f, fix: 'guided', fixNote: FIX_NOTE };
    const r = buildFixProposal(f, content, (p, t) => scanFile(inputs, p, t));
    return r.ok ? f : { ...f, fix: 'guided', fixNote: FIX_NOTE };
  });
}

export async function scanProject(inputs: ScanInputs, options: ScanOptions = {}): Promise<ScanResult> {
  const now = options.now ?? (() => Date.now());
  const yieldToMain = options.yieldToMain ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const start = now();
  const check = () => { if (options.signal?.aborted) throw new ScanAbortError(); };
  check();
  const effective = applyCorrections(inputs.analysis, inputs.corrections);
  const labelsOf = new Map<string, FileUnderstanding>(effective.map((f) => [f.path, f]));
  const callers = new Set(inputs.analysis.edges.filter((e) => e.kind === 'calls_api' || e.kind === 'calls_external').map((e) => e.from));
  const loaded = inputs.snapshot.files.filter((f) => typeof f.content === 'string' && !labelsOf.get(f.path)?.ignored).map((f) => f.path).sort();
  const texts = new Map<string, string>();
  const findings: Finding[] = [];
  const couldNotCheck: Array<{ path: string; skillId: string }> = [];
  const notChecked: Record<string, number> = {};
  const partialReasons: string[] = [];
  let filesScanned = 0;
  let timedOut = false;
  const todo = loaded.slice(0, L.maxFiles);
  if (loaded.length > L.maxFiles) partialReasons.push(`File limit (${L.maxFiles.toLocaleString('en-US')}) reached: ${loaded.length - L.maxFiles} files were not checked.`);
  for (let i = 0; i < todo.length; i += L.batchSize) {
    if (now() - start > L.maxMs) { timedOut = true; partialReasons.push(`Time limit (${L.maxMs / 1000} seconds) reached: ${todo.length - i} files were not checked.`); break; }
    for (const p of todo.slice(i, i + L.batchSize)) {
      const text = inputs.effective(p) ?? '';
      texts.set(p, text);
      const labels = labelsOf.get(p)?.labels ?? ['unknown'];
      if (applicable(p, labels, callers.has(p)).length === 0) {
        const e = extOf(p) || '(no extension)';
        notChecked[e] = (notChecked[e] ?? 0) + 1;
        continue;
      }
      filesScanned++;
      const r = scanOneFile(p, text, labels, callers.has(p));
      findings.push(...r.findings);
      for (const id of r.couldNot) couldNotCheck.push({ path: p, skillId: id });
    }
    options.onProgress?.({ done: Math.min(i + L.batchSize, todo.length), total: todo.length });
    await yieldToMain();
    check();
  }
  if (!timedOut) options.onProgress?.({ done: todo.length, total: todo.length });
  for (const f of loaded.slice(todo.length)) texts.set(f, inputs.effective(f) ?? '');
  const all = [...findings, ...repoFindings(inputs, texts)];
  // caps: per check, then total
  const per = new Map<string, number>();
  const dropped = new Map<string, number>();
  const capped: Finding[] = [];
  for (const f of all.slice().sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.path < b.path ? -1 : 1) || a.firstLine - b.firstLine)) {
    const n = per.get(f.skillId) ?? 0;
    if (n >= L.maxPerCheck) { dropped.set(f.skillId, (dropped.get(f.skillId) ?? 0) + 1); continue; }
    per.set(f.skillId, n + 1);
    capped.push(f);
  }
  for (const [id, n] of dropped) partialReasons.push(`Limit of ${L.maxPerCheck} findings for ${scanSkillById(id)!.title} reached: ${n} more were not listed.`);
  let kept = capped;
  if (capped.length > L.maxFindings) {
    partialReasons.push(`Finding limit (${L.maxFindings}) reached: ${capped.length - L.maxFindings} later findings are missing.`);
    kept = capped.slice(0, L.maxFindings);
  }
  const filesNotRead = inputs.snapshot.inventory.entries.filter((e) => e.entryType === 'file' && !texts.has(e.path) && !labelsOf.get(e.path)?.ignored).length;
  return finish(applyFixLabels(kept, inputs), inputs, {
    coverage: { filesScanned, filesNotRead, notChecked, couldNotCheck }, partial: partialReasons.length > 0, partialReasons,
  });
}

/** Re-checks the given paths on their effective content and replaces their findings. Synchronous. Keeps `partial` and `labelsKey`. */
export function rescanPaths(result: ScanResult, paths: readonly string[], inputs: ScanInputs): ScanResult {
  const effective = applyCorrections(inputs.analysis, inputs.corrections);
  const labelsOf = new Map(effective.map((f) => [f.path, f]));
  const callers = new Set(inputs.analysis.edges.filter((e) => e.kind === 'calls_api' || e.kind === 'calls_external').map((e) => e.from));
  const set = new Set(paths);
  const keep = result.findings.filter((f) => !set.has(f.path) && !f.skillId.startsWith('scan.backend.no-auth') && f.skillId !== 'scan.api.route-mismatch' && f.skillId !== 'scan.security.env-file');
  const fresh: Finding[] = [];
  for (const p of paths) {
    const text = inputs.effective(p);
    if (text === undefined) continue;
    fresh.push(...scanOneFile(p, text, labelsOf.get(p)?.labels ?? ['unknown'], callers.has(p)).findings);
  }
  const texts = new Map<string, string>();
  for (const f of inputs.snapshot.files) if (typeof f.content === 'string') texts.set(f.path, inputs.effective(f.path) ?? f.content);
  const next = finish(applyFixLabels([...keep, ...fresh, ...repoFindings(inputs, texts)], inputs), inputs, { coverage: result.coverage, partial: result.partial, partialReasons: result.partialReasons });
  return { ...next, labelsKey: result.labelsKey };
}
