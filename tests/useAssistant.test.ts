// @node: F2.6
import { describe, expect, it } from 'vitest';
import { createAssistantController, type AssistantServices } from '../src/hooks/useAssistant';
import { createStore, initialState, type Store, type StudioState } from '../src/store/useStudioStore';
import {
  beginIngestion,
  cancelIngestion,
  completeIngestion,
  reset,
} from '../src/store/useStudioStore';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import type { AIResult } from '../src/types/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface Call {
  request: Parameters<AssistantServices['requestAssistant']>[0];
  signal: AbortSignal;
  result: Deferred<AIResult>;
}

function setup() {
  const store: Store<StudioState> = createStore(initialState());
  const calls: Call[] = [];
  let clock = 100;
  const services: AssistantServices = {
    requestAssistant(request, { signal }) {
      const result = deferred<AIResult>();
      calls.push({ request, signal, result });
      return result.promise;
    },
    now: () => ++clock,
    newId: () => `ai-${calls.length + 1}`,
  };
  const controller = createAssistantController(store, services);
  return { store, calls, controller, actions: controller.actions };
}

const snap = () => buildSampleSnapshot('static-site', 1);
const goodResult = (): AIResult => ({
  requestId: 'ai-1',
  mode: 'mock',
  response: { type: 'explanation', summary: 'x', evidencePaths: ['index.html'], limitations: ['none'] },
});

const baseInput = (snapshot = snap()) => ({
  snapshot,
  instruction: 'Explain this.',
  taskType: 'explain' as const,
  selectedPaths: ['index.html'],
  includeContent: false,
  requestId: 'ai-1',
});

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// send: validation
// ---------------------------------------------------------------------------

