// @node: F11.3
import { describe, expect, it } from 'vitest';
import { AI_LIVE } from '../src/config/aiLive';
import { applyUnifiedDiff, hashText, reverseUnifiedDiff } from '../src/engine/diffApply';
import { buildEditDiff, extractJson, parseAnswer } from '../src/engine/live/answerParser';
import { validateAIResult } from '../src/engine/aiValidate';
import type { AIRequest, AIResult } from '../src/types/contracts';
import { applyHunks } from './helpers/applyHunks';

const FILE = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
const req = (over: Partial<AIRequest> = {}): AIRequest => ({
  requestId: 'r1', instruction: 'q', taskType: 'explain', selectedPaths: ['src/a.ts'], ...over,
});
const withSnippet = (over: Partial<AIRequest> = {}, content = FILE, startLine?: number): AIRequest =>
  req({ taskType: 'suggest_change', sourceContext: [{ filePath: 'src/a.ts', content, ...(startLine ? { startLine } : {}) }], ...over });
const json = (o: unknown) => JSON.stringify(o);
const patch = (edits: unknown, extra: Record<string, unknown> = {}) => json({ kind: 'patch', summary: 'fix', path: 'src/a.ts', edits, tests: ['t'], risks: ['r'], ...extra });
const asResult = (request: AIRequest, response: unknown) => ({ requestId: request.requestId, mode: 'live', response }) as unknown as AIResult;

describe('extractJson', () => {
  it('reads plain JSON, a fenced block, and JSON inside prose', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Here you go:\n```\n{"a":3}\n```\nBye')).toEqual({ a: 3 });
    expect(extractJson('Sure! {"a":4} hope that helps')).toEqual({ a: 4 });
  });
  it('returns undefined for no object, an array, broken JSON, empty, or huge text', () => {
    for (const t of ['', 'hello', '[1,2]', '{"a":', 'x'.repeat(200_001)]) expect(extractJson(t)).toBeUndefined();
    expect(extractJson(undefined as unknown as string)).toBeUndefined();
  });
});

