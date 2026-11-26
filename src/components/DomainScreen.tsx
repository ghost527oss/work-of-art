// @node: F3.4
// Screen 5 (Domain Debugging): an empty wireframe page for one area. No toolbar here.
import { areaLabel, type AreaId } from '../store/shellView';

export interface DomainScreenProps {
  area: AreaId;
  onBackToSkeleton(): void;
  onBackToStudio(): void;
}

export function DomainScreen({ area, onBackToSkeleton, onBackToStudio }: DomainScreenProps) {
  return (
    <section className="screen-right" aria-labelledby="domain-heading">
      <h1 id="domain-heading">{areaLabel(area)}</h1>
      <p>Findings and live debugging arrive in sub-phase 2D.</p>
      <p>
        <button type="button" onClick={onBackToSkeleton}>
          Back to Skeleton Crew
        </button>{' '}
        <button type="button" onClick={onBackToStudio}>
          Back to Studio
        </button>
      </p>
    </section>
  );
}
