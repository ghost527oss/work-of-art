// @node: F7.7
// The layout overflow check: pure evaluation of measurements and building of measured findings.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { scanSkillById } from '../skillbook';
import type { Finding } from '../engine/scanFindingTypes';
import { makeFindingId, snippetFor } from '../engine/scanText';
import type { ElementEntry } from './previewDocument';

export interface Measurement {
  id: number; tag: string; clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number;
  overflowX: string; overflowY: string; hasText: boolean;
}

export type OverflowKind = 'text-wider' | 'text-cut-bottom' | 'page-wider';
export interface OverflowResult { id: number; kind: OverflowKind; width: number; content: number; box: number }

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100_000, Math.round(n))) : 0);

export function evaluateOverflow(measurements: readonly Measurement[], width: number, docScrollWidth: number): OverflowResult[] {
  const out: OverflowResult[] = [];
  let widest: Measurement | undefined;
  for (const raw of measurements) {
    const m = { ...raw, clientWidth: clamp(raw.clientWidth), scrollWidth: clamp(raw.scrollWidth), clientHeight: clamp(raw.clientHeight), scrollHeight: clamp(raw.scrollHeight) };
    if (!widest || m.scrollWidth > widest.scrollWidth) widest = m;
    if (!m.hasText) continue;
    const xOpen = !['auto', 'scroll'].includes(m.overflowX);
    const yClip = m.overflowY === 'hidden' || m.overflowY === 'clip';
    if (xOpen && m.scrollWidth > m.clientWidth + 1 && ['visible', 'hidden', 'clip'].includes(m.overflowX)) out.push({ id: m.id, kind: 'text-wider', width, content: m.scrollWidth, box: m.clientWidth });
    if (yClip && m.scrollHeight > m.clientHeight + 1) out.push({ id: m.id, kind: 'text-cut-bottom', width, content: m.scrollHeight, box: m.clientHeight });
  }
  const doc = clamp(docScrollWidth);
  if (doc > width + 1 && widest) out.push({ id: widest.id, kind: 'page-wider', width, content: doc, box: width });
  return out;
}

const WORDS: Record<OverflowKind, string> = { 'text-wider': 'Text is wider than its box', 'text-cut-bottom': 'Text is cut off at the bottom', 'page-wider': 'The page is wider than the screen' };

/** One finding per element and kind, listing every width. At most 100. */
export function layoutFindings(
  results: readonly OverflowResult[], elements: readonly ElementEntry[], effective: (path: string) => string | undefined,
): { findings: Finding[]; partialReasons: string[] } {
  const byEl = new Map<number, ElementEntry>(elements.map((e) => [e.id, e]));
  const groups = new Map<string, OverflowResult[]>();
  for (const r of results) groups.set(`${r.id}|${r.kind}`, [...(groups.get(`${r.id}|${r.kind}`) ?? []), r]);
  const findings: Finding[] = [];
  const seen = new Map<string, number>();
  let dropped = 0;
  for (const [, rs] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const el = byEl.get(rs[0]!.id);
    if (!el) continue;
    if (findings.length >= L.maxLayoutFindings) { dropped++; continue; }
    const text = effective(el.path) ?? '';
    const lines = text.split('\n');
    const key = `${el.path}|${lines[el.line - 1]?.trim()}`;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const widths = rs.map((r) => r.width).sort((a, b) => a - b);
    const first = rs[0]!;
    const skill = scanSkillById('scan.frontend.layout-overflow')!;
    findings.push({
      id: makeFindingId(`scan.frontend.layout-overflow:${first.kind}`, el.path, lines[el.line - 1] ?? '', k), skillId: skill.id, primary: 'frontend', areas: ['frontend'],
      severity: 'medium', certainty: 'found', fix: 'guided', path: el.path, firstLine: el.line, lastLine: el.endLine,
      snippet: snippetFor(lines, el.line, el.endLine),
      extra: `${WORDS[first.kind]}: content ${first.content} px in a box ${first.box} px wide, measured at ${widths.join(', ')} px wide preview${widths.length > 1 ? 's' : ''}`,
    });
  }
  return { findings, partialReasons: dropped > 0 ? [`Layout check limit (${L.maxLayoutFindings}) reached: later findings are missing.`] : [] };
}
