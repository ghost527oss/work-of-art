// @node: F1.4
import { describe, expect, it, vi } from 'vitest';
import {
  API_HOST,
  IngestError,
  RAW_HOST,
  fetchFileCapped,
  fetchTree,
  getRepoInfo,
  isAbortError,
  resolveDefaultBranch,
  type FetchLike,
  type SourceDeps,
} from '../src/engine/githubSource';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Call = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fn, calls };
}

function deps(fn: FetchLike, extra: Partial<SourceDeps> = {}): SourceDeps {
  return { fetch: fn, timeoutMs: 1000, ...extra };
}

function headerOf(call: Call | undefined, name: string): string | undefined {
  const h = call?.init?.headers as Record<string, string> | undefined;
  return h?.[name];
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

/** A fetch that never answers until its signal aborts, then rejects like the real one. */
function hangingFetch(): FetchLike {
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const fail = () => reject(signal?.reason ?? new DOMException('aborted', 'AbortError'));
      if (signal?.aborted) fail();
      else signal?.addEventListener('abort', fail, { once: true });
    });
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function streamOf(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[i++];
      if (next) controller.enqueue(next);
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

function infiniteStream(chunkSize: number, onCancel: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(chunkSize).fill(97));
    },
    cancel() {
      onCancel();
    },
  });
}

// ---------------------------------------------------------------------------
// resolveDefaultBranch
// ---------------------------------------------------------------------------

describe('resolveDefaultBranch', () => {
  it('returns the default branch and calls only the API host with the right headers', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse({ default_branch: 'trunk' }));
    await expect(resolveDefaultBranch('octo', 'hello', deps(fn))).resolves.toBe('trunk');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://${API_HOST}/repos/octo/hello`);
    expect(headerOf(calls[0], 'Accept')).toBe('application/vnd.github+json');
    expect(headerOf(calls[0], 'X-GitHub-Api-Version')).toBe('2022-11-28');
    expect(headerOf(calls[0], 'Authorization')).toBeUndefined();
  });

  it('sends the token to the API host when one is configured', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse({ default_branch: 'main' }));
    await resolveDefaultBranch('o', 'r', deps(fn, { token: 'tok123' }));
    expect(headerOf(calls[0], 'Authorization')).toBe('Bearer tok123');
  });

  it('does not send an empty token', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse({ default_branch: 'main' }));
    await resolveDefaultBranch('o', 'r', deps(fn, { token: '' }));
    expect(headerOf(calls[0], 'Authorization')).toBeUndefined();
  });

  it('maps 404 to not_found', async () => {
    const { fn } = mockFetch(() => jsonResponse({ message: 'Not Found' }, 404));
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn)))) as IngestError;
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe('not_found');
  });

  it('maps 403 with remaining=0 to rate_limited with the reset time', async () => {
    const reset = 1_900_000_000;
    const { fn } = mockFetch(() =>
      jsonResponse({ message: 'rate limit' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }),
    );
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn)))) as IngestError;
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBe(new Date(reset * 1000).toISOString());
    expect(err.toApiError()).toMatchObject({ code: 'rate_limited', resetAt: err.resetAt });
  });

  it('maps 429 with Retry-After to rate_limited using the injected clock', async () => {
    const { fn } = mockFetch(() => jsonResponse({}, 429, { 'retry-after': '30' }));
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn, { now: () => 1_000_000 })))) as IngestError;
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBe(new Date(1_000_000 + 30_000).toISOString());
  });

  it('maps 429 without any reset hint to rate_limited with no resetAt', async () => {
    const { fn } = mockFetch(() => jsonResponse({}, 429));
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn)))) as IngestError;
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBeUndefined();
  });

  it('maps a plain 403 (no rate-limit signals) to upstream_failure', async () => {
    const { fn } = mockFetch(() => jsonResponse({ message: 'blocked' }, 403));
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn)))) as IngestError;
    expect(err.code).toBe('upstream_failure');
  });

  it('maps 500 to upstream_failure without leaking the body', async () => {
    const { fn } = mockFetch(() => new Response('secret internal detail', { status: 500 }));
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn)))) as IngestError;
    expect(err.code).toBe('upstream_failure');
    expect(err.message).not.toMatch(/secret/);
  });

  it('maps malformed JSON, a missing field, and an unusable branch to upstream_failure', async () => {
    for (const make of [
      () => new Response('not json', { status: 200 }),
      () => jsonResponse({}),
      () => jsonResponse({ default_branch: '-bad' }),
      () => jsonResponse({ default_branch: 5 }),
    ]) {
      const { fn } = mockFetch(make);
      const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn)))) as IngestError;
      expect(err.code).toBe('upstream_failure');
    }
  });

  it('maps a network failure to upstream_failure', async () => {
    const { fn } = mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(fn)))) as IngestError;
    expect(err.code).toBe('upstream_failure');
  });

  it('encodes owner and repo in the URL', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse({ default_branch: 'main' }));
    await resolveDefaultBranch('o', 'my repo/x', deps(fn));
    expect(calls[0]!.url).toBe(`https://${API_HOST}/repos/o/my%20repo%2Fx`);
  });
});

