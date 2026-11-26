// @node: F9.9
// The 12 concept cards, each expandable, with "Related:" buttons that open the other card.
import { cardById } from '../skillbook';
import type { Card, Level } from '../skillbook/playbookSchema';
import { Fold } from './Fold';
import { lessonDomId } from './LessonsSection';

export interface ConceptsSectionProps {
  concepts: readonly Card[];
  level: Level;
  focus?: string;
  onRelated(id: string): void;
}

export function ConceptsSection({ concepts, level, focus, onRelated }: ConceptsSectionProps) {
  return (
    <div className="journal-concepts">
      {concepts.map((c) => (
        <Fold key={c.id} id={lessonDomId(c.id)} title={c.title} heading="h4" initialOpen={focus === c.id} force={focus === c.id}>
          <p>{c.levels[level]}</p>
          {c.related.length > 0 && (
            <p>
              Related:{' '}
              {c.related.map((r) => {
                const card = cardById(r);
                return card ? <button key={r} type="button" className="link-button" onClick={() => onRelated(r)}>{card.title}</button> : null;
              })}
            </p>
          )}
        </Fold>
      ))}
    </div>
  );
}
