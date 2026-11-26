// @node: F4.5
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { parseCommand, type ActionName } from '../src/engine/commands';
import { practiceContent } from '../src/engine/practiceScript';
import {
  addChatReply, clearWork, enterSelfEditing, runCommand, tickRun, type Mode, type WorkCtx, type WorkEffect,
} from '../src/store/workActions';
import { initialState, type StudioState } from '../src/store/useStudioStore';
import { workProblems } from '../src/store/workSlice';
import type { RepoSnapshot } from '../src/types/contracts';

let idN = 0;
const ctx = (mode: Mode = 'automation', now = 1000): WorkCtx => ({ now, mode, newId: () => `id-${++idN}` });
const snapshot: RepoSnapshot = buildSampleSnapshot('fullstack-api', 1);
const withSnap = (): StudioState => ({ ...initialState(), experience: 'studio', snapshot });

function cmd(s: StudioState, text: string, mode: Mode = 'automation'): { state: StudioState; effects: WorkEffect[]; reply: string } {
  const p = parseCommand(text);
  if (p.kind !== 'command') throw new Error('not a command: ' + text);
  const r = runCommand(s, { name: p.name, arg: p.arg }, ctx(mode));
  const chat = r.state.work.chat;
  return { ...r, reply: chat[chat.length - 1]?.reply ?? '' };
}
function tick(s: StudioState): StudioState {
  const run = s.work.run!;
  return tickRun(s, run.id, run.position, ctx());
}
const statuses = (s: StudioState, from = 0) => s.log.slice(from).map((e) => e.status);
const msgs = (s: StudioState) => s.log.map((e) => e.message);

/** Same object except for one extra chat line. */
function onlyChatAdded(before: StudioState, after: StudioState): boolean {
  return (
    after.work.chat.length === Math.min(20, before.work.chat.length + 1) &&
    after.log === before.log && after.work.run === before.work.run && after.work.proposal === before.work.proposal &&
    after.work.applied === before.work.applied && after.work.undone === before.work.undone && after.snapshot === before.snapshot
  );
}

