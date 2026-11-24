// @node: F1.7
// Coverage report for the loaded snapshot, plus the scoped-load picker. It never says a
// repository is fully analysed unless `sourceAnalysisComplete` is true.
import { useMemo, useState } from 'react';
import { BUDGETS } from '../config/budgets';
import type { RepoSnapshot } from '../types/contracts';

const MAX_REASONS_SHOWN = 200;

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export interface CoveragePanelProps {
  snapshot: RepoSnapshot;
  /** True while a (scoped) reload is running. */
  busy: boolean;
  onLoadFolders(folders: string[]): void;
}

export function CoveragePanel({ snapshot, busy, onLoadFolders }: CoveragePanelProps) {
  const c = snapshot.coverage;
  const [selected, setSelected] = useState<string[]>([]);

  const topFolders = useMemo(
    () => snapshot.inventory.entries.filter((e) => e.entryType === 'directory' && !e.path.includes('/')).map((e) => e.path),
    [snapshot],
  );
  // A scoped reload only filters which files are read; it asks GitHub for the same tree again.
  // So it can help when the content budget was the limit, but not when the tree itself is incomplete.
  const scopable = snapshot.source === 'github' && !c.sourceAnalysisComplete && topFolders.length > 0;
  const canScope = scopable && c.treeComplete;
  const treeBlocksScope = scopable && !c.treeComplete;
  const atLimit = selected.length >= BUDGETS.maxScopeEntries;
  const isEmpty = snapshot.inventory.entries.length === 0;

  function toggle(folder: string) {
    setSelected((cur) => (cur.includes(folder) ? cur.filter((f) => f !== folder) : [...cur, folder]));
  }

  return (
    <section className="coverage" aria-labelledby="coverage-heading">
      <h2 id="coverage-heading">Coverage</h2>

      {isEmpty && <p role="status">This repository has no files.</p>}

      <p>
        <strong>Source analysis: {c.sourceAnalysisComplete ? 'complete for supported file types' : 'incomplete'}.</strong>{' '}
        {c.treeComplete ? 'The file tree is complete.' : 'The file tree is incomplete.'}
      </p>
      {c.sourceAnalysisComplete && c.skippedFiles > 0 && (
        <p className="note">
          {c.skippedFiles} files were skipped by file-type or folder rules and are listed below. They were not analysed.
        </p>
      )}

      <table>
        <tbody>
          <tr><th scope="row">Paths indexed</th><td>{c.indexedPaths}</td></tr>
          <tr><th scope="row">Source files loaded</th><td>{c.loadedSourceFiles}</td></tr>
          <tr><th scope="row">Truncated files</th><td>{c.truncatedFiles}</td></tr>
          <tr><th scope="row">Deferred (not loaded)</th><td>{c.deferredSourceFiles}</td></tr>
          <tr><th scope="row">Skipped files</th><td>{c.skippedFiles}</td></tr>
          <tr><th scope="row">Failed files</th><td>{c.failedFiles}</td></tr>
          <tr><th scope="row">Content loaded</th><td>{kb(c.totalLoadedBytes)}</td></tr>
        </tbody>
      </table>

      {c.warnings.length > 0 && (
        <>
          <h3>Warnings</h3>
          <ul>
            {c.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      )}

      {c.skippedReasons.length > 0 && (
        <details>
          <summary>Skipped files ({c.skippedReasons.length})</summary>
          <ul>
            {c.skippedReasons.slice(0, MAX_REASONS_SHOWN).map((r) => (
              <li key={r.path}>
                <code>{r.path}</code>: {r.reason}
              </li>
            ))}
          </ul>
          {c.skippedReasons.length > MAX_REASONS_SHOWN && <p className="note">Showing the first {MAX_REASONS_SHOWN}.</p>}
        </details>
      )}

      <details>
        <summary>Limits in use{BUDGETS.provisional ? ' (provisional)' : ''}</summary>
        <ul>
          <li>Per-file prefix: {kb(BUDGETS.maxFilePrefixBytes)}</li>
          <li>Skipped above: {kb(BUDGETS.hardCeilingBytes)}</li>
          <li>Total content: {kb(BUDGETS.maxTotalLoadedBytes)}</li>
          <li>Files per batch: {BUDGETS.batchSize}</li>
          <li>Request timeout: {BUDGETS.requestTimeoutMs / 1000} s</li>
        </ul>
      </details>

      {treeBlocksScope && (
        <p role="note">
          Loading only some folders is not available here: GitHub returned an incomplete file tree, and a folder reload would request the
          same incomplete tree again. Paths missing from the inventory cannot be recovered in this version.
        </p>
      )}

      {canScope && (
        <fieldset disabled={busy}>
          <legend>Load only some folders</legend>
          <p className="note">
            Root files are always included. Choose up to {BUDGETS.maxScopeEntries} top-level folders. This reloads the repository.
          </p>
          {topFolders.map((folder) => (
            <label key={folder} className="check">
              <input
                type="checkbox"
                checked={selected.includes(folder)}
                disabled={!selected.includes(folder) && atLimit}
                onChange={() => toggle(folder)}
              />{' '}
              {folder}
            </label>
          ))}
          <p>
            <button type="button" disabled={selected.length === 0 || busy} onClick={() => onLoadFolders(selected)}>
              Load selected folders
            </button>
          </p>
        </fieldset>
      )}
    </section>
  );
}
