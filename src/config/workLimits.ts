// @node: F4.2
// Every 2B limit in one place. All values are provisional placeholders.

export const WORK_LIMITS = {
  provisional: true,
  tickMs: 1200,
  maxSteps: 8,
  maxPracticeFiles: 2,
  maxPracticeFileBytes: 20 * 1024,
  maxHistoryEntries: 50,
  maxChatReplies: 20,
  maxSavedLogEntries: 200,
  maxSavedBytes: 256 * 1024,
  maxDiffChars: 2000,
} as const;
