// @node: F9.9
// The Journal panel: title, intro line, level picker, and the five collapsible blocks. Props only.
import { useEffect } from 'react';
import type { JournalModel } from '../journal/journalModel';
import type { Level } from '../skillbook/playbookSchema';
import { ConceptsSection } from './ConceptsSection';
import { FlowsSection } from './FlowsSection';
import { Fold } from './Fold';
import { JournalDownload } from './JournalDownload';
import { LessonsSection, lessonDomId } from './LessonsSection';
import { LevelPicker } from './LevelPicker';
import { OverviewSection } from './OverviewSection';

export interface JournalPanelProps {
  model: JournalModel;
  onLevel(level: Level): void;
  /** The lesson or concept to open and scroll to (from Learn more or Related). */
  focus?: string;
  onFocus(id: string): void;
  onFocusDone(): void;
  onOpenViewer(path: string, line: number): void;
  onDownload(): string | false;
  analysisError?: string;
  onRetry?(): void;
}

export function JournalPanel({ model, onLevel, focus, onFocus, onFocusDone, onOpenViewer, onDownload, analysisError, onRetry }: JournalPanelProps) {
  const lessonFocus = focus && model.lessons.some((l) => l.lesson.id === focus) ? focus : undefined;
  const conceptFocus = focus && model.concepts.some((c) => c.id === focus) ? focus : undefined;

  useEffect(() => {
    // Keep the request until the Journal is built, so Learn more during analysis still lands on the lesson.
    if (!focus || model.status !== 'ready') return undefined;
    // Wait one frame so the forced-open blocks are in the page, then scroll and hand focus to the lesson.
    const t = setTimeout(() => {
      const el = typeof document !== 'undefined' ? document.getElementById(lessonDomId(focus)) : null;
      if (el) { el.scrollIntoView({ block: 'start' }); el.querySelector<HTMLElement>('summary')?.focus(); }
      onFocusDone();
    }, 0);
    return () => clearTimeout(t);
  }, [focus, onFocusDone, model.status]);

  return (
    <section aria-labelledby="journal-heading" className="journal-panel">
      <h2 id="journal-heading">Journal</h2>
      <p>The Journal explains how your project works and what PatchBay found. The Log shows what PatchBay did.</p>
      <LevelPicker level={model.level} onLevel={onLevel} />
      {model.status === 'analysing' && <p role="status">Building the Journal...</p>}
      {model.status === 'no-snapshot' && <p>Load a project to build the Journal.</p>}
      {model.status === 'failed' && (
        <p role="alert">
          The project analysis is not ready, so the Journal cannot be built.{analysisError ? ` Reason: ${analysisError}` : ''}{' '}
          {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
        </p>
      )}
      {model.status === 'ready' && (
        <>
          <Fold title="Application overview" initialOpen>
            <OverviewSection parts={model.overview} />
          </Fold>
          <Fold title="How things flow" initialOpen={false}>
            <FlowsSection flows={model.flows} hidden={model.flowsHidden} level={model.level} onOpenViewer={onOpenViewer} />
          </Fold>
          {/* keyed so the block opens when the first lesson arrives after the scan */}
          <Fold key={model.lessons.length > 0 ? 'has' : 'none'} title="Lessons from your project" initialOpen={model.lessons.length > 0} force={!!lessonFocus}>
            <LessonsSection lessons={model.lessons} level={model.level} scan={model.scan} focus={lessonFocus} onOpenViewer={onOpenViewer} />
          </Fold>
          {model.notes.length > 0 && <div className="note">{model.notes.map((n, i) => <p key={i}>{n}</p>)}</div>}
        </>
      )}
      <Fold title="Concepts" initialOpen={false} force={!!conceptFocus}>
        <ConceptsSection concepts={model.concepts} level={model.level} focus={conceptFocus} onRelated={onFocus} />
      </Fold>
      <Fold title="Download" initialOpen={false}>
        <JournalDownload onDownload={onDownload} disabledReason={model.status === 'ready' ? undefined : 'The Journal is not built yet.'} />
      </Fold>
    </section>
  );
}
