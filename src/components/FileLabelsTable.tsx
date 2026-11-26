// @node: F5.10
// The Files table: filters, at most 200 rows with Show more, and a Why? disclosure per row. Props only.
import { useState } from 'react';
import { filterFiles, labelName, type FileFilter } from '../engine/understandingView';
import type { FileUnderstanding, Label } from '../engine/understandTypes';

const PAGE = 200;
const GROUPS: Array<{ value: Label | 'all'; text: string }> = [
  { value: 'all', text: 'All' }, { value: 'frontend', text: 'Frontend' }, { value: 'backend', text: 'Backend' }, { value: 'api_data', text: 'APIs & Data' },
  { value: 'shared', text: 'Shared' }, { value: 'assets', text: 'Images and fonts' }, { value: 'tests', text: 'Tests' }, { value: 'configuration', text: 'Settings' },
  { value: 'documentation', text: 'Docs' }, { value: 'infrastructure', text: 'Infrastructure' },
];

export interface FileLabelsTableProps {
  files: readonly FileUnderstanding[];
  notScannedExt: ReadonlySet<string>;
  onEdit(path: string): void;
  /** Initial filters (used by tests and by "Needs Review only"). */
  initial?: FileFilter;
}

function extOf(p: string): string {
  const b = p.slice(p.lastIndexOf('/') + 1);
  const d = b.lastIndexOf('.');
  return d > 0 ? b.slice(d + 1).toLowerCase() : '';
}

export function FileLabelsTable({ files, notScannedExt, onEdit, initial }: FileLabelsTableProps) {
  const [filter, setFilter] = useState<FileFilter>(initial ?? { group: 'all', confidence: 'all', needsReviewOnly: false, text: '' });
  const [limit, setLimit] = useState(PAGE);
  const rows = filterFiles(files, filter);
  const shown = rows.slice(0, limit);
  return (
    <div className="understanding-files">
      <p className="filters">
        <label>Area or group <select value={filter.group ?? 'all'} onChange={(e) => setFilter({ ...filter, group: e.target.value as Label | 'all' })}>
          {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.text}</option>)}
        </select></label>{' '}
        <label>Confidence <select value={filter.confidence ?? 'all'} onChange={(e) => setFilter({ ...filter, confidence: e.target.value as FileFilter['confidence'] })}>
          <option value="all">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select></label>{' '}
        <label className="check"><input type="checkbox" checked={!!filter.needsReviewOnly} onChange={(e) => setFilter({ ...filter, needsReviewOnly: e.target.checked })} /> Needs Review only</label>{' '}
        <label>Path contains <input type="text" value={filter.text ?? ''} onChange={(e) => setFilter({ ...filter, text: e.target.value })} /></label>
      </p>
      <div className="table-scroll">
        <table>
          <thead><tr><th scope="col">Path</th><th scope="col">Labels</th><th scope="col">Confidence</th><th scope="col">Reason</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {shown.map((f) => (
              <tr key={f.path}>
                <td>{f.path}</td>
                <td>{f.ignored ? 'Ignored' : f.labels.map(labelName).join(', ')}{f.corrected ? ' (set by you)' : ''}</td>
                <td>{f.ignored ? 'n/a' : f.confidence}</td>
                <td>
                  {f.ignored ? f.ignoredReason : f.evidence[0]?.description}
                  {notScannedExt.has(extOf(f.path)) && <span className="note"> Connections not scanned for this language.</span>}
                  {!f.ignored && (
                    <details><summary>Why?</summary>
                      <ul>{f.evidence.map((e, i) => <li key={i}>{e.description}</li>)}</ul>
                      {f.before && (<><p>Before your change: {f.before.labels.map(labelName).join(', ')} ({f.before.confidence})</p>
                        <ul>{f.before.evidence.map((e, i) => <li key={i}>{e.description}</li>)}</ul></>)}
                    </details>
                  )}
                </td>
                <td>{!f.ignored && <button type="button" onClick={() => onEdit(f.path)}>Set labels</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>No files match.</p>}
      {rows.length > shown.length && <p><button type="button" onClick={() => setLimit(limit + PAGE)}>Show more</button> <span className="note">Showing {shown.length} of {rows.length}.</span></p>}
    </div>
  );
}
