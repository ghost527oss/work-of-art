// @node: F6.10
// Findings for one area: at most 200 rows with Show more and a Details button per row. Props only.
import { useState } from 'react';
import { scanSkillById } from '../skillbook';
import { areaLabel } from '../store/shellView';
import type { AreaId } from '../store/shellView';
import type { Finding } from '../engine/scanFindingTypes';

const PAGE = 200;
const FIX_TEXT = { auto: 'Auto-supported', guided: 'Guided', explanation: 'Explanation only' } as const;

export interface FindingsTableProps {
  area: AreaId;
  findings: readonly Finding[];
  selectedId?: string;
  onDetails(id: string): void;
}

export function FindingsTable({ area, findings, selectedId, onDetails }: FindingsTableProps) {
  const [limit, setLimit] = useState(PAGE);
  if (findings.length === 0) return <p>No findings from the checks that ran.</p>;
  const shown = findings.slice(0, limit);
  return (
    <div>
      <div className="table-scroll"><table>
        <thead><tr><th scope="col">Severity</th><th scope="col">Check</th><th scope="col">File</th><th scope="col">Lines</th><th scope="col">Certainty</th><th scope="col">Fix</th><th scope="col">Also in</th><th scope="col">Details</th></tr></thead>
        <tbody>
          {shown.map((f) => (
            <tr key={f.id} aria-selected={f.id === selectedId}>
              <td>{f.severity}</td><td>{scanSkillById(f.skillId)?.title}</td><td>{f.path}</td>
              <td>{f.firstLine === f.lastLine ? f.firstLine : `${f.firstLine} to ${f.lastLine}`}</td>
              <td>{f.certainty === 'found' ? 'Found' : 'Possible'}</td><td>{FIX_TEXT[f.fix]}</td>
              <td>{f.areas.filter((a) => a !== area).map(areaLabel).join(', ')}</td>
              <td><button type="button" onClick={() => onDetails(f.id)}>Details</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {findings.length > shown.length && <p><button type="button" onClick={() => setLimit(limit + PAGE)}>Show more</button> <span className="note">Showing {shown.length} of {findings.length}.</span></p>}
    </div>
  );
}
