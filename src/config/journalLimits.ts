// @node: F9.1
// Every 2F limit in one place. All values are provisional placeholders.
export const JOURNAL_LIMITS = {
  provisional: true,
  maxFlows: 30,
  stepsPerFlow: 12,
  requestFlowFiles: 8,
  requestFlowLevels: 3,
  pageFlows: 3,
  requestFlows: 20,
  settingFlows: 20,
  instancesPerLesson: 5,
  overviewRoutes: 10,
  patchBytes: 512 * 1024,
  journalBytes: 200 * 1024,
  logEntries: 500,
  contextLines: 3,
  previewLines: 2000,
  diffWork: 4_000_000,
} as const;
