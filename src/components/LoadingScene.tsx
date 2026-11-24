// @node: F1.7
// Loading screen (Phase 1 wireframe). Every status shown here comes from real pipeline
// events held in the store. Counts appear only when both numbers are known, and there is
// no percentage anywhere.
import { useState } from 'react';
import { SAMPLES } from '../data/sampleRepos';
import { describeTarget, useStudioStore, type StageStatus } from '../store/useStudioStore';
import type { IngestStage } from '../types/contracts';

const STAGES: ReadonlyArray<{ id: IngestStage; label: string }> = [
  { id: 'resolving_ref', label: 'Resolve branch' },
  { id: 'fetching_tree', label: 'Fetch file tree' },
  { id: 'classifying', label: 'Classify files' },
  { id: 'loading_sources', label: 'Load source files' },
  { id: 'preparing_preview', label: 'Prepare preview' },
];

const STATUS_TEXT: Record<StageStatus, string> = {
  pending: 'pending',
  active: 'in progress',
  done: 'done',
  skipped: 'skipped',
  failed: 'failed',
  not_available: 'not available yet',
};

export function formatResetTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export interface LoadingSceneProps {
  onCancel(): void;
  onRetry(): void;
  onSample(id: string): void;
  onBack(): void;
}

export function LoadingScene({ onCancel, onRetry, onSample, onBack }: LoadingSceneProps) {
  const ingestion = useStudioStore((s) => s.ingestion);
  const [sampleId, setSampleId] = useState<string>(SAMPLES[0]?.id ?? '');
  const target = ingestion.target;
  const running = ingestion.status === 'running';
  const failed = ingestion.status === 'failed';
  const resetTime = formatResetTime(ingestion.error?.resetAt);

  return (
    <main className="screen loading">
      <h1>Loading repository</h1>
      {target && (
        <p>
          {describeTarget(target)}
          {target.source === 'sample' ? ' (sample)' : ''}
        </p>
      )}

      <ol className="stages" aria-live="polite">
        {STAGES.map(({ id, label }) => {
          const status = ingestion.stages[id];
          const detail = ingestion.stageDetails[id];
          const progress = id === 'loading_sources' && status === 'active' ? ingestion.progress : undefined;
          return (
            <li key={id} data-stage={id} data-status={status}>
              <strong>{label}</strong>: {STATUS_TEXT[status]}
              {status === 'active' && !progress && ' ...'}
              {progress && ` (${progress.loaded} of ${progress.total} files)`}
              {detail && status !== 'active' && <span className="note"> {detail}</span>}
            </li>
          );
        })}
      </ol>

      {ingestion.notices.length > 0 && (
        <ul className="notices" role="status">
          {ingestion.notices.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {running && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}

      {failed && ingestion.error && (
        <section className="error-panel" role="alert">
          <h2>Could not load the repository</h2>
          <p>
            <strong>{ingestion.error.code}</strong>: {ingestion.error.message}
          </p>
          {resetTime && <p>The rate limit resets at {resetTime}.</p>}
          <p>
            <button type="button" onClick={onRetry}>
              Retry
            </button>{' '}
            <button type="button" onClick={onBack}>
              Back to Start
            </button>
          </p>
          <p className="secondary">
            <label htmlFor="loading-sample">Use a sample repository instead</label>{' '}
            <select id="loading-sample" value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
              {SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>{' '}
            <button type="button" onClick={() => onSample(sampleId)}>
              Use sample
            </button>
          </p>
        </section>
      )}
    </main>
  );
}
