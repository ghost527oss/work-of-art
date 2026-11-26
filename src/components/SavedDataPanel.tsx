// @node: F10.6
// "Saved in this browser": the five saved parts with their sizes and fixed descriptions. Never a stored value.
import type { SavedRow } from '../store/sessionRecord';
import { ResetSessionButton } from './ResetSessionButton';

export const PRIVACY_LINE = 'PatchBay saves addresses, your changes, and settings. It never saves file contents, secrets, or what you type to the AI.';

export function SavedDataPanel({ rows, onReset }: { rows: readonly SavedRow[]; onReset?(): void }) {
  return (
    <details className="saved-data">
      <summary>Saved in this browser</summary>
      <p>{PRIVACY_LINE}</p>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            {r.label} (<code>{r.key}</code>): {r.bytes === null ? 'nothing saved' : `${r.bytes} bytes`}
          </li>
        ))}
      </ul>
      {onReset && <p><ResetSessionButton onReset={onReset} /></p>}
    </details>
  );
}