describe('parseAnswer: explanation and clarification', () => {
  it('maps an explanation and adds the AI note, then the cards note when the cards did not cover it', () => {
    const r = parseAnswer(json({ kind: 'explanation', summary: 'S', evidence_paths: ['src/a.ts'], limitations: ['L1'], cards_covered: false }), req(), 'groq');
    expect(r.ok).toBe(true);
    if (!r.ok || r.response.type !== 'explanation') throw new Error('x');
    expect(r.response.summary).toBe('S');
    expect(r.response.evidencePaths).toEqual(['src/a.ts']);
    expect(r.response.limitations).toEqual([
      'L1',
      'This answer was written by an AI model (Groq). Check it before you rely on it.',
      'The reference cards did not cover this question.',
    ]);
  });
  it('defaults: no limitations, cards covered', () => {
    const r = parseAnswer(json({ kind: 'explanation', summary: 'S' }), req(), 'gemini');
    if (!r.ok || r.response.type !== 'explanation') throw new Error('x');
    expect(r.response.limitations).toEqual(['This answer was written by an AI model (Gemini). Check it before you rely on it.']);
  });
  it('maps a clarification and keeps at most 5 questions', () => {
    const r = parseAnswer(json({ kind: 'clarification', questions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), req(), 'groq');
    expect(r.ok && r.response.type === 'clarification' && r.response.questions).toHaveLength(5);
  });
  it('clips an over-long string to the contract limit', () => {
    const r = parseAnswer(json({ kind: 'explanation', summary: 'x'.repeat(5000) }), req(), 'groq');
    expect(r.ok && r.response.type === 'explanation' && r.response.summary.length).toBe(2000);
  });
});

describe('parseAnswer: bad answers', () => {
  const reason = (text: string, request = req()) => { const r = parseAnswer(text, request, 'groq'); return r.ok ? 'ok' : r.reason; };
  it('not JSON', () => expect(reason('I cannot do that')).toBe('not_json'));
  it('wrong shape: missing field, wrong type, unknown kind, empty summary', () => {
    expect(reason(json({ kind: 'explanation' }))).toBe('wrong_shape');
    expect(reason(json({ kind: 'explanation', summary: 5 }))).toBe('wrong_shape');
    expect(reason(json({ kind: 'novel', summary: 'S' }))).toBe('wrong_shape');
    expect(reason(json({ kind: 'explanation', summary: '' }))).toBe('wrong_shape');
  });
  it('a path that was not selected', () => {
    expect(reason(json({ kind: 'explanation', summary: 'S', evidence_paths: ['src/other.ts'] }))).toBe('path_not_selected');
    expect(reason(json({ kind: 'plan', summary: 'S', affected_paths: ['src/other.ts'], steps: ['s'], risks: [] }), req({ taskType: 'suggest_change' }))).toBe('path_not_selected');
  });
  it('a kind that the task does not allow', () => {
    expect(reason(json({ kind: 'plan', summary: 'S', affected_paths: ['src/a.ts'], steps: ['s'] }))).toBe('kind_not_allowed');
    expect(reason(json({ kind: 'action', action: 'help', summary: 'S' }))).toBe('kind_not_allowed');
    expect(reason(patch([{ start_line: 1, end_line: 1, new_text: 'x' }]))).toBe('kind_not_allowed');
    expect(reason(json({ kind: 'explanation', summary: 'S' }), req({ taskType: 'suggest_change' }))).toBe('kind_not_allowed');
  });
  it('a secret anywhere in the answer', () => {
    expect(reason(json({ kind: 'explanation', summary: 'use AKIAABCDEFGHIJKLMNOP now' }))).toBe('secret_in_answer');
    expect(reason(json({ kind: 'clarification', questions: ['token ghp_' + 'a'.repeat(36)] }))).toBe('secret_in_answer');
  });
});

describe('parseAnswer: plan', () => {
  const planText = json({ kind: 'plan', summary: 'S', affected_paths: ['src/a.ts', 'src/b.ts'], steps: ['one', 'two'], risks: ['r'] });
  it('maps a plan for selected files and adds the AI risk', () => {
    const r = parseAnswer(planText, req({ taskType: 'suggest_change', selectedPaths: ['src/a.ts', 'src/b.ts'] }), 'groq');
    if (!r.ok || r.response.type !== 'plan') throw new Error('x');
    expect(r.response.affectedPaths).toEqual(['src/a.ts', 'src/b.ts']);
    expect(r.response.steps).toEqual(['one', 'two']);
    expect(r.response.risks[0]).toBe('r');
    expect(r.response.risks.length).toBe(2);
  });
  it('with no file selected it becomes a clarification that asks which file', () => {
    const r = parseAnswer(planText, req({ taskType: 'suggest_change', selectedPaths: [] }), 'groq');
    expect(r.ok && r.response.type).toBe('clarification');
    expect(r.ok && r.response.type === 'clarification' && r.response.questions[0]).toContain('Which file');
  });
});

describe('parseAnswer: action', () => {
  const act = req({ taskType: 'act', selectedPaths: [] });
  it('maps an action for an act task with no snippets', () => {
    const r = parseAnswer(json({ kind: 'action', action: 'start', arg: 'crew', summary: 'Start the crew' }), act, 'groq');
    expect(r).toEqual({ ok: true, response: { type: 'action', action: 'start', arg: 'crew', summary: 'Start the crew' } });
    const r2 = parseAnswer(json({ kind: 'action', action: 'pause', summary: 'Pause' }), act, 'groq');
    expect(r2.ok && 'arg' in r2.response).toBe(false);
  });
  it('never accepts approve, reject, reset, or an unknown action', () => {
    for (const action of ['approve', 'reject', 'reset', 'delete']) {
      expect(parseAnswer(json({ kind: 'action', action, summary: 'x' }), act, 'groq').ok).toBe(false);
    }
  });
  it('is refused when snippets were sent', () => {
    const r = parseAnswer(json({ kind: 'action', action: 'help', summary: 'x' }), req({ taskType: 'act', sourceContext: [{ filePath: 'src/a.ts', content: 'x' }] }), 'groq');
    expect(r).toEqual({ ok: false, reason: 'action_not_allowed' });
  });
  it('the mapped result passes validateAIResult for the same request (argument rules)', () => {
    const r = parseAnswer(json({ kind: 'action', action: 'open', arg: 'log', summary: 'x' }), act, 'groq');
    if (!r.ok) throw new Error('x');
    expect(validateAIResult(act, asResult(act, r.response)).ok).toBe(true);
    const wrong = parseAnswer(json({ kind: 'action', action: 'start', summary: 'x' }), act, 'groq');
    if (wrong.ok) expect(validateAIResult(act, asResult(act, wrong.response)).ok).toBe(false);
  });
});

describe('buildEditDiff', () => {
  const edit = (start_line: number, end_line: number, new_text: string) => ({ start_line, end_line, new_text });
  it('builds one hunk with 3 context lines and correct header counts', () => {
    const r = buildEditDiff('src/a.ts', 1, FILE, [edit(10, 10, 'changed ten')]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.diff).toBe([
      '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -7,7 +7,7 @@',
      ' line 7', ' line 8', ' line 9', '-line 10', '+changed ten', ' line 11', ' line 12', ' line 13', '',
    ].join('\n'));
  });
  it('clips context at the edges of the snippet and counts added and removed lines', () => {
    const r = buildEditDiff('src/a.ts', 1, FILE, [edit(1, 2, 'a\nb\nc')]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.diff).toContain('@@ -1,5 +1,6 @@');
    expect(r.diff.split('\n').filter((l) => l.startsWith('+')).length).toBe(3 + 1); // 3 added lines + the header "+++"
  });
  it('supports a deletion (empty new_text) and several edits in one hunk', () => {
    const r = buildEditDiff('src/a.ts', 1, FILE, [edit(5, 5, ''), edit(8, 8, 'eight'), edit(6, 6, 'six')]);
    if (!r.ok) throw new Error(r.reason);
    // Lines 5 and 8 are removed, 6 is replaced, 8 is replaced: 3 old lines go, 2 new lines come. Context is lines 2 to 11.
    expect(r.diff).toBe([
      '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -2,10 +2,9 @@',
      ' line 2', ' line 3', ' line 4', '-line 5', '-line 6', '+six', ' line 7', '-line 8', '+eight', ' line 9', ' line 10', ' line 11', '',
    ].join('\n'));
  });
  it('uses the snippet start line for numbering (a window)', () => {
    const win = Array.from({ length: 10 }, (_, i) => `w${100 + i}`).join('\n');
    const r = buildEditDiff('f.ts', 100, win, [edit(104, 104, 'X')]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.diff).toContain('@@ -101,7 +101,7 @@');
  });
  it('rejects: no edits, too many edits, a bad range, outside the lines, overlap, too long, no change, redaction, CR', () => {
    const r = (e: ReturnType<typeof edit>[], content = FILE, first = 1) => buildEditDiff('f', first, content, e);
    expect(r([]).ok).toBe(false);
    expect(r([edit(1, 1, 'a'), edit(3, 3, 'a'), edit(5, 5, 'a'), edit(7, 7, 'a')]).ok).toBe(false);
    expect(r([edit(5, 4, 'a')]).ok).toBe(false);
    expect(r([edit(0, 1, 'a')]).ok).toBe(false);
    expect(r([edit(30, 31, 'a')]).ok).toBe(false);
    expect(r([edit(40, 41, 'a')], FILE, 1).ok).toBe(false);
    expect(r([edit(5, 7, 'a'), edit(7, 8, 'b')]).ok).toBe(false);
    expect(r([edit(5, 5, Array.from({ length: AI_LIVE.maxEditNewLines + 1 }, () => 'x').join('\n'))]).ok).toBe(false);
    expect(r([edit(5, 5, 'line 5')]).ok).toBe(false);
    expect(r([edit(1, 1, 'a')], 'k = "[REDACTED:assignment]"\nb').ok).toBe(false);
    expect(r([edit(1, 1, 'a')], 'one\r\ntwo').ok).toBe(false);
    expect(r([edit(1, 1, 'a\rb')]).ok).toBe(false);
    expect(r([edit(1.5, 2, 'a')]).ok).toBe(false);
  });
  it('rejects a diff larger than 2,000 characters', () => {
    const big = Array.from({ length: 80 }, (_, i) => `a fairly long line number ${i} with some padding text to make it large`).join('\n');
    const r = buildEditDiff('f', 1, big, [edit(1, 40, Array.from({ length: 40 }, (_, i) => `replacement line ${i} that is also rather long, with padding`).join('\n'))]);
    expect(r.ok).toBe(false);
  });
  it('a trailing newline in the snippet does not create a phantom line', () => {
    const r = buildEditDiff('f', 1, 'a\nb\nc\n', [edit(3, 3, 'C')]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.diff).toContain('@@ -1,3 +1,3 @@');
  });
});

describe('buildEditDiff: the diff applies and reverses (seeded random, 300 cases)', () => {
  function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
  it('agrees with applyUnifiedDiff and the independent applier, and reverses exactly', () => {
    const rand = rng(20261126);
    let built = 0;
    for (let n = 0; n < 300; n++) {
      const total = 5 + Math.floor(rand() * 60);
      const first = 1 + Math.floor(rand() * 200);
      const lines = Array.from({ length: total }, (_, i) => `row ${first + i} ${'x'.repeat(Math.floor(rand() * 8))}`);
      const content = lines.join('\n');
      const count = 1 + Math.floor(rand() * 3);
      const edits: Array<{ start_line: number; end_line: number; new_text: string }> = [];
      let cursor = first;
      for (let e = 0; e < count; e++) {
        const gap = Math.floor(rand() * 8);
        const start = cursor + gap;
        const end = start + Math.floor(rand() * 3);
        if (end > first + total - 1) break;
        const newLines = Math.floor(rand() * 4);
        edits.push({ start_line: start, end_line: end, new_text: Array.from({ length: newLines }, (_, i) => `new ${n} ${e} ${i}`).join('\n') });
        cursor = end + 2;
      }
      if (edits.length === 0) continue;
      const r = buildEditDiff('src/f.ts', first, content, edits);
      if (!r.ok) continue;
      built++;
      // The window is shown as the whole "file" with the same numbering only when first === 1; otherwise embed it in a bigger file.
      const before = Array.from({ length: first - 1 }, (_, i) => `pre ${i + 1}`);
      const file = [...before, ...lines].join('\n') + '\n';
      const applied = applyUnifiedDiff(file, r.diff);
      if (!applied.ok) throw new Error(`apply failed: ${applied.reason}\n${r.diff}`);
      expect(applyHunks(file, r.diff)).toBe(applied.text);
      const rev = reverseUnifiedDiff(r.diff)!;
      const back = applyUnifiedDiff(applied.text, rev);
      if (!back.ok) throw new Error(back.reason);
      expect(back.text).toBe(file);
      expect(hashText(back.text)).toBe(hashText(file));
      expect(applied.text).not.toBe(file);
    }
    expect(built).toBeGreaterThanOrEqual(200);
  });
  it('a CRLF file takes the same diff and comes back exactly', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `row ${i + 1}`);
    const r = buildEditDiff('f.txt', 1, lines.join('\n'), [{ start_line: 5, end_line: 6, new_text: 'five\nsix\nsix and a half' }]);
    if (!r.ok) throw new Error(r.reason);
    const crlf = lines.join('\r\n') + '\r\n';
    const applied = applyUnifiedDiff(crlf, r.diff);
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.text).toContain('five\r\nsix\r\nsix and a half\r\n');
    const back = applyUnifiedDiff(applied.text, reverseUnifiedDiff(r.diff)!);
    expect(back.ok && back.text).toBe(crlf);
  });
});

