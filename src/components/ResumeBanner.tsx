// @node: F10.6
// The Start screen banner for a saved session that is not being restored right now.
import type { SessionRecord } from '../store/sessionRecord';
import { ResetSessionButton } from './ResetSessionButton';

export const labelOf = (r: SessionRecord): string =>
  r.target.source === 'sample' ? `sample/${r.target.sampleId}` : `${r.target.owner}/${r.target.repo}`;
export const refOf = (r: SessionRecord): string => (r.target.source === 'sample' ? 'the bundled copy' : r.target.ref ?? 'the default branch');

export interface ResumeBannerProps {
  record?: SessionRecord;
  restoring: boolean;
  onResume(): void;
  onReset(): void;
  /** Formats savedAt (injected so tests are stable). */
  formatTime?(ms: number): string;
}

export function ResumeBanner({ record, restoring, onResume, onReset, formatTime = (ms) => new Date(ms).toLocaleString() }: ResumeBannerProps) {
  if (!record || restoring) return null;
  return (
    <section className="resume-banner" aria-label="Last session">
      <p>Last session: {labelOf(record)} at {refOf(record)}, saved {formatTime(record.savedAt)}.</p>
      <p>
        <button type="button" onClick={onResume}>Resume last session</button>{' '}
        <ResetSessionButton onReset={onReset} />
      </p>
    </section>
  );
}
