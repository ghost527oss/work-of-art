// @node: F11.7
// The session answer cache (browser memory only). Asking the same question about the same text again costs nothing.
// The key includes a fingerprint of every snippet, so any edit, undo, or different file changes the key by itself.
// Only successful live answers of four kinds are stored. Failures, `action` answers, and mock answers never are.
import { AI_LIVE } from '../config/aiLive';
import type { AIRequest, AIResult } from '../types/contracts';
import { hashText } from './diffApply';
import { containsSecret } from './redact';

const encoder = new TextEncoder();
const CACHEABLE: ReadonlySet<string> = new Set(['explanation', 'plan', 'patch_proposal', 'clarification']);
const SEP = '\u0001';

export function normaliseQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The key for a request (the request id is not part of it). `mode` keeps mock and live answers apart. */
export function cacheKey(mode: 'mock' | 'live', request: AIRequest): string {
  const snippets = (request.sourceContext ?? [])
    .map((s) => `${s.filePath}@${s.startLine ?? 1}:${s.content.length}:${hashText(s.content)}`)
    .sort()
    .join(',');
  return [
    mode,
    request.taskType,
    normaliseQuestion(request.instruction),
    request.skillId ?? '',
    [...request.selectedPaths].sort().join(','),
    (request.connections ?? []).join('|'),
    snippets,
  ].join(SEP);
}

export interface AnswerCache {
  get(key: string): AIResult | undefined;
  /** Returns true when the answer was stored. */
  put(key: string, result: AIResult): boolean;
  clear(): void;
  size(): number;
  bytes(): number;
}

export interface CacheLimits { maxEntries: number; maxBytes: number }

export function createAnswerCache(limits: CacheLimits = { maxEntries: AI_LIVE.cacheMaxEntries, maxBytes: AI_LIVE.cacheMaxBytes }): AnswerCache {
  const map = new Map<string, { result: AIResult; bytes: number }>();
  let total = 0;
  const drop = (key: string): void => {
    const e = map.get(key);
    if (e) { total -= e.bytes; map.delete(key); }
  };
  return {
    get(key) {
      const e = map.get(key);
      return e ? structuredClone(e.result) : undefined;
    },
    put(key, result) {
      if (result.mode !== 'live' || !CACHEABLE.has(result.response.type)) return false;
      if (containsSecret(result)) return false;
      const bytes = encoder.encode(key).length + encoder.encode(JSON.stringify(result)).length;
      if (bytes > limits.maxBytes) return false;
      drop(key);
      map.set(key, { result: structuredClone(result), bytes });
      total += bytes;
      for (const oldest of map.keys()) {
        if (map.size <= limits.maxEntries && total <= limits.maxBytes) break;
        if (oldest === key && map.size === 1) break;
        drop(oldest);
      }
      return map.has(key);
    },
    clear() { map.clear(); total = 0; },
    size() { return map.size; },
    bytes() { return total; },
  };
}
