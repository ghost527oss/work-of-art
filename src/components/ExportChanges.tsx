// @node: F9.9
// History panel, Export changes: the file list with checkboxes, origins, counts or the exclusion reason,
// the Preview Only line, the patch preview, the apply line, and Download .patch. Props only.
import { useMemo, useState } from 'react';
import { JOURNAL_LIMITS as L } from '../config/journalLimits';
import { buildPatch, EXCLUDE, ORIGIN_WORDS, type PatchPlan } from '../export/patchExport';
import { ExportButton } from './ExportButton';

export interface ExportChangesProps {
  plan: PatchPlan;
  fileName: string;
  /** Downloads the patch for the selected files; returns the file name or false. */
  onDownload(selected: ReadonlySet<string>): string | false;
}

export function ExportChanges({ plan, fileName, onDownload }: ExportChangesProps) {
  // Only the user's choices are kept; every other file uses its default (the plan can change while the panel is open).
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const live = useMemo(() => new Set(plan.files.filter((f) => f.patch && (choices.get(f.path) ?? f.defaultSelected)).map((f) => f.path)), [choices, plan]);
  const patch = useMemo(() => buildPatch(plan, live), [plan, live]);
  const toggle = (p: string, on: boolean) => setChoices((c) => new Map(c).set(p, on));
  const previewLines = patch.text.split('\n');
  return (
    <section aria-labelledby="export-heading" className="export-changes">
      <h3 id="export-heading">Export changes</h3>
      {plan.files.length === 0 ? <p>No changes to export.</p> : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Export</th><th>File</th><th>From</th><th>Details</th></tr></thead>
            <tbody>
              {plan.files.map((f) => {
                const reason = f.excluded ?? (patch.sizeExcluded.includes(f.path) ? EXCLUDE.size : undefined);
                return (
                  <tr key={f.path}>
                    <td><input type="checkbox" aria-label={`Export ${f.path}`} disabled={!!f.excluded} checked={live.has(f.path)} onChange={(e) => toggle(f.path, e.target.checked)} /></td>
                    <td><code>{f.path}</code></td>
                    <td>{f.origins.map((o) => ORIGIN_WORDS[o]).join(', ')}{f.origins.includes('practice') && <><br /><span className="note">This file contains practice-run changes.</span></>}</td>
                    <td>{reason ?? `${f.changes} changes, ${f.hunks} hunks, +${f.added} -${f.removed}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {plan.previewOnlyCount > 0 && <p className="note">{plan.previewOnlyCount} Preview Only changes are not exported.</p>}
      {patch.text && (
        <details>
          <summary>Preview patch</summary>
          <pre className="diff-block">{previewLines.slice(0, L.previewLines).join('\n')}</pre>
          {previewLines.length > L.previewLines && <p className="note">{previewLines.length - L.previewLines} more lines are in the file.</p>}
        </details>
      )}
      <p>To use it: open your project folder and run  <code>git apply {fileName}</code></p>
      <p className="note">The patch is made against the files as PatchBay loaded them.</p>
      <ExportButton label="Download .patch" disabledReason={patch.files === 0 ? 'Nothing to export.' : undefined} onExport={() => onDownload(live)} />
    </section>
  );
}
