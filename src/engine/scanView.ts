// @node: F6.5
// Pure view helpers for Screens 4 and 5.
import { SKILLBOOK } from '../skillbook';
import { AREAS, type AreaId } from '../store/shellView';
import type { StudioState } from '../store/useStudioStore';
import { isActive } from '../store/workSlice';
import { labelsKeyOf } from './scanProject';
import type { Finding, ScanResult, Severity } from './scanFindingTypes';
import type { AnalysisResult, FileUnderstanding } from './understandTypes';

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
  const findings = state.scan.result?.findings ?? [];
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

export function whatWasChecked(result: ScanResult): {
  filesScanned: number; filesNotRead: number; checks: Array<{ id: string; title: string; area: AreaId; fix: string }>;
  notChecked: Array<[string, number]>; notCheckedLines: string[]; couldNotCheck: number;
} {
  return {
    filesScanned: result.coverage.filesScanned,
    filesNotRead: result.coverage.filesNotRead,
    checks: SKILLBOOK.scan.map((s) => ({ id: s.id, title: s.title, area: s.primary, fix: s.fix === 'auto' ? 'Auto-supported' : s.fix === 'guided' ? 'Guided' : 'Explanation only' })),
    notChecked: Object.entries(result.coverage.notChecked).sort(),
    notCheckedLines: ['Layout overflow is not checked (it arrives in sub-phase 2E).', 'Data shapes are not checked.', 'Imported code is never run.'],
    couldNotCheck: result.coverage.couldNotCheck.length,
  };
}
