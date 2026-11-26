// @node: F10.6
// Reset session with a confirmation first. ResetSessionView takes its state by props; the button keeps it.
import { useState } from 'react';

export const RESET_CONFIRM = 'This clears your saved History, Log, label corrections, and session in this browser. Your repository is not changed.';

export interface ResetSessionViewProps {
  confirming: boolean;
  onAsk(): void;
  onYes(): void;
  onCancel(): void;
}

export function ResetSessionView({ confirming, onAsk, onYes, onCancel }: ResetSessionViewProps) {
  if (!confirming) return <button type="button" className="reset-session" onClick={onAsk}>Reset session</button>;
  return (
    <span className="reset-confirm" role="alertdialog" aria-label="Confirm reset session">
      {RESET_CONFIRM}{' '}
      <button type="button" onClick={onYes}>Yes, reset</button>{' '}
      <button type="button" onClick={onCancel}>Cancel</button>
    </span>
  );
}

export interface ResetSessionButtonProps {
  onReset(): void;
  /** For tests and server rendering: start in the confirming state. */
  initialConfirming?: boolean;
}

export function ResetSessionButton({ onReset, initialConfirming = false }: ResetSessionButtonProps) {
  const [confirming, setConfirming] = useState(initialConfirming);
  return <ResetSessionView confirming={confirming} onAsk={() => setConfirming(true)} onYes={() => { setConfirming(false); onReset(); }} onCancel={() => setConfirming(false)} />;
}
