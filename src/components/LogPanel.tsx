// @node: F3.5
// @node: F4.9 (2B placeholder note removed)
// @node: F9.10 (log downloads)
// The session log list (last 50 entries), moved out of the old Studio stub, with an empty state. Props only.
import type { SessionLogEntry } from '../types/contracts';
import { LogExportButtons } from './LogExportButtons';

const LOG_SHOWN = 50;

export interface LogPanelProps {
  entries: SessionLogEntry[];
  /** 2F: the two downloads. */
  onDownload?(format: 'md' | 'json'): string | false;
}

export function LogPanel({ entries, onDownload }: LogPanelProps) {
  return (
    <section aria-labelledby="log-heading">
      <h2 id="log-heading">Session log</h2>
      {entries.length === 0 ? (
        <p>No entries yet.</p>
      ) : (
        <ol className="log">
          {entries.slice(-LOG_SHOWN).map((entry) => (
            <li key={entry.id}>
              <span className="note">{new Date(entry.timestamp).toLocaleTimeString()}</span> {entry.action} [{entry.status}]: {entry.message}
            </li>
          ))}
        </ol>
      )}
      {onDownload && <LogExportButtons count={entries.length} onDownload={onDownload} />}
    </section>
  );
}