describe('send: validation', () => {
  it('returns an error message for empty instruction and starts nothing', () => {
    const { calls, actions } = setup();
    const msg = actions.send({ ...baseInput(), instruction: '  ' });
    expect(msg).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('returns null and starts a request for valid input', () => {
    const { calls, actions } = setup();
    expect(actions.send(baseInput())).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('ignores a second send while pending', () => {
    const { calls, actions } = setup();
    actions.send(baseInput());
    expect(actions.send({ ...baseInput(), requestId: 'ai-2' })).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// send: success
// ---------------------------------------------------------------------------

describe('send: success', () => {
  it('dispatches begin then complete, and sets the store to done', async () => {
    const { store, calls, actions } = setup();
    actions.send(baseInput());
    expect(store.getState().ai.status).toBe('pending');
    calls[0]!.result.resolve(goodResult());
    await flush();
    expect(store.getState().ai.status).toBe('done');
    expect(store.getState().ai.result?.requestId).toBe('ai-1');
  });

  it('a stale result cannot overwrite a newer request', async () => {
    const { store, calls, actions } = setup();
    actions.send({ ...baseInput(), requestId: 'ai-1' });
    actions.cancel();
    actions.send({ ...baseInput(), requestId: 'ai-2' });
    // Resolve the first (stale) call
    calls[0]!.result.resolve({ ...goodResult(), requestId: 'ai-1' });
    await flush();
    // State should still show pending for the second call
    expect(store.getState().ai.status).toBe('pending');
    expect(store.getState().ai.requestId).toBe('ai-2');
  });
});

// ---------------------------------------------------------------------------
// send: failure
// ---------------------------------------------------------------------------

describe('send: failure', () => {
  it('dispatches fail with the error code', async () => {
    const { store, calls, actions } = setup();
    actions.send(baseInput());
    const { AssistantError } = await import('../src/engine/aiAssistant');
    calls[0]!.result.reject(new AssistantError('timeout', 'too slow'));
    await flush();
    expect(store.getState().ai.status).toBe('failed');
    expect(store.getState().ai.error?.code).toBe('timeout');
  });

  it('an unexpected error uses upstream_failure with a generic message', async () => {
    const { store, calls, actions } = setup();
    actions.send(baseInput());
    calls[0]!.result.reject(new Error('internal detail do-not-log'));
    await flush();
    expect(store.getState().ai.error?.code).toBe('upstream_failure');
    expect(store.getState().ai.error?.message).not.toContain('internal detail');
  });

  it('after a failure, a new send works (retry)', async () => {
    const { store, calls, actions } = setup();
    const { AssistantError } = await import('../src/engine/aiAssistant');
    actions.send(baseInput());
    calls[0]!.result.reject(new AssistantError('upstream_failure', 'oops'));
    await flush();
    actions.send({ ...baseInput(), requestId: 'ai-2' });
    expect(calls).toHaveLength(2);
    calls[1]!.result.resolve({ ...goodResult(), requestId: 'ai-2' });
    await flush();
    expect(store.getState().ai.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('aborts the request, leaves the slice idle, and ignores a late result', async () => {
    const { store, calls, actions } = setup();
    actions.send(baseInput());
    const call = calls[0]!;
    actions.cancel();
    expect(call.signal.aborted).toBe(true);
    expect(store.getState().ai.status).toBe('idle');
    call.result.resolve(goodResult());
    await flush();
    expect(store.getState().ai.status).toBe('idle');
  });

  it('is a no-op when nothing is pending', () => {
    const { store, actions } = setup();
    expect(() => actions.cancel()).not.toThrow();
    expect(store.getState().ai.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
  it('aborts a pending request and updates the store', async () => {
    const { store, calls, controller, actions } = setup();
    actions.send(baseInput());
    controller.dispose();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(store.getState().ai.status).toBe('idle');
    calls[0]!.result.resolve(goodResult());
    await flush();
    expect(store.getState().ai.status).toBe('idle');
  });

  it('is safe to call repeatedly and when idle', () => {
    const { controller } = setup();
    expect(() => { controller.dispose(); controller.dispose(); }).not.toThrow();
  });

  it('the controller remains usable after dispose', () => {
    const { calls, controller, actions } = setup();
    controller.dispose();
    expect(actions.send(baseInput())).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Clearing from outside (snapshot replaced, Back to Start)
// ---------------------------------------------------------------------------

describe('clearing from outside', () => {
  function withLoadedSnap(s: Store<StudioState>) {
    let st = s.getState();
    st = beginIngestion(st, { owner: 'o', repo: 'r', source: 'github' }, 1);
    st = completeIngestion(st, st.ingestion.runId, buildSampleSnapshot('static-site', 1), 2);
    s.setState(st);
  }

  it('a foreground beginIngestion aborts the AI request', async () => {
    const { store, calls, actions } = setup();
    withLoadedSnap(store);
    actions.send(baseInput(store.getState().snapshot!));
    const call = calls[0]!;
    store.update((s) => beginIngestion(s, { owner: 'o', repo: 'r', source: 'github' }, 10));
    await flush();
    expect(call.signal.aborted).toBe(true);
  });

  it('reset aborts the AI request', async () => {
    const { store, calls, actions } = setup();
    withLoadedSnap(store);
    actions.send(baseInput(store.getState().snapshot!));
    store.update((s) => reset(s));
    await flush();
    expect(calls[0]!.signal.aborted).toBe(true);
  });

  it('a foreground cancelIngestion aborts the AI request', async () => {
    const { store, calls, actions } = setup();
    withLoadedSnap(store);
    // Start an ingestion, then start an AI request, then cancel the ingestion
    store.update((s) => beginIngestion(s, { owner: 'o', repo: 'r', source: 'github' }, 5));
    actions.send(baseInput(store.getState().snapshot!));
    store.update((s) => cancelIngestion(s, 6));
    await flush();
    expect(calls[0]!.signal.aborted).toBe(true);
  });

  it('a background reload completing aborts the AI request (snapshot replaced)', async () => {
    const { store, calls, actions } = setup();
    withLoadedSnap(store);
    actions.send(baseInput(store.getState().snapshot!));
    // Complete a background reload → snapshot changes → AI is cleared
    store.update((s) => {
      let st = beginIngestion(s, { owner: 'o', repo: 'r', scope: ['css'], source: 'github' }, 7, { keepSnapshot: true });
      st = completeIngestion(st, st.ingestion.runId, buildSampleSnapshot('react-frontend', 2), 8);
      return st;
    });
    await flush();
    expect(calls[0]!.signal.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Store subscription cleanup
// ---------------------------------------------------------------------------

describe('subscription cleanup', () => {
  it('the subscription is released when the request ends', async () => {
    const { store, calls, actions } = setup();
    // Count listeners before and after
    let listenersBefore = 0;
    let listenersAfter = 0;
    const origSub = store.subscribe.bind(store);
    let subCount = 0;
    store.subscribe = (fn) => {
      subCount++;
      const off = origSub(fn);
      return () => { subCount--; off(); };
    };
    listenersBefore = subCount;
    actions.send(baseInput());
    const afterSend = subCount;
    calls[0]!.result.resolve(goodResult());
    await flush();
    listenersAfter = subCount;
    // After completion, the subscription count should return to what it was before send
    expect(afterSend).toBeGreaterThan(listenersBefore);
    expect(listenersAfter).toBe(listenersBefore);
  });
});

// ---------------------------------------------------------------------------
// @node: F11.8 Phase 3A: live mode, the notice, the held request, and the session cache
// ---------------------------------------------------------------------------

import { createAnswerCache } from '../src/engine/aiCache';
import type { AIStatusState } from '../src/engine/aiStatus';

function setupLive(status: AIStatusState = { kind: 'live', ready: true, providers: [] }, opts: { cacheless?: boolean } = {}) {
  const store: Store<StudioState> = createStore(initialState());
  const calls: Call[] = [];
  let clock = 100;
  let currentStatus = status;
  const services: AssistantServices = {
    requestAssistant(request, { signal }) {
      const result = deferred<AIResult>();
      calls.push({ request, signal, result });
      return result.promise;
    },
    now: () => ++clock,
    newId: () => `ai-${calls.length + 1}-${clock}`,
    fetchStatus: async () => currentStatus,
    ...(opts.cacheless ? {} : { cache: createAnswerCache() }),
  };
  const controller = createAssistantController(store, services);
  let st = store.getState();
  st = beginIngestion(st, { owner: 'o', repo: 'r', source: 'github' }, 1);
  st = completeIngestion(st, st.ingestion.runId, buildSampleSnapshot('static-site', 1), 2);
  store.setState(st);
  return {
    store, calls, controller, actions: controller.actions, ui: controller.actions.ui!,
    setStatus(s: AIStatusState) { currentStatus = s; },
  };
}
const liveResult = (id: string, over: Partial<AIResult> = {}): AIResult => ({
  requestId: id, mode: 'live',
  response: { type: 'explanation', summary: 'ANSWER_SENTINEL', evidencePaths: ['index.html'], limitations: ['AI note'] },
  meta: { tier: 'light', provider: 'groq', model: 'openai/gpt-oss-20b', lighter: false, attempts: [{ provider: 'gemini', outcome: 'rate_limited' }] },
  ...over,
});
const liveInput = (store: Store<StudioState>, over: Record<string, unknown> = {}) => ({
  snapshot: store.getState().snapshot!, instruction: 'What does this do?', taskType: 'explain' as const,
  selectedPaths: ['index.html'], includeContent: false, ...over,
});
const settle = async () => { await flush(); await flush(); };

describe('Phase 3A: status', () => {
  it('starts as checking, then shows the server mode', async () => {
    const t = setupLive({ kind: 'live', ready: true, providers: [{ id: 'groq', configured: true }] });
    expect(t.ui.getState().status).toEqual({ kind: 'checking' });
    await t.actions.refreshStatus!();
    expect(t.ui.getState().status).toEqual({ kind: 'live', ready: true, providers: [{ id: 'groq', configured: true }] });
  });
  it('a controller without a status service is mock and never asks for the notice', () => {
    const { actions, calls, store } = setup();
    expect(actions.ui!.getState().status).toEqual({ kind: 'mock' });
    store.setState({ ...store.getState() });
    actions.send(baseInput());
    expect(calls).toHaveLength(1);
    expect(actions.ui!.getState().noticeOpen).toBe(false);
  });
  it('a status answer for an older epoch (StrictMode double effect) is ignored', async () => {
    const t = setupLive();
    const first = t.actions.refreshStatus!();
    t.controller.dispose();
    t.setStatus({ kind: 'mock' });
    const second = t.actions.refreshStatus!();
    await Promise.all([first, second]);
    expect(t.ui.getState().status).toEqual({ kind: 'mock' });
  });
  it('a mode change clears saved answers and a held request', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    expect(t.ui.getState().noticeOpen).toBe(true);
    t.setStatus({ kind: 'mock' });
    await t.actions.refreshStatus!();
    expect(t.ui.getState().noticeOpen).toBe(false);
    t.actions.acceptNotice!();
    expect(t.calls).toHaveLength(0);
  });
});

describe('Phase 3A: mock mode is exactly Phase 2', () => {
  it('builds the request with the Phase 2 builder: whole file contents, no skill id, no connections, no window', async () => {
    const t = setupLive({ kind: 'mock' });
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store, { includeContent: true }));
    const req = t.calls[0]!.request;
    expect(req.sourceContext![0]!.startLine).toBeUndefined();
    expect('skillId' in req).toBe(false);
    expect('connections' in req).toBe(false);
    expect(t.ui.getState().noticeOpen).toBe(false);
  });
  it('never saves or reuses a mock answer', async () => {
    const t = setupLive({ kind: 'mock' });
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    t.calls[0]!.result.resolve({ ...liveResult(t.calls[0]!.request.requestId), mode: 'mock' });
    await settle();
    t.actions.send(liveInput(t.store));
    expect(t.calls).toHaveLength(2);
  });
});

describe('Phase 3A: the first-request notice', () => {
  it('the first live request is held, not sent, and the Log has no request line', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    expect(t.actions.send(liveInput(t.store))).toBeNull();
    expect(t.calls).toHaveLength(0);
    expect(t.ui.getState().noticeOpen).toBe(true);
    expect(t.store.getState().ai.status).toBe('idle');
    expect(t.store.getState().log.some((l) => l.action === 'ai_request')).toBe(false);
  });
  it('OK sends exactly the held request, once, and later requests need no notice', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    t.actions.acceptNotice!();
    expect(t.calls).toHaveLength(1);
    expect(t.ui.getState().noticeOpen).toBe(false);
    t.actions.acceptNotice!();
    t.actions.acceptNotice!();
    expect(t.calls).toHaveLength(1);
    t.calls[0]!.result.resolve(liveResult(t.calls[0]!.request.requestId));
    await settle();
    t.actions.send(liveInput(t.store, { instruction: 'A different question' }));
    expect(t.calls).toHaveLength(2);
    expect(t.ui.getState().noticeOpen).toBe(false);
  });
  it('OK with nothing held sends nothing', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.acceptNotice!();
    expect(t.calls).toHaveLength(0);
  });
  it('an unknown mode also needs the notice, because the server may be live', async () => {
    const t = setupLive({ kind: 'unknown' });
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    expect(t.ui.getState().noticeOpen).toBe(true);
    expect(t.calls).toHaveLength(0);
  });
  it('a request sent before the status answer arrives is refused with a plain message and nothing is held or sent', () => {
    const t = setupLive();
    expect(t.actions.send(liveInput(t.store))).toBe('Still checking the AI mode. Try again in a moment.');
    expect(t.ui.getState().noticeOpen).toBe(false);
    expect(t.calls).toHaveLength(0);
  });
});

describe('Phase 3A: a held request never fires late', () => {
  const held = async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    expect(t.ui.getState().noticeOpen).toBe(true);
    return t;
  };
  const neverSends = async (t: Awaited<ReturnType<typeof held>>) => {
    expect(t.ui.getState().noticeOpen).toBe(false);
    t.actions.acceptNotice!();
    await settle();
    expect(t.calls).toHaveLength(0);
    expect(t.store.getState().ai.status).not.toBe('pending');
  };
  it('Cancel', async () => { const t = await held(); t.actions.cancel(); await neverSends(t); });
  it('Clear', async () => { const t = await held(); t.actions.clear(); await neverSends(t); });
  it('Stop / reset commands (cancel and reset)', async () => {
    const a = await held(); a.actions.reset!(); await neverSends(a);
    const b = await held(); b.actions.cancel(); await neverSends(b);
  });
  it('dispose', async () => { const t = await held(); t.controller.dispose(); await neverSends(t); });
  it('the panel unmounting (discardHeld)', async () => { const t = await held(); t.actions.discardHeld!(); await neverSends(t); });
  it('a snapshot change: Back to Start, a new load, or reset', async () => {
    const a = await held();
    a.store.update((s) => reset(s));
    await neverSends(a);
    const b = await held();
    b.store.update((s) => beginIngestion(s, { owner: 'o', repo: 'r2', source: 'github' }, 10));
    await neverSends(b);
  });
  it('a replaced snapshot after the request was held (load finishing)', async () => {
    const t = await held();
    let st = t.store.getState();
    st = beginIngestion(st, { owner: 'o', repo: 'r', source: 'github' }, 5, { background: true } as never);
    t.store.setState(st);
    st = completeIngestion(st, st.ingestion.runId, buildSampleSnapshot('react-frontend', 9), 6);
    t.store.setState(st);
    await neverSends(t);
  });
  it('a newer send replaces the held one, so OK sends only the newest', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store, { instruction: 'FIRST question' }));
    t.actions.send(liveInput(t.store, { instruction: 'SECOND question' }));
    t.actions.acceptNotice!();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.request.instruction).toBe('SECOND question');
  });
  it('even with timers advanced, a discarded request is never sent', async () => {
    const t = await held();
    t.actions.cancel();
    await new Promise((r) => setTimeout(r, 50));
    expect(t.calls).toHaveLength(0);
    t.actions.acceptNotice!();
    await new Promise((r) => setTimeout(r, 50));
    expect(t.calls).toHaveLength(0);
  });
  it('after a discard the user has not accepted, so the next live request asks again', async () => {
    const t = await held();
    t.actions.cancel();
    t.actions.send(liveInput(t.store));
    expect(t.ui.getState().noticeOpen).toBe(true);
  });
  it('a request that is already running is not affected by OK', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    t.actions.acceptNotice!();
    expect(t.store.getState().ai.status).toBe('pending');
    t.actions.send(liveInput(t.store, { instruction: 'Another' }));
    t.actions.acceptNotice!();
    expect(t.calls).toHaveLength(1);
  });
});

describe('Phase 3A: the session cache', () => {
  const accepted = async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    t.actions.acceptNotice!();
    t.calls[0]!.result.resolve(liveResult(t.calls[0]!.request.requestId));
    await settle();
    return t;
  };
  it('the same question again reuses the answer: no request, a Log line, fromCache, and the new request id', async () => {
    const t = await accepted();
    t.actions.send(liveInput(t.store, { requestId: 'again-1' }));
    expect(t.calls).toHaveLength(1);
    const ai = t.store.getState().ai;
    expect(ai.status).toBe('done');
    expect(ai.fromCache).toBe(true);
    expect(ai.requestId).toBe('again-1');
    expect(ai.result!.requestId).toBe('again-1');
    const line = t.store.getState().log.find((l) => l.action === 'ai_reused')!;
    expect(line.message).toBe('AI answer reused from this session (explain, 1 file selected). No request was sent.');
  });
  it('spacing and case do not matter; a different question, file, or task misses', async () => {
    const t = await accepted();
    t.actions.send(liveInput(t.store, { instruction: '  WHAT does   this do?  ' }));
    expect(t.calls).toHaveLength(1);
    t.actions.send(liveInput(t.store, { instruction: 'Something else' }));
    expect(t.calls).toHaveLength(2);
  });
  it('Ask again skips the saved answer and replaces it', async () => {
    const t = await accepted();
    t.actions.send(liveInput(t.store, { bypassCache: true }));
    expect(t.calls).toHaveLength(2);
    t.calls[1]!.result.resolve({ ...liveResult(t.calls[1]!.request.requestId), response: { type: 'explanation', summary: 'NEW', evidencePaths: [], limitations: ['x'] } });
    await settle();
    t.actions.send(liveInput(t.store));
    expect(t.calls).toHaveLength(2);
    expect((t.store.getState().ai.result!.response as { summary: string }).summary).toBe('NEW');
  });
  it('a failure is never saved', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    t.actions.acceptNotice!();
    t.calls[0]!.result.reject(new Error('boom'));
    await settle();
    t.actions.send(liveInput(t.store));
    expect(t.calls).toHaveLength(2);
  });
  it('an action answer is never saved', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store, { taskType: 'act', selectedPaths: [], instruction: 'start the crew' }));
    t.actions.acceptNotice!();
    t.calls[0]!.result.resolve({ requestId: t.calls[0]!.request.requestId, mode: 'live', response: { type: 'action', action: 'help', summary: 's' } });
    await settle();
    t.actions.send(liveInput(t.store, { taskType: 'act', selectedPaths: [], instruction: 'start the crew' }));
    expect(t.calls).toHaveLength(2);
  });
  it('a changed snippet misses; a new repository clears everything; reset clears', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store, { includeContent: true }));
    t.actions.acceptNotice!();
    t.calls[0]!.result.resolve(liveResult(t.calls[0]!.request.requestId));
    await settle();
    t.actions.send(liveInput(t.store, { includeContent: true }));
    expect(t.calls).toHaveLength(1);
    // Same repository, but the file text differs (an edit): the key changes by itself.
    const snap = t.store.getState().snapshot!;
    const edited = { ...snap, files: snap.files.map((f) => (f.path === 'index.html' ? { ...f, content: (f.content ?? '') + '\n<!-- edited -->' } : f)) };
    t.actions.send({ ...liveInput(t.store, { includeContent: true }), snapshot: edited });
    expect(t.calls).toHaveLength(2);
    t.calls[1]!.result.resolve(liveResult(t.calls[1]!.request.requestId));
    await settle();
    t.actions.reset!();
    t.actions.send(liveInput(t.store, { includeContent: true }));
    expect(t.calls).toHaveLength(3);
    t.calls[2]!.result.resolve(liveResult(t.calls[2]!.request.requestId));
    await settle();
    t.store.update((s) => reset(s));
    let st = t.store.getState();
    st = beginIngestion(st, { owner: 'o', repo: 'r', source: 'github' }, 20);
    st = completeIngestion(st, st.ingestion.runId, buildSampleSnapshot('static-site', 20), 21);
    t.store.setState(st);
    t.actions.send(liveInput(t.store, { includeContent: true }));
    expect(t.calls).toHaveLength(4);
  });
  it('a saved answer needs no notice', async () => {
    const t = await accepted();
    t.actions.discardHeld!();
    t.actions.send(liveInput(t.store));
    expect(t.ui.getState().noticeOpen).toBe(false);
  });
  it('nothing is saved or shown before a request was sent', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    expect(t.calls).toHaveLength(0);
    expect(t.store.getState().ai.status).toBe('idle');
  });
});

describe('Phase 3A: Context Engine in live requests', () => {
  it('sends no snippet with the box off, and a window with its first line when on', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store, { finding: { path: 'index.html', skillId: 'scan.frontend.img-alt', firstLine: 1 } }));
    t.actions.acceptNotice!();
    const req = t.calls[0]!.request;
    expect(req.sourceContext).toBeUndefined();
    expect(req.skillId).toBe('scan.frontend.img-alt');
  });
  it('a request that fails the Phase 2 checks returns the message and holds nothing', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    expect(t.actions.send(liveInput(t.store, { instruction: '   ' }))).toBe('The instruction is empty.');
    expect(t.ui.getState().noticeOpen).toBe(false);
    expect(t.actions.send(liveInput(t.store, { selectedPaths: ['nope.js'] }))).toBe('"nope.js" is not in the loaded snapshot.');
  });
});

