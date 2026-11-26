// @node: F10.1
// Every 2G limit in one place. All values are provisional placeholders.
export const SESSION_LIMITS = {
  provisional: true,
  recordBytes: 4096,
  folders: 20,
  pathChars: 250,
  componentNameChars: 100,
  maxPreviewOnly: 50,
  applyWaitMs: 3000,
} as const;
