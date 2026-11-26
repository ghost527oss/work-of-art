// @node: F7.1
// Every 2E-1 limit in one place. All values are provisional placeholders.
export const PREVIEW_LIMITS = {
  provisional: true,
  maxDocBytes: 1024 * 1024,
  maxInlinedFiles: 30,
  maxElements: 5000,
  consoleLines: 50,
  lineChars: 200,
  messagesPerSecond: 20,
  messageBytes: 8 * 1024,
  maxLayoutFindings: 100,
  layoutMs: 3000,
  maxComponents: 200,
  componentBytes: 100 * 1024,
  inlineLevels: 3,
  viewerLines: 2000,
  panelRem: 28,
  svgDataBytes: 100 * 1024,
} as const;
