// @node: F2.5
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantError,
  buildAIRequest,
  isAssistantAbortError,
  requestAssistant,
  resetIdCounter,
} from '../src/engine/aiAssistant';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import type { AIResult, RepoSnapshot } from '../src/types/contracts';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetIdCounter();
  vi.restoreAllMocks();
});

function snap(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  const base = buildSampleSnapshot('react-frontend', 1);
  return { ...base, ...overrides };
}

function goodInput() {
  return {
    instruction: 'Explain the login form.',
    taskType: 'explain' as const,
    selectedPaths: ['src/App.tsx'],
    includeContent: false,
  };
}

function validResult(requestId: string): AIResult {
  return {
    requestId,
    mode: 'mock',
    response: { type: 'explanation', summary: 'x', evidencePaths: ['src/App.tsx'], limitations: ['none'] },
  };
}

type FetchLike = (input: string | Request | URL, init?: RequestInit) => Promise<Response>;
function mockFetch(result: AIResult | { error: { code: string; message: string } }, status = 200): FetchLike {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(result), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

// ---------------------------------------------------------------------------
// buildAIRequest
// ---------------------------------------------------------------------------

describe('buildAIRequest: valid inputs', () => {
  it('passes for a minimal valid request', () => {
    const r = buildAIRequest(snap(), goodInput(), 'req-1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.requestId).toBe('req-1');
      expect(r.request.taskType).toBe('explain');
      expect(r.request.selectedPaths).toEqual(['src/App.tsx']);
      expect(r.request.sourceContext).toBeUndefined();
    }
  });

  it('trims the instruction', () => {
    const r = buildAIRequest(snap(), { ...goodInput(), instruction: '  hello  ' }, 'r1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.request.instruction).toBe('hello');
  });

  it('includes content when opted in and files are loaded', () => {
    const s = snap();
    const loaded = s.files.find((f) => f.loadStatus === 'loaded');
    if (!loaded) return;
    const r = buildAIRequest(s, { ...goodInput(), selectedPaths: [loaded.path], includeContent: true }, 'r1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.sourceContext?.find((c) => c.filePath === loaded.path)).toBeTruthy();
    }
  });

  it('sends no content when includeContent is false', () => {
    const s = snap();
    const loaded = s.files.find((f) => f.loadStatus === 'loaded');
    if (!loaded) return;
    const r = buildAIRequest(s, { ...goodInput(), selectedPaths: [loaded.path], includeContent: false }, 'r1');
    if (r.ok) expect(r.request.sourceContext).toBeUndefined();
  });

  it('allows 0 selectedPaths', () => {
    const r = buildAIRequest(snap(), { ...goodInput(), selectedPaths: [] }, 'r1');
    expect(r.ok).toBe(true);
  });
});

describe('buildAIRequest: rejection', () => {
  it('empty instruction', () => {
    const r = buildAIRequest(snap(), { ...goodInput(), instruction: '   ' }, 'r1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });

  it('a path not in the snapshot', () => {
    const r = buildAIRequest(snap(), { ...goodInput(), selectedPaths: ['src/ghost.ts'] }, 'r1');
    expect(r.ok).toBe(false);
  });

  it('more than 10 paths', () => {
    const s = snap();
    const paths = s.files.filter((f) => f.loadStatus === 'loaded').map((f) => f.path);
    // If the sample has fewer than 10 loaded files, duplicate up to 11 paths from the first file
    const too = paths.length >= 11 ? paths.slice(0, 11) : Array(11).fill(paths[0] ?? 'x.ts');
    const r = buildAIRequest(s, { ...goodInput(), selectedPaths: too }, 'r1');
    expect(r.ok).toBe(false);
  });

  it('a truncated file cannot be selected', () => {
    const s = snap();
    // Inject a truncated file
    const truncated = { ...s.files[0]!, loadStatus: 'truncated' as const, truncated: true };
    const modified = { ...s, files: [truncated, ...s.files.slice(1)] };
    const r = buildAIRequest(modified, { ...goodInput(), selectedPaths: [truncated.path] }, 'r1');
    expect(r.ok).toBe(false);
  });

  it('content over 20 KB returns a message naming the limit', () => {
    const bigContent = 'a'.repeat(20 * 1024 + 1);
    const bigFile = { ...(snap().files[0]!), content: bigContent };
    const s = { ...snap(), files: [bigFile, ...snap().files.slice(1)] };
    const r = buildAIRequest(s, { ...goodInput(), selectedPaths: [bigFile.path], includeContent: true }, 'r1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/too large/i);
  });

  it('makes no network call on failure', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch was called');
    });
    buildAIRequest(snap(), { ...goodInput(), instruction: '' }, 'r1');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requestAssistant: success
// ---------------------------------------------------------------------------

describe('requestAssistant: success', () => {
  it('calls POST /api/assistant, validates the response, returns the result', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-ok') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const fetchSpy = mockFetch(validResult('r-ok'));
    const result = await requestAssistant(request, { fetchImpl: fetchSpy as FetchLike });
    expect(result.requestId).toBe('r-ok');
    expect(result.mode).toBe('mock');
    expect(result.response.type).toBe('explanation');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/assistant');
    expect(init.method).toBe('POST');
  });

  it('never makes a network call when the request itself is invalid', async () => {
    const fetchSpy = vi.fn();
    await expect(requestAssistant(
      { requestId: '', instruction: '', taskType: 'explain', selectedPaths: [] },
      { fetchImpl: fetchSpy },
    )).rejects.toBeInstanceOf(AssistantError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requestAssistant: failure cases
// ---------------------------------------------------------------------------

describe('requestAssistant: failures', () => {
  it('a JSON error body is mapped to its code', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-err') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const fetchSpy = mockFetch({ error: { code: 'unsupported', message: 'Live AI not available.' } }, 501);
    await expect(requestAssistant(request, { fetchImpl: fetchSpy })).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('a network failure becomes upstream_failure', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-net') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as FetchLike;
    await expect(requestAssistant(request, { fetchImpl: fetchSpy })).rejects.toMatchObject({ code: 'upstream_failure' });
  });

  it('a 15s timeout becomes timeout', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-to') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const fetchSpy = vi.fn().mockImplementation((_url, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    );
    await expect(requestAssistant(request, { fetchImpl: fetchSpy, timeoutMs: 25 })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('a caller abort rejects with AbortError, not AssistantError', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-ab') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const controller = new AbortController();
    const fetchSpy = vi.fn().mockImplementation((_url, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    );
    const p = requestAssistant(request, { fetchImpl: fetchSpy, signal: controller.signal });
    controller.abort();
    const err = await p.catch((e: unknown) => e);
    expect(isAssistantAbortError(err)).toBe(true);
    expect(err).not.toBeInstanceOf(AssistantError);
  });

  it('already-aborted signal rejects immediately without calling fetch', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-pab') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const controller = new AbortController();
    controller.abort();
    const fetchSpy = vi.fn() as unknown as FetchLike;
    await expect(requestAssistant(request, { fetchImpl: fetchSpy, signal: controller.signal })).rejects.toSatisfy(isAssistantAbortError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a response body over 256 KB becomes upstream_failure', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-big') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const bigBody = 'x'.repeat(256 * 1024 + 1);
    const fetchSpy = vi.fn().mockResolvedValue(new Response(bigBody, { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as FetchLike;
    await expect(requestAssistant(request, { fetchImpl: fetchSpy })).rejects.toMatchObject({ code: 'upstream_failure' });
  });

  it('a non-JSON response body becomes upstream_failure', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-njson') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const fetchSpy = vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as FetchLike;
    await expect(requestAssistant(request, { fetchImpl: fetchSpy })).rejects.toMatchObject({ code: 'upstream_failure' });
  });

  it('a result with a different requestId becomes upstream_failure', async () => {
    const { request } = buildAIRequest(snap(), goodInput(), 'r-mid') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const fetchSpy = mockFetch({ ...validResult('DIFFERENT'), requestId: 'DIFFERENT' });
    await expect(requestAssistant(request, { fetchImpl: fetchSpy })).rejects.toMatchObject({ code: 'upstream_failure' });
  });

  it('every failure rejects — no path resolves with a canned result', async () => {
    // A very short timeout ensures the stalled server triggers timeout, not an infinite wait.
    const { request } = buildAIRequest(snap(), goodInput(), 'r-stall') as { ok: true; request: Parameters<typeof requestAssistant>[0] };
    const fetchSpy = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      }),
    ) as unknown as FetchLike;
    await expect(requestAssistant(request, { fetchImpl: fetchSpy, timeoutMs: 25 })).rejects.toBeInstanceOf(AssistantError);
  });
});

// ---------------------------------------------------------------------------
// No mock imports in the browser path
// ---------------------------------------------------------------------------

describe('no browser-side canned response', () => {
  it('aiAssistant.ts does not import mockAssistant or redact mock output', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../src/engine/aiAssistant.ts', import.meta.url).pathname, 'utf-8',
    );
    expect(src).not.toContain("from './mockAssistant'");
    expect(src).not.toContain('from "./mockAssistant"');
    expect(src).not.toContain('mockResponse');
  });
});
