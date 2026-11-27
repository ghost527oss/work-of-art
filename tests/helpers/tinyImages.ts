// @node: F12.8
// Valid-looking tiny pictures (right signature, padded to any size) and a small fake GitHub for picture tests.
import type { FetchLike } from '../../src/engine/githubSource';

export type Kind = 'png' | 'jpeg' | 'gif' | 'webp' | 'ico';

const HEAD: Record<Kind, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  gif: [...'GIF89a'].map((c) => c.charCodeAt(0)),
  webp: [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))),
  ico: [0, 0, 1, 0, 1, 0],
};

/** Bytes with the right start for `kind`, padded with a marker byte up to `size` (at least the header length). */
export function image(kind: Kind, size = 64, fill = 7): Uint8Array<ArrayBuffer> {
  const head = HEAD[kind];
  const n = Math.max(size, kind === 'ico' ? 6 + 16 : head.length);
  const out = new Uint8Array(n).fill(fill);
  out.set(head, 0);
  return out;
}

export const REAL_1X1_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

export interface FakeRepoFiles { files: Record<string, string | Uint8Array<ArrayBuffer>>; sizes?: Record<string, number> }

/** A fake GitHub: repo info, a tree, and raw files. `rawCalls` lists the raw paths asked for. */
export function fakeGithub(repo: FakeRepoFiles, hooks: { raw?: (path: string) => Response | undefined } = {}): { fetch: FetchLike; rawCalls: string[] } {
  const rawCalls: string[] = [];
  const enc = new TextEncoder();
  const bytes = (v: string | Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => (typeof v === 'string' ? enc.encode(v) : v);
  const fetchImpl: FetchLike = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      if (u.pathname.includes('/git/trees/')) {
        const dirs = new Set<string>();
        const tree: Array<Record<string, unknown>> = [];
        for (const path of Object.keys(repo.files)) {
          const parts = path.split('/');
          for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
          tree.push({ path, type: 'blob', mode: '100644', size: repo.sizes?.[path] ?? bytes(repo.files[path]!).length });
        }
        for (const d of dirs) tree.push({ path: d, type: 'tree', mode: '040000' });
        return new Response(JSON.stringify({ tree, truncated: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
    }
    const path = decodeURIComponent(u.pathname.split('/').slice(4).join('/'));
    rawCalls.push(path);
    const override = hooks.raw?.(path);
    if (override) return override;
    const file = repo.files[path];
    if (file === undefined) return new Response('not found', { status: 404 });
    return new Response(bytes(file), { status: 200 });
  };
  return { fetch: fetchImpl, rawCalls };
}
