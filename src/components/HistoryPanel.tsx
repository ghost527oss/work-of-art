// @node: F4.8
// @node: F9.10 (Export changes below the list)
// The History list: applied and undone practice changes, newest first. Props only.
import type { HistoryEntry } from '../store/workSlice';
import { ExportChanges, type ExportChangesProps } from './ExportChanges';

export interface HistoryPanelProps {
  applied: readonly HistoryEntry[];
  undone: readonly HistoryEntry[];
  /** 2F: shown only when History has entries. */
  exporter?: ExportChangesProps;
}

interface Row {
  entry: HistoryEntry;
  state: 'applied' | 'undone';
  order: number;
}

export function HistoryPanel({ applied, undone, exporter }: HistoryPanelProps) {
  const rows: Row[] = [
    ...applied.map((entry, i) => ({ entry, state: 'applied' as const, order: i })),
    ...undone.map((entry, i) => ({ entry, state: 'undone' as const, order: applied.length + i })),
  ].sort((a, b) => b.entry.at - a.entry.at || b.order - a.order);
  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading">History</h2>
      {rows.length === 0 ? (
        <p>No changes yet. Type start in AI Chat to try a practice run.</p>
      ) : (
        <ol className="history-list">
          {rows.map(({ entry, state }) => (
            <li key={entry.id}>
              <strong>{entry.title}</strong> <code>{entry.path}</code>
              <br />
              <span className="note">
                {new Date(entry.at).toLocaleTimeString()}, state: {state}
              </span>
              <pre className="diff-block">{entry.diff}</pre>
            </li>
          ))}
        </ol>
      )}
      <p className="note">Type undo or redo in AI Chat.</p>
      {exporter && rows.length > 0 && <ExportChanges {...exporter} />}
    </section>
  );
}
