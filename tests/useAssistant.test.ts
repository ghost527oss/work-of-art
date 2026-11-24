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
