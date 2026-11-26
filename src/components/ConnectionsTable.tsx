// @node: F5.10
// The Connections table: filters and at most 200 rows with Show more. Certainty is written in words. Props only.
import { useState } from 'react';
import { CERTAINTY_TEXT, KIND_TEXT, filterEdges, type EdgeFilter } from '../engine/understandingView';
import type { Edge } from '../engine/understandTypes';

const PAGE = 200;

export interface ConnectionsTableProps {
  edges: readonly Edge[];
  initial?: EdgeFilter;
}

export function ConnectionsTable({ edges, initial }: ConnectionsTableProps) {
  const [filter, setFilter] = useState<EdgeFilter>(initial ?? { kind: 'all', certainty: 'all', text: '' });
  const [limit, setLimit] = useState(PAGE);
  const rows = filterEdges(edges, filter);
  const shown = rows.slice(0, limit);
  if (edges.length === 0) return <p>No connections were found.</p>;
  return (
    <div className="understanding-connections">
      <p className="filters">
        <label>Kind <select value={filter.kind ?? 'all'} onChange={(e) => setFilter({ ...filter, kind: e.target.value as EdgeFilter['kind'] })}>
          <option value="all">All</option>
          {(Object.keys(KIND_TEXT) as Array<keyof typeof KIND_TEXT>).map((k) => <option key={k} value={k}>{KIND_TEXT[k]}</option>)}
        </select></label>{' '}
        <label>Certainty <select value={filter.certainty ?? 'all'} onChange={(e) => setFilter({ ...filter, certainty: e.target.value as EdgeFilter['certainty'] })}>
          <option value="all">All</option><option value="confirmed">Confirmed</option><option value="inferred">Inferred</option><option value="broken">Broken</option>
        </select></label>{' '}
        <label>Text <input type="text" value={filter.text ?? ''} onChange={(e) => setFilter({ ...filter, text: e.target.value })} /></label>
      </p>
      <div className="table-scroll">
        <table>
          <thead><tr><th scope="col">Kind</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Certainty</th><th scope="col">Line</th><th scope="col">Note</th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}><td>{KIND_TEXT[e.kind]}</td><td>{e.from}</td><td>{e.target}</td><td>{CERTAINTY_TEXT[e.certainty]}</td><td>{e.line}</td><td>{e.note ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>No connections match.</p>}
      {rows.length > shown.length && <p><button type="button" onClick={() => setLimit(limit + PAGE)}>Show more</button> <span className="note">Showing {shown.length} of {rows.length}.</span></p>}
    </div>
  );
}
