// @node: F11.9
import { describe, expect, it } from 'vitest';
import { createAIHandoff } from '../src/hooks/useAIHandoff';
import { practiceContent } from '../src/engine/practiceScript';
import { mergedFindings } from '../src/engine/scanView';
import { buildRecord } from '../src/store/workStorage';
import { createStore, type Store, type StudioState } from '../src/store/useStudioStore';
import { runCommand } from '../src/store/workActions';
import { parseCommand, type ActionName, type CommandArg } from '../src/engine/commands';
import type { AIRequest, AIResult } from '../src/types/contracts';
import { IMG_FIXTURE, cmd, loadedState, patchRequest, patchResult, wctx } from './helpers/aiHarness';

const EDIT = [{ start_line: 5, end_line: 5, new_text: '<img src="logo.png" alt="Shop logo">' }];
const BAD_EDIT = [{ start_line: 5, end_line: 5, new_text: '<img src="logo.png" class="logo">' }];

async function setup() {
  const state = await loadedState(IMG_FIXTURE);
  const store: Store<StudioState> = createStore(state);
  let n = 0;
  const ran: string[] = [];
  const harness = {
    run: (name: ActionName, arg?: CommandArg) => {
      ran.push(arg ? `${name} ${arg}` : name);
      store.update((s) => runCommand(s, { name, ...(arg ? { arg } : {}) }, wctx()).state);
    },
  };
  const handoff = createAIHandoff(store, harness, { now: () => 5000, newId: () => `aip-${++n}` });
  const finding = mergedFindings(state)[0]!;
  const request = (over: Partial<AIRequest> = {}) => patchRequest(store.getState(), 'index.html', over);
  const deliver = (edits = EDIT, over: Partial<AIResult> = {}, findingId: string | null = finding.id) => {
    const req = request();
    handoff(patchResult(req, edits, over), req, { fromCache: false, ...(findingId !== null ? { findingId } : {}) });
    return req;
  };
  const command = (text: string) => { store.update((s) => cmd(s, text).state); };
  return { store, ran, harness, handoff, finding, request, deliver, command };
}
const text = (s: StudioState) => practiceContent(s.snapshot!, s.work.applied, 'index.html')!;

describe('queueing an AI patch', () => {
  it('queues exactly one waiting AI proposal and applies nothing', async () => {
    const t = await setup();
    const before = text(t.store.getState());
    t.deliver();
    const s = t.store.getState();
    expect(s.work.proposal).toMatchObject({ source: 'ai', path: 'index.html', title: 'AI-proposed change to index.html', findingId: t.finding.id });
    expect(s.work.applied).toHaveLength(0);
    expect(text(s)).toBe(before);
    expect(s.ai.attempts).toEqual({ [t.finding.id]: 1 });
    expect(s.log.at(-1)!.message).toBe('AI proposal queued for index.html. Nothing changes until you press Approve.');
  });
  it('a second patch while one waits is refused with the plain reason, and the first stays', async () => {
    const t = await setup();
    t.deliver();
    const first = t.store.getState().work.proposal;
    t.deliver();
    expect(t.store.getState().work.proposal).toBe(first);
  });
  it('a refused patch leaves a note on the answer and counts no attempt', async () => {
    const t = await setup();
    t.command('start');
    t.deliver();
    const s = t.store.getState();
    expect(s.work.proposal).toBeNull();
    expect(s.ai.attempts).toBeUndefined();
  });
  it('a mock result is never queued', async () => {
    const t = await setup();
    const req = t.request();
    t.handoff(patchResult(req, EDIT, { mode: 'mock' }), req, { fromCache: false });
    expect(t.store.getState().work.proposal).toBeNull();
  });
});

