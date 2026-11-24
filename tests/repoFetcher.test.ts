// @node: F1.6
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRepoRequest } from '../api/repo';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { IngestError, isAbortError, type FetchLike } from '../src/engine/githubSource';
import { encodeEvent } from '../src/engine/ndjson';
import { FALLBACK_CODES, ingestRepository, ingestSample, type IngestOptions } from '../src/engine/repoFetcher';
import { assertCoverageConsistent, type ApiErrorCode, type IngestEvent, type RepoRequest } from '../src/types/contracts';

// ---------------------------------------------------------------------------
// A small world: a fake GitHub, the real server handler, and a "browser" fetch
// ---------------------------------------------------------------------------

const files: Record<string, string> = {
  'package.json': '{"name":"demo"}',
  'index.html': '<html></html>',
  'src/main.ts': 'export {}',
};

type GithubHooks = { raw?: (path: string) => Response | Promise<Response> | undefined; tree?: () => Response | undefined };

function githubFake(hooks: GithubHooks = {}): FetchLike {
  return async (url) => {
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      if (u.pathname.includes('/git/trees/')) {
        const o = hooks.tree?.();
        if (o) return o;
        const dirs = new Set<string>();
        const tree: Array<Record<string, unknown>> = [];
        for (const p of Object.keys(files)) {
          const parts = p.split('/');
          for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
          tree.push({ path: p, type: 'blob', mode: '100644', size: files[p]!.length });
        }
        for (const d of dirs) tree.push({ path: d, type: 'tree' });
        return new Response(JSON.stringify({ tree, truncated: false }));
      }
      return new Response(JSON.stringify({ default_branch: 'main' }));
    }
    const path = decodeURIComponent(u.pathname.split('/').slice(4).join('/'));
    const o = await hooks.raw?.(path);
    if (o) return o;
    const content = files[path];
    return content === undefined ? new Response('', { status: 404 }) : new Response(content);
  };
}

type ServerScript = (init: RequestInit | undefined) => Response | Promise<Response>;

function world(options: { server?: ServerScript; github?: GithubHooks } = {}) {
  const serverCalls: RequestInit[] = [];
  const browserGithubCalls: string[] = [];
  const github = githubFake(options.github);
  const fetchImpl: FetchLike = async (url, init) => {
    if (url === '/api/repo') {
      serverCalls.push(init ?? {});
      if (options.server) return options.server(init);
      // The real handler, talking to the fake GitHub on the "server side".
      return handleRepoRequest(new Request('http://localhost/api/repo', init), {}, { fetch: github });
    }
    browserGithubCalls.push(url);
    return github(url, init);
  };
  return { fetchImpl, serverCalls, browserGithubCalls };
}

const target: RepoRequest = { owner: 'octo', repo: 'demo' };

function ndjson(events: IngestEvent[], status = 200): Response {
  return new Response(events.map(encodeEvent).join(''), { status, headers: { 'content-type': 'application/x-ndjson' } });
}

function errorEvent(code: ApiErrorCode, extra: { resetAt?: string } = {}): IngestEvent {
  return { type: 'error', error: { code, message: `scripted ${code}`, ...extra } };
}

