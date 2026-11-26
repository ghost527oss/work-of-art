// @node: F5.10
// The Project understanding section: state, partial line, summary, and collapsible blocks. Props only.
import { useMemo, useState } from 'react';
import { applyCorrections, summarize } from '../engine/understandingView';
import type { Label } from '../engine/understandTypes';
import type { UnderstandingState } from '../store/understandingSlice';
import { ConnectionsTable } from './ConnectionsTable';
import { FileLabelsTable } from './FileLabelsTable';
import { LabelEditor } from './LabelEditor';

export interface UnderstandingSectionProps {
  state: UnderstandingState;
  onRun(): void;
  onCancel(): void;
  /** Returns a refusal message or null. */
  onSetLabels(path: string, labels: Label[]): string | null;
  onRemove(path: string): void;
  onClear(): void;
}

export function UnderstandingSection({ state, onRun, onCancel, onSetLabels, onRemove, onClear }: UnderstandingSectionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const result = state.result;
  const files = useMemo(() => (result ? applyCorrections(result, state.corrections) : []), [result, state.corrections]);
  const summary = useMemo(() => summarize(files), [files]);
  const review = files.filter((f) => f.needsReview);
  const notScannedExt = useMemo(() => new Set(Object.keys(result?.coverage.notScanned ?? {})), [result]);
  const correctionCount = Object.keys(state.corrections).length;
  const editingFile = editing ? files.find((f) => f.path === editing) : undefined;

  const stateLine =
    state.status === 'running' ? (
      <p role="status">Analysing {state.progress?.done ?? 0} of {state.progress?.total ?? 0} files. <button type="button" onClick={onCancel}>Cancel</button></p>
    ) : state.status === 'failed' ? (
      <p role="alert">Analysis failed: {state.error ?? 'unknown problem'} <button type="button" onClick={onRun}>Try again</button></p>
    ) : state.status === 'idle' ? (
      <p>Analysis was cancelled or has not run. <button type="button" onClick={onRun}>Run again</button></p>
    ) : (
      <p>Analysis is up to date. <button type="button" onClick={onRun}>Run again</button></p>
    );

  return (
    <section className="understanding" aria-labelledby="understanding-heading">
      <h2 id="understanding-heading">Project understanding</h2>
      {stateLine}
      {result?.coverage.partial && <p className="partial">Partial result: {result.coverage.partialReasons.join(' ')}</p>}
      {result && (
        <>
          <div className="table-scroll">
            <table className="summary">
              <caption>Summary</caption>
              <thead><tr><th scope="col">Group</th><th scope="col">Files</th></tr></thead>
              <tbody>
                {summary.areas.map((a) => <tr key={a.id}><th scope="row">{a.name}</th><td>{a.count}</td></tr>)}
                <tr><th scope="row">Security</th><td>{summary.security}</td></tr>
                {summary.labels.filter((l) => ['shared', 'infrastructure', 'unknown'].includes(l.label)).map((l) => <tr key={l.label}><th scope="row">{l.name}</th><td>{l.count}</td></tr>)}
                {summary.helpers.map((h) => <tr key={h.id}><th scope="row">{h.name}</th><td>{h.count}</td></tr>)}
                <tr><th scope="row">Needs Review</th><td>{summary.needsReview}</td></tr>
                <tr><th scope="row">Ignored</th><td>{summary.ignored}</td></tr>
              </tbody>
            </table>
          </div>

          {editingFile && (
            <LabelEditor
              key={editingFile.path}
              path={editingFile.path}
              current={editingFile.labels}
              corrected={!!editingFile.corrected}
              error={error}
              onSave={(labels) => { const e = onSetLabels(editingFile.path, labels); setError(e); if (!e) setEditing(null); }}
              onCancel={() => { setEditing(null); setError(null); }}
              onRemove={() => { onRemove(editingFile.path); setEditing(null); setError(null); }}
            />
          )}

          <details open={review.length > 0}>
            <summary>Needs Review ({review.length})</summary>
            {review.length === 0 ? <p>No files need review.</p> : (
              <div className="table-scroll"><table>
                <thead><tr><th scope="col">Path</th><th scope="col">What was found</th><th scope="col">Action</th></tr></thead>
                <tbody>{review.slice(0, 200).map((f) => (
                  <tr key={f.path}><td>{f.path}</td><td>{f.evidence[0]?.description}</td><td><button type="button" onClick={() => { setError(null); setEditing(f.path); }}>Set labels</button></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </details>

          <details>
            <summary>Files ({files.length})</summary>
            <FileLabelsTable files={files} notScannedExt={notScannedExt} onEdit={(p) => { setError(null); setEditing(p); }} />
          </details>

          <details>
            <summary>Connections ({result.edges.length})</summary>
            <ConnectionsTable edges={result.edges} />
          </details>

          <details>
            <summary>What was and was not scanned</summary>
            <ul>
              <li>Files read: {result.coverage.read}. Sorted by path only: {result.coverage.pathOnly}. Ignored: {result.coverage.ignored}.</li>
              <li>Scanned for connections: {result.coverage.scanned}.</li>
              {Object.entries(result.coverage.notScanned).map(([ext, n]) => <li key={ext}>.{ext}: {n} files, connections not scanned for this language.</li>)}
              <li>Alias imports not followed: {result.coverage.aliasImportsNotFollowed}.</li>
              {result.coverage.djangoUrlFilesSeen && <li>Django URL files are not followed.</li>}
              <li>External packages ({result.externals.length}): {result.externals.slice(0, 20).join(', ') || 'none'}{result.externals.length > 20 ? ', ...' : ''}.</li>
              {result.coverage.partialReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </details>
        </>
      )}
      {correctionCount > 0 && <p><button type="button" onClick={onClear}>Clear my label corrections</button> <span className="note">{correctionCount} saved for this repository.</span></p>}
    </section>
  );
}
