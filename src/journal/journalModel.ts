// @node: F9.5
// The Journal model: overview, flows, lessons from the project, the sorting lesson, and the concepts.
// Built only from fixed templates, playbook cards, and facts; every fact string passes through redact().
import { JOURNAL_LIMITS as L } from '../config/journalLimits';
import { redact } from '../engine/redact';
import type { Finding, ScanResult } from '../engine/scanFindingTypes';
import { allFindings, countsBy } from '../engine/scanView';
import { extOf } from '../engine/sourceScan';
import type { AnalysisResult, FileUnderstanding } from '../engine/understandTypes';
import { applyCorrections } from '../engine/understandingView';
import { PLAYBOOK, cardById, cardsForSkill } from '../skillbook';
import type { Card, Level } from '../skillbook/playbookSchema';
import type { RepoSnapshot } from '../types/contracts';
import { buildFlows, type Flow } from './flows';
import { buildOverview, type OverviewFacts, type OverviewPart } from './overview';
import { readPackageFacts } from './packageFacts';

export interface LessonView {
  lesson: Card;
  instances: Array<{ path: string; firstLine: number; lastLine: number; severity: string; certainty: string; fix: string; extra?: string }>;
  more: number;
}

export interface JournalModel {
  level: Level;
  overview: OverviewPart[];
  flows: Flow[];
  flowsHidden: number;
  lessons: LessonView[];
  concepts: Card[];
  hidden: number;
  notes: string[];
  status: 'ready' | 'analysing' | 'failed' | 'no-snapshot';
}

export interface JournalInput {
  snapshot?: RepoSnapshot;
  analysis?: AnalysisResult;
  analysisStatus: 'idle' | 'running' | 'done' | 'failed';
  corrections: Readonly<Record<string, readonly string[]>>;
  scan?: ScanResult;
  measured: readonly Finding[];
  mode: 'static' | 'workbench' | 'source';
  modeReason: string;
  entryPath?: string;
}

const SEV = { high: 0, medium: 1, low: 2 } as const;
const FIX_WORDS = { auto: 'Auto-supported', guided: 'Guided', explanation: 'Explanation only' } as const;
const DB = ['pg', 'mysql', 'mysql2', 'mongodb', 'mongoose', 'sqlite3', 'redis', 'knex', 'sequelize', 'typeorm', 'drizzle-orm', '@prisma/client'];

