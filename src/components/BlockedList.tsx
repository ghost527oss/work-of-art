// @node: F12.6
// What the preview did not load and why, plus the plain note about outside hosts. Props only; all text is React text.
import { FONT_HOSTS, STYLE_HOSTS } from '../config/previewHosts';
import { describeBlocked, type BlockedEntry } from '../preview/blockedReport';

export const OUTSIDE_HOSTS_NOTE = `Styles and fonts may load from: ${[...new Set([...STYLE_HOSTS, ...FONT_HOSTS])].join(', ')}. Pictures may load from their own https addresses. Any of these hosts can see your IP address. No referrer is sent.`;

export function BlockedList({ blocked, outsideStyles = [], outsideScripts = [] }: { blocked: readonly BlockedEntry[]; outsideStyles?: readonly string[]; outsideScripts?: readonly string[] }) {
  const d = describeBlocked(blocked);
  return (
    <div className="blocked-list">
      <p className="note">{OUTSIDE_HOSTS_NOTE}</p>
      {outsideStyles.length > 0 && <p className="note">Loaded from outside: {[...new Set(outsideStyles)].join(', ')} (styles).</p>}
      {outsideScripts.length > 0 && <p className="note">Loaded from outside: {[...new Set(outsideScripts)].join(', ')} (scripts).</p>}
      {d.total === 0 ? (
        <p className="note">Nothing was blocked.</p>
      ) : (
        <details>
          <summary>Not loaded in the preview ({d.total})</summary>
          <ul>
            {d.lines.map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}
            {d.more > 0 && <li>and {d.more} more.</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
