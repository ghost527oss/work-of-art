// @node: F9.9
// One export button with its reason or status line. `onExport` returns the file name, or false when the browser refused.
import { useState } from 'react';

export const BLOCKED = 'Your browser did not allow the download.';

export interface ExportButtonProps {
  label: string;
  /** When set, the button is disabled and this reason is shown beside it. */
  disabledReason?: string;
  onExport(): string | false;
  /** For tests: the status line to start with. */
  initialStatus?: string;
}

export function ExportButton({ label, disabledReason, onExport, initialStatus }: ExportButtonProps) {
  const [status, setStatus] = useState(initialStatus ?? '');
  return (
    <p className="export-button">
      <button type="button" disabled={!!disabledReason} onClick={() => { const r = onExport(); setStatus(r === false ? BLOCKED : `Downloaded ${r}.`); }}>{label}</button>
      {disabledReason ? <span className="note"> {disabledReason}</span> : status ? <span role="status"> {status}</span> : null}
    </p>
  );
}