// ---------------------------------------------------------------------------
// fetchTree
// ---------------------------------------------------------------------------

describe('fetchTree', () => {
  it('maps entries and the truncated flag, and requests the recursive tree', async () => {
    const { fn, calls } = mockFetch(() =>
      jsonResponse({
        sha: 'abc',
        truncated: true,
        tree: [
          { path: 'src', mode: '040000', type: 'tree', sha: 's' },
          { path: 'src/a.ts', mode: '100644', type: 'blob', size: 12, sha: 'b' },
          { path: 'sub', mode: '160000', type: 'commit', sha: 'c' },
        ],
      }),
    );
    const result = await fetchTree('o', 'r', 'main', deps(fn));
    expect(calls[0]!.url).toBe(`https://${API_HOST}/repos/o/r/git/trees/main?recursive=1`);
    expect(result.truncated).toBe(true);
    expect(result.entries).toEqual([
      { path: 'src', type: 'tree', mode: '040000' },
      { path: 'src/a.ts', type: 'blob', mode: '100644', size: 12 },
      { path: 'sub', type: 'commit', mode: '160000' },
    ]);
  });

  it('treats a missing truncated field as false', async () => {
    const { fn } = mockFetch(() => jsonResponse({ tree: [] }));
    await expect(fetchTree('o', 'r', 'main', deps(fn))).resolves.toEqual({ entries: [], truncated: false });
  });

  it('percent-encodes a ref that contains a slash', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse({ tree: [] }));
    await fetchTree('o', 'r', 'feature/login form', deps(fn));
    expect(calls[0]!.url).toBe(`https://${API_HOST}/repos/o/r/git/trees/feature%2Flogin%20form?recursive=1`);
  });

  it('returns an empty tree for a 409 "repository is empty"', async () => {
    const { fn } = mockFetch(() => jsonResponse({ message: 'Git Repository is empty.' }, 409));
    await expect(fetchTree('o', 'r', 'main', deps(fn))).resolves.toEqual({ entries: [], truncated: false });
  });

  it('treats any other 409 as upstream_failure', async () => {
    const { fn } = mockFetch(() => jsonResponse({ message: 'Conflict' }, 409));
    const err = (await rejection(fetchTree('o', 'r', 'main', deps(fn)))) as IngestError;
    expect(err.code).toBe('upstream_failure');
  });

  it('maps 404, rate limit, 500, and bad formats', async () => {
    const cases: Array<[() => Response, string]> = [
      [() => jsonResponse({}, 404), 'not_found'],
      [() => jsonResponse({}, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' }), 'rate_limited'],
      [() => jsonResponse({}, 502), 'upstream_failure'],
      [() => new Response('<html>', { status: 200 }), 'upstream_failure'],
      [() => jsonResponse({ tree: 'nope' }), 'upstream_failure'],
      [() => jsonResponse({ nothing: true }), 'upstream_failure'],
    ];
    for (const [make, code] of cases) {
      const { fn } = mockFetch(make);
      const err = (await rejection(fetchTree('o', 'r', 'main', deps(fn)))) as IngestError;
      expect(err.code).toBe(code);
    }
  });

  it('passes malformed items through so the inventory can count them', async () => {
    const { fn } = mockFetch(() => jsonResponse({ tree: [{ type: 'blob' }, { path: 'a', size: 1 }] }));
    const result = await fetchTree('o', 'r', 'main', deps(fn));
    expect(result.entries).toEqual([
      { path: '', type: 'blob' },
      { path: 'a', type: '', size: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// fetchFileCapped
// ---------------------------------------------------------------------------

describe('fetchFileCapped', () => {
  it('reads a small file and calls only the raw host', async () => {
    const { fn, calls } = mockFetch(() => new Response('hello world'));
    const result = await fetchFileCapped('o', 'r', 'main', 'src/a.ts', 1000, deps(fn));
    expect(result).toEqual({ text: 'hello world', bytes: 11, truncated: false, binary: false });
    expect(calls[0]!.url).toBe(`https://${RAW_HOST}/o/r/main/src/a.ts`);
  });

  it('never sends the token to the raw host', async () => {
    const { fn, calls } = mockFetch(() => new Response('x'));
    await fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn, { token: 'secret-token' }));
    expect(calls[0]!.init?.headers).toBeUndefined();
    expect(JSON.stringify(calls)).not.toMatch(/secret-token/);
  });

  it('percent-encodes each path and ref segment, keeping slashes', async () => {
    const { fn, calls } = mockFetch(() => new Response('x'));
    await fetchFileCapped('o', 'r', 'feature/x y', 'dir with space/a#b?.ts', 100, deps(fn));
    expect(calls[0]!.url).toBe(`https://${RAW_HOST}/o/r/feature/x%20y/dir%20with%20space/a%23b%3F.ts`);
  });

  it('keeps a file of exactly the cap whole and not truncated', async () => {
    const { fn } = mockFetch(() => new Response('a'.repeat(100)));
    const result = await fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn));
    expect(result).toMatchObject({ bytes: 100, truncated: false });
  });

  it('truncates at the cap and cancels the stream instead of buffering everything', async () => {
    const onCancel = vi.fn();
    const { fn } = mockFetch(() => new Response(infiniteStream(64, onCancel)));
    const result = await fetchFileCapped('o', 'r', 'main', 'big.txt', 200, deps(fn));
    expect(result.truncated).toBe(true);
    expect(result.bytes).toBe(200);
    expect(result.text).toBe('a'.repeat(200));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('moves a cut inside a multi-byte character back to the previous boundary', async () => {
    // 'é' is two bytes (0xC3 0xA9). 1 + 2*5 bytes; a cap of 4 lands between the two bytes of the second 'é'.
    const text = 'a' + 'é'.repeat(5);
    const { fn } = mockFetch(() => new Response(streamOf([bytes(text)])));
    const result = await fetchFileCapped('o', 'r', 'main', 'u.txt', 4, deps(fn));
    expect(result.truncated).toBe(true);
    expect(result.text).toBe('aé');
    expect(result.bytes).toBe(3);
    expect(result.text).not.toContain('\uFFFD');
  });

  it('cuts cleanly when the cap falls exactly on a character boundary', async () => {
    const { fn } = mockFetch(() => new Response(streamOf([bytes('a' + 'é'.repeat(5))])));
    const result = await fetchFileCapped('o', 'r', 'main', 'u.txt', 5, deps(fn));
    expect(result.text).toBe('aéé');
    expect(result.bytes).toBe(5);
  });

  it('handles content split across many small chunks', async () => {
    const chunks = Array.from({ length: 10 }, () => bytes('abcdefghij'));
    const { fn } = mockFetch(() => new Response(streamOf(chunks)));
    const result = await fetchFileCapped('o', 'r', 'main', 'a.txt', 35, deps(fn));
    expect(result).toMatchObject({ bytes: 35, truncated: true });
    expect(result.text).toHaveLength(35);
  });

  it('flags a NUL byte in the first 8 KB as binary and discards the content', async () => {
    const data = new Uint8Array([104, 105, 0, 106]);
    const { fn } = mockFetch(() => new Response(data));
    const result = await fetchFileCapped('o', 'r', 'main', 'b.dat', 1000, deps(fn));
    expect(result).toEqual({ text: '', bytes: 0, truncated: false, binary: true });
  });

  it('does not flag a NUL byte that appears after the first 8 KB', async () => {
    const data = new Uint8Array(9000).fill(97);
    data[8500] = 0;
    const { fn } = mockFetch(() => new Response(data));
    const result = await fetchFileCapped('o', 'r', 'main', 'a.txt', 20_000, deps(fn));
    expect(result.binary).toBe(false);
    expect(result.bytes).toBe(9000);
  });

  it('returns empty text for an empty body', async () => {
    const { fn } = mockFetch(() => new Response(''));
    const result = await fetchFileCapped('o', 'r', 'main', 'e.txt', 100, deps(fn));
    expect(result).toEqual({ text: '', bytes: 0, truncated: false, binary: false });
  });

  it('maps 404, 429, and 500', async () => {
    const cases: Array<[() => Response, string]> = [
      [() => new Response('nope', { status: 404 }), 'not_found'],
      [() => new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }), 'rate_limited'],
      [() => new Response('boom', { status: 500 }), 'upstream_failure'],
    ];
    for (const [make, code] of cases) {
      const { fn } = mockFetch(make);
      const err = (await rejection(fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn)))) as IngestError;
      expect(err.code).toBe(code);
    }
  });

  it('reports the reset time for a rate-limited file fetch', async () => {
    const { fn } = mockFetch(() => new Response('', { status: 429, headers: { 'retry-after': '10' } }));
    const err = (await rejection(fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn, { now: () => 5_000 })))) as IngestError;
    expect(err.resetAt).toBe(new Date(15_000).toISOString());
  });

  it('maps a network error to upstream_failure', async () => {
    const { fn } = mockFetch(() => {
      throw new TypeError('network down');
    });
    const err = (await rejection(fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn)))) as IngestError;
    expect(err.code).toBe('upstream_failure');
  });
});

