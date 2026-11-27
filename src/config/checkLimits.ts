// @node: F12.1
// Every 3B-1 code-check limit in one place. All values are provisional placeholders.
export const CHECK_LIMITS = {
  provisional: true,
  maxJsBytes: 200 * 1024,
  maxCssBytes: 200 * 1024,
  maxHtmlBytes: 300 * 1024,
  maxInlineScripts: 20,
  maxCssRules: 500,
  maxCssFindings: 20,
  maxHtmlFindings: 10,
  maxBalanceFindings: 3,
  maxFixCandidates: 12,
  maxFixChars: 8,
  maxFixDiffChars: 2000,
  maxSelectorChars: 40,
} as const;
