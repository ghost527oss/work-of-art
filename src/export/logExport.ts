// @node: F9.8
// The Log exports (Markdown and JSON). Every string passes through redact(). No snippet, diff body, value, or content.
import { redact } from '../engine/redact';
import type { StudioState } from '../store/useStudioStore';
import { mergedFindings, countsBy, areaCounts } from '../engine/scanView';

function cleaner() {
  let hidden = 0;
  const c = (t: string) => { const r = redact(t); hidden += r.count; return r.text; };
  return { c, hidden: () => hidden };
}

const cell = (t: string) => t.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function summaryOf(s: StudioState) {
  const cov = s.understanding.result?.coverage;
  const findings = mergedFindings(s);
  const sev = countsBy(findings);
  const area = areaCounts(findings).byArea;
  return {
    filesRead: cov?.read ?? 0, pathOnly: cov?.pathOnly ?? 0, ignored: cov?.ignored ?? 0,
    findings: s.scan.status === 'done' ? { total: findings.length, high: sev.high, medium: sev.medium, low: sev.low, frontend: area.frontend.high + area.frontend.medium + area.frontend.low, backend: area.backend.high + area.backend.medium + area.backend.low, security: area.security.high + area.security.medium + area.security.low, api_data: area.api_data.high + area.api_data.medium + area.api_data.low, partial: !!s.scan.result?.partial } : null,
    changesApplied: s.work.applied.length, changesUndone: s.work.undone.length, previewOnly: s.edit.previewOnly.length,
  };
}

export function buildLogMarkdown(s: StudioState, now: Date): string {
  const snap = s.snapshot!;
  const { c, hidden } = cleaner();
  const sum = summaryOf(s);
  const out: string[] = [
    `# PatchBay session log: ${c(snap.name)}`, `Repository: ${snap.source} ${c(snap.owner)}/${c(snap.name)} @ ${c(snap.ref)}`, `Exported: ${now.toISOString()}`, '', '## Summary',
    `- Files read: ${sum.filesRead}. Sorted by path only: ${sum.pathOnly}. Left out on purpose: ${sum.ignored}.`,
    sum.findings ? `- Findings: ${sum.findings.total} (High ${sum.findings.high}, Medium ${sum.findings.medium}, Low ${sum.findings.low}). Scan: ${sum.findings.partial ? 'partial' : 'done'}.` : '- Findings: not scanned. Scan: not run.',
    `- Changes applied: ${sum.changesApplied}. Undone: ${sum.changesUndone}. Preview-only changes: ${sum.previewOnly}.`, '', '## Changes',
  ];
  const changes = [...s.work.applied.map((e) => ({ e, state: 'applied' })), ...s.work.undone.map((e) => ({ e, state: 'undone' }))];
  if (changes.length === 0) out.push('No changes.');
  else { out.push('| Time | State | Title | File |', '| --- | --- | --- | --- |'); for (const { e, state } of changes) out.push(`| ${new Date(e.at).toISOString()} | ${state} | ${cell(c(e.title))} | ${cell(c(e.path))} |`); }
  out.push('', '## Log', '| Time | Action | Status | Message | Files |', '| --- | --- | --- | --- | --- |');
  for (const e of s.log.slice(-500)) out.push(`| ${new Date(e.timestamp).toISOString()} | ${cell(c(e.action))} | ${e.status} | ${cell(c(e.message))} | ${cell(e.affectedPaths.map(c).join(', '))} |`);
  if (hidden() > 0) out.push('', `${hidden()} values were hidden.`);
  return out.join('\n') + '\n';
}

export function buildLogJson(s: StudioState, now: Date): string {
  const snap = s.snapshot!;
  const { c, hidden } = cleaner();
  const obj: Record<string, unknown> = {
    version: 1, exportedAt: now.toISOString(),
    repository: { source: snap.source, owner: c(snap.owner), name: c(snap.name), ref: c(snap.ref) },
    summary: summaryOf(s),
    changes: [...s.work.applied.map((e) => ({ e, state: 'applied' })), ...s.work.undone.map((e) => ({ e, state: 'undone' }))].map(({ e, state }) => ({ id: e.id, title: c(e.title), path: c(e.path), at: e.at, state })),
    log: s.log.slice(-500).map((e) => ({ id: e.id, timestamp: e.timestamp, action: c(e.action), status: e.status, affectedPaths: e.affectedPaths.map(c), message: c(e.message) })),
  };
  if (hidden() > 0) obj.note = `${hidden()} values were hidden.`;
  return JSON.stringify(obj, null, 2) + '\n';
}
