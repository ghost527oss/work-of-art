// @node: F1.5
import { afterEach, describe, expect, it, vi } from 'vitest';
import apiRoute, { MAX_BODY_BYTES, handleRepoRequest, type HandlerDeps } from '../api/repo';
import { BUDGETS, type Budgets } from '../src/config/budgets';
import { IngestError, isAbortError, type FetchLike } from '../src/engine/githubSource';
import { MAX_EVENT_LINE_CHARS, encodeEvent, readEvents } from '../src/engine/ndjson';
import { RepoSnapshotSchema, assertCoverageConsistent, type IngestEvent } from '../src/types/contracts';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const SECRET_CONTENT = 'TOP-SECRET-FILE-CONTENT';
const SECRET_TOKEN = 'ghp_secret_token_value';

const files: Record<string, string> = {
  'package.json': '{"name":"demo"}',
  'src/main.ts': `export const s = "${SECRET_CONTENT}"`,
  'README.md': '# demo',
};

interface FakeHooks {
  tree?: () => Response | undefined;
  repoInfo?: () => Response | undefined;
  raw?: (path: string) => Response | Promise<Response> | undefined;
}

function fakeGithub(hooks: FakeHooks = {}) {
  const seen: Array<{ url: string; auth?: string; signal?: AbortSignal | null }> = [];
  const fn: FetchLike = async (url, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    seen.push({ url, auth: headers?.Authorization, signal: init?.signal });
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
          tree.push({ path: p, type: 'blob', mode: '100644', size: new TextEncoder().encode(files[p]).length });
        }
        for (const d of dirs) tree.push({ path: d, type: 'tree' });
        return new Response(JSON.stringify({ tree, truncated: false }));
      }
      const o = hooks.repoInfo?.();
      if (o) return o;
      return new Response(JSON.stringify({ default_branch: 'main', private: false }));
    }
    const path = decodeURIComponent(u.pathname.split('/').slice(4).join('/'));
    const o = await hooks.raw?.(path);
    if (o) return o;
    const content = files[path];
    return content === undefined ? new Response('', { status: 404 }) : new Response(content);
  };
  return { fn, seen };
}

function post(body: unknown, init: RequestInit = {}): Request {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('http://localhost/api/repo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text,
    ...init,
  });
}

async function collect(response: Response, signal?: AbortSignal): Promise<IngestEvent[]> {
  const events: IngestEvent[] = [];
  for await (const e of readEvents(response, signal ? { signal } : {})) events.push(e);
  return events;
}

async function jsonBody(response: Response): Promise<{ error: { code: string; message: string } }> {
  return (await response.json()) as { error: { code: string; message: string } };
}

const valid = { owner: 'octo', repo: 'demo' };

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Request validation (plain JSON errors)
// ---------------------------------------------------------------------------