describe('parseAnswer: patch', () => {
  it('maps a patch to a patch_proposal that validates and applies to the snippet', () => {
    const request = withSnippet();
    const r = parseAnswer(patch([{ start_line: 10, end_line: 10, new_text: 'ten changed' }]), request, 'groq');
    if (!r.ok || r.response.type !== 'patch_proposal') throw new Error('x');
    expect(r.response.affectedPaths).toEqual(['src/a.ts']);
    expect(r.response.unifiedDiff).toContain('+ten changed');
    expect(r.response.risks[r.response.risks.length - 1]).toContain('written by an AI model');
    expect(validateAIResult(request, asResult(request, r.response)).ok).toBe(true);
    const applied = applyUnifiedDiff(FILE, r.response.unifiedDiff);
    expect(applied.ok && applied.text.split('\n')[9]).toBe('ten changed');
  });
  it('supplies a default test and always adds the AI risk when the model gives none', () => {
    const r = parseAnswer(json({ kind: 'patch', summary: 'x', path: 'src/a.ts', edits: [{ start_line: 2, end_line: 2, new_text: 'b' }] }), withSnippet(), 'groq');
    if (!r.ok || r.response.type !== 'patch_proposal') throw new Error('x');
    expect(r.response.tests.length).toBe(1);
    expect(r.response.risks.length).toBe(1);
  });
  it('is refused with no snippet, with two files, with the wrong path, or with a redacted snippet', () => {
    const e = [{ start_line: 1, end_line: 1, new_text: 'x' }];
    expect(parseAnswer(patch(e), req({ taskType: 'suggest_change' }), 'groq')).toEqual({ ok: false, reason: 'patch_not_allowed' });
    expect(parseAnswer(patch(e), withSnippet({ selectedPaths: ['src/a.ts', 'src/b.ts'] }), 'groq')).toEqual({ ok: false, reason: 'patch_not_allowed' });
    expect(parseAnswer(patch(e, { path: 'src/b.ts' }), withSnippet(), 'groq')).toEqual({ ok: false, reason: 'patch_not_allowed' });
    const redacted = parseAnswer(patch(e), withSnippet({}, 'k = "[REDACTED:assignment]"\nmore'), 'groq');
    expect(redacted.ok).toBe(false);
  });
  it('rejects bad edits (outside the lines shown, overlapping, no change) as bad_edits', () => {
    for (const edits of [[{ start_line: 99, end_line: 99, new_text: 'x' }], [{ start_line: 3, end_line: 5, new_text: 'x' }, { start_line: 5, end_line: 6, new_text: 'y' }], [{ start_line: 3, end_line: 3, new_text: 'line 3' }]]) {
      const r = parseAnswer(patch(edits), withSnippet(), 'groq');
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason.startsWith('bad_edits')).toBe(true);
    }
  });
  it('rejects a fractional or zero line number and more than 3 edits as wrong_shape', () => {
    const one = (e: unknown) => parseAnswer(patch([e]), withSnippet(), 'groq');
    expect(one({ start_line: 0, end_line: 1, new_text: 'x' })).toEqual({ ok: false, reason: 'wrong_shape' });
    expect(one({ start_line: 1.5, end_line: 2, new_text: 'x' })).toEqual({ ok: false, reason: 'wrong_shape' });
    const four = Array.from({ length: 4 }, (_, i) => ({ start_line: 2 * i + 1, end_line: 2 * i + 1, new_text: 'z' }));
    expect(parseAnswer(patch(four), withSnippet(), 'groq')).toEqual({ ok: false, reason: 'wrong_shape' });
  });
});

