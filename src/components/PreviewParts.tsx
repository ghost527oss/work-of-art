// @node: F7.9
// Small parts of the Sandbox panel. Props only. All text is React text.
import { useState } from 'react';
import { MODE_NAMES, type PreviewMode } from '../preview/previewMode';
import type { PreviewWidth } from '../store/previewSlice';
import { groupFiles, viewerLines } from '../preview/sourceView';
import type { FileUnderstanding } from '../engine/understandTypes';
import type { WorkbenchComponent } from '../preview/workbenchDocument';

const WIDTHS: Array<{ w: PreviewWidth; text: string }> = [{ w: 375, text: '375' }, { w: 768, text: '768' }, { w: 1024, text: '1024' }, { w: 0, text: 'Fit' }];

export interface PreviewToolbarProps {
  mode: PreviewMode;
  choices: PreviewMode[];
  width: PreviewWidth;
  scripts: boolean;
  canMeasure: boolean;
  measureReason: string | null;
  onMode(m: PreviewMode): void;
  onWidth(w: PreviewWidth): void;
  onReload(): void;
  onCheck(): void;
  onCheckAll(): void;
}

export function PreviewToolbar(p: PreviewToolbarProps) {
  return (
    <div className="preview-toolbar">
      <label>Mode <select value={p.mode} onChange={(e) => p.onMode(e.target.value as PreviewMode)}>
        {p.choices.map((m) => <option key={m} value={m}>{MODE_NAMES[m]}</option>)}
      </select></label>{' '}
      {p.mode !== 'source' && (
        <>
          <span role="group" aria-label="Preview width">
            {WIDTHS.map((x) => <button key={x.w} type="button" aria-pressed={p.width === x.w} onClick={() => p.onWidth(x.w)}>{x.text}</button>)}
          </span>{' '}
          <button type="button" onClick={p.onReload}>Reload</button>{' '}
        </>
      )}
      {p.mode === 'static' && (
        <>
          <button type="button" data-check="one" disabled={!p.canMeasure} onClick={p.onCheck}>Check layout</button>{' '}
          <button type="button" data-check="all" title="Measures at 375, 768, and 1024 px wide" disabled={!p.canMeasure} onClick={p.onCheckAll}>Check at all widths</button>
          {!p.canMeasure && p.measureReason && <span className="note"> {p.measureReason}</span>}
        </>
      )}
    </div>
  );
}

export function ScriptsSwitch({ on, available, onTurnOn, onStop }: { on: boolean; available: boolean; onTurnOn(): void; onStop(): void }) {
  const [asking, setAsking] = useState(false);
  if (!available) return null;
  if (on) return <p><button type="button" onClick={onStop}>Stop scripts</button> <span className="note">Scripts are running in a locked box with no outside network.</span></p>;
  return (
    <div>
      {!asking ? <p><button type="button" onClick={() => setAsking(true)}>Run scripts</button> <span className="note">Look-only is on. Scripts are off.</span></p> : (
        <section className="finding-detail" aria-label="Run scripts confirmation">
          <p>The page&apos;s own scripts will run inside a locked box. The box has no access to PatchBay or your browser storage, and it cannot send data to a server. Scripts from a short list of public script hosts (jsDelivr, cdnjs, unpkg, jQuery, Tailwind) may load. Scripts on the page can ask any https address for a picture, so that address&apos;s host can see your IP address (no referrer is sent). A script can still freeze this tab with an endless loop, or send the box to another address (it is then reset, but the browser may already have made that one request). Some browser features, such as peer-to-peer connections, are not covered by the box&apos;s rules, so do not run scripts from a repository you do not trust. Stop scripts at any time to go back to look-only.</p>
          <p><button type="button" onClick={() => { setAsking(false); onTurnOn(); }}>Yes, run scripts</button> <button type="button" onClick={() => setAsking(false)}>Cancel</button></p>
        </section>
      )}
    </div>
  );
}

export function PreviewNotes({ reason, mode, notes, invalid }: { reason: string; mode: PreviewMode; notes: string[]; invalid: number }) {
  return (
    <div>
      <p>Mode: {MODE_NAMES[mode]}. Why: {reason}</p>
      {mode === 'workbench' && <p className="note">Approximate: read from the source, not run.</p>}
      {notes.length > 0 && <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {invalid > 0 && <p className="note">{invalid} invalid message{invalid === 1 ? '' : 's'} from the preview were ignored.</p>}
    </div>
  );
}

export function ConsolePane({ lines }: { lines: Array<{ level: string; text: string }> }) {
  return (
    <section aria-labelledby="console-heading">
      <h3 id="console-heading">Console (from the preview)</h3>
      {lines.length === 0 ? <p>No console output.</p> : <ol>{lines.map((l, i) => <li key={i}>[{l.level}] {l.text}</li>)}</ol>}
    </section>
  );
}

export function WorkbenchPicker({ components, chosen, onPick }: { components: WorkbenchComponent[]; chosen?: string; onPick(key: string): void }) {
  return (
    <label>Component <select value={chosen ?? ''} onChange={(e) => onPick(e.target.value)}>
      {components.map((c) => <option key={c.key} value={c.key} disabled={!!c.error}>{c.name} ({c.path}){c.error ? `: ${c.error}` : ''}</option>)}
    </select></label>
  );
}

export interface SourceViewerProps {
  files: readonly FileUnderstanding[];
  loaded: ReadonlySet<string>;
  contentOf(path: string): string | undefined;
  notReadReason(path: string): string | undefined;
  highlight?: { path: string; first: number; last: number };
}

export function SourceViewer({ files, loaded, contentOf, notReadReason, highlight }: SourceViewerProps) {
  const [selected, setSelected] = useState<string | undefined>(highlight?.path);
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const groups = groupFiles(files, loaded);
  const content = selected ? contentOf(selected) : undefined;
  const view = content !== undefined ? viewerLines(content, offset) : null;
  return (
    <div className="source-viewer">
      <label>Filter files <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
      <div className="table-scroll">
        {groups.map((g) => (
          <div key={g.group}>
            <h4>{g.group}</h4>
            <ul>{g.paths.filter((p) => !filter || p.path.toLowerCase().includes(filter.toLowerCase())).map((p) => (
              <li key={p.path}><button type="button" onClick={() => { setSelected(p.path); setOffset(0); }}>{p.path}</button>{!p.read && <span className="note"> (not read)</span>}</li>
            ))}</ul>
          </div>
        ))}
      </div>
      {selected && (view ? (
        <>
          <pre className="diff-block" aria-label={`Source of ${selected}`}>{view.lines.map((l) => {
            const hot = highlight && highlight.path === selected && l.n >= highlight.first && l.n <= highlight.last;
            return `${hot ? '>> ' : '   '}${String(l.n).padStart(4, ' ')}  ${l.text}`;
          }).join('\n')}</pre>
          {view.next !== null && <p><button type="button" onClick={() => setOffset(view.next!)}>Show more</button></p>}
        </>
      ) : <p>This file was not read{notReadReason(selected) ? `: ${notReadReason(selected)}` : '.'}</p>)}
    </div>
  );
}
