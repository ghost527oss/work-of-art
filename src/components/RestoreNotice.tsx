// @node: F10.6
// The Loading screen's restore heading and line, and the kept-session sentence for the failure panel.
import type { SessionRecord } from '../store/sessionRecord';
import { labelOf, refOf } from './ResumeBanner';

export const KEPT_LINE = 'Your saved session is kept until you press Reset session or Back to Start.';

export function RestoreHeading({ record }: { record: SessionRecord }) {
  return (
    <>
      <h1>Restoring your session</h1>
      <p>{labelOf(record)} at {refOf(record)}. Your saved changes come back when the repository has loaded.</p>
    </>
  );
}

export function RestoreNotice({ record, failedLoad }: { record: SessionRecord; failedLoad: boolean }) {
  return (
    <div className="restore-notice">
      <RestoreHeading record={record} />
      {failedLoad && <p>{KEPT_LINE}</p>}
    </div>
  );
}
