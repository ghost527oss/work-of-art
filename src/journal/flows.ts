// @node: F9.4
// Flow traces built from the 2C connections. They stop honestly with fixed sentences. Deterministic and pure.
import { JOURNAL_LIMITS as L } from '../config/journalLimits';
import type { Level } from '../skillbook/playbookSchema';
import type { RepoInventoryEntry } from '../types/contracts';
import type { Certainty, Edge } from '../engine/understandTypes';

export interface FlowStep { path?: string; line?: number; certainty?: Certainty; kind: string; label: string; target?: string; note?: string }
export interface Flow { id: string; kind: 'page' | 'request' | 'route' | 'setting'; title: string; steps: FlowStep[]; stop?: string; notes: string[] }

export const STOPS = {
  broken: 'Stopped: no route matches this address (Broken).',
  outside: (host: string) => `Stopped: this goes to an outside service (${host}), which PatchBay does not follow.`,
  notLoaded: (p: string, r: string) => `Stopped: ${p} was not loaded (${r}).`,
  deep: 'Stopped: this goes more than 3 files deep, so PatchBay did not follow further.',
  noRoutes: 'Stopped: no backend routes were found in this repository; the route may live elsewhere.',
  noCaller: 'Nothing in the loaded files calls this route.',
  end: 'End of the trace: no more loaded files are used.',
} as const;

const cmp = (a: Edge, b: Edge) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.line - b.line);

export function buildFlows(edges: readonly Edge[], loaded: ReadonlySet<string>, inventory: readonly RepoInventoryEntry[], entryPath?: string, aliasCount = 0): { flows: Flow[]; hidden: number } {
  const byFrom = new Map<string, Edge[]>();
  for (const e of [...edges].sort(cmp)) byFrom.set(e.from, [...(byFrom.get(e.from) ?? []), e]);
  const reasonOf = (p: string) => inventory.find((e) => e.path === p)?.reason ?? 'not loaded';
  const all: Flow[] = [];

  // pages
  const pages = [...new Set([...(entryPath ? [entryPath] : []), ...[...byFrom.keys()].filter((p) => /\.html?$/i.test(p)).sort()])].slice(0, L.pageFlows);
  for (const page of pages) {
    const steps: FlowStep[] = [{ path: page, kind: 'page', label: 'page' }];
    for (const e of byFrom.get(page) ?? []) {
      if (e.kind !== 'loads') continue;
      steps.push({ path: page, line: e.line, certainty: e.certainty, kind: 'loads', label: 'loads', target: e.targetPath ?? e.target });
      if (e.targetPath) for (const c of byFrom.get(e.targetPath) ?? []) if (c.kind === 'calls_api' || c.kind === 'calls_external') steps.push({ path: e.targetPath, line: c.line, certainty: c.certainty, kind: c.kind, label: c.kind === 'calls_api' ? 'request' : 'outside', target: c.target });
    }
    all.push({ id: `page:${page}`, kind: 'page', title: `Page: ${page}`, steps: steps.slice(0, L.stepsPerFlow), notes: [] });
  }

  // requests
  const calls = [...edges].filter((e) => e.kind === 'calls_api' || e.kind === 'calls_external').sort(cmp).slice(0, L.requestFlows);
  const routeEdges = edges.filter((e) => e.kind === 'defines_route');
  const calledRoutes = new Set<string>();
  for (const c of calls) {
    const steps: FlowStep[] = [{ path: c.from, line: c.line, certainty: c.certainty, kind: 'request', label: 'request', target: c.target }];
    let stop: string | undefined;
    const notes: string[] = [];
    if (c.kind === 'calls_external') stop = STOPS.outside(c.target);
    else if (c.certainty === 'broken') stop = STOPS.broken;
    else if (!c.targetPath) stop = c.note?.startsWith('No backend routes') ? STOPS.noRoutes : STOPS.notLoaded(c.target, 'not found in the loaded files');
    else {
      const route = routeEdges.find((r) => r.from === c.targetPath && r.target.split(' ')[1] === c.target.split(' ')[1]) ?? routeEdges.find((r) => r.from === c.targetPath);
      if (route) calledRoutes.add(route.id);
      steps.push({ path: c.targetPath, line: route?.line, certainty: c.certainty, kind: 'route', label: 'route', target: route?.target ?? c.target, note: route?.note });
      // breadth-first over the route file's imports
      const seen = new Set<string>([c.targetPath]);
      let frontier = [c.targetPath];
      let files = 0;
      for (let level = 1; level <= L.requestFlowLevels && frontier.length && !stop; level++) {
        const next: string[] = [];
        for (const f of frontier) {
          for (const imp of byFrom.get(f) ?? []) {
            if (imp.kind !== 'imports') continue;
            const t = imp.targetPath ?? imp.target;
            if (seen.has(t)) continue;
            seen.add(t);
            if (files >= L.requestFlowFiles) { stop = STOPS.deep; break; }
            files++;
            steps.push({ path: t, line: imp.line, certainty: imp.certainty, kind: 'uses', label: 'uses', target: f });
            if (!loaded.has(t)) { stop = STOPS.notLoaded(t, reasonOf(t)); break; }
            next.push(t);
          }
          if (stop) break;
        }
        frontier = next;
        if (level === L.requestFlowLevels && next.some((p) => (byFrom.get(p) ?? []).some((e) => e.kind === 'imports'))) stop = stop ?? STOPS.deep;
      }
      stop = stop ?? STOPS.end;
    }
    if (aliasCount > 0) notes.push(`${aliasCount} imports that use shortcuts such as @/ were not followed.`);
    all.push({ id: `request:${c.id}`, kind: 'request', title: `Request: ${c.target}`, steps: steps.slice(0, L.stepsPerFlow), stop, notes });
  }

  // routes with no caller
  for (const r of routeEdges.filter((r) => !calledRoutes.has(r.id) && !calls.some((c) => c.targetPath === r.from)).sort(cmp)) {
    all.push({ id: `route:${r.id}`, kind: 'route', title: `Route: ${r.target}`, steps: [{ path: r.from, line: r.line, certainty: r.certainty, kind: 'route', label: 'route', target: r.target, note: r.note }], stop: STOPS.noCaller, notes: [] });
  }

  // settings
  const names = [...new Set(edges.filter((e) => e.kind === 'reads_config').map((e) => e.target))].sort().slice(0, L.settingFlows);
  for (const name of names) {
    const steps = edges.filter((e) => e.kind === 'reads_config' && e.target === name).sort(cmp).map((e) => ({ path: e.from, line: e.line, certainty: e.certainty, kind: 'setting', label: 'reads', target: name }));
    all.push({ id: `setting:${name}`, kind: 'setting', title: `Setting: ${name}`, steps: steps.slice(0, L.stepsPerFlow), notes: ['The value is never shown.'] });
  }
  return { flows: all.slice(0, L.maxFlows), hidden: Math.max(0, all.length - L.maxFlows) };
}

