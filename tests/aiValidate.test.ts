// @node: F2.1
import { describe, expect, it } from 'vitest';
import { validateAIRequest, validateAIResult } from '../src/engine/aiValidate';
import type { AIRequest, AIResult } from '../src/types/contracts';

const SENTINEL = 'SENTINEL_VALUE_123XYZ';

const baseReq = {
  requestId: 'req-1',
  instruction: 'Explain this code.',
  taskType: 'explain' as const,
  selectedPaths: ['src/main.ts'],
};

function ok(input: unknown) {
  const r = validateAIRequest(input);
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`);
  return r.request;
}

function bad(input: unknown) {
  const r = validateAIRequest(input);
  if (r.ok) throw new Error('expected failure');
  return r;
}

// ---------------------------------------------------------------------------
// validateAIRequest: valid cases
// ---------------------------------------------------------------------------

describe('validateAIRequest: valid', () => {
  it('passes a minimal request', () => {
    const r = ok(baseReq);
    expect(r.requestId).toBe('req-1');
    expect(r.instruction).toBe('Explain this code.');
  });

  it('trims the instruction and returns the trimmed value', () => {
    const r = ok({ ...baseReq, instruction: '  hello world  ' });
    expect(r.instruction).toBe('hello world');
  });

  it('passes a request with sourceContext', () => {
    expect(validateAIRequest({
      ...baseReq,
      sourceContext: [{ filePath: 'src/main.ts', content: 'export const x = 1;' }],
    }).ok).toBe(true);
  });

  it('passes with no selectedPaths', () => {
    expect(validateAIRequest({ ...baseReq, selectedPaths: [] }).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAIRequest: classification (invalid_request vs oversized)
// ---------------------------------------------------------------------------

describe('validateAIRequest: classification', () => {
  it('invalid_request for an unknown field even if it is also large', () => {
    const r = bad({ ...baseReq, unknownField: 'x'.repeat(300_000) });
    expect(r.code).toBe('invalid_request');
  });

  it('oversized for selectedPaths with 11 entries (only size issues)', () => {
    const r = bad({ ...baseReq, selectedPaths: Array.from({ length: 11 }, (_, i) => `f${i}.ts`) });
    expect(r.code).toBe('oversized');
  });

  it('invalid_request for a wrong taskType (not a size issue)', () => {
    const r = bad({ ...baseReq, taskType: 'nope' });
    expect(r.code).toBe('invalid_request');
  });

  it('invalid_request for a whitespace-only instruction', () => {
    const r = bad({ ...baseReq, instruction: '   ' });
    expect(r.code).toBe('invalid_request');
  });
});

// ---------------------------------------------------------------------------
// validateAIRequest: path rules
// ---------------------------------------------------------------------------

describe('validateAIRequest: path rules', () => {
  it('invalid_request for an unsafe path', () => {
    const r = bad({ ...baseReq, selectedPaths: ['../etc/passwd'] });
    expect(r.code).toBe('invalid_request');
    expect(r.message).toMatch(/unsafe/i);
    expect(r.message).not.toContain(SENTINEL);
  });

  it('invalid_request for a duplicate path', () => {
    const r = bad({ ...baseReq, selectedPaths: ['src/a.ts', 'src/a.ts'] });
    expect(r.code).toBe('invalid_request');
    expect(r.message).toMatch(/duplicate/i);
  });

  it('invalid_request for a path that looks like a secret', () => {
    // A github token as a path would trigger containsSecret
    const secretPath = `src/ghp_${'A'.repeat(36)}.ts`;
    const r = bad({ ...baseReq, selectedPaths: [secretPath] });
    expect(r.code).toBe('invalid_request');
    expect(r.message).toMatch(/secret pattern/i);
    expect(r.message).not.toContain(secretPath);
  });

  it('invalid_request for sourceContext with a filePath not in selectedPaths', () => {
    const r = bad({
      ...baseReq,
      selectedPaths: ['src/a.ts'],
      sourceContext: [{ filePath: 'src/b.ts', content: 'x' }],
    });
    expect(r.code).toBe('invalid_request');
    expect(r.message).toMatch(/not in selectedPaths/i);
  });

  it('invalid_request for duplicate filePaths in sourceContext', () => {
    const r = bad({
      ...baseReq,
      selectedPaths: ['src/a.ts'],
      sourceContext: [
        { filePath: 'src/a.ts', content: 'x' },
        { filePath: 'src/a.ts', content: 'y' },
      ],
    });
    expect(r.code).toBe('invalid_request');
    expect(r.message).toMatch(/duplicate/i);
  });
});

// ---------------------------------------------------------------------------
// validateAIRequest: oversized content
// ---------------------------------------------------------------------------

describe('validateAIRequest: oversized content', () => {
  const encoder = new TextEncoder();
  const KB20 = 20 * 1024;

  it('passes exactly 20 KB of content for one file', () => {
    const content = 'a'.repeat(KB20);
    expect(encoder.encode(content).length).toBe(KB20);
    expect(validateAIRequest({
      ...baseReq,
      sourceContext: [{ filePath: 'src/main.ts', content }],
    }).ok).toBe(true);
  });

  it('oversized for content one byte over 20 KB', () => {
    // Use a 2-byte char to ensure the byte count is what matters
    const bytes = new Uint8Array(KB20 + 2);
    bytes.fill(0xc3); // first byte of a 2-byte UTF-8 sequence — may not be valid but that's ok
    // Build a string that's exactly KB20+1 bytes: 'a' * KB20 + extra char
    const content = 'a'.repeat(KB20) + 'x'; // KB20 + 1 bytes
    const r = bad({
      ...baseReq,
      sourceContext: [{ filePath: 'src/main.ts', content }],
    });
    expect(r.code).toBe('oversized');
  });

  it('passes exactly 60 KB total across three files', () => {
    const content = 'a'.repeat(KB20);
    expect(validateAIRequest({
      ...baseReq,
      selectedPaths: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      sourceContext: [
        { filePath: 'src/a.ts', content },
        { filePath: 'src/b.ts', content },
        { filePath: 'src/c.ts', content },
      ],
    }).ok).toBe(true);
  });

  it('oversized when total content exceeds 60 KB', () => {
    const content = 'a'.repeat(KB20);
    const r = bad({
      ...baseReq,
      selectedPaths: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
      sourceContext: [
        { filePath: 'src/a.ts', content },
        { filePath: 'src/b.ts', content },
        { filePath: 'src/c.ts', content },
        { filePath: 'src/d.ts', content }, // 80 KB total — over 60 KB
      ],
    });
    expect(r.code).toBe('oversized');
  });

  it('counts multi-byte characters as bytes, not chars', () => {
    // 'é' is 2 bytes; (KB20/2) × 'é' = KB20 bytes = at the limit
    const twoByteChar = '\u00e9'; // é
    const content = twoByteChar.repeat(KB20 / 2); // exactly KB20 bytes
    expect(encoder.encode(content).length).toBe(KB20);
    expect(validateAIRequest({
      ...baseReq,
      sourceContext: [{ filePath: 'src/main.ts', content }],
    }).ok).toBe(true);

    // One extra 2-byte char puts it over
    const over = twoByteChar.repeat(KB20 / 2 + 1);
    expect(encoder.encode(over).length).toBe(KB20 + 2);
    const r = bad({ ...baseReq, sourceContext: [{ filePath: 'src/main.ts', content: over }] });
    expect(r.code).toBe('oversized');
  });
});

// ---------------------------------------------------------------------------
// validateAIRequest: sentinel — no value leaks into error messages
// ---------------------------------------------------------------------------

describe('validateAIRequest: sentinel values never appear in messages', () => {
  const cases: Array<[string, unknown]> = [
    ['unsafe path', { ...baseReq, selectedPaths: [`../${SENTINEL}/file.ts`] }],
    ['secret-like path', { ...baseReq, selectedPaths: [`src/ghp_${'A'.repeat(36)}_${SENTINEL}.ts`] }],
    ['duplicate path', { ...baseReq, selectedPaths: [`src/${SENTINEL}.ts`, `src/${SENTINEL}.ts`] }],
    ['invalid_request (unknown field)', { ...baseReq, [SENTINEL]: 'x' }],
    ['sourceContext path not in selectedPaths', { ...baseReq, selectedPaths: ['src/a.ts'], sourceContext: [{ filePath: `src/${SENTINEL}.ts`, content: 'x' }] }],
  ];

  for (const [name, input] of cases) {
    it(`${name}`, () => {
      const r = bad(input);
      expect(r.message).not.toContain(SENTINEL);
    });
  }
});

// ---------------------------------------------------------------------------
// validateAIResult
// ---------------------------------------------------------------------------

function baseResult(type: string, extra: Record<string, unknown> = {}): AIResult {
  const response = { type, ...extra };
  return { requestId: 'req-1', mode: 'mock', response } as AIResult;
}

const req: AIRequest = {
  requestId: 'req-1',
  instruction: 'Explain.',
  taskType: 'explain',
  selectedPaths: ['src/a.ts'],
};

describe('validateAIResult: valid cases', () => {
  it('clarification', () => {
    expect(validateAIResult(req, baseResult('clarification', { questions: ['Why?'] })).ok).toBe(true);
  });

  it('explanation', () => {
    expect(validateAIResult(req, baseResult('explanation', {
      summary: 'x', evidencePaths: ['src/a.ts'], limitations: ['none'],
    })).ok).toBe(true);
  });

  it('plan', () => {
    expect(validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'plan', summary: 'x', affectedPaths: ['src/a.ts'], steps: ['s'], risks: ['r'],
      },
    }).ok).toBe(true);
  });

  it('patch_proposal with a short diff', () => {
    expect(validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'patch_proposal', summary: 'x', affectedPaths: ['src/a.ts'],
        unifiedDiff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1 @@\n+added\n',
        tests: ['test'], risks: ['r'],
      },
    }).ok).toBe(true);
  });
});

describe('validateAIResult: rejection cases', () => {
  it('rejects a different requestId', () => {
    const r = validateAIResult(req, { ...baseResult('clarification', { questions: ['q'] }), requestId: 'other' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('requestId mismatch'))).toBe(true);
  });

  it('rejects an evidencePath outside selectedPaths', () => {
    const r = validateAIResult(req, baseResult('explanation', {
      summary: 'x', evidencePaths: ['src/b.ts'], limitations: ['l'],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('evidencePaths'))).toBe(true);
  });

  it('rejects an affectedPath outside selectedPaths', () => {
    const r = validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'plan', summary: 'x', affectedPaths: ['src/other.ts'], steps: ['s'], risks: ['r'],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('affectedPaths'))).toBe(true);
  });

  it('rejects a plan with empty affectedPaths', () => {
    const r = validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'plan', summary: 'x', affectedPaths: [], steps: ['s'], risks: ['r'],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('affectedPath'))).toBe(true);
  });

  it('rejects a patch_proposal with empty affectedPaths', () => {
    const r = validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'patch_proposal', summary: 'x', affectedPaths: [],
        unifiedDiff: 'd', tests: ['t'], risks: ['r'],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('affectedPath'))).toBe(true);
  });

  it('rejects a unifiedDiff over 20 KB (UTF-8 bytes)', () => {
    // Build a diff whose byte length is exactly 20 KB + 1
    const bigDiff = 'a'.repeat(20 * 1024 + 1);
    const r = validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'patch_proposal', summary: 'x', affectedPaths: ['src/a.ts'],
        unifiedDiff: bigDiff, tests: ['t'], risks: ['r'],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.some((p) => p.includes('unifiedDiff'))).toBe(true);
  });

  it('accepts a unifiedDiff of exactly 20 KB', () => {
    const exactly20k = 'a'.repeat(20 * 1024);
    expect(validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'patch_proposal', summary: 'x', affectedPaths: ['src/a.ts'],
        unifiedDiff: exactly20k, tests: ['t'], risks: ['r'],
      },
    }).ok).toBe(true);
  });

  it('rejects a result that fails the schema (e.g. questions over 5)', () => {
    const r = validateAIResult(req, {
      requestId: 'req-1', mode: 'mock', response: {
        type: 'clarification', questions: Array(6).fill('q'),
      },
    });
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// @node: F11.1 Phase 3A additions
// ---------------------------------------------------------------------------

describe('validateAIRequest: Phase 3A fields', () => {
  it('accepts a known skillId and safe connections', () => {
    const r = ok({ ...baseReq, skillId: 'scan.frontend.img-alt', connections: ['src/a.js calls /api/x (confirmed, line 3)'] });
    expect(r.skillId).toBe('scan.frontend.img-alt');
  });
  it('rejects an unknown skillId', () => {
    expect(bad({ ...baseReq, skillId: 'scan.frontend.not-real' }).code).toBe('invalid_request');
  });
  it('rejects a connection that matches a secret pattern, without echoing it', () => {
    const r = bad({ ...baseReq, connections: ['key=AKIAABCDEFGHIJKLMNOP'] });
    expect(r.code).toBe('invalid_request');
    expect(r.message).not.toContain('AKIA');
  });
  it('accepts a snippet with startLine inside selectedPaths', () => {
    ok({ ...baseReq, sourceContext: [{ filePath: 'src/main.ts', content: 'a', startLine: 12 }] });
  });
});

describe('validateAIResult: action responses', () => {
  const act: AIRequest = { requestId: 'req-1', instruction: 'start the crew', taskType: 'act', selectedPaths: [] };
  const result = (response: unknown) => ({ requestId: 'req-1', mode: 'live', response }) as unknown as AIResult;
  it('accepts start crew, open log, and help for an act request', () => {
    expect(validateAIResult(act, result({ type: 'action', action: 'start', arg: 'crew', summary: 's' })).ok).toBe(true);
    expect(validateAIResult(act, result({ type: 'action', action: 'open', arg: 'log', summary: 's' })).ok).toBe(true);
    expect(validateAIResult(act, result({ type: 'action', action: 'help', summary: 's' })).ok).toBe(true);
  });
  it('rejects an action for any other task type', () => {
    for (const taskType of ['explain', 'suggest_change', 'review_finding'] as const) {
      expect(validateAIResult({ ...act, taskType }, result({ type: 'action', action: 'help', summary: 's' })).ok).toBe(false);
    }
  });
  it('rejects an action when file text was sent', () => {
    const withText: AIRequest = { ...act, selectedPaths: ['a.ts'], sourceContext: [{ filePath: 'a.ts', content: 'x' }] };
    expect(validateAIResult(withText, result({ type: 'action', action: 'help', summary: 's' })).ok).toBe(false);
  });
  it('enforces the argument rules', () => {
    const v = (response: unknown) => validateAIResult(act, result(response)).ok;
    expect(v({ type: 'action', action: 'start', summary: 's' })).toBe(false);
    expect(v({ type: 'action', action: 'start', arg: 'log', summary: 's' })).toBe(false);
    expect(v({ type: 'action', action: 'open', summary: 's' })).toBe(false);
    expect(v({ type: 'action', action: 'open', arg: 'crew', summary: 's' })).toBe(false);
    expect(v({ type: 'action', action: 'pause', arg: 'crew', summary: 's' })).toBe(false);
  });
});
