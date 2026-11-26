// @node: F6.10
// The four worker boxes and the Start Crew button. Props only.
export interface WorkerSlotsProps {
  slots: Array<{ area: string; name: string; status: string }>;
  start: { enabled: boolean; reason: string | null };
  onStart(): void;
}

export function WorkerSlots({ slots, start, onStart }: WorkerSlotsProps) {
  return (
    <section aria-labelledby="workers-heading">
      <h2 id="workers-heading">Worker slots</h2>
      <div className="area-grid">
        {slots.map((s) => (
          <div key={s.area} className="area-box"><h3>{s.name}</h3><p>{s.status}</p></div>
        ))}
      </div>
      <p className="note">Workers take turns in this version.</p>
      <p>
        <button type="button" disabled={!start.enabled} onClick={onStart}>Start Crew</button>{' '}
        {!start.enabled && start.reason && <span className="note">{start.reason}</span>}
      </p>
    </section>
  );
}