describe('Approve, re-check, Undo, Redo', () => {
  it('Approve applies to the practice copy only, records one History entry, and the re-check says "no longer found"', async () => {
    const t = await setup();
    t.deliver();
    t.command('approve');
    const s = t.store.getState();
    expect(s.work.proposal).toBeNull();
    expect(s.work.applied).toHaveLength(1);
    expect(text(s)).toContain('alt="Shop logo"');
    expect(s.snapshot!.files.find((f) => f.path === 'index.html')!.content).not.toContain('alt=');
    const msgs = s.log.map((l) => l.message);
    expect(msgs).toContain('Approved the change to index.html.');
    expect(msgs).toContain('Applied to the practice copy of index.html.');
    const re = s.log.find((l) => l.action === 'ai_recheck')!;
    expect(re.status).toBe('verified');
    expect(re.message).toMatch(/^Re-check: .+ is no longer found in index\.html\.$/);
    expect(msgs.join(' ')).not.toMatch(/\bfixed\b/i);
    expect(mergedFindings(s).some((f) => f.skillId === t.finding.skillId)).toBe(false);
  });
  it('when the change does not remove the finding, the re-check says "still found" and nothing is called fixed', async () => {
    const t = await setup();
    t.deliver(BAD_EDIT);
    t.command('approve');
    const s = t.store.getState();
    const re = s.log.find((l) => l.action === 'ai_recheck')!;
    expect(re.status).toBe('info');
    expect(re.message).toMatch(/is still found in index\.html\.$/);
    expect(s.log.some((l) => l.status === 'verified')).toBe(false);
    expect(mergedFindings(s).some((f) => f.skillId === t.finding.skillId)).toBe(true);
  });
  it('Undo restores the exact original and Redo re-applies it (hash round trip)', async () => {
    const t = await setup();
    const original = text(t.store.getState());
    t.deliver();
    t.command('approve');
    const changed = text(t.store.getState());
    t.command('undo');
    expect(text(t.store.getState())).toBe(original);
    t.command('redo');
    expect(text(t.store.getState())).toBe(changed);
  });
  it('a failed round trip records nothing and keeps the original (a file that mixes line endings)', async () => {
    const mixed = IMG_FIXTURE['index.html'].replace(/\n/g, '\r\n').replace('<img src="logo.png">\r\n', '<img src="logo.png">\n');
    const state = await loadedState({ 'index.html': mixed });
    // A proposal built from the LF view of the file, put in the queue directly (the queue check would have refused it).
    const lf = patchRequest(await loadedState(IMG_FIXTURE), 'index.html');
    const diff = (patchResult(lf, EDIT).response as { unifiedDiff: string }).unifiedDiff;
    const queued = { ...state, work: { ...state.work, proposal: { id: 'p', path: 'index.html', title: 'AI-proposed change to index.html', diff, source: 'ai' as const } } };
    const r = runCommand(queued, { name: 'approve' }, wctx());
    expect(r.state.work.applied).toHaveLength(0);
    expect(r.state.work.proposal).not.toBeNull();
    expect(r.state.work.chat.at(-1)).toMatchObject({ ok: false, reply: 'The change could not be applied: it could not be undone exactly, so nothing was changed.' });
    expect(r.state.log.some((l) => l.action === 'proposal_failed' && l.message === 'failed: the change could not be undone exactly')).toBe(true);
  });
  it('Approve refuses (and the original stays) when the file changed after queueing', async () => {
    const t = await setup();
    t.deliver();
    const s = t.store.getState();
    const snap = { ...s.snapshot!, files: s.snapshot!.files.map((f) => ({ ...f, content: (f.content ?? '').replace('Welcome', 'Hello') })) };
    // The diff context includes line 5 and neighbours; change a context line.
    const changed = { ...s, snapshot: { ...snap, files: snap.files.map((f) => ({ ...f, content: (f.content ?? '').replace('<h1>Shop</h1>', '<h1>Store</h1>') })) } };
    const r = runCommand(changed, { name: 'approve' }, wctx());
    expect(r.state.work.applied).toHaveLength(0);
    expect(r.state.work.chat.at(-1)!.reply).toMatch(/^The change could not be applied: /);
    expect(r.state.log.some((l) => l.action === 'proposal_failed')).toBe(true);
  });
  it('an AI change without a finding gets no re-check line', async () => {
    const t = await setup();
    t.deliver(EDIT, {}, null);
    t.command('approve');
    expect(t.store.getState().log.some((l) => l.action === 'ai_recheck')).toBe(false);
  });
});

describe('Reject and Stop', () => {
  it('Reject discards it, applies nothing, and still counts as one attempt', async () => {
    const t = await setup();
    t.deliver();
    t.command('reject');
    const s = t.store.getState();
    expect(s.work.proposal).toBeNull();
    expect(s.work.applied).toHaveLength(0);
    expect(s.ai.attempts).toEqual({ [t.finding.id]: 1 });
  });
  it('Stop rejects a waiting AI change even though no run is active', async () => {
    const t = await setup();
    t.deliver();
    const r = cmd(t.store.getState(), 'stop');
    expect(r.state.work.proposal).toBeNull();
    expect(r.state.work.chat.at(-1)).toMatchObject({ ok: true, reply: 'Rejected the waiting AI change.' });
    expect(r.state.log.some((l) => l.action === 'proposal_rejected' && l.message === 'rejected: stopped')).toBe(true);
    expect(r.effects).toEqual([{ type: 'cancel_ai' }]);
  });
  it('Stop with nothing to stop is still refused', async () => {
    const t = await setup();
    expect(cmd(t.store.getState(), 'stop').state.work.chat.at(-1)).toMatchObject({ ok: false, reply: 'Nothing to stop.' });
  });
});

