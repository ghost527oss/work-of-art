// @node: F6.10
// The four-area map (2 by 2 boxes) and the links between areas. Props only.
import type { Severity } from '../engine/scanFindingTypes';
import { AREAS, type AreaId } from '../store/shellView';

export interface AreaMapProps {
  counts: Record<AreaId, Record<Severity, number>>;
  files: Record<AreaId, number | null>;
  links: Array<{ from: AreaId; to: AreaId; count: number }>;
  helpers: Array<{ name: string; count: number }>;
  scanDone: boolean;
  onOpen(area: AreaId): void;
}

const name = (id: AreaId) => AREAS.find((a) => a.id === id)?.label ?? id;

export function AreaMap({ counts, files, links, helpers, scanDone, onOpen }: AreaMapProps) {
  return (
    <section aria-labelledby="map-heading">
      <h2 id="map-heading">Map</h2>
      <div className="area-grid">
        {AREAS.map(({ id, label }) => {
          const c = counts[id];
          const none = c.high + c.medium + c.low === 0;
          return (
            <div key={id} className="area-box">
              <h3>{label}</h3>
              <p>{id === 'security' ? 'All code files' : `${files[id] ?? 0} files`}</p>
              <p>{!scanDone ? 'No scan result yet.' : none ? 'No findings from the checks that ran.' : `High ${c.high}, Medium ${c.medium}, Low ${c.low}`}</p>
              <button type="button" onClick={() => onOpen(id)}>Open {label}</button>
            </div>
          );
        })}
      </div>
      <h3>Links between areas</h3>
      {links.length === 0 ? <p>No links between areas were found.</p> : (
        <div className="table-scroll"><table>
          <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Links</th></tr></thead>
          <tbody>{links.map((l) => <tr key={`${l.from}>${l.to}`}><td>{name(l.from)}</td><td>{name(l.to)}</td><td>{l.count}</td></tr>)}</tbody>
        </table></div>
      )}
      <p className="note">Helper groups: {helpers.map((h) => `${h.name} ${h.count}`).join(', ')}.</p>
    </section>
  );
}
