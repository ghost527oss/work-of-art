// @node: F2.4
// Reads the HTTP request body up to a byte limit without buffering more than needed.
// Returns the full text, or null if the content is larger than the limit.
export async function readBodyCapped(request: Request, limitBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limitBytes) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limitBytes) return null;
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }
  return new TextDecoder('utf-8').decode(all);
}
