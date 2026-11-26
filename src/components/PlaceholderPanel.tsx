// @node: F3.3
// A heading and one line naming the sub-phase that fills this panel. Nothing else.
export interface PlaceholderPanelProps {
  title: string;
  /** For example "2E" or "2F". */
  phaseLabel: string;
}

export function PlaceholderPanel({ title, phaseLabel }: PlaceholderPanelProps) {
  return (
    <section aria-label={title} className="placeholder-panel">
      <h3>{title}</h3>
      <p>Arrives in sub-phase {phaseLabel}.</p>
    </section>
  );
}
