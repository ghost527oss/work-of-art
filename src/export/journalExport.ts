// @node: F9.5
// The Journal download (Markdown), at the chosen level, cut at a section boundary above 200 KB.
import { JOURNAL_LIMITS as L } from '../config/journalLimits';
import { describeStep } from '../journal/flows';
import type { JournalModel } from '../journal/journalModel';
import type { RepoSnapshot } from '../types/contracts';

const LEVEL_NAMES = { simple: 'Simple', practical: 'Practical', deeper: 'Deeper' } as const;

export function buildJournalMarkdown(j: JournalModel, snap: RepoSnapshot): string {
  const sections: string[][] = [];
  sections.push([`# PatchBay journal: ${snap.name}`, `Repository: ${snap.source} ${snap.owner}/${snap.name} @ ${snap.ref}`, `Level: ${LEVEL_NAMES[j.level]}`, 'Built offline by PatchBay from the files it read. No AI was used.', '']);
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
  if (j.lessons.length === 0) lessons.push('No lessons: the checks that ran found nothing to look at.', '');
  for (const l of j.lessons) {
    lessons.push(`### ${l.lesson.title}`, l.lesson.levels[j.level], '', 'In your project:');
    for (const i of l.instances) lessons.push(i.firstLine ? `- ${i.path}, lines ${i.firstLine} to ${i.lastLine}: ${i.severity}, ${i.certainty}, ${i.fix}${i.extra ? `. ${i.extra}` : ''}` : `- ${i.path}: ${i.extra ?? ''}`);
    if (l.more) lessons.push(`${l.more} more are listed on the area screen.`);
    lessons.push('');
  }
  sections.push(lessons);
  sections.push(['## Notes', ...(j.notes.length ? j.notes : ['None.']), '']);
  let out = '';
  for (const s of sections) {
    const block = s.join('\n') + '\n';
    if (out.length + block.length > L.journalBytes) { out += 'Shortened to fit.\n'; break; }
    out += block;
  }
  return out;
}
