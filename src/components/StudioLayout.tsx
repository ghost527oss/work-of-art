// @node: F2.7
// Studio STUB for this spec: repository identity, coverage, the inventory, the session
// log, and the AI Assistant panel. The real Studio (preview, action rail) is a later spec.
import { useState } from 'react';
import { describeTarget, useStudioStore } from '../store/useStudioStore';
import { formatResetTime } from './LoadingScene';
import { CoveragePanel } from './CoveragePanel';
import { AIAssistantPanel } from './AIAssistantPanel';
import type { AssistantActions } from '../hooks/useAssistant';

const PAGE = 500;
const LOG_SHOWN = 50;

export interface StudioLayoutProps {
  onLoadFolders(folders: string[]): void;
  onCancel(): void;
  onRetry(): void;
  onDismissError(): void;
  onBack(): void;
  assistant: AssistantActions;
}

export function StudioLayout({ onLoadFolders, onCancel, onRetry, onDismissError, onBack, assistant }: StudioLayoutProps) {
  const snapshot = useStudioStore((s) => s.snapshot);
  const ingestion = useStudioStore((s) => s.ingestion);
  const log = useStudioStore((s) => s.log);
  const [shown, setShown] = useState(PAGE);

  if (!snapshot) return null;
  const isSample = snapshot.source === 'sample';
  const reloading = ingestion.status === 'running' && ingestion.background;
  const reloadFailed = ingestion.status === 'failed' && ingestion.background;
  const entries = snapshot.inventory.entries;
  const resetTime = formatResetTime(ingestion.error?.resetAt);

  return (
    <main className="screen studio">
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

      <section aria-labelledby="log-heading">
        <h2 id="log-heading">Session log</h2>
        <ol className="log">
          {log.slice(-LOG_SHOWN).map((entry) => (
            <li key={entry.id}>
              <span className="note">{new Date(entry.timestamp).toLocaleTimeString()}</span> {entry.action} [{entry.status}]: {entry.message}
            </li>
          ))}
        </ol>
      </section>

      <AIAssistantPanel key={snapshot.id} snapshot={snapshot} assistant={assistant} />
    </main>
  );
}