// ---------------------------------------------------------------------------
// timeout and abort
// ---------------------------------------------------------------------------

describe('timeout versus abort', () => {
  it('reports timeout when the request exceeds timeoutMs', async () => {
    const err = (await rejection(resolveDefaultBranch('o', 'r', deps(hangingFetch(), { timeoutMs: 20 })))) as IngestError;
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe('timeout');
  });

  it('reports timeout for the tree and file calls too', async () => {
    const t = (await rejection(fetchTree('o', 'r', 'main', deps(hangingFetch(), { timeoutMs: 20 })))) as IngestError;
    const f = (await rejection(fetchFileCapped('o', 'r', 'main', 'a.ts', 10, deps(hangingFetch(), { timeoutMs: 20 })))) as IngestError;
    expect(t.code).toBe('timeout');
    expect(f.code).toBe('timeout');
  });

  it('rejects with an AbortError (not an IngestError) when the caller aborts', async () => {
    const controller = new AbortController();
    const promise = fetchTree('o', 'r', 'main', deps(hangingFetch(), { signal: controller.signal, timeoutMs: 5000 }));
    controller.abort();
    const err = await rejection(promise);
    expect(isAbortError(err)).toBe(true);
    expect(err).not.toBeInstanceOf(IngestError);
  });

  it('rejects immediately without calling fetch when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fn, calls } = mockFetch(() => jsonResponse({}));
    const err = await rejection(resolveDefaultBranch('o', 'r', deps(fn, { signal: controller.signal })));
    expect(isAbortError(err)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('times out while reading a stalled response body', async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('partial'));
      },
      pull() {
        return new Promise(() => undefined);
      },
    });
    const { fn } = mockFetch(() => new Response(stalled));
    const err = (await rejection(fetchFileCapped('o', 'r', 'main', 'a.ts', 1000, deps(fn, { timeoutMs: 30 })))) as IngestError;
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe('timeout');
  });

  it('aborts while reading a stalled response body', async () => {
    const controller = new AbortController();
    const stalled = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes('partial'));
      },
      pull() {
        return new Promise(() => undefined);
      },
    });
    const { fn } = mockFetch(() => new Response(stalled));
    const promise = fetchFileCapped('o', 'r', 'main', 'a.ts', 1000, deps(fn, { signal: controller.signal, timeoutMs: 5000 }));
    setTimeout(() => controller.abort(), 20);
    expect(isAbortError(await rejection(promise))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// host allow-list
// ---------------------------------------------------------------------------

describe('host allow-list', () => {
  it('only ever calls api.github.com and raw.githubusercontent.com across all functions', async () => {
    const { fn, calls } = mockFetch((url) =>
      url.includes('/git/trees/') ? jsonResponse({ tree: [] }) : url.startsWith('https://api.') ? jsonResponse({ default_branch: 'main' }) : new Response('x'),
    );
    const d = deps(fn, { token: 't' });
    await resolveDefaultBranch('o', 'r', d);
    await fetchTree('o', 'r', 'main', d);
    await fetchFileCapped('o', 'r', 'main', 'a.ts', 10, d);
    const hosts = new Set(calls.map((c) => new URL(c.url).hostname));
    expect(hosts).toEqual(new Set([API_HOST, RAW_HOST]));
  });

  it('rejects traversal in a file path or ref without making a request', async () => {
    const { fn, calls } = mockFetch(() => new Response('x'));
    for (const [ref, path] of [
      ['main', '../../evil.com/x'],
      ['main', 'a/./b'],
      ['main', 'a//b'],
      ['main', ''],
      ['../x', 'a.ts'],
    ] as const) {
      const err = (await rejection(fetchFileCapped('o', 'r', ref, path, 10, deps(fn)))) as IngestError;
      expect(err.code, `${ref} ${path}`).toBe('invalid_request');
    }
    expect(calls).toHaveLength(0);
  });

  it('keeps hostile characters in owner, repo, ref, and path inside the URL path', async () => {
    const { fn, calls } = mockFetch(() => new Response('x'));
    await fetchFileCapped('o@evil.com', 'r:80', 'main', 'a/b%2e%2e/c', 10, deps(fn));
    const url = new URL(calls[0]!.url);
    expect(url.hostname).toBe(RAW_HOST);
    expect(url.username).toBe('');
    expect(url.pathname.startsWith('/o%40evil.com/r%3A80/main/')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// redirects, discarded bodies, repository privacy (T16)
// ---------------------------------------------------------------------------

function withUrl(response: Response, url: string): Response {
  return Object.defineProperty(response, 'url', { value: url });
}

describe('redirects must stay on the two allowed hosts over https', () => {
  const allowed = [
    'https://api.github.com/repositories/123',
    'https://raw.githubusercontent.com/o/r/main/a.ts',
  ];
  const rejected = [
    'https://evil.example/x',
    'https://github.com/o/r',
    'https://api.github.com.evil.example/x',
    'https://evil.example/api.github.com',
    'http://api.github.com/repositories/123',
    'ftp://raw.githubusercontent.com/x',
    'not a url',
  ];

  const calls: Array<[string, (fn: FetchLike) => Promise<unknown>, () => Response]> = [
    ['getRepoInfo', (fn) => getRepoInfo('o', 'r', deps(fn)), () => jsonResponse({ default_branch: 'main', private: false })],
    ['fetchTree', (fn) => fetchTree('o', 'r', 'main', deps(fn)), () => jsonResponse({ tree: [] })],
    ['fetchFileCapped', (fn) => fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn)), () => new Response('hello')],
  ];

  for (const [name, call, make] of calls) {
    it(`${name}: accepts a final URL on an allowed host`, async () => {
      for (const url of allowed) {
        const { fn } = mockFetch(() => withUrl(make(), url));
        await expect(call(fn), url).resolves.toBeTruthy();
      }
    });

    it(`${name}: rejects a redirect that left the allowed hosts`, async () => {
      for (const url of rejected) {
        const { fn } = mockFetch(() => withUrl(make(), url));
        const err = (await rejection(call(fn))) as IngestError;
        expect(err, url).toBeInstanceOf(IngestError);
        expect(err.code, url).toBe('upstream_failure');
        expect(err.message).toMatch(/redirected/);
      }
    });

    it(`${name}: accepts a response with no URL (test doubles)`, async () => {
      const { fn } = mockFetch(() => make());
      await expect(call(fn)).resolves.toBeTruthy();
    });
  }

  it('does not echo the foreign address in the error message', async () => {
    const { fn } = mockFetch(() => withUrl(jsonResponse({ default_branch: 'main' }), 'https://secret-host.example/path?token=abc'));
    const err = (await rejection(getRepoInfo('o', 'r', deps(fn)))) as IngestError;
    expect(err.message).not.toMatch(/secret-host|token=abc/);
  });

  it('cancels the body of a response it refuses', async () => {
    const onCancel = vi.fn();
    const { fn } = mockFetch(() => withUrl(new Response(infiniteStream(8, onCancel)), 'https://evil.example/x'));
    await rejection(fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn)));
    await new Promise((r) => setTimeout(r, 5));
    expect(onCancel).toHaveBeenCalled();
  });

  it('never forwards the token to a redirect target: the token is only ever set on API requests', async () => {
    const seen: Array<string | undefined> = [];
    const { fn } = mockFetch((_url, init) => {
      seen.push((init?.headers as Record<string, string> | undefined)?.Authorization);
      return new Response('x');
    });
    await fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn, { token: 'tok' }));
    expect(seen).toEqual([undefined]);
  });
});

