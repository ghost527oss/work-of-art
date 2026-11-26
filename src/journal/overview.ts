// @node: F9.3
// The application overview: fixed templates at three levels, filled only with paths, counts, names, and certainty words.
import type { Level } from '../skillbook/playbookSchema';

export interface OverviewFacts {
  name: string; source: 'github' | 'sample'; owner: string; repo: string; ref: string;
  mode: 'static' | 'workbench' | 'source'; modeReason: string; entryPath?: string;
  extensions: Array<{ ext: string; count: number }>;
  areaCounts: { frontend: number; backend: number; api_data: number };
  helperCounts: { assets: number; tests: number; settings: number; docs: number };
  needsReview: number;
  packageScripts: string[]; dependencyCount: number; routeFiles: number;
  externalHosts: string[]; settingNames: string[]; databases: string[]; routes: string[]; inferredCalls: number;
  read: number; pathOnly: number; ignored: number; partialReasons: string[]; notScanned: Record<string, number>;
  findings: { total: number; bySeverity: { high: number; medium: number; low: number }; byArea: Record<string, number>; byFix: Record<string, number>; scanned: boolean };
}

export interface OverviewPart { id: string; title: string; sentences: string[] }

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
void cap;
const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function kind(f: OverviewFacts): string {
  if (f.mode === 'static') return 'a small website';
  if (f.mode === 'workbench') return 'an app built from screen pieces';
  return f.areaCounts.backend > 0 ? 'a server or a library' : 'a project without a web page';
}

function origin(f: OverviewFacts): string {
  return f.source === 'sample' ? `It came from PatchBay's ${f.repo === 'static-site' ? 'Static site' : f.repo === 'react-frontend' ? 'React frontend' : f.repo === 'fullstack-api' ? 'Full-stack API' : f.repo} sample.` : `It came from GitHub: ${f.owner}/${f.repo} at ${f.ref}.`;
}

export function buildOverview(f: OverviewFacts, level: Level): OverviewPart[] {
  const parts: OverviewPart[] = [];
  const add = (id: string, title: string, s: string[]) => { if (s.length) parts.push({ id, title, sentences: s }); };
  const deeper = level === 'deeper';
  const practical = level !== 'simple';

  // What this project is
  const what = [`This looks like ${kind(f)}.`, origin(f)];
  if (practical) what.push(`PatchBay shows it this way because: ${f.modeReason}`);
  if (deeper) what.push(f.mode === 'workbench' ? 'The preview is an approximate picture read from the source; nothing is run.' : f.mode === 'static' ? 'The preview shows the page with scripts off, built only from the loaded files.' : 'There is no page to show, so the Sandbox lists the files instead.');
  add('what', 'What this project is', what);

  // What it is made of
  const made: string[] = [];
  const front = f.areaCounts.frontend;
  const biggest = [['web page, style, and script files', front], ['server files', f.areaCounts.backend], ['data and request files', f.areaCounts.api_data]].sort((a, b) => (b[1] as number) - (a[1] as number))[0]!;
  if ((biggest[1] as number) > 0) made.push(`Most of it is ${biggest[0]}: ${biggest[1]} of them.`);
  const helpers = [f.helperCounts.assets ? n(f.helperCounts.assets, 'picture file') : '', f.helperCounts.docs ? n(f.helperCounts.docs, 'document file') : '', f.helperCounts.tests ? n(f.helperCounts.tests, 'test file') : '', f.helperCounts.settings ? n(f.helperCounts.settings, 'settings file') : ''].filter(Boolean);
  if (helpers.length) made.push(`It also has ${list(helpers)}.`);
  if (practical && f.extensions.length) made.push(`The most common file types are ${list(f.extensions.map((e) => `.${e.ext} (${e.count})`))}.`);
  if (practical) made.push(`By area: Frontend ${front}, Backend ${f.areaCounts.backend}, APIs & Data ${f.areaCounts.api_data}.`);
  if (deeper) made.push(f.needsReview > 0 ? `${n(f.needsReview, 'file')} need review; your label corrections change these counts.` : 'No file needs review.');
  add('made', 'What it is made of', made);

  // How it starts
  const starts: string[] = [];
  if (f.entryPath) starts.push(`The main page is ${f.entryPath}.`);
  if (practical && f.packageScripts.length) starts.push(`The package file lists these scripts: ${list(f.packageScripts)}.`);
  if (deeper && f.routeFiles > 0) starts.push(`${n(f.routeFiles, 'file')} define routes, found in the code or from where the files sit.`);
  add('starts', 'How it starts', starts);

  // What it talks to
  const talks: string[] = [];
  if (f.externalHosts.length === 0 && f.routes.length === 0) talks.push('PatchBay did not see it talking to any other service.');
  else {
    if (f.externalHosts.length) talks.push(level === 'simple' ? `It contacts ${n(f.externalHosts.length, 'outside service')}.` : `It contacts ${list(f.externalHosts)}.`);
    if (f.routes.length) talks.push(level === 'simple' ? `It answers ${n(f.routes.length, 'server address', 'server addresses')}.` : `Its routes include ${list(f.routes)}.`);
  }
  if (practical && f.settingNames.length) talks.push(`It reads these settings by name: ${list(f.settingNames)}. Their values are never shown.`);
  if (deeper && f.databases.length) talks.push(`It uses database libraries: ${list(f.databases)}.`);
  if (practical && f.inferredCalls > 0) talks.push(`${n(f.inferredCalls, 'request')} probably go${f.inferredCalls === 1 ? 'es' : ''} to a server PatchBay could not see.`);
  add('talks', 'What it talks to', talks);

  // What PatchBay read
  const read = [`PatchBay read ${n(f.read, 'file')}.`];
  const notRead = f.pathOnly ? `${n(f.pathOnly, 'file')} ${f.pathOnly === 1 ? 'was' : 'were'} not read` : '';
  const left = f.ignored ? `${n(f.ignored, 'file')} ${f.ignored === 1 ? 'was' : 'were'} left out on purpose` : '';
  if (notRead || left) read[0] += ` ${[notRead, left].filter(Boolean).join(', and ')}.`;
  if (practical) for (const r of f.partialReasons) read.push(r);
  if (deeper) { const ns = Object.entries(f.notScanned); if (ns.length) read.push(`Connections were not scanned for ${list(ns.map(([e, c]) => `.${e} (${c})`))}.`); }
  add('read', 'What PatchBay read', read);

  // What PatchBay found
  const found: string[] = [];
  if (!f.findings.scanned) found.push('The checks have not run yet. Open Skeleton Crew to run them.');
  else {
    found.push(f.findings.total === 0 ? 'The checks that ran found nothing to look at.' : `PatchBay found ${n(f.findings.total, 'thing')} to look at. The lessons below explain ${f.findings.total === 1 ? 'it' : 'them'}.`);
    if (practical && f.findings.total > 0) found.push(`By severity: High ${f.findings.bySeverity.high}, Medium ${f.findings.bySeverity.medium}, Low ${f.findings.bySeverity.low}.`);
    if (deeper && f.findings.total > 0) found.push(`By fix: ${Object.entries(f.findings.byFix).map(([k, v]) => `${k === 'auto' ? 'Auto-supported' : k === 'guided' ? 'Guided' : 'Explanation only'} ${v}`).join(', ')}.`);
  }
  add('found', 'What PatchBay found', found);

  parts.push({ id: 'closing', title: '', sentences: [level === 'simple' ? 'PatchBay describes only the files it read.' : 'This overview describes only the files PatchBay read.'] });
  return parts;
}
