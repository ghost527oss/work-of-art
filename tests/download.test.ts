// @node: F9.7
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDownloader } from '../src/export/download';

function fakes(opts: { throwUrl?: boolean } = {}) {
  const blobs: Array<{ parts: unknown[]; type: string }> = [];
  const revoked: string[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const anchors: Array<Record<string, unknown>> = [];
  let body = 0;
  class FakeBlob { constructor(parts: unknown[], o: { type: string }) { blobs.push({ parts, type: o.type }); } }
  let n = 0;
  const deps = {
    Blob: FakeBlob as unknown as typeof Blob,
    URL: { createObjectURL: () => { if (opts.throwUrl) throw new Error('no'); return `blob:${++n}`; }, revokeObjectURL: (u: string) => { revoked.push(u); } },
    document: {
      createElement: () => { const a: Record<string, unknown> = { clicked: 0 }; a.click = () => { (a.clicked as number)++; }; anchors.push(a); return a as unknown as HTMLElement; },
      body: { appendChild: () => { body++; }, removeChild: () => { body--; } },
    } as never,
    setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); },
  };
  return { deps, blobs, revoked, timers, anchors, body: () => body };
}

describe('download helper', () => {
  const realFetch = globalThis.fetch;
  const open = vi.fn();
  beforeEach(() => { globalThis.fetch = (() => { throw new Error('network used'); }) as never; (globalThis as { open?: unknown }).open = open; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('makes a text Blob, clicks an anchor with download, removes it, and releases the URL after 10 s', () => {
    const f = fakes();
    const d = createDownloader(f.deps);
    expect(d.download('a.patch', 'hello')).toBe(true);
    expect(f.blobs).toEqual([{ parts: ['hello'], type: 'text/plain;charset=utf-8' }]);
    expect(f.anchors[0]).toMatchObject({ href: 'blob:1', download: 'a.patch', clicked: 1 });
    expect(f.body()).toBe(0);
    expect(f.timers.map((t) => t.ms)).toEqual([10_000]);
    expect(f.revoked).toEqual([]);
    f.timers[0]!.fn();
    expect(f.revoked).toEqual(['blob:1']);
    expect(open).not.toHaveBeenCalled();
  });

  it('dispose releases URLs not yet released, once', () => {
    const f = fakes();
    const d = createDownloader(f.deps);
    d.download('a', 'x'); d.download('b', 'y');
    d.dispose();
    expect(f.revoked).toEqual(['blob:1', 'blob:2']);
    f.timers.forEach((t) => t.fn());
    expect(f.revoked).toHaveLength(2);
  });

  it('returns false without throwing when the browser refuses or Blob is missing', () => {
    expect(createDownloader(fakes({ throwUrl: true }).deps).download('a', 'x')).toBe(false);
    const f = fakes();
    expect(createDownloader({ ...f.deps, Blob: undefined as never }).download('a', 'x')).toBe(false);
  });
});
