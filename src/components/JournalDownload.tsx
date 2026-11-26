// @node: F9.9
// The Journal's Download block.
import { ExportButton } from './ExportButton';

export function JournalDownload({ onDownload, disabledReason }: { onDownload(): string | false; disabledReason?: string }) {
  return (
    <div className="journal-download">
      <p>A Markdown copy of this Journal at the current reading level. Nothing is uploaded.</p>
      <ExportButton label="Download journal (.md)" disabledReason={disabledReason} onExport={onDownload} />
    </div>
  );
}
