// @node: F9.9
// The Application overview: one heading and a short paragraph per part.
import type { OverviewPart } from '../journal/overview';

export function OverviewSection({ parts }: { parts: readonly OverviewPart[] }) {
  if (parts.length === 0) return <p>The overview is not available yet.</p>;
  return (
    <div className="journal-overview">
      {parts.map((p) => (
        <div key={p.id}>
          {p.title && <h4>{p.title}</h4>}
          <p>{p.sentences.join(' ')}</p>
        </div>
      ))}
    </div>
  );
}