describe('Phase 3A: the result hand-off and the Log', () => {
  it('calls the handler with the result, the request, and whether it was saved; the finding id is passed through', async () => {
    const t = setupLive();
    const seen: Array<{ type: string; fromCache: boolean; findingId?: string }> = [];
    t.actions.setResultHandler!((r, _req, info) => seen.push({ type: r.response.type, fromCache: info.fromCache, ...(info.findingId ? { findingId: info.findingId } : {}) }));
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store, { findingId: 'f-1' }));
    t.actions.acceptNotice!();
    t.calls[0]!.result.resolve(liveResult(t.calls[0]!.request.requestId));
    await settle();
    t.actions.send(liveInput(t.store, { findingId: 'f-1' }));
    expect(seen).toEqual([{ type: 'explanation', fromCache: false, findingId: 'f-1' }, { type: 'explanation', fromCache: true, findingId: 'f-1' }]);
  });
  it('removing the handler stops the calls; a throwing handler is logged and does not break the controller', async () => {
    const t = setupLive();
    const off = t.actions.setResultHandler!(() => { throw new Error('handler boom'); });
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    t.actions.acceptNotice!();
    t.calls[0]!.result.resolve(liveResult(t.calls[0]!.request.requestId));
    await settle();
    expect(t.store.getState().ai.status).toBe('done');
    expect(t.store.getState().log.find((l) => l.action === 'ai_handoff_failed')!.message).toBe('The AI answer could not be handed on (Error).');
    off();
    t.actions.send(liveInput(t.store, { instruction: 'next' }));
    expect(t.calls).toHaveLength(2);
  });
  it('Log lines hold the provider, tier, and counts, and never the question, snippet, or answer text', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store, { instruction: 'QUESTION_SENTINEL_77 about this', includeContent: true }));
    t.actions.acceptNotice!();
    t.calls[0]!.result.resolve(liveResult(t.calls[0]!.request.requestId, { meta: { tier: 'light', provider: 'groq', model: 'openai/gpt-oss-20b', lighter: true, attempts: [{ provider: 'gemini', outcome: 'rate_limited' }] } }));
    await settle();
    const log = t.store.getState().log;
    const resp = log.find((l) => l.action === 'ai_response')!;
    expect(resp.message).toBe('AI response: explanation (live, Groq, light, lighter model, 1 earlier attempt failed).');
    const text = JSON.stringify(log) + JSON.stringify({ ...t.store.getState().ai, result: undefined, summary: t.store.getState().ai.summary });
    expect(text).not.toContain('QUESTION_SENTINEL_77');
    expect(text).not.toContain('ANSWER_SENTINEL');
    expect(text).not.toContain('openai/gpt-oss-20b');
  });
});

