// @node: F6.10
// Applied changes for this area (from History). Props only.
import type { HistoryEntry } from '../store/workSlice';

export function ChangesMade({ entries }: { entries: readonly HistoryEntry[] }) {
  return (
    <section aria-labelledby="changes-heading">
      <h3 id="changes-heading">Changes made</h3>
      {entries.length === 0 ? <p>No changes were made for this area.</p> : <ul>{entries.map((e) => <li key={e.id}>{e.title}</li>)}</ul>}
      <p className="note">Type undo to reverse the latest change.</p>
    </section>
  );
}
