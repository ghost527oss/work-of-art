// @node: F12.10
// Builds findings from the Visual Linter results. One finding per element and kind, listing every width. `extra` holds
// fixed words and numbers only (never page text). Findings are never saved.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { scanSkillById } from '../skillbook';
import type { Finding } from '../engine/scanFindingTypes';
import { makeFindingId, snippetFor } from '../engine/scanText';
import { layoutFindings, type OverflowResult } from './layoutCheck';
import { unsizedPictures, type UnsizedPicture } from './mediaSize';
import type { Confidence, LintKind, LintOutput, LintResult } from './linter';
import type { ElementEntry } from './previewDocument';

export type FindingKind = LintKind | 'nolimit';

const SKILL: Record<FindingKind, string> = {
  'tap-target': 'scan.frontend.tap-target', 'text-small': 'scan.frontend.text-small', contrast: 'scan.frontend.contrast',
  overlap: 'scan.frontend.layout-overlap', 'media-wide': 'scan.frontend.media-unsized', nolimit: 'scan.frontend.media-unsized',
};
const ORDER: FindingKind[] = ['tap-target', 'text-small', 'contrast', 'overlap', 'media-wide', 'nolimit'];
const LABEL = ' (static render, scripts off)';

export interface BuildInput {
  overflow: readonly OverflowResult[];
  /** One output per measured width. */
  perWidth: ReadonlyArray<{ width: number; lint: LintOutput }>;
  elements: readonly ElementEntry[];
  effective: (path: string) => string | undefined;
  /** Text of every loaded stylesheet and style block (for the source reading of picture sizes). */
  cssRules: readonly string[];
}

export interface BuildOutput { findings: Finding[]; partialReasons: string[]; cantMeasure: Record<string, number> }

const widthsText = (ws: readonly number[]): string => `${[...new Set(ws)].sort((a, b) => a - b).join(', ')} px wide preview${new Set(ws).size > 1 ? 's' : ''}`;

function describe(kind: FindingKind, r: LintResult, otherLine: number | undefined): string {
  switch (kind) {
    case 'tap-target': return `Tap target is ${r.aux?.[1] ?? r.value} px high and ${r.aux?.[0] ?? r.value} px wide (needs at least ${r.limit} px each way)`;
    case 'text-small': return `Text is ${r.value} px (needs at least ${r.limit} px)`;
    case 'contrast': return `Contrast is ${r.value} to 1 (needs at least ${r.limit} to 1)`;
    case 'overlap': return `This box overlaps a neighbouring box${otherLine ? ` (the one on line ${otherLine})` : ''} by ${r.aux?.[1] ?? r.value} square px`;
    case 'media-wide': return `Picture is ${r.value} px wide in a box ${r.limit} px wide`;
    case 'nolimit': return 'Picture has no width, height, or size limit written down (read from the page text, not measured)';
  }
}

const worse = (kind: FindingKind, a: LintResult, b: LintResult): LintResult => {
  const smallerIsWorse = kind === 'tap-target' || kind === 'text-small' || kind === 'contrast';
  return (smallerIsWorse ? b.value < a.value : b.value > a.value) ? b : a;
};
const lowest = (a: Confidence, b: Confidence): Confidence => (['low', 'medium', 'high'].indexOf(a) <= ['low', 'medium', 'high'].indexOf(b) ? a : b);

export function buildMeasuredFindings(input: BuildInput): BuildOutput {
  const partialReasons: string[] = [];
  const byEl = new Map<number, ElementEntry>(input.elements.map((e) => [e.id, e]));
  // Overflow keeps its own builder and limit (existing behaviour).
  const overflow = layoutFindings(input.overflow, input.elements, input.effective);
  partialReasons.push(...overflow.partialReasons);

  // Merge the "can't measure" ids across widths, then count each element once.
  const cantIds = new Map<string, Set<number>>();
  for (const w of input.perWidth) {
    for (const [reason, ids] of Object.entries(w.lint.cantMeasure)) {
      const s = cantIds.get(reason) ?? new Set<number>();
      ids.forEach((id) => s.add(id));
      cantIds.set(reason, s);
    }
    partialReasons.push(...w.lint.partial);
  }
  const cantMeasure: Record<string, number> = {};
  for (const [reason, ids] of cantIds) cantMeasure[reason] = ids.size;

  const notMeasured = new Set<number>();
  for (const r of ['picture_placeholder', 'picture_loading', 'picture_broken']) for (const id of cantIds.get(r) ?? []) notMeasured.add(id);
  const unsized: UnsizedPicture[] = unsizedPictures(input.elements, notMeasured, input.effective, input.cssRules);

  // Group results by element and kind.
  const groups = new Map<string, { kind: FindingKind; id: number; worst: LintResult; widths: number[]; confidence: Confidence }>();
  for (const w of input.perWidth) {
    for (const r of w.lint.results) {
      const key = `${r.id}|${r.kind}`;
      const g = groups.get(key);
      if (!g) groups.set(key, { kind: r.kind, id: r.id, worst: r, widths: [r.width], confidence: r.confidence });
      else { g.worst = worse(g.kind, g.worst, r); g.widths.push(r.width); g.confidence = lowest(g.confidence, r.confidence); }
    }
  }
  for (const u of unsized) groups.set(`${u.id}|nolimit`, { kind: 'nolimit', id: u.id, worst: { id: u.id, kind: 'media-wide', width: 0, value: 0, limit: 0, confidence: 'low' }, widths: [], confidence: 'low' });

  const findings: Finding[] = [];
  const seen = new Map<string, number>();
  let dropped = 0;
  for (const kind of ORDER) {
    const list = [...groups.values()].filter((g) => g.kind === kind).sort((a, b) => a.id - b.id);
    let made = 0;
    for (const g of list) {
      const el = byEl.get(g.id);
      if (!el) continue;
      if (made >= L.maxPerKind) { dropped++; continue; }
      const skill = scanSkillById(SKILL[kind])!;
      const text = input.effective(el.path) ?? '';
      const lines = text.split('\n');
      const lineText = lines[el.line - 1] ?? '';
      const key = `${SKILL[kind]}:${kind}|${el.path}|${lineText.trim()}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const other = kind === 'overlap' ? byEl.get(g.worst.aux?.[0] ?? -1)?.line : undefined;
      const extra = `${describe(kind, g.worst, other)}${g.widths.length ? `, measured at ${widthsText(g.widths)}` : ''}${kind === 'nolimit' ? '' : LABEL}`;
      findings.push({
        id: makeFindingId(`${SKILL[kind]}:${kind}`, el.path, lineText, k), skillId: skill.id, primary: 'frontend', areas: ['frontend'],
        severity: skill.severity, certainty: skill.certainty, fix: 'guided', path: el.path, firstLine: el.line, lastLine: el.endLine,
        snippet: snippetFor(lines, el.line, el.endLine), extra, confidence: g.confidence,
        measure: { kind, value: g.worst.value, limit: g.worst.limit },
      });
      made++;
    }
  }
  if (dropped > 0) partialReasons.push(`Limit of ${L.maxPerKind} findings for one kind of check reached: ${dropped} more were not listed.`);
  let all = [...overflow.findings, ...findings];
  if (all.length > L.maxLayoutFindings) {
    partialReasons.push(`Layout check limit (${L.maxLayoutFindings}) reached: later findings are missing.`);
    all = all.slice(0, L.maxLayoutFindings);
  }
  return { findings: all, partialReasons: [...new Set(partialReasons)], cantMeasure };
}