export function buildJournal(input: JournalInput, level: Level): JournalModel {
  const base: JournalModel = { level, overview: [], flows: [], flowsHidden: 0, lessons: [], concepts: [], hidden: 0, notes: [], status: 'ready' };
  const concepts = PLAYBOOK.cards.filter((c) => c.kind === 'concept');
  if (!input.snapshot) return { ...base, concepts, status: 'no-snapshot' };
  if (input.analysisStatus !== 'done' || !input.analysis) return { ...base, concepts, status: input.analysisStatus === 'failed' ? 'failed' : 'analysing' };
  const snap = input.snapshot;
  const a = input.analysis;
  let hidden = 0;
  const clean = (t: string) => { const r = redact(t); if (r.count > 0) hidden += r.count; return r.text; };

  const files: FileUnderstanding[] = applyCorrections(a, input.corrections as Record<string, never>);
  const count = (l: string) => files.filter((f) => !f.ignored && f.labels.includes(l as never)).length;
  const extCounts = new Map<string, number>();
  for (const f of files) if (!f.ignored) { const e = extOf(f.path); if (e) extCounts.set(e, (extCounts.get(e) ?? 0) + 1); }
  const pkg = readPackageFacts(snap.files);
  const findings = input.scan ? allFindings(input.scan.findings, input.measured) : [];
  const byArea: Record<string, number> = {};
  const byFix: Record<string, number> = {};
  for (const f of findings) { for (const ar of f.areas) byArea[ar] = (byArea[ar] ?? 0) + 1; byFix[f.fix] = (byFix[f.fix] ?? 0) + 1; }
  const facts: OverviewFacts = {
    name: clean(pkg.name ?? snap.name), source: snap.source, owner: clean(snap.owner), repo: clean(snap.name), ref: clean(snap.ref),
    mode: input.mode, modeReason: input.modeReason, entryPath: input.entryPath,
    extensions: [...extCounts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 5).map(([ext, c]) => ({ ext, count: c })),
    areaCounts: { frontend: count('frontend'), backend: count('backend'), api_data: count('api_data') },
    helperCounts: { assets: count('assets'), tests: count('tests'), settings: count('configuration'), docs: count('documentation') },
    needsReview: files.filter((f) => f.needsReview).length,
    packageScripts: pkg.scripts.map(clean), dependencyCount: pkg.dependencies.length,
    routeFiles: new Set(a.edges.filter((e) => e.kind === 'defines_route').map((e) => e.from)).size,
    externalHosts: [...new Set(a.edges.filter((e) => e.kind === 'calls_external').map((e) => clean(e.target)))].sort(),
    settingNames: [...new Set(a.edges.filter((e) => e.kind === 'reads_config').map((e) => clean(e.target)))].sort(),
    databases: pkg.dependencies.filter((d) => DB.includes(d)),
    routes: a.edges.filter((e) => e.kind === 'defines_route').map((e) => clean(e.target.replace(/^ANY /, ''))).slice(0, L.overviewRoutes),
    inferredCalls: a.edges.filter((e) => e.kind === 'calls_api' && e.certainty === 'inferred').length,
    read: a.coverage.read, pathOnly: a.coverage.pathOnly, ignored: a.coverage.ignored,
    partialReasons: [...a.coverage.partialReasons, ...(input.scan?.partialReasons ?? [])],
    notScanned: a.coverage.notScanned,
    findings: { total: findings.length, bySeverity: countsBy(findings), byArea, byFix, scanned: !!input.scan },
  };
  const overview = buildOverview(facts, level).map((p) => ({ ...p, sentences: p.sentences.map(clean) }));
  const loaded = new Set(snap.files.filter((f) => typeof f.content === 'string').map((f) => f.path));
  const { flows, hidden: flowsHidden } = buildFlows(a.edges, loaded, snap.inventory.entries, input.entryPath, a.coverage.aliasImportsNotFollowed);

  // Lessons from the project
  const bySkill = new Map<string, Finding[]>();
  for (const f of findings) bySkill.set(f.skillId, [...(bySkill.get(f.skillId) ?? []), f]);
  const lessons: LessonView[] = [];
  for (const [skillId, list] of bySkill) {
    const card = cardsForSkill(skillId)[0];
    if (!card) continue;
    const sorted = [...list].sort((x, y) => SEV[x.severity] - SEV[y.severity] || (x.path < y.path ? -1 : x.path > y.path ? 1 : 0) || x.firstLine - y.firstLine);
    lessons.push({
      lesson: card,
      instances: sorted.slice(0, L.instancesPerLesson).map((f) => ({
        path: clean(f.path), firstLine: f.firstLine, lastLine: f.lastLine, severity: f.severity, certainty: f.certainty === 'found' ? 'Found' : 'Possible', fix: FIX_WORDS[f.fix],
        ...(f.extra ? { extra: clean(f.extra) } : {}),
      })),
      more: Math.max(0, list.length - L.instancesPerLesson),
    });
  }
  lessons.sort((x, y) => SEV[x.instances[0]!.severity as keyof typeof SEV] - SEV[y.instances[0]!.severity as keyof typeof SEV] || (x.lesson.id < y.lesson.id ? -1 : 1));
  const review = files.filter((f) => f.needsReview);
  if (review.length > 0) {
    const card = cardById('lesson.sorting.needs-review')!;
    lessons.push({ lesson: card, instances: review.slice(0, L.instancesPerLesson).map((f) => ({ path: clean(f.path), firstLine: 0, lastLine: 0, severity: 'review', certainty: '', fix: '', extra: clean(f.evidence[0]?.description ?? '') })), more: Math.max(0, review.length - L.instancesPerLesson) });
  }
  const notes = [...facts.partialReasons];
  if (hidden > 0) notes.push(`${hidden} values were hidden.`);
  return { level, overview, flows, flowsHidden, lessons, concepts, hidden, notes, status: 'ready' };
}
