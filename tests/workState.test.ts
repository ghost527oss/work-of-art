// @node: F4.4
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RunStep } from '../src/engine/practiceScript';
import {
  addChat, createProposal, decideProposal, idleWork, MSG, pauseRun, redoChange, resumeRun, runOneStep,
  setSelfEditingPause, startRun, stepRun, stopRun, undoChange, workProblems,
  type HistoryEntry, type WorkState,
} from '../src/store/workSlice';

const STEPS: RunStep[] = [
  { kind: 'info', title: 'a' }, { kind: 'plan', title: 'b' },
  { kind: 'propose', title: 'Propose a change to x.ts', path: 'x.ts' },
  { kind: 'verify', title: 'v', path: 'x.ts' }, { kind: 'finish', title: 'f' },
];
const entry = (n: number): HistoryEntry => ({ id: `h${n}`, path: 'x.ts', title: 't', at: n, diff: 'd', beforeHash: 'b', afterHash: 'a' });
const started = () => startRun(idleWork(), 'r1', STEPS, false);
const atProposal = (auto = true) => {
  let w = started();
  w = runOneStep(w, 'p1'); w = runOneStep(w, 'p1'); w = runOneStep(w, 'p1');
  return auto ? w : pauseRun(w);
};
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); }
  return o;
}

describe('state machine table', () => {
  it('start: none -> running at 0 with autoAdvance', () => {
    const w = started();
    expect(w.run).toMatchObject({ id: 'r1', status: 'running', autoAdvance: true, position: 0 });
    expect(w.runSeq).toBe(1);
  });
  it('start after stopped or finished', () => {
    expect(startRun(stopRun(started()), 'r2', STEPS, false).run?.id).toBe('r2');
    let w = started();
    w = runOneStep(w, 'p'); w = runOneStep(w, 'p'); w = runOneStep(w, 'p');
    w = decideProposal(w, 'reject'); w = runOneStep(w, 'p'); w = runOneStep(w, 'p');
    expect(w.run?.status).toBe('finished');
    expect(startRun(w, 'r3', STEPS, false).run?.id).toBe('r3');
  });
  it('start refused while active and in self-editing mode', () => {
    const w = started();
    expect(startRun(w, 'r2', STEPS, false)).toBe(w);
    const i = idleWork();
    expect(startRun(i, 'r', STEPS, true)).toBe(i);
  });
  it('start refuses bad step lists', () => {
    const i = idleWork();
    expect(startRun(i, 'r', [], false)).toBe(i);
    expect(startRun(i, 'r', Array.from({ length: 9 }, () => STEPS[0]!), false)).toBe(i);
  });
  it('running tick -> position+1', () => {
    const w = runOneStep(started(), 'p');
    expect(w.run).toMatchObject({ status: 'running', position: 1 });
  });
  it('tick on the last step -> finished', () => {
    let w = atProposal();
    w = decideProposal(w, 'reject');
    w = runOneStep(w, 'p');
    expect(w.run?.status).toBe('running');
    w = runOneStep(w, 'p');
    expect(w.run).toMatchObject({ status: 'finished', position: 5 });
  });
  it('tick on a propose step -> awaiting_decision with a practice proposal', () => {
    const w = atProposal();
    expect(w.run?.status).toBe('awaiting_decision');
    expect(w.proposal).toMatchObject({ id: 'p1', path: 'x.ts', title: 'Propose a change to x.ts' });
    expect(w.proposal?.diff).toContain('@@ -0,0 +1 @@');
  });
  it('pause: running -> paused, autoAdvance false', () => {
    expect(pauseRun(started()).run).toMatchObject({ status: 'paused', autoAdvance: false });
  });
  it('resume: paused -> running, autoAdvance true', () => {
    expect(resumeRun(pauseRun(started()), false).run).toMatchObject({ status: 'running', autoAdvance: true });
  });
  it('step: paused -> paused, one step; propose -> awaiting; last -> finished', () => {
    let w = pauseRun(started());
    w = stepRun(w, false, 'p');
    expect(w.run).toMatchObject({ status: 'paused', position: 1 });
    w = stepRun(w, false, 'p'); w = stepRun(w, false, 'p');
    expect(w.run?.status).toBe('awaiting_decision');
    w = decideProposal(w, 'reject');
    expect(w.run?.status).toBe('paused');
    w = stepRun(w, false, 'p'); w = stepRun(w, false, 'p');
    expect(w.run).toMatchObject({ status: 'finished', position: 5 });
  });
  it('step refusals', () => {
    const run = started();
    expect(stepRun(run, false, 'p')).toBe(run);
    const wait = atProposal();
    expect(stepRun(wait, false, 'p')).toBe(wait);
    const paused = pauseRun(started());
    expect(stepRun(paused, true, 'p')).toBe(paused);
    const i = idleWork();
    expect(stepRun(i, false, 'p')).toBe(i);
  });
  it('stop: running, paused, awaiting -> stopped, proposal dropped', () => {
    for (const w of [started(), pauseRun(started()), atProposal()]) {
      const s = stopRun(w);
      expect(s.run?.status).toBe('stopped');
      expect(s.proposal).toBeNull();
    }
  });
  it('awaiting_decision: pause and resume change only the flag', () => {
    const w = atProposal();
    const p = pauseRun(w);
    expect(p.run).toMatchObject({ status: 'awaiting_decision', autoAdvance: false });
    expect(p.proposal).toBe(w.proposal);
    const r = resumeRun(p, false);
    expect(r.run).toMatchObject({ status: 'awaiting_decision', autoAdvance: true });
  });
  it('decision: running if autoAdvance else paused', () => {
    expect(decideProposal(atProposal(true), 'approve', entry(1)).run?.status).toBe('running');
    expect(decideProposal(atProposal(false), 'approve', entry(1)).run?.status).toBe('paused');
    expect(decideProposal(atProposal(true), 'reject').run?.status).toBe('running');
    expect(decideProposal(atProposal(false), 'reject').run?.status).toBe('paused');
  });
  it('Edit opens: running -> paused/autoAdvance false; awaiting -> flag only; others unchanged', () => {
    expect(setSelfEditingPause(started()).run).toMatchObject({ status: 'paused', autoAdvance: false });
    expect(setSelfEditingPause(atProposal()).run).toMatchObject({ status: 'awaiting_decision', autoAdvance: false });
    const i = idleWork(); expect(setSelfEditingPause(i)).toBe(i);
    const p = pauseRun(started()); expect(setSelfEditingPause(p)).toBe(p);
    const s = stopRun(started()); expect(setSelfEditingPause(s)).toBe(s);
  });
});

