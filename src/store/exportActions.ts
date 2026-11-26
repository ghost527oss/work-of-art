// @node: F9.7
// Export Log entries: counts or the level only. Written only after the download succeeded.
import { withLog, type StudioState } from './useStudioStore';

const log = (s: StudioState, now: number, action: string, message: string): StudioState => ({ ...s, ...withLog(s, now, { action, status: 'info', message }) });

export const logPatchExport = (s: StudioState, now: number, files: number, hunks: number) => log(s, now, 'export_patch', `Exported patch: ${files} files, ${hunks} hunks.`);
export const logLogExport = (s: StudioState, now: number, format: 'md' | 'json', entries: number) => log(s, now, 'export_log', `Exported log (${format}): ${entries} entries.`);
export const logJournalExport = (s: StudioState, now: number, level: string) => log(s, now, 'export_journal', `Exported journal (${level}).`);
