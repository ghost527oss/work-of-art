// @node: F11.8
// Browser side: asks `GET /api/assistant` which mode the server is in. Never throws. Holds no key and no model name.
import { z } from 'zod';
import { AIProviderIdSchema } from '../types/contracts';

export const AIStatusSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('mock') }),
  z.strictObject({
    mode: z.literal('live'),
    ready: z.boolean(),
    providers: z.array(z.strictObject({ id: AIProviderIdSchema, configured: z.boolean() })).max(3),
  }),
]);

/** What the panel knows about the server's mode. `checking` before the first answer, `unknown` when the check failed. */
export type AIStatusState =
  | { kind: 'checking' }
  | { kind: 'unknown' }
  | { kind: 'mock' }
  | { kind: 'live'; ready: boolean; providers: Array<{ id: z.infer<typeof AIProviderIdSchema>; configured: boolean }> };

export interface FetchStatusOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function fetchAIStatus(options: FetchStatusOptions = {}): Promise<AIStatusState> {
  const { endpoint = '/api/assistant', timeoutMs = 5000 } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  try {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await fetchImpl(endpoint, { method: 'GET', headers: { accept: 'application/json' }, signal });
    if (!response.ok) return { kind: 'unknown' };
    const text = await response.text();
    if (text.length > 4096) return { kind: 'unknown' };
    const parsed = AIStatusSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { kind: 'unknown' };
    return parsed.data.mode === 'mock' ? { kind: 'mock' } : { kind: 'live', ready: parsed.data.ready, providers: parsed.data.providers };
  } catch {
    return { kind: 'unknown' };
  }
}

/** True when the notice must be accepted before a request may be sent (live, or not known). */
export function needsConsent(status: AIStatusState): boolean {
  return status.kind === 'live' || status.kind === 'unknown' || status.kind === 'checking';
}
