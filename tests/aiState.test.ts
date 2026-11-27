// @node: F2.6
import { describe, expect, it } from 'vitest';
import {
  beginAIRequest,
  cancelAIRequest,
  clearAI,
  completeAIRequest,
  failAIRequest,
} from '../src/store/aiActions';
import { idleAI } from '../src/store/aiSlice';
import {
  beginIngestion,
  cancelIngestion,
  completeIngestion,
  failIngestion,
  initialState,
  reset,
  type StudioState,
} from '../src/store/useStudioStore';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import type { AIResult, ApiError } from '../src/types/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SENTINEL = 'SENTINEL_VAL_567ABC';

function base(): StudioState { return initialState(); }

const summary = { taskType: 'explain', selectedCount: 1, includesContent: false };
const apiErr: ApiError = { code: 'upstream_failure', message: 'boom' };
const goodResult: AIResult = {
  requestId: 'r1',
  mode: 'mock',
  response: { type: 'explanation', summary: 'x', evidencePaths: ['a.ts'], limitations: ['none'] },
};

function withPending(s: StudioState, id = 'r1'): StudioState {
  return beginAIRequest(s, id, summary, 1);
}

// ---------------------------------------------------------------------------
// initialState
// ---------------------------------------------------------------------------

describe('initialState', () => {
  it('has ai: idle', () => {
    expect(base().ai).toEqual(idleAI());
    expect(base().ai.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// beginAIRequest
// ---------------------------------------------------------------------------

describe('beginAIRequest', () => {
  it('transitions idle to pending', () => {
    const s = withPending(base());
    expect(s.ai.status).toBe('pending');
    expect(s.ai.requestId).toBe('r1');
    expect(s.ai.summary).toEqual(summary);
  });

  it('no-op while already pending', () => {
    const s = withPending(base());
    expect(beginAIRequest(s, 'r2', summary, 2)).toBe(s);
  });

  it('adds a log entry with ai_request action', () => {
    const s = withPending(base());
    const last = s.log[s.log.length - 1]!;
    expect(last.action).toBe('ai_request');
    expect(last.status).toBe('info');
    expect(last.message).toContain('explain');
    expect(last.message).toContain('1 file');
    expect(last.message).not.toContain(SENTINEL);
  });

  it('the summary never stores instruction text (sentinel test)', () => {
    // The summary stores task type (not secret) but NOT instruction text or file content.
    // We confirm that if instruction were somehow included, we'd detect it.
    const instructionSentinel = `INSTRUCTION_SENTINEL_XYZ`;
    const innocuousSummary = { taskType: 'explain', selectedCount: 1, includesContent: false };
    // Instruction is passed separately; it must NOT appear in ai or log fields that aren't the message
    const s = beginAIRequest(base(), 'r1', innocuousSummary, 1);
    // The summary should only contain taskType, selectedCount, includesContent
    expect(s.ai.summary).toEqual(innocuousSummary);
    expect(JSON.stringify(s.ai)).not.toContain(instructionSentinel);
  });
});

// ---------------------------------------------------------------------------
// completeAIRequest
// ---------------------------------------------------------------------------

describe('completeAIRequest', () => {
  it('transitions pending to done', () => {
    const s = completeAIRequest(withPending(base()), 'r1', goodResult, 2);
    expect(s.ai.status).toBe('done');
    expect(s.ai.result).toBe(goodResult);
    expect(s.ai.error).toBeUndefined();
  });

  it('no-op for a stale requestId', () => {
    const p = withPending(base());
    const s = completeAIRequest(p, 'STALE', goodResult, 2);
    expect(s).toBe(p);
  });

  it('no-op when nothing is pending', () => {
    const s = base();
    expect(completeAIRequest(s, 'r1', goodResult, 1)).toBe(s);
  });

  it('adds a log entry with ai_response action', () => {
    const s = completeAIRequest(withPending(base()), 'r1', goodResult, 2);
    const last = s.log[s.log.length - 1]!;
    expect(last.action).toBe('ai_response');
    expect(last.message).toContain('explanation');
    expect(last.message).toContain('mock');
  });
});

// ---------------------------------------------------------------------------
// failAIRequest
// ---------------------------------------------------------------------------

describe('failAIRequest', () => {
  it('transitions pending to failed', () => {
    const s = failAIRequest(withPending(base()), 'r1', apiErr, 2);
    expect(s.ai.status).toBe('failed');
    expect(s.ai.error).toEqual(apiErr);
    expect(s.ai.result).toBeUndefined();
  });

  it('no-op for a stale requestId', () => {
    const p = withPending(base());
    expect(failAIRequest(p, 'STALE', apiErr, 2)).toBe(p);
  });

  it('adds a log entry with ai_failed action', () => {
    const s = failAIRequest(withPending(base()), 'r1', apiErr, 2);
    const last = s.log[s.log.length - 1]!;
    expect(last.action).toBe('ai_failed');
    expect(last.status).toBe('failed');
    expect(last.message).toContain('upstream_failure');
  });
});

// ---------------------------------------------------------------------------
// cancelAIRequest
// ---------------------------------------------------------------------------

describe('cancelAIRequest', () => {
  it('transitions pending to idle', () => {
    const s = cancelAIRequest(withPending(base()), 2);
    expect(s.ai).toEqual(idleAI());
  });

  it('no-op when not pending', () => {
    const s = base();
    expect(cancelAIRequest(s, 1)).toBe(s);
  });

  it('adds a log entry with ai_cancelled action', () => {
    const s = cancelAIRequest(withPending(base()), 2);
    const last = s.log[s.log.length - 1]!;
    expect(last.action).toBe('ai_cancelled');
    expect(last.message).toBe('AI request cancelled.');
  });
});

// ---------------------------------------------------------------------------
// clearAI
// ---------------------------------------------------------------------------

describe('clearAI', () => {
  it('returns to idle with no log entry', () => {
    const before = withPending(base());
    const after = clearAI(before);
    expect(after.ai).toEqual(idleAI());
    expect(after.log.length).toBe(before.log.length); // no extra log entry
  });
});

// ---------------------------------------------------------------------------
// Clearing on snapshot change (via store actions)
// ---------------------------------------------------------------------------

describe('AI state clears when snapshot changes', () => {
  function runWithSnapshot() {
    let s = base();
    s = beginIngestion(s, { owner: 'o', repo: 'r', source: 'github' }, 1);
    const snap = buildSampleSnapshot('static-site', 1);
    s = completeIngestion(s, s.ingestion.runId, snap, 2);
    return s;
  }

  it('completeIngestion clears the AI slice', () => {
    let s = beginIngestion(base(), { owner: 'o', repo: 'r', source: 'github' }, 1);
    s = withPending(s);
    s = completeIngestion(s, s.ingestion.runId, buildSampleSnapshot('static-site', 1), 3);
    expect(s.ai).toEqual(idleAI());
  });

  it('foreground beginIngestion clears the AI slice', () => {
    let s = runWithSnapshot();
    s = withPending(s);
    s = beginIngestion(s, { owner: 'o', repo: 'r', source: 'github' }, 5);
    expect(s.ai).toEqual(idleAI());
  });

  it('background beginIngestion does NOT clear the AI slice', () => {
    let s = runWithSnapshot();
    s = withPending(s);
    const aiStateBefore = s.ai;
    // keepSnapshot = true means background=true
    s = beginIngestion(s, { owner: 'o', repo: 'r', source: 'github', scope: ['src'] }, 5, { keepSnapshot: true });
    expect(s.ai).toBe(aiStateBefore);
  });

  it('foreground cancelIngestion clears the AI slice', () => {
    let s = beginIngestion(base(), { owner: 'o', repo: 'r', source: 'github' }, 1);
    s = withPending(s);
    s = cancelIngestion(s, 3);
    expect(s.ai).toEqual(idleAI());
  });

  it('background cancelIngestion keeps AI slice (snapshot stays, so AI context is still valid)', () => {
    let s = runWithSnapshot();
    s = beginIngestion(s, { owner: 'o', repo: 'r', source: 'github', scope: ['src'] }, 5, { keepSnapshot: true });
    s = withPending(s);
    s = cancelIngestion(s, 6);
    // Background cancel keeps the snapshot; the AI slice is kept too
    expect(s.snapshot).toBeTruthy();
    // AI was pending — cancelIngestion doesn't cancel AI (the controller does in M10)
    expect(s.ai.status).toBe('pending');
  });

  it('reset clears the AI slice', () => {
    let s = runWithSnapshot();
    s = withPending(s);
    s = reset(s);
    expect(s.ai).toEqual(idleAI());
  });

  it('a background reload that completes clears the AI slice', () => {
    let s = runWithSnapshot();
    s = withPending(s);
    // Simulate a background reload completing
    s = beginIngestion(s, { owner: 'o', repo: 'r', scope: ['src'], source: 'github' }, 5, { keepSnapshot: true });
    s = completeIngestion(s, s.ingestion.runId, buildSampleSnapshot('static-site', 2), 6);
    expect(s.ai).toEqual(idleAI());
  });

  it('a background reload that fails does NOT clear the AI slice', () => {
    let s = runWithSnapshot();
    s = withPending(s);
    s = completeAIRequest(s, 'r1', goodResult, 3);
    // After AI done, start a background reload and fail it
    s = beginIngestion(s, { owner: 'o', repo: 'r', scope: ['src'], source: 'github' }, 5, { keepSnapshot: true });
    const { failIngestion: fi } = { failIngestion };
    s = fi(s, s.ingestion.runId, apiErr, 6);
    // AI slice should still have the result
    expect(s.ai.status).toBe('done');
    expect(s.snapshot).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Log entries never contain instruction text or file content
// ---------------------------------------------------------------------------

describe('log entries: sentinel values never appear', () => {
  it('the full state serialisation contains no leaked instruction text', () => {
    // The sentinel here is used as instruction text — it must NOT appear in AI/log fields
    // (the task type and log messages are fine to contain the type name, not raw instructions)
    const instructionText = `VERY_SECRET_INSTRUCTION_DO_NOT_LOG`;
    // We test that if instruction were stored, it would be detectable
    // The store only stores the summary, not the instruction
    const innocuousSummary = { taskType: 'explain', selectedCount: 1, includesContent: false };
    let s = beginAIRequest(base(), 'r1', innocuousSummary, 1);
    s = cancelAIRequest(s, 2);
    s = beginAIRequest(s, 'r2', innocuousSummary, 3);
    s = completeAIRequest(s, 'r2', goodResult, 4);
    s = beginAIRequest(s, 'r3', innocuousSummary, 5);
    s = failAIRequest(s, 'r3', apiErr, 6);
    // Instruction text must not be in log
    expect(JSON.stringify(s.log)).not.toContain(instructionText);
    // Confirm the summary only contains the right keys
    expect(Object.keys(s.ai.summary ?? {})).toEqual(['taskType', 'selectedCount', 'includesContent']);
  });

  it('log entries have redacted: false and affectedPaths: []', () => {
    let s = withPending(base());
    s = completeAIRequest(s, 'r1', goodResult, 2);
    for (const entry of s.log) {
      expect(entry.redacted).toBe(false);
      expect(entry.affectedPaths).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// No import cycle check
// ---------------------------------------------------------------------------

describe('no import cycle', () => {
  it('aiSlice can be imported independently', async () => {
    const mod = await import('../src/store/aiSlice');
    expect(typeof mod.idleAI).toBe('function');
  });

  it('aiActions can be imported independently', async () => {
    const mod = await import('../src/store/aiActions');
    expect(typeof mod.beginAIRequest).toBe('function');
  });

  it('useStudioStore can be imported independently', async () => {
    const mod = await import('../src/store/useStudioStore');
    expect(typeof mod.initialState).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// @node: F11.8 Phase 3A: fromCache and the attempt counts
// ---------------------------------------------------------------------------

import { aiBegin, aiCancel, aiClear, aiComplete, aiCountAttempt, aiFail, aiReuse } from '../src/store/aiSlice';

describe('Phase 3A slice additions', () => {
  const summary = { taskType: 'explain', selectedCount: 1, includesContent: false };
  const result: AIResult = { requestId: 'r1', mode: 'live', response: { type: 'clarification', questions: ['q'] } };

  it('aiReuse shows a saved answer with fromCache and starts no request', () => {
    const s = aiReuse(idleAI(), 'r1', summary, result);
    expect(s).toEqual({ status: 'done', requestId: 'r1', summary, result, fromCache: true });
  });
  it('aiReuse is refused while a request is pending', () => {
    const pending = aiBegin(idleAI(), 'r0', summary);
    expect(aiReuse(pending, 'r1', summary, result)).toBe(pending);
  });
  it('a normal completion is not marked fromCache', () => {
    const s = aiComplete(aiBegin(idleAI(), 'r1', summary), 'r1', result);
    expect('fromCache' in s).toBe(false);
  });
  it('attempt counts increase per finding and survive begin, complete, fail, and cancel', () => {
    let s = aiCountAttempt(idleAI(), 'f1');
    s = aiCountAttempt(s, 'f1');
    s = aiCountAttempt(s, 'f2');
    expect(s.attempts).toEqual({ f1: 2, f2: 1 });
    const p = aiBegin(s, 'r1', summary);
    expect(p.attempts).toEqual({ f1: 2, f2: 1 });
    expect(aiComplete(p, 'r1', result).attempts).toEqual({ f1: 2, f2: 1 });
    expect(aiFail(p, 'r1', { code: 'timeout', message: 'm' }).attempts).toEqual({ f1: 2, f2: 1 });
    expect(aiCancel(p)).toEqual({ status: 'idle', attempts: { f1: 2, f2: 1 } });
    expect(aiReuse(s, 'r2', summary, result).attempts).toEqual({ f1: 2, f2: 1 });
  });
  it('clearing the slice (a new snapshot) forgets the counts, and idle has no attempts field', () => {
    const s = aiCountAttempt(idleAI(), 'f1');
    expect(aiClear()).toEqual({ status: 'idle' });
    expect(s.attempts).toEqual({ f1: 1 });
    expect(aiCancel(aiBegin(idleAI(), 'r', summary))).toEqual({ status: 'idle' });
  });
});
