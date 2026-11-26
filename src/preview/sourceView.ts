// @node: F7.4
// Source Inspection helpers: files grouped by label and a bounded, redacted, numbered viewer. Pure.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { redact } from '../engine/redact';
import type { FileUnderstanding } from '../engine/understandTypes';

export function groupFiles(files: readonly FileUnderstanding[], loaded: ReadonlySet<string>): Array<{ group: string; paths: Array<{ path: string; read: boolean }> }> {
  const groups = new Map<string, Array<{ path: string; read: boolean }>>();
  for (const f of files) {
    if (f.ignored) continue;
    const g = f.labels[0] ?? 'unknown';
    groups.set(g, [...(groups.get(g) ?? []), { path: f.path, read: loaded.has(f.path) }]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([group, paths]) => ({ group, paths: paths.sort((a, b) => (a.path < b.path ? -1 : 1)) }));
}

/** Up to 2,000 numbered lines, each redacted and cut to 400 characters. */
export function viewerLines(content: string, from = 0): { lines: Array<{ n: number; text: string }>; next: number | null } {
  const all = content.split('\n');
  const slice = all.slice(from, from + L.viewerLines);
  return {
    lines: slice.map((t, i) => { const r = redact(t.replace(/\r$/, '')).text; return { n: from + i + 1, text: r.length > 400 ? `${r.slice(0, 400)}...` : r }; }),
    next: from + L.viewerLines < all.length ? from + L.viewerLines : null,
  };
}
