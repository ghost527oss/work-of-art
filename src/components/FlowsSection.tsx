// @node: F9.9
// How things flow: a selector grouped by kind and the chosen flow's numbered steps with Open in viewer.
// Each step sentence carries its certainty in words (from describeStep).
import { useState } from 'react';
import { describeStep, type Flow } from '../journal/flows';
import type { Level } from '../skillbook/playbookSchema';

const GROUPS: Array<{ kind: Flow['kind']; label: string }> = [
  { kind: 'page', label: 'Pages' },
  { kind: 'request', label: 'Requests' },
  { kind: 'route', label: 'Routes' },
  { kind: 'setting', label: 'Settings' },
];

export interface FlowsSectionProps {
  flows: readonly Flow[];
  hidden: number;
  level: Level;
  onOpenViewer(path: string, line: number): void;
}

export function FlowsSection({ flows, hidden, level, onOpenViewer }: FlowsSectionProps) {
  const [chosen, setChosen] = useState<string | undefined>(flows[0]?.id);
  if (flows.length === 0) return <p>No flows were found in the loaded files.</p>;
  const flow = flows.find((f) => f.id === chosen) ?? flows[0]!;
  return (
    <div className="journal-flows">
      <label>
        Flow{' '}
        <select value={flow.id} onChange={(e) => setChosen(e.target.value)}>
          {GROUPS.filter((g) => flows.some((f) => f.kind === g.kind)).map((g) => (
            <optgroup key={g.kind} label={g.label}>
              {flows.filter((f) => f.kind === g.kind).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <h4>{flow.title}</h4>
      <ol>
        {flow.steps.map((s, i) => (
          <li key={i}>
            {s.kind === 'uses' && s.target
              ? <><code>{s.target}</code>{s.line ? `, line ${s.line}` : ''}: {describeStep(s, level)}</>
              : <>{s.path && <code>{s.path}</code>}{s.line ? `, line ${s.line}` : ''}: {describeStep(s, level)}</>}
            {/* a "uses" step's line is the import line in the importing file (target), so open that file there */}
            {s.path && <> <button type="button" onClick={() => (s.kind === 'uses' && s.target ? onOpenViewer(s.target, s.line ?? 1) : onOpenViewer(s.path!, s.line ?? 1))}>Open in viewer</button></>}
          </li>
        ))}
      </ol>
      {flow.stop && <p>{flow.stop}</p>}
      {flow.notes.map((n, i) => <p key={i} className="note">{n}</p>)}
      {hidden > 0 && <p className="note">{hidden} more flows are not shown.</p>}
    </div>
  );
}
