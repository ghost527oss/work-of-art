// @node: F6.5
// Pure view helpers for Screens 4 and 5.
import { SKILLBOOK } from '../skillbook';
import { AREAS, type AreaId } from '../store/shellView';
import type { StudioState } from '../store/useStudioStore';
import { isActive } from '../store/workSlice';
import { labelsKeyOf } from './scanProject';
import type { Finding, ScanResult, Severity } from './scanFindingTypes';
import type { AnalysisResult, FileUnderstanding } from './understandTypes';

const SEV: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Text findings from the scan plus measured findings from the layout check, in the same order the scan uses. */
export function allFindings(scan: readonly Finding[], measured: readonly Finding[]): Finding[] {
  if (measured.length === 0) return scan as Finding[];
  return [...scan, ...measured].sort((a, b) => SEV[a.severity] - SEV[b.severity] || (a.path === b.path ? 0 : a.path < b.path ? -1 : 1) || a.firstLine - b.firstLine || (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0));
}

export function mergedFindings(state: StudioState): Finding[] {
  return allFindings(state.scan.result?.findings ?? [], state.preview.layout.status === 'done' ? state.preview.layout.findings : []);
}

export function countsBy(findings: readonly Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

/** A finding counts in every area it belongs to. `unique` counts it once. */
export function areaCounts(findings: readonly Finding[]): { byArea: Record<AreaId, Record<Severity, number>>; unique: number } {
  const byArea = Object.fromEntries(AREAS.map((a) => [a.id, { high: 0, medium: 0, low: 0 }])) as Record<AreaId, Record<Severity, number>>;
  for (const f of findings) for (const a of f.areas) byArea[a][f.severity]++;
  return { byArea, unique: findings.length };
}

export function findingsForArea(findings: readonly Finding[], area: AreaId): Finding[] {
  return findings.filter((f) => f.areas.includes(area));
}

export interface FindingFilter { severity?: Severity | 'all'; skillId?: string | 'all'; text?: string }

export function filterFindings(findings: readonly Finding[], f: FindingFilter): Finding[] {
  const t = (f.text ?? '').trim().toLowerCase();
  return findings.filter((x) => (!f.severity || f.severity === 'all' || x.severity === f.severity) && (!f.skillId || f.skillId === 'all' || x.skillId === f.skillId) && (!t || x.path.toLowerCase().includes(t)));
}

/** Real links between areas, counted from the connection map. */
export function linksBetweenAreas(analysis: AnalysisResult, files: readonly FileUnderstanding[]): Array<{ from: AreaId; to: AreaId; count: number }> {
  const areaOf = new Map<string, AreaId>();
  for (const f of files) {
    const a = f.labels.find((l) => l === 'frontend' || l === 'backend' || l === 'api_data');
    if (a) areaOf.set(f.path, a as AreaId);
  }
  const counts = new Map<string, number>();
  for (const e of analysis.edges) {
    if (!e.targetPath || e.certainty === 'broken') continue;
    const from = areaOf.get(e.from);
    const to = areaOf.get(e.targetPath);
    if (from && to && from !== to) counts.set(`${from}>${to}`, (counts.get(`${from}>${to}`) ?? 0) + 1);
  }
  return [...counts.entries()].sort().map(([k, count]) => { const [from, to] = k.split('>') as [AreaId, AreaId]; return { from, to, count }; });
}

export const CREW_START_REFUSALS = {
  noSnapshot: 'Load a repository first.',
  noScan: 'Open Skeleton Crew and wait for the scan first.',
  stale: 'Scan again first: your labels changed.',
  active: 'A run is already active. Type stop first.',
  closeEdit: 'Close the Edit panel first.',
} as const;

/** The one rule set used by both `start crew` and the Start Crew button. */
export function crewStartState(state: StudioState, selfEditing: boolean): { enabled: boolean; reason: string | null } {
  if (!state.snapshot) return { enabled: false, reason: CREW_START_REFUSALS.noSnapshot };
  if (isActive(state.work.run)) return { enabled: false, reason: CREW_START_REFUSALS.active };
  if (selfEditing) return { enabled: false, reason: CREW_START_REFUSALS.closeEdit };
  if (state.scan.status !== 'done' || !state.scan.result) return { enabled: false, reason: CREW_START_REFUSALS.noScan };
  if (state.scan.result.labelsKey !== labelsKeyOf(state.understanding.corrections)) return { enabled: false, reason: CREW_START_REFUSALS.stale };
  return { enabled: true, reason: null };
}

export type WorkerStatus = string;

export function workerSlots(state: StudioState): Array<{ area: AreaId; name: string; status: WorkerStatus }> {
  const run = state.work.run;
  const findings = mergedFindings(state);
  const crew = run && run.kind === 'crew' ? run : null;
  const lastStep = crew ? crew.steps[crew.position - 1] : undefined;
  const activeArea: AreaId | undefined = lastStep?.area;
  return AREAS.map(({ id, label }) => {
    const mine = findings.filter((f) => f.primary === id).length;
    if (!crew) return { area: id, name: `${label} crew`, status: 'Waiting' };
    const idx = crew.steps.findIndex((s) => s.kind === 'area' && s.area === id);
    const nextIdx = crew.steps.findIndex((s, i) => i > idx && s.kind === 'area');
    const end = nextIdx === -1 ? crew.steps.length - 1 : nextIdx;
    if (crew.position > end && (crew.status === 'finished' || crew.position > end)) return { area: id, name: `${label} crew`, status: mine > 12 ? `Done: 12 of ${mine} narrated` : `Done: ${mine} findings` };
    if (activeArea === id && crew.status === 'awaiting_decision') return { area: id, name: `${label} crew`, status: 'Waiting for your decision' };
    if (activeArea === id && (crew.status === 'paused' || crew.status === 'stopped')) return { area: id, name: `${label} crew`, status: crew.status === 'paused' ? 'Paused' : 'Waiting' };
    if (activeArea === id && lastStep) return { area: id, name: `${label} crew`, status: `Checking ${lastStep.title}` };
    return { area: id, name: `${label} crew`, status: 'Waiting' };
  });
}

const CODE_NOT_CHECKED: Record<string, string> = {
  too_large: 'Too large for the code checks',
  minified: 'Minified file, not read by the JavaScript check',
  template: 'Template syntax found, so that part of the code checks was skipped',
  no_checker: 'The JavaScript reader could not be loaded, so JavaScript was not checked',
  no_probe: 'This browser could not check CSS rules, so "Possible invalid CSS" was not checked',
  too_many_scripts: 'More than 20 inline scripts, so the later ones were not checked',
  jsx: 'React code (JSX) inside a .js file, which the plain JavaScript reader cannot read',
};

export function whatWasChecked(result: ScanResult): {
  filesScanned: number; filesNotRead: number; checks: Array<{ id: string; title: string; area: AreaId; fix: string }>;
  notChecked: Array<[string, number]>; notCheckedLines: string[]; couldNotCheck: number; codeNotCheckedLines: string[];
} {
  return {
    filesScanned: result.coverage.filesScanned,
    filesNotRead: result.coverage.filesNotRead,
    checks: SKILLBOOK.scan.map((s) => ({ id: s.id, title: s.title, area: s.primary, fix: s.fix === 'auto' ? 'Auto-supported' : s.fix === 'guided' ? 'Guided' : 'Explanation only' })),
    notChecked: Object.entries(result.coverage.notChecked).sort(),
    notCheckedLines: ['Layout overflow: measured in the preview (look-only mode, static pages only).', 'Data shapes are not checked.', 'Imported code is never run.'],
    couldNotCheck: result.coverage.couldNotCheck.length,
    codeNotCheckedLines: Object.entries(result.coverage.codeNotChecked ?? {}).sort().map(([why, n]) => `${CODE_NOT_CHECKED[why] ?? why}: ${n} file${n === 1 ? '' : 's'}.`),
  };
}
