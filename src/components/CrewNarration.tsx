// @node: F6.10
// The crew narration lines (from the Log). Props only.
import type { SessionLogEntry } from '../types/contracts';

export function CrewNarration({ entries, limit }: { entries: readonly SessionLogEntry[]; limit: number }) {
  const shown = entries.slice(-limit);
  return (
    <section aria-labelledby={`narration-heading-${limit}`}>
      <h3 id={`narration-heading-${limit}`}>Crew narration</h3>
      {shown.length === 0 ? <p>The crew has not said anything yet.</p> : <ol aria-live="polite">{shown.map((e) => <li key={e.id}>{e.message}</li>)}</ol>}
    </section>
  );
}