describe('handleRepoRequest: request validation', () => {
  it('answers 405 with an Allow header for any method other than POST', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleRepoRequest(new Request('http://localhost/api/repo', { method }), {});
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
      expect((await jsonBody(res)).error.code).toBe('invalid_request');
    }
  });

  it('rejects a non-JSON content type', async () => {
    const res = await handleRepoRequest(post(valid, { headers: { 'content-type': 'text/plain' } }), {});
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    const res = await handleRepoRequest(post('{not json'), {});
    expect(res.status).toBe(400);
    expect((await jsonBody(res)).error.code).toBe('invalid_request');
  });

  it('rejects a body above the size limit, with or without a content-length header', async () => {
    const big = JSON.stringify({ ...valid, scope: ['a'.repeat(MAX_BODY_BYTES)] });
    const withLength = await handleRepoRequest(post(big, { headers: { 'content-type': 'application/json', 'content-length': String(big.length) } }), {});
    expect(withLength.status).toBe(400);
    const streamed = await handleRepoRequest(
      new Request('http://localhost/api/repo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(big));
            c.close();
          },
        }),
        // @ts-expect-error duplex is required by Node for streamed request bodies
        duplex: 'half',
      }),
      {},
    );
    expect(streamed.status).toBe(400);
  });

  it('rejects unknown fields without echoing their values', async () => {
    const res = await handleRepoRequest(post({ ...valid, url: 'https://evil.example/SECRETVALUE' }), {});
    expect(res.status).toBe(400);
    expect(JSON.stringify(await jsonBody(res))).not.toMatch(/SECRETVALUE|evil/);
  });

  it('rejects client attempts to supply a token or URL', async () => {
    expect((await handleRepoRequest(post({ ...valid, token: 'x' }), {})).status).toBe(400);
    expect((await handleRepoRequest(post({ ...valid, fetchUrl: 'http://169.254.169.254/' }), {})).status).toBe(400);
  });

  it('rejects missing, empty, and wrongly typed fields', async () => {
    for (const body of [{}, { owner: 'o' }, { owner: '', repo: 'r' }, { owner: 1, repo: 'r' }, [], null, 'x']) {
      const res = await handleRepoRequest(post(body), {});
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('rejects values that fail the character-set rules and unsafe scope paths', async () => {
    const bad = [
      { owner: '-bad', repo: 'r' },
      { owner: 'o', repo: 'r r' },
      { owner: 'o', repo: '..' },
      { owner: 'o', repo: 'r', ref: '../x' },
      { owner: 'o', repo: 'r', ref: '-x' },
      { owner: 'o', repo: 'r', scope: ['../etc'] },
      { owner: 'o', repo: 'r', scope: ['/abs'] },
      { owner: 'o', repo: 'r', scope: Array.from({ length: 21 }, (_, i) => `d${i}`) },
    ];
    for (const body of bad) {
      const res = await handleRepoRequest(post(body), {});
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await jsonBody(res)).error.code).toBe('invalid_request');
    }
  });

  it('makes no upstream call for any rejected request', async () => {
    const fake = fakeGithub();
    await handleRepoRequest(post({ owner: '-bad', repo: 'r' }), {}, { fetch: fake.fn });
    await handleRepoRequest(new Request('http://localhost/api/repo'), {}, { fetch: fake.fn });
    expect(fake.seen).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Streaming success
// ---------------------------------------------------------------------------

describe('handleRepoRequest: stream', () => {
  it('streams stage events then a result with a valid, consistent snapshot', async () => {
    const fake = fakeGithub();
    const res = await handleRepoRequest(post(valid), {}, { fetch: fake.fn });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/x-ndjson/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    const events = await collect(res);
    const last = events[events.length - 1];
    expect(last?.type).toBe('result');
    expect(events.filter((e) => e.type === 'result' || e.type === 'error')).toHaveLength(1);
    expect(events.slice(0, -1).every((e) => e.type === 'stage' || e.type === 'progress')).toBe(true);
    if (last?.type !== 'result') throw new Error('unreachable');
    const snapshot = last.response.snapshot;
    expect(RepoSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
    expect(snapshot.files.map((f) => f.path)).toEqual(['README.md', 'package.json', 'src/main.ts']);
  });

  it('passes the request ref and scope to the pipeline', async () => {
    const run = vi.fn(async () => {
      throw new IngestError('not_found', 'stop here');
    });
    const res = await handleRepoRequest(post({ ...valid, ref: 'dev', scope: ['src'] }), {}, { run });
    await collect(res);
    expect(run).toHaveBeenCalledTimes(1);
    expect((run.mock.calls[0] as unknown[])[0]).toEqual({ owner: 'octo', repo: 'demo', ref: 'dev', scope: ['src'] });
  });

  it('sends the server token to the API host only', async () => {
    const fake = fakeGithub();
    const res = await handleRepoRequest(post(valid), { GITHUB_TOKEN: ` ${SECRET_TOKEN} ` }, { fetch: fake.fn });
    const events = await collect(res);
    expect(events[events.length - 1]?.type).toBe('result');
    const api = fake.seen.filter((s) => s.url.includes('api.github.com'));
    const raw = fake.seen.filter((s) => s.url.includes('raw.githubusercontent.com'));
    expect(api.length).toBeGreaterThan(0);
    expect(api.every((s) => s.auth === `Bearer ${SECRET_TOKEN}`)).toBe(true);
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.every((s) => s.auth === undefined)).toBe(true);
  });

  it('never returns the token in the response stream', async () => {
    const fake = fakeGithub();
    const res = await handleRepoRequest(post(valid), { GITHUB_TOKEN: SECRET_TOKEN }, { fetch: fake.fn });
    expect(await res.text()).not.toContain(SECRET_TOKEN);
  });

  it('works through the default export used by Vercel', async () => {
    const res = await apiRoute.fetch(new Request('http://localhost/api/repo', { method: 'GET' }));
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Errors inside the stream
// ---------------------------------------------------------------------------

describe('handleRepoRequest: errors arrive as stream events', () => {
  async function lastEvent(hooks: FakeHooks, deps: HandlerDeps = {}): Promise<IngestEvent | undefined> {
    const fake = fakeGithub(hooks);
    const res = await handleRepoRequest(post(valid), {}, { fetch: fake.fn, ...deps });
    expect(res.status).toBe(200);
    const events = await collect(res);
    expect(events.some((e) => e.type === 'result')).toBe(false);
    return events[events.length - 1];
  }

  it('not_found', async () => {
    const e = await lastEvent({ tree: () => new Response('{}', { status: 404 }) });
    expect(e).toEqual({ type: 'error', error: { code: 'not_found', message: expect.any(String) } });
  });

  it('rate_limited with a reset time', async () => {
    const e = await lastEvent({
      tree: () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' } }),
    });
    expect(e).toMatchObject({ type: 'error', error: { code: 'rate_limited', resetAt: new Date(1_900_000_000 * 1000).toISOString() } });
  });

  it('upstream_failure for a 500', async () => {
    const e = await lastEvent({ repoInfo: () => new Response('boom', { status: 500 }) });
    expect(e).toMatchObject({ type: 'error', error: { code: 'upstream_failure' } });
  });

  it('timeout when GitHub does not answer within the request timeout', async () => {
    const budgets: Budgets = { ...BUDGETS, requestTimeoutMs: 25 };
    const hanging: FetchLike = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const res = await handleRepoRequest(post(valid), {}, { fetch: hanging, budgets });
    const events = await collect(res);
    expect(events[events.length - 1]).toMatchObject({ type: 'error', error: { code: 'timeout' } });
  });

  it('turns an unexpected exception into a generic upstream_failure without leaking its message', async () => {
    const run = vi.fn(async () => {
      throw new Error(`internal detail ${SECRET_CONTENT}`);
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleRepoRequest(post(valid), {}, { run });
    const events = await collect(res);
    expect(events).toEqual([{ type: 'error', error: { code: 'upstream_failure', message: 'Unexpected server error.' } }]);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_CONTENT);
  });

  it('always ends the stream with exactly one result or error event', async () => {
    const cases: FakeHooks[] = [{}, { tree: () => new Response('{}', { status: 404 }) }, { repoInfo: () => new Response('', { status: 502 }) }];
    for (const hooks of cases) {
      const fake = fakeGithub(hooks);
      const events = await collect(await handleRepoRequest(post(valid), {}, { fetch: fake.fn }));
      expect(events.filter((e) => e.type === 'result' || e.type === 'error')).toHaveLength(1);
      expect(['result', 'error']).toContain(events[events.length - 1]?.type);
    }
  });
});

// ---------------------------------------------------------------------------
// Acceptance cases through the handler itself (requirements section 7, item 2)
// ---------------------------------------------------------------------------

describe('handleRepoRequest: repository shapes arrive as a valid result', () => {
  async function resultOf(hooks: FakeHooks, deps: HandlerDeps = {}) {
    const fake = fakeGithub(hooks);
    const res = await handleRepoRequest(post(valid), {}, { fetch: fake.fn, ...deps });
    expect(res.status).toBe(200);
    const events = await collect(res);
    const last = events[events.length - 1];
    if (last?.type !== 'result') throw new Error(`expected a result, got ${JSON.stringify(last)}`);
    const snapshot = last.response.snapshot;
    expect(RepoSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
    return snapshot;
  }
  const treeOf = (entries: Array<Record<string, unknown>>, truncated = false) => () => new Response(JSON.stringify({ tree: entries, truncated }));

  it('truncated tree: treeComplete false, warning present, analysis incomplete', async () => {
    const snapshot = await resultOf({
      tree: treeOf([{ path: 'a.ts', type: 'blob', size: 3 }], true),
      raw: () => new Response('abc'),
    });
    expect(snapshot.inventory.treeComplete).toBe(false);
    expect(snapshot.coverage.treeComplete).toBe(false);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/truncated/i);
    expect(snapshot.coverage.loadedSourceFiles).toBe(1);
  });

  it('empty repository: a valid empty snapshot with a notice', async () => {
    const snapshot = await resultOf({ tree: () => new Response(JSON.stringify({ message: 'Git Repository is empty.' }), { status: 409 }) });
    expect(snapshot.inventory.entries).toEqual([]);
    expect(snapshot.files).toEqual([]);
    expect(snapshot.coverage.warnings.join(' ')).toMatch(/no files/i);
  });

  it('oversized files: a prefix is kept below the ceiling, and a file above it is skipped unread', async () => {
    const budgets: Budgets = { ...BUDGETS, maxFilePrefixBytes: 100, hardCeilingBytes: 1000 };
    const fake = fakeGithub({
      tree: treeOf([
        { path: 'big.json', type: 'blob', size: 5_000_000 },
        { path: 'mid.ts', type: 'blob', size: 500 },
      ]),
      raw: (path) => (path === 'mid.ts' ? new Response('x'.repeat(500)) : undefined),
    });
    const res = await handleRepoRequest(post(valid), {}, { fetch: fake.fn, budgets });
    const events = await collect(res);
    const last = events[events.length - 1];
    if (last?.type !== 'result') throw new Error('expected a result');
    const snapshot = last.response.snapshot;
    expect(() => assertCoverageConsistent(snapshot)).not.toThrow();
    expect(snapshot.inventory.entries.find((e) => e.path === 'big.json')).toMatchObject({ loadStatus: 'skipped', reasonCode: 'over_hard_ceiling' });
    expect(snapshot.inventory.entries.find((e) => e.path === 'mid.ts')).toMatchObject({ loadStatus: 'truncated' });
    expect(snapshot.files.find((f) => f.path === 'mid.ts')?.content).toHaveLength(100);
    expect(snapshot.coverage.sourceAnalysisComplete).toBe(false);
    expect(fake.seen.some((s) => s.url.endsWith('big.json'))).toBe(false);
  });

  it('failed file fetch: marked failed, the run continues, analysis incomplete', async () => {
    const snapshot = await resultOf({ raw: (path) => (path === 'src/main.ts' ? new Response('boom', { status: 500 }) : undefined) });
    expect(snapshot.inventory.entries.find((e) => e.path === 'src/main.ts')).toMatchObject({ loadStatus: 'failed', reasonCode: 'fetch_failed' });
    expect(snapshot.coverage).toMatchObject({ failedFiles: 1, loadedSourceFiles: 2, sourceAnalysisComplete: false });
  });
});

// ---------------------------------------------------------------------------
// Public-only token policy
// ---------------------------------------------------------------------------

describe('handleRepoRequest: a configured token only loads public repositories', () => {
  const env = { GITHUB_TOKEN: SECRET_TOKEN };

  it('rejects a private repository as not_found and fetches no tree or file', async () => {
    const fake = fakeGithub({ repoInfo: () => new Response(JSON.stringify({ default_branch: 'main', private: true })) });
    const events = await collect(await handleRepoRequest(post(valid), env, { fetch: fake.fn }));
    expect(events[events.length - 1]).toEqual({
      type: 'error',
      error: { code: 'not_found', message: 'The repository was not found, or the repository is private.' },
    });
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(fake.seen.some((s) => s.url.includes('/git/trees/') || s.url.includes('raw.githubusercontent.com'))).toBe(false);
  });

  it('rejects when GitHub does not report the private flag (fails closed)', async () => {
    const fake = fakeGithub({ repoInfo: () => new Response(JSON.stringify({ default_branch: 'main' })) });
    const events = await collect(await handleRepoRequest(post(valid), env, { fetch: fake.fn }));
    expect(events[events.length - 1]).toMatchObject({ type: 'error', error: { code: 'not_found' } });
  });

  it('checks visibility even when the request names a ref', async () => {
    const fake = fakeGithub({ repoInfo: () => new Response(JSON.stringify({ default_branch: 'main', private: true })) });
    const events = await collect(await handleRepoRequest(post({ ...valid, ref: 'dev' }), env, { fetch: fake.fn }));
    expect(events[events.length - 1]).toMatchObject({ type: 'error', error: { code: 'not_found' } });
  });

  it('loads a public repository, with the token on the API calls only', async () => {
    const fake = fakeGithub();
    const events = await collect(await handleRepoRequest(post(valid), env, { fetch: fake.fn }));
    expect(events[events.length - 1]?.type).toBe('result');
    expect(fake.seen.filter((s) => s.url.includes('api.github.com')).every((s) => s.auth === `Bearer ${SECRET_TOKEN}`)).toBe(true);
    expect(fake.seen.filter((s) => s.url.includes('raw.githubusercontent.com')).every((s) => s.auth === undefined)).toBe(true);
  });

  it('does not reveal whether a rejected repository exists: same code and message as a real 404', async () => {
    const privateFake = fakeGithub({ repoInfo: () => new Response(JSON.stringify({ default_branch: 'main', private: true })) });
    const missingFake = fakeGithub({ repoInfo: () => new Response('{}', { status: 404 }) });
    const a = (await collect(await handleRepoRequest(post(valid), env, { fetch: privateFake.fn }))).pop();
    const b = (await collect(await handleRepoRequest(post(valid), env, { fetch: missingFake.fn }))).pop();
    expect(a).toEqual(b);
  });

  it('without a token, makes no visibility check when a ref is given (anonymous access sees public data only)', async () => {
    const fake = fakeGithub();
    await collect(await handleRepoRequest(post({ ...valid, ref: 'dev' }), {}, { fetch: fake.fn }));
    expect(fake.seen.some((s) => s.url.endsWith('/repos/octo/demo'))).toBe(false);
  });

  it('treats a blank token as no token', async () => {
    const fake = fakeGithub();
    await collect(await handleRepoRequest(post({ ...valid, ref: 'dev' }), { GITHUB_TOKEN: '   ' }, { fetch: fake.fn }));
    expect(fake.seen.some((s) => s.url.endsWith('/repos/octo/demo'))).toBe(false);
    expect(fake.seen.every((s) => s.auth === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disconnect and cancellation
// ---------------------------------------------------------------------------

describe('handleRepoRequest: disconnect', () => {
  it('aborts upstream work when the request signal aborts, and closes without a result', async () => {
    const controller = new AbortController();
    let upstreamSignal: AbortSignal | null | undefined;
    const fake = fakeGithub({
      raw: (_path) =>
        new Promise<Response>((_resolve, reject) => {
          controller.abort(); // the client disconnects while a file is loading
          setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 5);
        }),
    });
    const wrapped: FetchLike = (url, init) => {
      if (url.includes('raw.githubusercontent.com')) upstreamSignal = init?.signal;
      return fake.fn(url, init);
    };
    const req = post(valid, { signal: controller.signal });
    const res = await handleRepoRequest(req, {}, { fetch: wrapped });
    const events: IngestEvent[] = [];
    for await (const e of readEvents(res)) events.push(e);
    expect(events.some((e) => e.type === 'result' || e.type === 'error')).toBe(false);
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it('aborts upstream work when the consumer cancels the response body', async () => {
    let upstreamSignal: AbortSignal | null | undefined;
    const blocking: FetchLike = (_url, init) => {
      upstreamSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    };
    const res = await handleRepoRequest(post(valid), {}, { fetch: blocking });
    const reader = res.body!.getReader();
    await new Promise((r) => setTimeout(r, 10)); // let the pipeline start
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 10));
    expect(upstreamSignal?.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Logging hygiene
// ---------------------------------------------------------------------------

describe('handleRepoRequest: logging', () => {
  it('writes no file content or token to the console on success or failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const env = { GITHUB_TOKEN: SECRET_TOKEN };

    await collect(await handleRepoRequest(post(valid), env, { fetch: fakeGithub().fn }));
    await collect(await handleRepoRequest(post(valid), env, { fetch: fakeGithub({ tree: () => new Response('{}', { status: 404 }) }).fn }));
    await collect(await handleRepoRequest(post(valid), env, { fetch: fakeGithub({ repoInfo: () => new Response('', { status: 500 }) }).fn }));
    await handleRepoRequest(post('{bad'), env);

    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(SECRET_CONTENT);
    expect(logged).not.toContain(SECRET_TOKEN);
    expect(logged).not.toMatch(/"name":"demo"/);
  });

  it('logs only the code and repository name for a failed ingestion', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await collect(await handleRepoRequest(post(valid), {}, { fetch: fakeGithub({ tree: () => new Response('{}', { status: 404 }) }).fn }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toBe('[api/repo] ingestion failed: not_found (octo/demo)');
  });
});

// ---------------------------------------------------------------------------
// ndjson helpers
// ---------------------------------------------------------------------------

function responseOf(chunks: Array<string | Uint8Array>): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(typeof ch === 'string' ? enc.encode(ch) : ch);
        c.close();
      },
    }),
  );
}

const stageEvent: IngestEvent = { type: 'stage', stage: 'fetching_tree', status: 'started' };
const progressEvent: IngestEvent = { type: 'progress', stage: 'loading_sources', loaded: 1, total: 2 };

describe('ndjson', () => {
  it('encodes one event per line, ending with a newline and containing no inner newline', () => {
    const line = encodeEvent({ type: 'notice', code: 'fallback_in_use', message: 'two\nlines' });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toContain('\n');
  });

  it('round-trips events', async () => {
    const events = await collect(responseOf([encodeEvent(stageEvent) + encodeEvent(progressEvent)]));
    expect(events).toEqual([stageEvent, progressEvent]);
  });

  it('handles lines split across chunks, including inside a multi-byte character', async () => {
    const event: IngestEvent = { type: 'notice', code: 'fallback_in_use', message: 'héllo wörld ✓' };
    const bytes = new TextEncoder().encode(encodeEvent(event) + encodeEvent(stageEvent));
    const split = bytes.indexOf(0xc3) + 1; // between the two bytes of 'é'
    const events = await collect(responseOf([bytes.slice(0, split), bytes.slice(split, split + 7), bytes.slice(split + 7)]));
    expect(events).toEqual([event, stageEvent]);
  });

  it('accepts a final line without a trailing newline and ignores blank lines', async () => {
    const events = await collect(responseOf(['\n\n', JSON.stringify(stageEvent), '\n\n', JSON.stringify(progressEvent)]));
    expect(events).toEqual([stageEvent, progressEvent]);
  });

  it('yields nothing for an empty body', async () => {
    expect(await collect(responseOf([]))).toEqual([]);
    expect(await collect(new Response(null))).toEqual([]);
  });

  it('rejects invalid JSON and unknown event shapes with upstream_failure', async () => {
    for (const bad of ['not json\n', '{"type":"mystery"}\n', '{"type":"stage","stage":"nope","status":"started"}\n', '[]\n']) {
      const err = await collect(responseOf([bad])).catch((e: unknown) => e);
      expect(err, bad).toBeInstanceOf(IngestError);
      expect((err as IngestError).code).toBe('upstream_failure');
    }
  });

  it('yields earlier valid events before failing on a bad line', async () => {
    const seen: IngestEvent[] = [];
    const run = async () => {
      for await (const e of readEvents(responseOf([encodeEvent(stageEvent), 'garbage\n']))) seen.push(e);
    };
    await expect(run()).rejects.toBeInstanceOf(IngestError);
    expect(seen).toEqual([stageEvent]);
  });

  it('rejects a line longer than the cap', async () => {
    const err = await (async () => {
      try {
        for await (const _e of readEvents(responseOf(['x'.repeat(200)]), { maxLineChars: 100 })) void _e;
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(err).toBeInstanceOf(IngestError);
    expect(MAX_EVENT_LINE_CHARS).toBeGreaterThan(1024 * 1024);
  });

  it('rejects with AbortError when the signal aborts, even if the stream stalls', async () => {
    const controller = new AbortController();
    const stalled = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(encodeEvent(stageEvent)));
        },
        pull: () => new Promise(() => undefined),
      }),
    );
    const seen: IngestEvent[] = [];
    const run = (async () => {
      for await (const e of readEvents(stalled, { signal: controller.signal })) {
        seen.push(e);
        setTimeout(() => controller.abort(), 10);
      }
    })();
    const err = await run.catch((e: unknown) => e);
    expect(isAbortError(err)).toBe(true);
    expect(seen).toEqual([stageEvent]);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const err = await collect(responseOf([encodeEvent(stageEvent)]), controller.signal).catch((e: unknown) => e);
    expect(isAbortError(err)).toBe(true);
  });
});

// @node: F12.8 (3B-1: a referenced picture travels in the stream result, apart from the text files)
describe('handleRepoRequest: pictures', () => {
  it('a small referenced picture comes back in snapshot.media and the text files stay text', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    files['index.html'] = '<img src="dot.png">';
    files['dot.png'] = 'x'.repeat(png.length);
    try {
      const { fn } = fakeGithub({ raw: (p) => (p === 'dot.png' ? new Response(png) : undefined) });
      const res = await handleRepoRequest(post(valid), {}, { fetch: fn });
      const events = await collect(res);
      const last = events.at(-1)!;
      expect(last.type).toBe('result');
      if (last.type !== 'result') return;
      const snap = last.response.snapshot;
      expect(RepoSnapshotSchema.safeParse(snap).success).toBe(true);
      expect(snap.media).toHaveLength(1);
      expect(snap.media![0]).toMatchObject({ path: 'dot.png', mime: 'image/png', bytes: png.length });
      expect(snap.files.map((f) => f.path)).not.toContain('dot.png');
      expect(() => assertCoverageConsistent(snap)).not.toThrow();
    } finally {
      delete files['index.html'];
      delete files['dot.png'];
    }
  });
});
