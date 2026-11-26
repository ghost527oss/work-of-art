// @node: F11.10
// The mode banner at the top of AI Chat. Props only. Plain text, black and white.
import { bannerFor } from '../engine/aiNotes';
import type { AIStatusState } from '../engine/aiStatus';

export function AIStatusBanner({ status }: { status: AIStatusState }) {
  const b = bannerFor(status);
  return (
    <div className="ai-banner" data-kind={b.kind}>
      <p className={b.kind === 'mock' ? 'mock-label' : 'live-label'}>{b.main}</p>
      {b.hint && <p className="note">{b.hint}</p>}
    </div>
  );
}
