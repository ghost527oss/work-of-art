// @node: F11.10
// Plain-English sentences for the live AI screens. Pure text work: no React, no network.
import { PROVIDERS, PROVIDER_ORDER } from '../config/aiProviders';
import type { AIAttemptOutcome, AIMeta } from '../types/contracts';
import type { AIStatusState } from './aiStatus';

/** The exact Phase 2 line for mock mode. */
export const MOCK_LINE = 'Mock mode: responses are canned examples. No AI model is used and nothing is sent to an AI provider.';
export const LIVE_LINE = 'Live AI: answers come from a free outside AI provider.';
export const NOT_SET_UP_LINE = 'Live AI is not set up.';
export const NOT_SET_UP_HINT = 'Add at least one key (GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY) to the server settings, then restart.';
export const UNKNOWN_LINE = 'Could not check the AI mode.';
export const CHECKING_LINE = 'Checking the AI mode...';
export const LIGHTER_WARNING = 'Answered by a lighter model; review carefully.';
export const SAVED_LABEL = 'Saved answer from earlier in this session.';

const OUTCOME_PHRASE: Record<AIAttemptOutcome, string> = {
  rate_limited: 'was busy',
  timeout: 'took too long',
  error: 'had a problem',
  bad_answer: 'gave an answer PatchBay could not use',
  key_rejected: 'did not accept its key',
  out_of_time: 'was not tried because time ran out',
};

/** "Answered by Groq (light)." */
export function providerLine(meta: AIMeta): string {
  return `Answered by ${PROVIDERS[meta.provider].name} (${meta.tier}).`;
}

/** One calm sentence when an earlier provider failed, such as "Gemini was busy, so Groq answered." Undefined when none failed. */
export function fallbackSentence(meta: AIMeta): string | undefined {
  const last = new Map<string, AIAttemptOutcome>();
  for (const a of meta.attempts) if (a.provider !== meta.provider) last.set(a.provider, a.outcome);
  if (last.size === 0) return undefined;
  const parts = [...last.entries()].map(([p, o]) => `${PROVIDERS[p as keyof typeof PROVIDERS].name} ${OUTCOME_PHRASE[o]}`);
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${joined}, so ${PROVIDERS[meta.provider].name} answered.`;
}

/** The banner for each status, as a main line and an optional hint. */
export function bannerFor(status: AIStatusState): { main: string; hint?: string; kind: 'mock' | 'live' | 'not_set_up' | 'unknown' | 'checking' } {
  switch (status.kind) {
    case 'mock': return { main: MOCK_LINE, kind: 'mock' };
    case 'checking': return { main: CHECKING_LINE, kind: 'checking' };
    case 'unknown': return { main: UNKNOWN_LINE, kind: 'unknown' };
    case 'live': {
      if (!status.ready) return { main: NOT_SET_UP_LINE, hint: NOT_SET_UP_HINT, kind: 'not_set_up' };
      const have = PROVIDER_ORDER.filter((id) => status.providers.some((p) => p.id === id && p.configured)).map((id) => PROVIDERS[id].name);
      return { main: LIVE_LINE, hint: `Order tried: ${have.join(', then ')}.`, kind: 'live' };
    }
  }
}

/** The five points of the first-request notice (requirement R5.2). */
export function noticeLines(status: AIStatusState): string[] {
  const first = status.kind === 'live'
    ? 'Live AI sends your question and the redacted pieces you choose to an outside AI company (Gemini, Groq, or OpenRouter).'
    : 'If this server is in live mode, your question and the redacted pieces you choose go to an outside AI company (Gemini, Groq, or OpenRouter).';
  return [
    first,
    'Free plans may let that company keep or use what you send.',
    'File contents stay off unless you tick "Include the contents of the selected files".',
    'Secrets are removed first, but the removal can miss an unusual one.',
    'Nothing in your project changes unless you press Approve, and only PatchBay\'s practice copy ever changes.',
  ];
}