describe('refusals (requirements table)', () => {
  it('no snapshot', () => {
    const s = initialState();
    for (const n of ['start', 'pause', 'resume', 'step', 'approve', 'reject', 'undo', 'redo', 'reset']) {
      const r = cmd(s, n);
      expect(r.reply).toBe('Load a repository first.');
      expect(onlyChatAdded(s, r.state)).toBe(true);
      expect(r.effects).toEqual([]);
    }
  });
  it('idle run', () => {
    const s = withSnap();
    const expectations: Array<[string, string]> = [
      ['pause', 'No run is active.'], ['resume', 'No run is active.'], ['step', 'No run is active.'], ['stop', 'Nothing to stop.'],
      ['approve', 'No proposal is waiting.'], ['reject', 'No proposal is waiting.'], ['undo', 'Nothing to undo.'], ['redo', 'Nothing to redo.'],
    ];
    for (const [c, reply] of expectations) {
      const r = cmd(s, c);
      expect(r.reply).toBe(reply);
      expect(onlyChatAdded(s, r.state)).toBe(true);
    }
  });
  it('start while active, and in self-editing mode', () => {
    const s = cmd(withSnap(), 'start').state;
    expect(cmd(s, 'start').reply).toBe('A run is already active. Type stop first.');
    expect(cmd(withSnap(), 'start', 'self_editing').reply).toBe('Close the Edit panel first.');
    const p = cmd(s, 'pause').state;
    expect(cmd(p, 'resume', 'self_editing').reply).toBe('Close the Edit panel first.');
    expect(cmd(p, 'step', 'self_editing').reply).toBe('Close the Edit panel first.');
  });
  it('start without a suitable file', () => {
    const empty = { ...withSnap(), snapshot: { ...snapshot, files: [] } };
    expect(cmd(empty, 'start').reply).toBe('No suitable file for a practice change. It needs a fully loaded text file under 20 KB with no secrets.');
  });
  it('step while running or waiting, undo/redo while running or waiting', () => {
    const run = cmd(withSnap(), 'start').state;
    expect(cmd(run, 'step').reply).toBe('Pause the run first.');
    expect(cmd(run, 'undo').reply).toBe('Pause the run first.');
    expect(cmd(run, 'redo').reply).toBe('Pause the run first.');
    let w = tick(tick(tick(tick(run))));
    expect(w.work.proposal).not.toBeNull();
    expect(cmd(w, 'step').reply).toBe('Decide the waiting proposal first.');
    expect(cmd(w, 'undo').reply).toBe('Decide the waiting proposal first.');
    expect(cmd(w, 'redo').reply).toBe('Decide the waiting proposal first.');
    w = cmd(w, 'pause').state;
    expect(cmd(w, 'pause').reply).toBe('Already paused.');
    expect(cmd(run, 'resume').reply).toBe('Already running.');
  });
  it('resume while awaiting decision', () => {
    let w = tick(tick(tick(tick(cmd(withSnap(), 'start').state))));
    w = cmd(w, 'pause').state;
    const r = cmd(w, 'resume');
    expect(r.reply).toBe('The run continues after you approve or reject.');
    expect(r.state.work.run).toMatchObject({ status: 'awaiting_decision', autoAdvance: true });
  });
  it('open shows the panel and refuses nothing else', () => {
    expect(cmd(withSnap(), 'open edit').effects).toEqual([{ type: 'open_panel', panel: 'edit' }]);
    expect(cmd(withSnap(), 'open chat').effects).toEqual([{ type: 'open_panel', panel: 'ai' }]);
    expect(cmd(withSnap(), 'open journal').effects).toEqual([{ type: 'open_panel', panel: 'journal' }]);
  });
  it('help and status only add a chat line', () => {
    const s = withSnap();
    const h = cmd(s, 'help');
    expect(h.reply.split('\n')).toHaveLength(13);
    expect(onlyChatAdded(s, h.state)).toBe(true);
    const st = cmd(s, 'status');
    expect(st.reply).toContain('Mode: Automation');
    expect(st.reply).toContain('no run');
    expect(cmd(s, 'status', 'self_editing').reply).toContain('Mode: Self-editing');
  });
});

