// @node: F3.4
// Screen 4 (Skeleton Crew): an empty wireframe page for sub-phase 2A. The right-hand
// content only; the Studio shell supplies the left Sandbox. No toolbar here.
import { AREAS, type AreaId } from '../store/shellView';

export interface SkeletonCrewScreenProps {
  onOpenArea(area: AreaId): void;
  onBack(): void;
}

export function SkeletonCrewScreen({ onOpenArea, onBack }: SkeletonCrewScreenProps) {
  return (
    <section className="screen-right" aria-labelledby="skeleton-heading">
      <h1 id="skeleton-heading">Skeleton Crew</h1>
      <p>The four-area map and the worker slots arrive in sub-phase 2D.</p>
      <p>
        {AREAS.map((a) => (
          <button key={a.id} type="button" onClick={() => onOpenArea(a.id)}>
            {a.label}
          </button>
        ))}
      </p>
      <p>
        <button type="button" onClick={onBack}>
          Back to Studio
        </button>
      </p>
    </section>
  );
}
