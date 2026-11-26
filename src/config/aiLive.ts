// @node: F11.1
// Every new Phase 3A live-AI limit in one place. All values are provisional until measured with real providers.
// Plain numbers only: this file is safe to import from browser code.
export const AI_LIVE = {
  provisional: true,
  /** Per attempt (raised from 5,000 at the user's request so free reasoning models do not time out falsely). */
  attemptTimeoutMs: 7000,
  /** Whole request. Fits inside the 15 s browser timeout (`AI_LIMITS.clientTimeoutMs`) with about 1 s to spare. */
  totalBudgetMs: 14000,
  /** No new attempt starts when less than this remains. */
  minAttemptMs: 1500,
  maxPromptChars: 12000,
  // Reasoning models spend part of this on thinking before the JSON answer, so the caps are generous.
  maxOutputTokensLight: 1500,
  maxOutputTokensHeavy: 3000,
  maxProviderBodyBytes: 64 * 1024,
  maxCards: 2,
  maxCardChars: 700,
  wholeFileMaxBytes: 2048,
  windowLinesBefore: 15,
  windowLinesAfter: 15,
  windowMaxLines: 80,
  windowMaxBytes: 6 * 1024,
  headLines: 60,
  maxConnections: 3,
  maxEdits: 3,
  maxEditNewLines: 40,
  /** Equals WORK_LIMITS.maxDiffChars (the History limit). A test keeps the two equal. */
  maxProposalDiffChars: 2000,
  cacheMaxEntries: 30,
  cacheMaxBytes: 256 * 1024,
  maxAttemptsPerFinding: 3,
  maxFindingsListed: 50,
} as const;