describe('a full practice run', () => {
  it('runs, proposes, approves, verifies, undoes, redoes, finishes', () => {
    const frozenSnap = JSON.stringify(snapshot);
    let s = cmd(withSnap(), 'start').state;
    expect(s.work.run?.status).toBe('running');
    expect(msgs(s).at(-1)).toContain('Practice run (no AI) started');
    const total = s.work.run!.steps.length;
    // steps 1-3 log in order with skills
    s = tick(s); s = tick(s);
    expect(msgs(s)).toContain('Step 1 of ' + total + ': Read the repository summary');
    expect(msgs(s)).toContain('Skill used: repo-overview (practice)');
    expect(msgs(s)).toContain('Skill used: coverage-check (practice)');
    expect(msgs(s).some((m) => /^Repository: \d+ paths indexed, \d+ files loaded\.$/.test(m))).toBe(true);
    expect(msgs(s).some((m) => m.startsWith('Coverage: '))).toBe(true);
    s = tick(s);
    expect(msgs(s)).toContain('Skill used: change-planner (practice)');
    // propose
    s = tick(s);
    expect(s.work.proposal).not.toBeNull();
    expect(s.work.run?.status).toBe('awaiting_decision');
    expect(statuses(s).at(-1)).toBe('proposed');
    const path = s.work.proposal!.path;
    const original = snapshot.files.find((f) => f.path === path)!.content!;
    // approve
    const before = s.log.length;
    const a = cmd(s, 'approve');
    s = a.state;
    expect(statuses(s, before)).toEqual(['approved', 'applied']);
    expect(s.work.applied).toHaveLength(1);
    expect(s.work.run?.status).toBe('running');
    const copy = practiceContent(s.snapshot!, s.work.applied, path)!;
    expect(copy.startsWith('// PRACTICE:') || copy.startsWith('# PRACTICE:') || copy.includes('PRACTICE:')).toBe(true);
    expect(copy.endsWith(original)).toBe(true);
    // verify
    s = tick(s);
    expect(statuses(s)).toContain('verified');
    // undo/redo while paused
    s = cmd(s, 'pause').state;
    s = cmd(s, 'undo').state;
    expect(statuses(s).at(-1)).toBe('undone');
    expect(practiceContent(s.snapshot!, s.work.applied, path)).toBe(original);
    expect(s.work.undone).toHaveLength(1);
    s = cmd(s, 'redo').state;
    expect(s.work.applied).toHaveLength(1);
    expect(practiceContent(s.snapshot!, s.work.applied, path)).toBe(copy);
    s = cmd(s, 'resume').state;
    const steps = s.work.run!.steps;
    while (s.work.run!.status === 'running') {
      s = tick(s);
      if (s.work.proposal) s = cmd(s, 'reject').state;
    }
    expect(s.work.run!.status).toBe('finished');
    expect(s.work.run!.position).toBe(steps.length);
    expect(msgs(s).at(-1)).toBe('Practice run finished.');
    expect(workProblems(s.work)).toEqual([]);
    expect(JSON.stringify(snapshot)).toBe(frozenSnap);
  });
  it('a rejected proposal adds no history and its verify step logs "nothing to verify"', () => {
    let s = tick(tick(tick(tick(cmd(withSnap(), 'start').state))));
    s = cmd(s, 'reject').state;
    expect(s.work.applied).toHaveLength(0);
    s = tick(s);
    expect(msgs(s).some((m) => m.startsWith('Nothing to verify for '))).toBe(true);
    expect(statuses(s)).not.toContain('verified');
  });
  it('step runs exactly one step when paused and a propose step moves to awaiting', () => {
    let s = cmd(cmd(withSnap(), 'start').state, 'pause').state;
    for (let n = 0; n < 3; n++) s = cmd(s, 'step').state;
    expect(s.work.run?.position).toBe(3);
    s = cmd(s, 'step').state;
    expect(s.work.run?.status).toBe('awaiting_decision');
  });
  it('stale ticks change nothing and a repeated tick runs the step once', () => {
    const s = cmd(withSnap(), 'start').state;
    const run = s.work.run!;
    expect(tickRun(s, 'old', 0, ctx())).toBe(s);
    expect(tickRun(s, run.id, 5, ctx())).toBe(s);
    const once = tickRun(s, run.id, 0, ctx());
    expect(tickRun(once, run.id, 0, ctx())).toBe(once);
    const paused = cmd(s, 'pause').state;
    expect(tickRun(paused, run.id, 0, ctx())).toBe(paused);
  });
  it('approve fails cleanly when the diff does not apply', () => {
    let s = tick(tick(tick(tick(cmd(withSnap(), 'start').state))));
    s = { ...s, work: { ...s.work, proposal: { ...s.work.proposal!, diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-zzzz\n+y\n' } } };
    const r = cmd(s, 'approve');
    expect(r.state.work.applied).toHaveLength(0);
    expect(r.state.work.proposal).not.toBeNull();
    expect(statuses(r.state).at(-1)).toBe('failed');
  });
  it('undo refuses when the file changed since', () => {
    let s = tick(tick(tick(tick(cmd(withSnap(), 'start').state))));
    s = cmd(cmd(s, 'approve').state, 'pause').state;
    const e = s.work.applied[0]!;
    s = { ...s, work: { ...s.work, applied: [{ ...e, afterHash: 'deadbeef' }] } };
    const r = cmd(s, 'undo');
    expect(r.state.work.applied).toHaveLength(1);
    expect(statuses(r.state).at(-1)).toBe('failed');
    expect(msgs(r.state).at(-1)).toBe('failed: file changed since');
  });
});

describe('stop, reset, modes', () => {
  it('stop during awaiting_decision rejects the proposal, logs it, and cancels AI', () => {
    const s = tick(tick(tick(tick(cmd(withSnap(), 'start').state))));
    const r = cmd(s, 'stop');
    expect(r.state.work.run?.status).toBe('stopped');
    expect(r.state.work.proposal).toBeNull();
    expect(msgs(r.state)).toContain('rejected: run stopped');
    expect(r.effects).toEqual([{ type: 'cancel_ai' }]);
  });
  it('stop with a pending AI request and no run still cancels it', () => {
    const s: StudioState = { ...withSnap(), ai: { status: 'pending', requestId: 'q' } };
    const r = cmd(s, 'stop');
    expect(r.effects).toEqual([{ type: 'cancel_ai' }]);
    expect(r.state.work.run).toBeNull();
  });
  it('reset empties work and log, returns cancel_ai and clear_slot', () => {
    const s = tick(cmd(withSnap(), 'start').state);
    const r = cmd(s, 'reset');
    expect(r.effects).toEqual([{ type: 'cancel_ai' }, { type: 'clear_slot' }]);
    expect(r.state.work.run).toBeNull();
    expect(r.state.work.applied).toEqual([]);
    expect(r.state.log.map((e) => e.message)).toEqual(['Work reset.']);
  });
  it('enterSelfEditing pauses running and waiting runs only', () => {
    const run = cmd(withSnap(), 'start').state;
    const p = enterSelfEditing(run, ctx());
    expect(p.work.run).toMatchObject({ status: 'paused', autoAdvance: false });
    expect(msgs(p).at(-1)).toBe('Paused automatically because you opened Edit.');
    const wait = tick(tick(tick(tick(run))));
    const w = enterSelfEditing(wait, ctx());
    expect(w.work.run).toMatchObject({ status: 'awaiting_decision', autoAdvance: false });
    expect(enterSelfEditing(p, ctx())).toBe(p);
    expect(enterSelfEditing(withSnap(), ctx())).toEqual(withSnap());
    const idle = withSnap();
    expect(enterSelfEditing(idle, ctx())).toBe(idle);
  });
  it('clearWork and addChatReply', () => {
    const i = withSnap();
    expect(clearWork(i)).toBe(i);
    const c = addChatReply(i, 'x', 'y', false);
    expect(c.work.chat).toHaveLength(1);
    expect(clearWork(c).work.chat).toHaveLength(0);
  });
});

describe('privacy', () => {
  it('log and chat never hold instruction sentinels, file content lines, secrets, or diff bodies', () => {
    const SENT = 'SENTINEL-INSTRUCTION-xyzzy';
    let s: StudioState = { ...withSnap(), ai: { status: 'idle', summary: { taskType: SENT, selectedCount: 1, includesContent: true } } };
    s = cmd(s, 'start').state;
    for (let n = 0; n < 4; n++) s = tick(s);
    s = cmd(s, 'approve').state;
    s = cmd(s, 'pause').state;
    s = cmd(s, 'undo').state; s = cmd(s, 'redo').state; s = cmd(s, 'status').state; s = cmd(s, 'help').state;
    const text = JSON.stringify([s.log, s.work.chat]);
    expect(text).not.toContain(SENT);
    expect(text).not.toMatch(/ghp_|@@ -|\+\+\+ b\/|--- a\//);
    for (const f of snapshot.files) {
      for (const line of (f.content ?? '').split('\n')) if (line.trim().length > 15) expect(text).not.toContain(line.trim());
    }
    expect(text).not.toContain('PRACTICE: example');
  });
});

describe('stays pure', () => {
  it('every command name is handled', () => {
    const names: ActionName[] = ['help', 'status', 'start', 'pause', 'resume', 'step', 'stop', 'approve', 'reject', 'undo', 'redo', 'open', 'reset'];
    for (const name of names) expect(() => runCommand(withSnap(), { name, arg: name === 'open' ? 'log' : undefined }, ctx())).not.toThrow();
  });
});
