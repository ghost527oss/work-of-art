// @node: F3.5
// @node: F5.11 (renders the Project understanding section between coverage and inventory)
// The repository header, the scoped-reload status and error blocks, the coverage panel, and
// the inventory table. Moved out of the old Studio stub with its markup and text unchanged.
import { useState } from 'react';
import { describeTarget, useStudioStore } from '../store/useStudioStore';
import { formatResetTime } from './LoadingScene';
import { CoveragePanel } from './CoveragePanel';
import { UnderstandingSection } from './UnderstandingSection';
import type { UnderstandingActions } from '../hooks/useUnderstanding';

const PAGE = 500;

export interface ProjectInfoProps {
  onLoadFolders(folders: string[]): void;
  onCancel(): void;
  onRetry(): void;
  onDismissError(): void;
  onBack(): void;
  /** Sub-phase 2C. When absent the section is not shown (2A and 2B look). */
  understanding?: UnderstandingActions;
}

export function ProjectInfo({ onLoadFolders, onCancel, onRetry, onDismissError, onBack, understanding }: ProjectInfoProps) {
  const snapshot = useStudioStore((s) => s.snapshot);
  const understandingState = useStudioStore((s) => s.understanding);
  const ingestion = useStudioStore((s) => s.ingestion);
  const [shown, setShown] = useState(PAGE);

  if (!snapshot) return null;
  const isSample = snapshot.source === 'sample';
  const reloading = ingestion.status === 'running' && ingestion.background;
  const reloadFailed = ingestion.status === 'failed' && ingestion.background;
  const entries = snapshot.inventory.entries;
  const resetTime = formatResetTime(ingestion.error?.resetAt);

  return (
    <div className="project-info">
      <header>
        <h1>
          {isSample ? `Sample: ${snapshot.name}` : `${snapshot.owner}/${snapshot.name}`}
          <span className="note"> ref {snapshot.ref}</span>
        </h1>
        <p className="banner">Studio is a placeholder in this build. Only repository loading is available.</p>
        <p>
          <button type="button" onClick={onBack}>
            Back to Start
          </button>{' '}
          <span className="note">Clears this session&apos;s loaded data. The original repository is never changed.</span>
        </p>
      </header>

      {reloading && (
        <p role="status">
          Reloading selected folders from {ingestion.target ? describeTarget(ingestion.target) : 'the repository'}. The current data stays visible until the
          new data is ready.{' '}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </p>
      )}

      {reloadFailed && ingestion.error && (
        <section className="error-panel" role="alert">
          <p>
            <strong>{ingestion.error.code}</strong>: {ingestion.error.message}
          </p>
          {resetTime && <p>The rate limit resets at {resetTime}.</p>}
          <p>The previous data is still loaded.</p>
          <p>
            <button type="button" onClick={onRetry}>
              Retry
            </button>{' '}
            <button type="button" onClick={onDismissError}>
              Keep current data
            </button>
          </p>
        </section>
      )}

      <CoveragePanel snapshot={snapshot} busy={reloading} onLoadFolders={onLoadFolders} />

      {understanding && (
        <UnderstandingSection
          state={understandingState}
          onRun={understanding.run}
          onCancel={understanding.cancel}
          onSetLabels={(p, l) => understanding.setLabels(p, l)}
          onRemove={understanding.removeCorrection}
          onClear={understanding.clearCorrections}
        />
      )}

      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">Inventory ({entries.length} paths)</h2>
        {entries.length === 0 ? (
          <p>No paths.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Path</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, shown).map((e) => (
                  <tr key={e.path}>
                    <td><code>{e.path}</code></td>
                    <td>{e.entryType}</td>
                    <td>{e.loadStatus ?? 'n/a'}</td>
                    <td>{e.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entries.length > shown && (
          <p>
            Showing {shown} of {entries.length}.{' '}
            <button type="button" onClick={() => setShown((n) => n + PAGE)}>
              Show more
            </button>
          </p>
        )}
      </section>
    </div>
  );
}
