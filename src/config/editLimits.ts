// @node: F8.1
// Every 2E-2 limit in one place. All values are provisional placeholders.
export const EDIT_LIMITS = {
  provisional: true,
  maxSelection: 20,
  maxPreviewOnly: 50,
  listItems: 200,
  maxDiffChars: 2000,
  maxHistory: 50,
  recheckMs: 300,
  maxSize: 5000,
  minWindow: 640,
  maxPages: 50,
} as const;