describe('refusals return the same object', () => {
  const i = idleWork();
  it('idle', () => {
    for (const w of [pauseRun(i), resumeRun(i, false), stopRun(i), decideProposal(i, 'approve', entry(1)), decideProposal(i, 'reject'), undoChange(i), redoChange(i), runOneStep(i, 'p')]) expect(w).toBe(i);
  });
  it('repeated pause, resume', () => {
    const p = pauseRun(started());
    expect(pauseRun(p)).toBe(p);
    const r = started();
    expect(resumeRun(r, false)).toBe(r);
    expect(resumeRun(p, true)).toBe(p);
  });
  it('stop twice, stopped and finished runs', () => {
    const s = stopRun(started());
    expect(stopRun(s)).toBe(s);
    expect(pauseRun(s)).toBe(s);
    expect(resumeRun(s, false)).toBe(s);
    expect(runOneStep(s, 'p')).toBe(s);
  });
  it('second approve for one proposal', () => {
    const a = decideProposal(atProposal(), 'approve', entry(1));
    expect(decideProposal(a, 'approve', entry(2))).toBe(a);
    expect(a.applied).toHaveLength(1);
  });
  it('second proposal while one waits', () => {
    const w = atProposal();
    expect(createProposal(w, { id: 'q', path: 'y', title: 't', diff: 'd', source: 'practice' })).toBe(w);
    expect(runOneStep(w, 'q')).toBe(w);
  });
  it('approve without an entry', () => {
    const w = atProposal();
    expect(decideProposal(w, 'approve')).toBe(w);
  });
  it('undo and redo refusals', () => {
    const waiting = atProposal();
    expect(undoChange(waiting)).toBe(waiting);
    expect(redoChange(waiting)).toBe(waiting);
    const running = started();
    expect(undoChange(running)).toBe(running);
    expect(redoChange(running)).toBe(running);
    const paused = pauseRun(started());
    expect(undoChange(paused)).toBe(paused);
    expect(redoChange(paused)).toBe(paused);
  });
});

