// @node: F6.10
// Every API call and route from the connection map (APIs & Data). Props only.
import { CERTAINTY_TEXT, KIND_TEXT } from '../engine/understandingView';
import type { Edge } from '../engine/understandTypes';

export function RequestTrace({ edges }: { edges: readonly Edge[] }) {
  const rows = edges.filter((e) => e.kind === 'calls_api' || e.kind === 'calls_external' || e.kind === 'defines_route');
  return (
    <section aria-labelledby="trace-heading">
      <h3 id="trace-heading">Request trace</h3>
      {rows.length === 0 ? <p>No requests or routes were found.</p> : (
        <div className="table-scroll"><table>
          <thead><tr><th scope="col">Kind</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Certainty</th><th scope="col">Line</th></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.id}><td>{KIND_TEXT[e.kind]}</td><td>{e.from}</td><td>{e.target}</td><td>{CERTAINTY_TEXT[e.certainty]}</td><td>{e.line}</td></tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}
