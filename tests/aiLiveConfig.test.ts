// @node: F11.1
import { describe, expect, it } from 'vitest';
import { AI_LIMITS } from '../src/config/aiLimits';
import { AI_LIVE } from '../src/config/aiLive';
import { AI_LIVE as FROM_PROXY } from '../src/config/budgets-proxy';
import { WORK_LIMITS } from '../src/config/workLimits';

describe('AI_LIVE limits', () => {
  it('are marked provisional', () => {
    expect(AI_LIVE.provisional).toBe(true);
  });
  it('uses the user-approved timeouts: 7 s per attempt, 14 s total', () => {
    expect(AI_LIVE.attemptTimeoutMs).toBe(7000);
    expect(AI_LIVE.totalBudgetMs).toBe(14000);
  });
  it('fits inside the 15 s browser timeout and leaves a usable minimum attempt', () => {
    expect(AI_LIVE.totalBudgetMs).toBeLessThan(AI_LIMITS.clientTimeoutMs);
    expect(AI_LIVE.attemptTimeoutMs).toBeLessThanOrEqual(AI_LIVE.totalBudgetMs);
    expect(AI_LIVE.minAttemptMs).toBe(1500);
  });
  it('keeps the proposal diff limit equal to the History limit', () => {
    expect(AI_LIVE.maxProposalDiffChars).toBe(WORK_LIMITS.maxDiffChars);
  });
  it('matches design 7.3', () => {
    expect(AI_LIVE).toMatchObject({
      maxPromptChars: 12000, maxOutputTokensLight: 700, maxOutputTokensHeavy: 1200, maxProviderBodyBytes: 65536,
      maxCards: 2, maxCardChars: 700, wholeFileMaxBytes: 2048, windowLinesBefore: 15, windowLinesAfter: 15,
      windowMaxLines: 80, windowMaxBytes: 6144, headLines: 60, maxConnections: 3, maxEdits: 3, maxEditNewLines: 40,
      cacheMaxEntries: 30, cacheMaxBytes: 262144, maxAttemptsPerFinding: 3, maxFindingsListed: 50,
    });
  });
  it('keeps the Phase 2 limits unchanged', () => {
    expect(AI_LIMITS).toMatchObject({ clientTimeoutMs: 15000, maxContextFiles: 5, maxContextTotalBytes: 60 * 1024, maxContextFileBytes: 20 * 1024, maxInstructionChars: 2000 });
  });
  it('is re-exported for browser code', () => {
    expect(FROM_PROXY).toBe(AI_LIVE);
  });
});