const CERT: Record<Certainty, string> = { confirmed: 'Confirmed', inferred: 'Inferred', broken: 'Broken' };

/** One sentence per step, at the chosen level. Certainty is in words at every level. */
export function describeStep(step: FlowStep, level: Level): string {
  const where = step.path ? (step.line && level !== 'simple' ? `${step.path}, line ${step.line},` : step.path) : '';
  const cert = step.certainty ? ` (${CERT[step.certainty]})` : '';
  const verb = (t?: string) => (t ? t.split(' ')[0]!.toLowerCase() : 'send');
  switch (step.kind) {
    case 'page': return `${step.path} is the page.`;
    case 'loads': return level === 'simple' ? `${step.path} loads ${step.target}.${cert}` : `${where} loads ${step.target}.${cert}`;
    case 'request': return level === 'simple' ? `${step.path} asks the server to ${verb(step.target) === 'get' ? 'send' : verb(step.target)} something.${cert}` : `${where} sends ${step.target}.${cert}`;
    case 'outside': return level === 'simple' ? `${step.path} contacts an outside service.${cert}` : `${where} contacts ${step.target}.${cert}`;
    case 'route': return level === 'simple' ? `${step.path} answers it.${cert}` : `${where} handles ${step.target}.${step.note && step.note.startsWith('mounted at') ? ` It is ${step.note.replace(/:(\d+)$/, ', line $1')}.` : ''}${cert}`;
    case 'uses': return level === 'simple' ? `It uses ${step.path}.${cert}` : `It uses ${step.path}. (line ${step.line}${step.certainty ? `, ${CERT[step.certainty]}` : ''})`;
    case 'setting': return level === 'simple' ? `${step.path} reads the setting ${step.target}.` : `${where} reads the setting ${step.target}.${cert}`;
    default: return `${where}${cert}`;
  }
}
