// @node: F9.5
// The Journal download (Markdown), at the chosen level, cut at a section boundary above 200 KB.
import { JOURNAL_LIMITS as L } from '../config/journalLimits';
import { describeStep } from '../journal/flows';
import type { JournalModel } from '../journal/journalModel';
import type { RepoSnapshot } from '../types/contracts';
import { cardById } from '../skillbook';
import { redact } from '../engine/redact';
import { NO_LESSONS } from '../journal/journalModel';
import { utf8Bytes } from './patchExport';

const LEVEL_NAMES = { simple: 'Simple', practical: 'Practical', deeper: 'Deeper' } as const;

export function buildJournalMarkdown(j: JournalModel, snap: RepoSnapshot, now?: Date): string {
  const sections: string[][] = [];
  const r = (t: string) => redact(t).text;
  sections.push([`# PatchBay journal: ${r(snap.name)}`, `Repository: ${snap.source} ${r(snap.owner)}/${r(snap.name)} @ ${r(snap.ref)}`, ...(now ? [`Exported: ${now.toISOString()}`] : []), `Level: ${LEVEL_NAMES[j.level]}`, 'Built offline by PatchBay from the files it read. No AI was used.', '']);
  sections.push(['## Application overview', ...j.overview.flatMap((p) => [p.title ? `### ${p.title}` : '', p.sentences.join(' '), '']).filter((x, i, a) => !(x === '' && a[i - 1] === ''))]);
  const flows = ['## How things flow'];
  for (const f of j.flows) {
    flows.push(`### ${f.title}`);
    f.steps.forEach((s, i) => flows.push(`${i + 1}. ${describeStep(s, j.level)}`));
    if (f.stop) flows.push(f.stop);
    for (const n of f.notes) flows.push(n);
    flows.push('');
  }
  if (j.flowsHidden) flows.push(`${j.flowsHidden} more flows are not shown.`, '');
  sections.push(flows);
  const lessons = ['## Lessons from your project'];
  if (j.lessons.length === 0) lessons.push(NO_LESSONS[j.scan], '');
  for (const l of j.lessons) {
    lessons.push(`### ${l.lesson.title}`, l.lesson.levels[j.level], '', 'In your project:');
    for (const i of l.instances) lessons.push(i.firstLine ? `- ${i.path}, lines ${i.firstLine} to ${i.lastLine}: ${i.severity}, ${i.certainty}, ${i.fix}${i.extra ? `. ${i.extra}` : ''}` : `- ${i.path}: ${i.extra ?? ''}`);
    if (l.more) lessons.push(`${l.more} more are listed on the area screen.`);
    lessons.push('');
  }
  sections.push(lessons);
  // R9.1: concept cards are included only when a lesson links to them.
  const linked = [...new Set(j.lessons.flatMap((l) => l.lesson.related))].map((id) => cardById(id)).filter((c) => c?.kind === 'concept');
  if (linked.length) sections.push(['## Related concepts', ...linked.flatMap((c) => [`### ${c!.title}`, c!.levels[j.level], '']), '']);
  sections.push(['## Notes', ...(j.notes.length ? j.notes : ['None.']), '']);
  let out = '';
  let bytes = 0;
  for (const s of sections) {
    const block = s.join('\n') + '\n';
    const size = utf8Bytes(block);
    if (bytes + size > L.journalBytes) { out += 'Shortened to fit.\n'; break; }
    bytes += size;
    out += block;
  }
  return out;
}