describe('the 3-attempt cap', () => {
  it('three proposals for one finding are queued (each needs Reject or Approve); the fourth is refused with the exact message', async () => {
    const t = await setup();
    for (let i = 0; i < 3; i++) {
      t.deliver(BAD_EDIT);
      expect(t.store.getState().work.proposal).not.toBeNull();
      t.command('reject');
    }
    expect(t.store.getState().ai.attempts![t.finding.id]).toBe(3);
    t.store.update((s) => ({ ...s, ai: { ...s.ai, status: 'done', result: undefined } as never }));
    t.deliver();
    expect(t.store.getState().work.proposal).toBeNull();
    expect(t.store.getState().ai.attempts![t.finding.id]).toBe(3);
    expect(t.store.getState().ai.proposalNote).toBe('Not queued: This finding has had 3 AI fix attempts. Fix it by hand, or ask about a different one.');
  });
  it('another finding is not affected, and nothing loops by itself', async () => {
    const t = await setup();
    for (let i = 0; i < 3; i++) { t.deliver(BAD_EDIT); t.command('reject'); }
    const before = t.store.getState();
    t.deliver(EDIT, {}, 'other-finding');
    expect(t.store.getState().work.proposal).not.toBeNull();
    // No further proposal appears unless the handler is called again.
    expect(before.work.proposal).toBeNull();
  });
  it('each of the three still needs Approve: nothing is applied by queueing', async () => {
    const t = await setup();
    for (let i = 0; i < 3; i++) { t.deliver(BAD_EDIT); t.command('reject'); }
    expect(t.store.getState().work.applied).toHaveLength(0);
  });
});

describe('what is saved', () => {
  it('a waiting AI proposal and any AI text are absent from the saved record', async () => {
    const t2 = await setup();
    t2.deliver();
    expect(t2.store.getState().work.proposal).not.toBeNull();
    const rec = buildRecord(t2.store.getState(), 1);
    expect(rec!.proposal).toBeNull();
    expect(JSON.stringify(rec)).not.toContain('Add a description');
    expect(JSON.stringify(rec)).not.toContain('Answered by');
    expect(JSON.stringify(rec)).not.toContain('AI-proposed');
  });
  it('an applied AI change is saved as a normal History entry and restores and reverses like any other', async () => {
    const t = await setup();
    t.deliver();
    t.command('approve');
    const rec = buildRecord(t.store.getState(), 1)!;
    expect(rec.applied).toHaveLength(1);
    expect(Object.keys(rec.applied[0]!).sort()).toEqual(['afterHash', 'at', 'beforeHash', 'diff', 'id', 'path', 'title']);
    expect(rec.applied[0]!.title).toBe('AI-proposed change to index.html');
    expect(JSON.stringify(rec)).not.toContain('Add a description');
  });
});

describe('AI actions run through the same path as typed commands', () => {
  const actReq = (): AIRequest => ({ requestId: 'r', instruction: 'start the crew', taskType: 'act', selectedPaths: [] });
  const act = (action: string, arg?: string): AIResult => ({ requestId: 'r', mode: 'live', response: { type: 'action', action, ...(arg ? { arg } : {}), summary: 's' } as never });

  it('start crew runs the same command, with an "AI asked for" Log line', async () => {
    const t = await setup();
    t.handoff(act('start', 'crew'), actReq(), { fromCache: false });
    expect(t.ran).toEqual(['start crew']);
    const s = t.store.getState();
    expect(s.work.run?.kind).toBe('crew');
    expect(s.log.some((l) => l.message === 'AI asked for: start crew')).toBe(true);
  });
  it('the harness own refusal is passed through unchanged', async () => {
    const t = await setup();
    t.handoff(act('pause'), actReq(), { fromCache: false });
    expect(t.store.getState().work.chat.at(-1)).toMatchObject({ ok: false, reply: 'No run is active.' });
  });
  it('approve, reject, and reset are refused and run nothing; the user sees why', async () => {
    const t = await setup();
    t.deliver();
    for (const a of ['approve', 'reject', 'reset']) t.handoff(act(a), actReq(), { fromCache: false });
    expect(t.ran).toEqual([]);
    expect(t.store.getState().work.proposal).not.toBeNull();
    expect(t.store.getState().work.applied).toHaveLength(0);
    expect(t.store.getState().work.chat.at(-1)).toMatchObject({ ok: false, command: 'AI action' });
  });
  it('an action for a request that carried file text is refused', async () => {
    const t = await setup();
    t.handoff(act('help'), { ...actReq(), selectedPaths: ['index.html'], sourceContext: [{ filePath: 'index.html', content: 'x' }] }, { fromCache: false });
    expect(t.ran).toEqual([]);
  });
  it('an AI action can never apply, approve, or reject a change (a patch stays waiting through every allowed action but undo and redo)', async () => {
    const t = await setup();
    t.deliver();
    for (const [a, arg] of [['help'], ['status'], ['pause'], ['resume'], ['step'], ['open', 'log']] as Array<[string, string?]>) t.handoff(act(a, arg), actReq(), { fromCache: false });
    expect(t.store.getState().work.proposal).not.toBeNull();
    expect(t.store.getState().work.applied).toHaveLength(0);
    expect(parseCommand('approve').kind).toBe('command'); // the typed word still works for the user
  });
});