// ---------------------------------------------------------------------------
// @node: F11.8 review fixes (independent review, 2026-11-26)
// ---------------------------------------------------------------------------

import { runCommand } from '../src/store/workActions';
import { practiceContent } from '../src/engine/practiceScript';
import { loadedState, wctx } from './helpers/aiHarness';
import { applyUnifiedDiff } from '../src/engine/diffApply';

describe('review fix: snippets and saved answers follow the practice copy', () => {
  const html = '<!doctype html>\n<html>\n<body>\n<h1>Shop</h1>\n<img src="logo.png">\n<p>Welcome to the little shop</p>\n</body>\n</html>\n';
  async function liveWithPractice() {
    const state = await loadedState({ 'index.html': html });
    const store: Store<StudioState> = createStore(state);
    const calls: Call[] = [];
    let clock = 0;
    const controller = createAssistantController(store, {
      requestAssistant(request, { signal }) { const result = deferred<AIResult>(); calls.push({ request, signal, result }); return result.promise; },
      now: () => ++clock, newId: () => `rf-${calls.length + 1}`,
      fetchStatus: async () => ({ kind: 'live', ready: true, providers: [] }), cache: createAnswerCache(),
    });
    await controller.actions.refreshStatus!();
    controller.actions.acceptNotice!();
    return { store, calls, actions: controller.actions };
  }
  const ask = (t: Awaited<ReturnType<typeof liveWithPractice>>, over: Record<string, unknown> = {}) =>
    t.actions.send({ snapshot: t.store.getState().snapshot!, instruction: 'What changed in this page?', taskType: 'explain', selectedPaths: ['index.html'], includeContent: true, ...over } as never);
  const approveEdit = (t: Awaited<ReturnType<typeof liveWithPractice>>) => {
    const diff = '--- a/index.html\n+++ b/index.html\n@@ -5,1 +5,1 @@\n-<img src="logo.png">\n+<img src="logo.png" alt="Shop logo">\n';
    t.store.update((s) => ({ ...s, work: { ...s.work, proposal: { id: 'p', path: 'index.html', title: 't', diff, source: 'practice' as const } } }));
    t.store.update((s) => runCommand(s, { name: 'approve' }, wctx()).state);
  };

  it('after an approved change, a new request sends the practice text, not the original', async () => {
    const t = await liveWithPractice();
    approveEdit(t);
    expect(practiceContent(t.store.getState().snapshot!, t.store.getState().work.applied, 'index.html')).toContain('alt="Shop logo"');
    ask(t);
    const sent = t.calls[0]!.request.sourceContext![0]!.content;
    expect(sent).toContain('alt="Shop logo"');
    expect(sent).not.toContain('<img src="logo.png">\n');
  });
  it('a diff built from the sent snippet applies to the practice copy', async () => {
    const t = await liveWithPractice();
    approveEdit(t);
    ask(t);
    const sent = t.calls[0]!.request.sourceContext![0]!.content;
    const practice = practiceContent(t.store.getState().snapshot!, t.store.getState().work.applied, 'index.html')!;
    expect(practice).toBe(sent);
    expect(applyUnifiedDiff(practice, '--- a/index.html\n+++ b/index.html\n@@ -6,1 +6,1 @@\n-<p>Welcome to the little shop</p>\n+<p>Hello</p>\n').ok).toBe(true);
  });
  it('Approve, Undo, and Redo each end the saved answers', async () => {
    const t = await liveWithPractice();
    ask(t, { includeContent: false });
    t.calls[0]!.result.resolve({ requestId: t.calls[0]!.request.requestId, mode: 'live', response: { type: 'clarification', questions: ['q'] } });
    await settle();
    ask(t, { includeContent: false });
    expect(t.calls).toHaveLength(1); // saved
    approveEdit(t);
    ask(t, { includeContent: false });
    expect(t.calls).toHaveLength(2); // Approve ended the saved answers
    t.calls[1]!.result.resolve({ requestId: t.calls[1]!.request.requestId, mode: 'live', response: { type: 'clarification', questions: ['q'] } });
    await settle();
    ask(t, { includeContent: false });
    expect(t.calls).toHaveLength(2);
    t.store.update((s) => runCommand(s, { name: 'undo' }, wctx()).state);
    ask(t, { includeContent: false });
    expect(t.calls).toHaveLength(3); // Undo ended them
    t.calls[2]!.result.resolve({ requestId: t.calls[2]!.request.requestId, mode: 'live', response: { type: 'clarification', questions: ['q'] } });
    await settle();
    t.store.update((s) => runCommand(s, { name: 'redo' }, wctx()).state);
    ask(t, { includeContent: false });
    expect(t.calls).toHaveLength(4); // Redo ended them
  });
});