describe('non-OK response bodies are cancelled', () => {
  const failing: Array<[string, (fn: FetchLike) => Promise<unknown>, number]> = [
    ['getRepoInfo 500', (fn) => getRepoInfo('o', 'r', deps(fn)), 500],
    ['getRepoInfo 404', (fn) => getRepoInfo('o', 'r', deps(fn)), 404],
    ['fetchTree 502', (fn) => fetchTree('o', 'r', 'main', deps(fn)), 502],
    ['fetchTree 429', (fn) => fetchTree('o', 'r', 'main', deps(fn)), 429],
    ['fetchFileCapped 404', (fn) => fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn)), 404],
    ['fetchFileCapped 500', (fn) => fetchFileCapped('o', 'r', 'main', 'a.ts', 100, deps(fn)), 500],
  ];
  for (const [name, call, status] of failing) {
    it(name, async () => {
      const onCancel = vi.fn();
      const { fn } = mockFetch(() => new Response(infiniteStream(8, onCancel), { status }));
      await rejection(call(fn));
      await new Promise((r) => setTimeout(r, 5));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  }

  it('still reads the rate-limit headers after discarding the body', async () => {
    const { fn } = mockFetch(() => new Response(infiniteStream(8, () => undefined), { status: 429, headers: { 'retry-after': '30' } }));
    const err = (await rejection(fetchTree('o', 'r', 'main', deps(fn, { now: () => 1000 })))) as IngestError;
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBe(new Date(31_000).toISOString());
  });
});

describe('getRepoInfo: privacy flag', () => {
  it('reports a public repository', async () => {
    const { fn } = mockFetch(() => jsonResponse({ default_branch: 'main', private: false }));
    await expect(getRepoInfo('o', 'r', deps(fn))).resolves.toEqual({ defaultBranch: 'main', isPrivate: false });
  });

  it('reports a private repository', async () => {
    const { fn } = mockFetch(() => jsonResponse({ default_branch: 'main', private: true }));
    await expect(getRepoInfo('o', 'r', deps(fn))).resolves.toEqual({ defaultBranch: 'main', isPrivate: true });
  });

  it('fails closed when GitHub does not say: a missing private field counts as private', async () => {
    const { fn } = mockFetch(() => jsonResponse({ default_branch: 'main' }));
    await expect(getRepoInfo('o', 'r', deps(fn))).resolves.toMatchObject({ isPrivate: true });
  });

  it('resolveDefaultBranch still returns just the branch name', async () => {
    const { fn } = mockFetch(() => jsonResponse({ default_branch: 'trunk', private: false }));
    await expect(resolveDefaultBranch('o', 'r', deps(fn))).resolves.toBe('trunk');
  });
});
