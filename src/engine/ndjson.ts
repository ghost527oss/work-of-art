// @node: F1.5
// Newline-delimited JSON helpers for the ingestion event stream. No React, no globals.
import { IngestEventSchema, type IngestEvent } from '../types/contracts';
import { IngestError } from './githubSource';

/** A `result` event carries a whole snapshot, so the cap is generous. */
export const MAX_EVENT_LINE_CHARS = 32 * 1024 * 1024;

export function encodeEvent(event: IngestEvent): string {
  return JSON.stringify(event) + '\n';
}

function parseLine(line: string): IngestEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new IngestError('upstream_failure', 'The event stream contained a line that is not valid JSON.');
  }
  const parsed = IngestEventSchema.safeParse(value);
  if (!parsed.success) throw new IngestError('upstream_failure', 'The event stream contained an unexpected event.');
  return parsed.data;
}

export interface ReadEventsOptions {
  /** Aborting stops reading and rejects with an AbortError. */
  signal?: AbortSignal;
  maxLineChars?: number;
}

/**
 * Reads an NDJSON response body and yields validated events. Blank lines are ignored.
 * A malformed or oversized line, or an unknown event shape, throws IngestError
 * (upstream_failure). The reader is always released.
 */
export async function* readEvents(response: Response, options: ReadEventsOptions = {}): AsyncGenerator<IngestEvent> {
  const { signal } = options;
  const maxLine = options.maxLineChars ?? MAX_EVENT_LINE_CHARS;
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => undefined);

  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) yield parseLine(line);
        newline = buffer.indexOf('\n');
      }
      if (buffer.length > maxLine) {
        throw new IngestError('upstream_failure', 'The event stream contained a line that is too long.');
      }
    }
    buffer += decoder.decode();
    const last = buffer.trim();
    if (last.length > 0) yield parseLine(last);
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => undefined);
  }
}