describe('history', () => {
  it('approve adds an entry and clears redo', () => {
    let w: WorkState = { ...idleWork(), undone: [entry(9)] };
    w = { ...w, ...startRun(w, 'r', STEPS, false) };
    w = runOneStep(w, 'p'); w = runOneStep(w, 'p'); w = runOneStep(w, 'p');
    w = decideProposal(w, 'approve', entry(1));
    expect(w.applied.map((e) => e.id)).toEqual(['h1']);
    expect(w.undone).toEqual([]);
    expect(w.proposal).toBeNull();
  });
  it('undo and redo move the newest entry', () => {
    const base: WorkState = { ...idleWork(), applied: [entry(1), entry(2)] };
    const u = undoChange(base);
    expect(u.applied.map((e) => e.id)).toEqual(['h1']);
    expect(u.undone.map((e) => e.id)).toEqual(['h2']);
    const r = redoChange(u);
    expect(r.applied.map((e) => e.id)).toEqual(['h1', 'h2']);
    expect(r.undone).toEqual([]);
    expect(undoChange(undoChange(u)).undone.map((e) => e.id)).toEqual(['h2', 'h1']);
  });
  it('the 51st entry is refused and the proposal stays', () => {
    const full: WorkState = { ...atProposal(), applied: Array.from({ length: 49 }, (_, n) => entry(n)), undone: [entry(99)] };
    expect(full.applied.length + full.undone.length).toBe(50);
    expect(decideProposal(full, 'approve', entry(100))).toBe(full);
    expect(decisionMsg(full)).toBe(MSG.historyFull);
    expect(decideProposal(full, 'reject').proposal).toBeNull();
  });
});
function decisionMsg(w: WorkState): string | null {
  return w.applied.length + w.undone.length >= 50 ? MSG.historyFull : null;
}

describe('chat', () => {
  it('never exceeds 20 lines, oldest dropped, ids keep rising', () => {
    let w = idleWork();
    for (let n = 0; n < 45; n++) w = addChat(w, 'c', `r${n}`, true);
    expect(w.chat).toHaveLength(20);
    expect(w.chat[0]!.reply).toBe('r25');
    expect(w.chat[19]!.id).toBe(45);
  });
});

describe('purity and serialization', () => {
  it('frozen inputs are never mutated', () => {
    const frozen = deepFreeze(atProposal());
    expect(() => {
      pauseRun(frozen); resumeRun(frozen, false); stopRun(frozen); decideProposal(frozen, 'approve', entry(1));
      decideProposal(frozen, 'reject'); undoChange(frozen); redoChange(frozen); runOneStep(frozen, 'p');
      setSelfEditingPause(frozen); addChat(frozen, 'c', 'r', true); stepRun(frozen, false, 'p');
    }).not.toThrow();
    const f2 = deepFreeze(started());
    expect(() => { pauseRun(f2); runOneStep(f2, 'p'); }).not.toThrow();
  });
  it('survives JSON except chat and runSeq', () => {
    let w = atProposal(false);
    w = decideProposal(w, 'approve', entry(1));
    w = { ...w, undone: [entry(2)] };
    const back = JSON.parse(JSON.stringify(w)) as WorkState;
    expect({ ...back, chat: [], runSeq: 0 }).toEqual({ ...w, chat: [], runSeq: 0 });
  });
  it('imports nothing from React, stores, network, or the AI files', () => {
    const src = readFileSync('src/store/workSlice.ts', 'utf8');
    expect(src).not.toMatch(/from 'react|useStudioStore|aiAssistant|mockAssistant|useAssistant|fetch\(/);
  });
});

describe('idempotence of repeats', () => {
  it('100 repeats of pause, resume, stop, approve equal the first press', () => {
    for (const [make, press] of [
      [started, (w: WorkState) => pauseRun(w)],
      [() => pauseRun(started()), (w: WorkState) => resumeRun(w, false)],
      [started, (w: WorkState) => stopRun(w)],
      [atProposal, (w: WorkState) => decideProposal(w, 'approve', entry(1))],
    ] as const) {
      const first = press(make());
      let w = first;
      for (let n = 0; n < 100; n++) w = press(w);
      expect(w).toEqual(first);
    }
  });
});

describe('random sequences keep the invariants', () => {
  it('3,000 transitions', () => {
    let seed = 12345;
    const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor((seed / 2 ** 32) * n); };
    let w = idleWork();
    let id = 0;
    let editOpen = false;
    for (let n = 0; n < 3000; n++) {
      switch (rnd(12)) {
        case 0: w = startRun(w, `r${++id}`, STEPS, editOpen); break;
        case 1: w = pauseRun(w); break;
        case 2: w = resumeRun(w, editOpen); break;
        case 3: w = stepRun(w, editOpen, `p${++id}`); break;
        case 4: w = stopRun(w); break;
        case 5: case 6: if (w.run?.status === 'running') w = runOneStep(w, `p${++id}`); break;
        case 7: w = decideProposal(w, 'approve', entry(++id)); break;
        case 8: w = decideProposal(w, 'reject'); break;
        case 9: w = undoChange(w); break;
        case 10: w = redoChange(w); break;
        default: editOpen = !editOpen; if (editOpen) w = setSelfEditingPause(w);
      }
      expect(workProblems(w)).toEqual([]);
    }
  });
});
