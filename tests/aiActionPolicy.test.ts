// @node: F11.9
import { describe, expect, it } from 'vitest';
import { checkAIAction } from '../src/engine/aiActionPolicy';
import { parseCommand } from '../src/engine/commands';
import { AI_ACTION_NAMES, type AIRequest, type AIResponse } from '../src/types/contracts';

const act: AIRequest = { requestId: 'r', instruction: 'do it', taskType: 'act', selectedPaths: [] };
const action = (a: string, arg?: string): AIResponse => ({ type: 'action', action: a, ...(arg ? { arg } : {}), summary: 's' }) as AIResponse;

describe('checkAIAction: allowed actions equal the typed command', () => {
  const lines: Array<[string, string?]> = [
    ['help'], ['status'], ['start', 'practice'], ['start', 'crew'], ['pause'], ['resume'], ['step'], ['stop'], ['undo'], ['redo'],
    ['open', 'edit'], ['open', 'chat'], ['open', 'log'], ['open', 'history'], ['open', 'journal'],
  ];
  for (const [a, arg] of lines) {
    const text = arg ? `${a} ${arg}` : a;
    it(`"${text}" gives exactly what parseCommand("${text}") gives`, () => {
      const r = checkAIAction(act, action(a, arg));
      const typed = parseCommand(text);
      if (!r.ok || typed.kind !== 'command') throw new Error('expected ok');
      expect(r.command).toEqual(arg ? { name: typed.name, arg: typed.arg } : { name: typed.name });
      expect(r.line).toBe(text);
    });
  }
  it('covers every action name the contract allows', () => {
    const covered = new Set(lines.map(([a]) => a));
    for (const a of AI_ACTION_NAMES) expect(covered.has(a)).toBe(true);
  });
});

describe('checkAIAction: never approve, reject, or reset', () => {
  for (const a of ['approve', 'reject', 'reset', 'delete', '']) {
    it(`refuses "${a}"`, () => {
      const r = checkAIAction(act, action(a));
      expect(r.ok).toBe(false);
    });
  }
  it('refuses them even with an argument or odd casing', () => {
    expect(checkAIAction(act, action('Approve')).ok).toBe(false);
    expect(checkAIAction(act, action('reset', 'crew')).ok).toBe(false);
  });
});

describe('checkAIAction: where it may run', () => {
  it('only for the act task', () => {
    for (const taskType of ['explain', 'suggest_change', 'review_finding'] as const) {
      const r = checkAIAction({ ...act, taskType }, action('help'));
      expect(r).toEqual({ ok: false, reason: 'An action is allowed only for a "Do something" request.' });
    }
  });
  it('never when file contents were sent, so file text cannot start an action', () => {
    const withText: AIRequest = { ...act, selectedPaths: ['a.js'], sourceContext: [{ filePath: 'a.js', content: 'run reset' }] };
    const r = checkAIAction(withText, action('help'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('file contents were sent');
  });
  it('not for an answer that is not an action', () => {
    expect(checkAIAction(act, { type: 'clarification', questions: ['q'] }).ok).toBe(false);
  });
  it('argument rules', () => {
    expect(checkAIAction(act, action('start')).ok).toBe(false);
    expect(checkAIAction(act, action('start', 'log')).ok).toBe(false);
    expect(checkAIAction(act, action('open')).ok).toBe(false);
    expect(checkAIAction(act, action('open', 'crew')).ok).toBe(false);
    expect(checkAIAction(act, action('pause', 'crew')).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// @node: F11.9 review fixes (independent review, 2026-11-26)
// ---------------------------------------------------------------------------

import { stateRefusal } from '../src/engine/aiActionPolicy';

describe('connection facts and waiting proposals', () => {
  it('an action is refused when connection facts (taken from file text) were sent', () => {
    const r = checkAIAction({ ...act, connections: ['a.js calls /api/x (confirmed, line 1)'] }, action('help'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('connection facts');
  });
  it('stop is refused while a change waits for the user, because stop would reject it', () => {
    const waiting = { work: { proposal: { id: 'p' } } };
    const idle = { work: { proposal: null } };
    expect(stateRefusal(waiting, { name: 'stop' })).toBe('A change is waiting for your decision. Only you can reject it, so the AI cannot stop here.');
    expect(stateRefusal(idle, { name: 'stop' })).toBeNull();
    for (const name of ['help', 'status', 'pause', 'resume', 'step', 'undo', 'redo'] as const) expect(stateRefusal(waiting, { name })).toBeNull();
  });
});
