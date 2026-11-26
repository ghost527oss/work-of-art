// @node: F5.10
// The label form for one file. Props only. All text is React text.
import { useState } from 'react';
import { labelName } from '../engine/understandingView';
import type { Label } from '../engine/understandTypes';
import { SELECTABLE_LABELS } from '../store/understandingSlice';

export interface LabelEditorProps {
  path: string;
  current: readonly Label[];
  corrected: boolean;
  /** A refusal shown above the buttons (for example the 500 limit). */
  error?: string | null;
  onSave(labels: Label[]): void;
  onCancel(): void;
  onRemove(): void;
}

export function LabelEditor({ path, current, corrected, error, onSave, onCancel, onRemove }: LabelEditorProps) {
  const [chosen, setChosen] = useState<Label[]>(current.filter((l) => SELECTABLE_LABELS.includes(l)));
  const toggle = (l: Label) => setChosen((c) => (c.includes(l) ? c.filter((x) => x !== l) : [...c, l]));
  return (
    <form className="label-editor" aria-label={`Set labels for ${path}`} onSubmit={(e) => { e.preventDefault(); onSave(chosen); }}>
      <fieldset>
        <legend>Labels for {path}</legend>
        {SELECTABLE_LABELS.map((l) => (
          <label key={l} className="check">
            <input type="checkbox" checked={chosen.includes(l)} onChange={() => toggle(l)} /> {labelName(l)}
          </label>
        ))}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <p>
        <button type="submit">Save</button> <button type="button" onClick={onCancel}>Cancel</button>
        {corrected && (<> <button type="button" onClick={onRemove}>Remove my change</button></>)}
      </p>
    </form>
  );
}