describe('review fix: no hand-off for mock answers, and status changes drop a held request', () => {
  it('a mock result is shown but never handed on (no queue, no action)', async () => {
    const t = setupLive({ kind: 'mock' });
    await t.actions.refreshStatus!();
    let handed = 0;
    t.actions.setResultHandler!(() => { handed++; });
    t.actions.send(liveInput(t.store));
    t.calls[0]!.result.resolve({ ...liveResult(t.calls[0]!.request.requestId), mode: 'mock', meta: undefined });
    await settle();
    expect(handed).toBe(0);
    expect(t.store.getState().ai.status).toBe('done');
  });
  it('a live result is handed on exactly once', async () => {
    const t = setupLive();
    await t.actions.refreshStatus!();
    let handed = 0;
    t.actions.setResultHandler!(() => { handed++; });
    t.actions.send(liveInput(t.store)); t.actions.acceptNotice!();
    t.calls[0]!.result.resolve(liveResult(t.calls[0]!.request.requestId));
    await settle();
    expect(handed).toBe(1);
  });
  it('unknown becoming mock drops the held request and the notice', async () => {
    const t = setupLive({ kind: 'unknown' });
    await t.actions.refreshStatus!();
    t.actions.send(liveInput(t.store));
    expect(t.ui.getState().noticeOpen).toBe(true);
    t.setStatus({ kind: 'mock' });
    await t.actions.refreshStatus!();
    expect(t.ui.getState().noticeOpen).toBe(false);
    t.actions.acceptNotice!();
    expect(t.calls).toHaveLength(0);
  });
});
