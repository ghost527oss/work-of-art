// @node: F9.7
// The small browser download helper. Never throws and never navigates. Object URLs are released.
export interface DownloadDeps {
  Blob: typeof Blob;
  URL: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
  document: Pick<Document, 'createElement'> & { body: { appendChild(n: Node): unknown; removeChild(n: Node): unknown } };
  setTimeout(fn: () => void, ms: number): unknown;
}

export function createDownloader(deps: DownloadDeps) {
  const urls = new Set<string>();
  const timers = new Set<string>();
  const release = (u: string) => { if (urls.delete(u)) { try { deps.URL.revokeObjectURL(u); } catch { /* ignore */ } } };
  return {
    download(name: string, text: string, type = 'text/plain'): boolean {
      try {
        const url = deps.URL.createObjectURL(new deps.Blob([text], { type: `${type};charset=utf-8` }));
        urls.add(url);
        const a = deps.document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        deps.document.body.appendChild(a);
        try { a.click(); } finally { try { deps.document.body.removeChild(a); } catch { /* already gone */ } }
        timers.add(url);
        deps.setTimeout(() => { timers.delete(url); release(url); }, 10_000);
        return true;
      } catch {
        // release a URL made before the failure
        for (const u of [...urls]) if (!timers.has(u)) release(u);
        return false;
      }
    },
    dispose() { for (const u of [...urls]) release(u); },
  };
}

export function browserDownloader() {
  return createDownloader({ Blob, URL, document, setTimeout: (fn, ms) => setTimeout(fn, ms) });
}
