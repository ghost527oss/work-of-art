// @node: F9.9
// Lessons from your project: one block per lesson, its text at the level, and "In your project" with Open in viewer.
import { NO_LESSONS, type JournalModel, type LessonView } from '../journal/journalModel';
import type { Level } from '../skillbook/playbookSchema';
import { Fold } from './Fold';

const SEV_WORDS: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const lessonDomId = (id: string) => `lesson-${id.replace(/[^a-z0-9-]/gi, '-')}`;

export interface LessonsSectionProps {
  lessons: readonly LessonView[];
  level: Level;
  scan: JournalModel['scan'];
  focus?: string;
  onOpenViewer(path: string, line: number): void;
}

export function LessonsSection({ lessons, level, scan, focus, onOpenViewer }: LessonsSectionProps) {
  if (lessons.length === 0) return <p>{NO_LESSONS[scan]}</p>;
  return (
    <div className="journal-lessons">
      {lessons.map((l) => (
        <Fold key={l.lesson.id} id={lessonDomId(l.lesson.id)} title={l.lesson.title} heading="h4" initialOpen={focus === l.lesson.id} force={focus === l.lesson.id}>
          <p>{l.lesson.levels[level]}</p>
          <p><strong>{l.lesson.kind === 'sorting' ? 'Files that need review:' : 'In your project:'}</strong></p>
          <ul>
            {l.instances.map((i, n) => (
              <li key={n}>
                <code>{i.path}</code>
                {i.firstLine > 0
                  ? <>, {i.firstLine === i.lastLine ? `line ${i.firstLine}` : `lines ${i.firstLine} to ${i.lastLine}`}: {SEV_WORDS[i.severity] ?? i.severity}, {i.certainty}, {i.fix}{i.extra ? `. ${i.extra}` : ''}{' '}
                      <button type="button" onClick={() => onOpenViewer(i.path, i.firstLine)}>Open in viewer</button></>
                  : <>: {i.extra}</>}
              </li>
            ))}
          </ul>
          {l.more > 0 && <p className="note">{l.more} more are listed on the area screen.</p>}
        </Fold>
      ))}
    </div>
  );
}
