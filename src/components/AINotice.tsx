// @node: F11.10
// The notice before the first live request of a page session. One OK button; Cancel drops the held question.
import { noticeLines } from '../engine/aiNotes';
import type { AIStatusState } from '../engine/aiStatus';

export interface AINoticeProps {
  status: AIStatusState;
  onOk(): void;
  onCancel(): void;
}

export function AINotice({ status, onOk, onCancel }: AINoticeProps) {
  return (
    <section className="ai-notice" aria-label="Before the first live request" role="alert">
      <h3>Before the first live request</h3>
      <ul>
        {noticeLines(status).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="note">Your question is on hold. It is sent only when you press OK.</p>
      <div className="button-row">
        <button type="button" onClick={onOk}>OK</button>{' '}
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
