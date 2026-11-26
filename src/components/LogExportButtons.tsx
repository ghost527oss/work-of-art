// @node: F9.9
// The Log panel's two downloads.
import { ExportButton } from './ExportButton';

export function LogExportButtons({ count, onDownload }: { count: number; onDownload(format: 'md' | 'json'): string | false }) {
  const reason = count === 0 ? 'The log is empty.' : undefined;
  return (
    <div className="log-export">
      <ExportButton label="Download log (.md)" disabledReason={reason} onExport={() => onDownload('md')} />
      <ExportButton label="Download log (.json)" disabledReason={reason} onExport={() => onDownload('json')} />
    </div>
  );
}