function recorder() {
  const events: IngestEvent[] = [];
  return { events, onEvent: (e: IngestEvent) => events.push(e) };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

const run = (w: ReturnType<typeof world>, extra: Partial<IngestOptions> = {}, req: RepoRequest = target) =>
  ingestRepository(req, { fetchImpl: w.fetchImpl, fallbackEnabled: false, ...extra });

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Server route
// ---------------------------------------------------------------------------

describe('ingestRepository: server route', () => {
  it('returns a validated snapshot and forwards stage and progress events, but not result', async () => {
    const w = world();
    const { events, onEvent } = recorder();
    const snapshot = await run(w, { onEvent });
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
    expect(snapshot).toMatchObject({ owner: 'octo', name: 'demo', ref: 'main', source: 'github' });
    expect(snapshot.files.map((f) => f.path)).toEqual(['index.html', 'package.json', 'src/main.ts']);
    expect(events.length).toBeGreaterThan(3);
    expect(events.every((e) => e.type === 'stage' || e.type === 'progress')).toBe(true);
    expect(events[0]).toMatchObject({ type: 'stage', stage: 'resolving_ref', status: 'started' });
    expect(w.browserGithubCalls).toHaveLength(0);
  });

  it('posts the request as JSON to the endpoint, with the abort signal', async () => {
    const w = world();
    const controller = new AbortController();
    await run(w, { signal: controller.signal }, { ...target, ref: 'dev', scope: ['src'] });
    expect(w.serverCalls).toHaveLength(1);
    const init = w.serverCalls[0]!;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ owner: 'octo', repo: 'demo', ref: 'dev', scope: ['src'] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never sends a token or URL to the server', async () => {
    const w = world();
    await run(w);
    expect(Object.keys(JSON.parse(w.serverCalls[0]!.body as string)).sort()).toEqual(['owner', 'repo']);
  });

  it('rejects invalid input before any network call', async () => {
    const w = world();
    for (const bad of [{ owner: '-x', repo: 'r' }, { owner: 'o', repo: '..' }, { owner: 'o', repo: 'r', scope: ['../x'] }]) {
      const err = (await rejection(run(w, {}, bad))) as IngestError;
      expect(err.code).toBe('invalid_request');
    }
    expect(w.serverCalls).toHaveLength(0);
    expect(w.browserGithubCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Errors that must not fall back
// ---------------------------------------------------------------------------

describe('ingestRepository: errors without fallback', () => {
  for (const code of ['not_found', 'unsupported', 'oversized', 'invalid_request'] as const) {
    it(`throws ${code} from a stream error event and does not call GitHub from the browser`, async () => {
      const w = world({ server: () => ndjson([errorEvent(code)]) });
      const err = (await rejection(run(w, { fallbackEnabled: true }))) as IngestError;
      expect(err).toBeInstanceOf(IngestError);
      expect(err.code).toBe(code);
      expect(w.browserGithubCalls).toHaveLength(0);
    });
  }

  it('maps a plain JSON 400 from the handler to invalid_request without fallback', async () => {
    const w = world({
      server: () =>
        new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'bad' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const err = (await rejection(run(w, { fallbackEnabled: true }))) as IngestError;
    expect(err.code).toBe('invalid_request');
    expect(w.browserGithubCalls).toHaveLength(0);
  });

  it('keeps the reset time on a rate_limited error when fallback is off', async () => {
    const w = world({ server: () => ndjson([errorEvent('rate_limited', { resetAt: '2030-01-01T00:00:00.000Z' })]) });
    const err = (await rejection(run(w))) as IngestError;
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('lists exactly the fallback-eligible codes', () => {
    expect([...FALLBACK_CODES].sort()).toEqual(['rate_limited', 'timeout', 'upstream_failure']);
  });
});

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

describe('ingestRepository: fallback', () => {
  const triggers: Array<[string, ServerScript]> = [
    ['upstream_failure event', () => ndjson([errorEvent('upstream_failure')])],
    ['timeout event', () => ndjson([errorEvent('timeout')])],
    ['rate_limited event', () => ndjson([errorEvent('rate_limited')])],
    [
      'network error',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
    ['missing route (HTML 404)', () => new Response('<html>Not found</html>', { status: 404, headers: { 'content-type': 'text/html' } })],
    ['server 500 without JSON', () => new Response('oops', { status: 500 })],
    ['stream ending with no result', () => ndjson([{ type: 'stage', stage: 'fetching_tree', status: 'started' }])],
    ['empty stream', () => ndjson([])],
    ['malformed event line', () => new Response('not json\n', { headers: { 'content-type': 'application/x-ndjson' } })],
    [
      'unknown event type',
      () => new Response('{"type":"mystery"}\n', { headers: { 'content-type': 'application/x-ndjson' } }),
    ],
  ];

  for (const [name, server] of triggers) {
    it(`falls back after: ${name}`, async () => {
      const w = world({ server });
      const { events, onEvent } = recorder();
      const snapshot = await run(w, { fallbackEnabled: true, onEvent });
      expect(snapshot.source).toBe('github');
      expect(snapshot.files).toHaveLength(3);
      expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
      expect(w.browserGithubCalls.length).toBeGreaterThan(0);

      const noticeAt = events.findIndex((e) => e.type === 'notice');
      expect(noticeAt).toBeGreaterThanOrEqual(0);
      expect(events.filter((e) => e.type === 'notice')).toHaveLength(1);
      expect(events[noticeAt]).toMatchObject({ code: 'fallback_in_use' });
      // The fallback run starts over, after the notice.
      expect(events[noticeAt + 1]).toMatchObject({ type: 'stage', stage: 'resolving_ref', status: 'started' });
      expect(events.some((e) => e.type === 'result' || e.type === 'error')).toBe(false);
    });
  }

  it('falls back after a result whose coverage is inconsistent', async () => {
    const bad = buildSampleSnapshot('static-site', 1);
    bad.coverage.loadedSourceFiles += 1;
    const w = world({ server: () => ndjson([{ type: 'result', response: { snapshot: bad } }]) });
    const snapshot = await run(w, { fallbackEnabled: true });
    expect(snapshot.source).toBe('github');
    expect(w.browserGithubCalls.length).toBeGreaterThan(0);
  });

  it('does not fall back when disabled, and throws the server failure', async () => {
    for (const [, server] of triggers) {
      const w = world({ server });
      const err = (await rejection(run(w, { fallbackEnabled: false }))) as IngestError;
      expect(err).toBeInstanceOf(IngestError);
      expect(FALLBACK_CODES).toContain(err.code);
      expect(w.browserGithubCalls).toHaveLength(0);
    }
  });

  it('never stores an inconsistent snapshot: it is rejected as upstream_failure', async () => {
    const bad = buildSampleSnapshot('static-site', 1);
    bad.coverage.skippedFiles = 99;
    const w = world({ server: () => ndjson([{ type: 'result', response: { snapshot: bad } }]) });
    const err = (await rejection(run(w))) as IngestError;
    expect(err.code).toBe('upstream_failure');
  });

  it('throws the fallback error when both routes fail, and returns no snapshot or sample', async () => {
    const w = world({
      server: () => ndjson([errorEvent('upstream_failure')]),
      github: { tree: () => new Response('{}', { status: 404 }) },
    });
    const err = (await rejection(run(w, { fallbackEnabled: true }))) as IngestError;
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe('not_found');
  });

  it('reports a rate limit from the fallback with its reset time', async () => {
    const w = world({
      server: () => ndjson([errorEvent('upstream_failure')]),
      github: { tree: () => new Response('{}', { status: 429, headers: { 'x-ratelimit-reset': '1900000000' } }) },
    });
    const err = (await rejection(run(w, { fallbackEnabled: true }))) as IngestError;
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBe(new Date(1_900_000_000 * 1000).toISOString());
  });

  it('never substitutes a sample after any failure', async () => {
    const failures: ServerScript[] = triggers.map(([, s]) => s);
    for (const server of failures) {
      const w = world({ server, github: { tree: () => new Response('{}', { status: 404 }) } });
      const outcome = await run(w, { fallbackEnabled: true }).then(
        (snapshot) => ({ snapshot }),
        (error: unknown) => ({ error }),
      );
      expect('snapshot' in outcome).toBe(false);
      expect((outcome as { error: IngestError }).error).toBeInstanceOf(IngestError);
    }
  });

  it('treats a stalled server as a timeout and can fall back', async () => {
    const stalled: ServerScript = (init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const w = world({ server: stalled });
    const snapshot = await run(w, { fallbackEnabled: true, serverTimeoutMs: 30 });
    expect(snapshot.source).toBe('github');
    const w2 = world({ server: stalled });
    const err = (await rejection(run(w2, { serverTimeoutMs: 30 }))) as IngestError;
    expect(err.code).toBe('timeout');
  });
});

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

describe('ingestRepository: cancellation', () => {
  it('rejects with AbortError and calls nothing when the signal is already aborted', async () => {
    const w = world();
    const controller = new AbortController();
    controller.abort();
    const err = await rejection(run(w, { signal: controller.signal }));
    expect(isAbortError(err)).toBe(true);
    expect(w.serverCalls).toHaveLength(0);
  });

  it('aborts mid-stream with no snapshot and no fallback attempt', async () => {
    const controller = new AbortController();
    const stalling: ServerScript = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(encodeEvent({ type: 'stage', stage: 'resolving_ref', status: 'started' })));
          },
          pull: () => new Promise(() => undefined),
        }),
        { headers: { 'content-type': 'application/x-ndjson' } },
      );
    const w = world({ server: stalling });
    const err = await rejection(
      run(w, {
        fallbackEnabled: true,
        signal: controller.signal,
        onEvent: () => setTimeout(() => controller.abort(), 5),
      }),
    );
    expect(isAbortError(err)).toBe(true);
    expect(w.browserGithubCalls).toHaveLength(0);
  });

  it('aborts during the fallback run and returns nothing', async () => {
    const controller = new AbortController();
    const w = world({ server: () => ndjson([errorEvent('upstream_failure')]) });
    const err = await rejection(
      run(w, {
        fallbackEnabled: true,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === 'notice') controller.abort();
        },
      }),
    );
    expect(isAbortError(err)).toBe(true);
    expect(w.browserGithubCalls).toHaveLength(0);
  });

  it('aborts a server request that is still waiting for a response', async () => {
    const controller = new AbortController();
    const hanging: ServerScript = (init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const w = world({ server: hanging });
    const pending = run(w, { fallbackEnabled: true, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    expect(isAbortError(await rejection(pending))).toBe(true);
    expect(w.browserGithubCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

describe('ingestSample', () => {
  it('returns a validated sample snapshot without any network call', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const snapshot = await ingestSample('react-frontend', { now: 7 });
    expect(spy).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({ source: 'sample', owner: 'sample', name: 'react-frontend', loadedAt: 7 });
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
  });

  it('emits the same kind of stage events as a real run, with skipped network stages', async () => {
    const { events, onEvent } = recorder();
    const snapshot = await ingestSample('static-site', { onEvent });
    expect(events.map((e) => (e.type === 'stage' ? `${e.stage}:${e.status}` : e.type))).toEqual([
      'resolving_ref:skipped',
      'fetching_tree:skipped',
      'loading_sources:started',
      'progress',
      'loading_sources:finished',
    ]);
    const progress = events.find((e) => e.type === 'progress');
    expect(progress).toMatchObject({ loaded: snapshot.coverage.loadedSourceFiles, total: snapshot.coverage.loadedSourceFiles });
  });

  it('rejects an unknown sample id', async () => {
    const err = (await rejection(ingestSample('nope' as never))) as IngestError;
    expect(err.code).toBe('invalid_request');
  });

  it('rejects with AbortError when already aborted, and emits nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    const { events, onEvent } = recorder();
    const err = await rejection(ingestSample('static-site', { signal: controller.signal, onEvent }));
    expect(isAbortError(err)).toBe(true);
    expect(events).toHaveLength(0);
  });
});
