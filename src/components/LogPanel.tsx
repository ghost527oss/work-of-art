// @node: F3.5
// The session log list (last 50 entries), moved out of the old Studio stub, with a short note about
// sub-phase 2B and an empty state. Props only.
import type { SessionLogEntry } from '../types/contracts';

const LOG_SHOWN = 50;

export interface LogPanelProps {
  entries: SessionLogEntry[];
}

export function LogPanel({ entries }: LogPanelProps) {
  return (
    <section aria-labelledby="log-heading">
      <h2 id="log-heading">Session log</h2>
      <p className="note">Planning and skill entries arrive in sub-phase 2B.</p>
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
    </section>
  );
}