describe('parseAnswer: tolerant where it is safe (found with real models)', () => {
  const one = (edits: unknown, path = 'src/a.ts') => parseAnswer(JSON.stringify({ kind: 'patch', summary: 'fix', path, edits, extra: 'ignored' }), withSnippet(), 'gemini');
  it('unknown extra fields are ignored and never copied into the result', () => {
    const r = parseAnswer(JSON.stringify({ kind: 'explanation', summary: 'S', surprise: 'SMUGGLED', cards_covered: true }), req(), 'gemini');
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toContain('SMUGGLED');
    const p = one([{ start_line: 3, end_line: 3, new_text: 'x', note: 'SMUGGLED' }]);
    expect(p.ok).toBe(true);
    expect(JSON.stringify(p)).not.toContain('SMUGGLED');
  });
  it('the one selected file may be written ./index.ts, /index.ts, or a/index.ts, but no other file', () => {
    const e = [{ start_line: 3, end_line: 3, new_text: 'changed' }];
    for (const p of ['src/a.ts', './src/a.ts', '/src/a.ts', 'a/src/a.ts', 'b/src/a.ts']) {
      const r = one(e, p);
      expect(r.ok, p).toBe(true);
      expect(r.ok && r.response.type === 'patch_proposal' && r.response.affectedPaths).toEqual(['src/a.ts']);
    }
    for (const p of ['src/b.ts', '../src/a.ts', 'x/src/a.ts', '']) expect(one(e, p).ok, p).toBe(false);
  });
  it('a missing or null new_text deletes the lines', () => {
    for (const edit of [{ start_line: 3, end_line: 3, new_text: null }, { start_line: 3, end_line: 3 }]) {
      const r = one([edit]);
      expect(r.ok).toBe(true);
      expect(r.ok && r.response.type === 'patch_proposal' && r.response.unifiedDiff).toContain('-line 3');
    }
  });
  it('the unknown kind and a missing summary are still refused', () => {
    expect(parseAnswer(JSON.stringify({ kind: 'novel', summary: 's' }), req(), 'groq')).toEqual({ ok: false, reason: 'wrong_shape' });
    expect(parseAnswer(JSON.stringify({ kind: 'explanation' }), req(), 'groq')).toEqual({ ok: false, reason: 'wrong_shape' });
  });
});
