// @node: F11.4
// answerLive: card pick, prompt, Model Router, parse, validate, secret check, `meta`. Server only.
// It never reads `process.env`: the caller passes the environment object. It logs nothing.
import { AI_LIVE } from '../../config/aiLive';
import { PROVIDERS, providerKey, type LiveEnv } from '../../config/aiProviders';
import { AIResultSchema, type AIAttemptOutcome, type AIProviderId, type AIRequest, type AIResult, type ApiErrorCode } from '../../types/contracts';
import { validateAIResult } from '../aiValidate';
import { containsSecret } from '../redact';
import { parseAnswer } from './answerParser';
import { pickCards } from './cardPicker';
import { buildAttemptPlan, runAttempts, tierOf, type Attempt, type Clock, type Entry, type StepResult } from './modelRouter';
import { buildPrompt } from './promptBuilder';
import { callProvider } from './providers';

export const NOT_SET_UP_MESSAGE =
  'Live AI is not set up. Add at least one key (GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY) to the server settings.';

export type LiveOutcome =
  | { ok: true; aborted?: false; result: AIResult; trace: string }
  | { ok: false; aborted: true }
  | { ok: false; aborted?: false; status: number; code: ApiErrorCode; message: string; trace: string };

export interface LiveDeps {
  fetchImpl: typeof fetch;
  clock?: Clock;
  signal?: AbortSignal;
}

const OUTCOME_WORDS: Record<AIAttemptOutcome, string> = {
  rate_limited: 'is at its free limit',
  timeout: 'took too long',
  error: 'had a problem',
  bad_answer: 'gave an answer PatchBay could not use',
  key_rejected: 'did not accept its key',
  out_of_time: 'was not tried because time ran out',
};

/** Plain words for the fixed detail codes of a bad answer. Fixed text only: nothing from the answer itself. */
export const DETAIL_WORDS: Readonly<Record<string, string>> = {
  truncated: 'the answer was cut off',
  not_json: 'it was not in the expected format',
  wrong_shape: 'it had the wrong fields',
  kind_not_allowed: 'it was the wrong kind of answer for this request',
  path_not_selected: 'it named a file you did not select',
  patch_not_allowed: 'it proposed a change where none was allowed',
  bad_edits: 'its edit did not fit the lines it was shown',
  secret_in_answer: 'it contained text that looked like a secret',
  action_not_allowed: 'it asked for an action that is not allowed here',
  invalid_result: 'it failed PatchBay\'s final check',
};

/** A server-log trace such as `gemini:bad_answer(wrong_shape),groq:timeout`. Provider names, outcome words, and code words only. */
export function traceOf(attempts: readonly Attempt[], winner?: string): string {
  const parts = attempts.map((a) => `${a.provider}:${a.outcome}${a.detail ? `(${a.detail})` : ''}`);
  if (winner) parts.push(`${winner}:ok`);
  return parts.length === 0 ? 'none' : parts.join(',');
}

/** One plain sentence per provider (its last outcome). Names and outcome words only. */
export function describeFailures(attempts: readonly Attempt[], allBusy: boolean): string {
  const last = new Map<AIProviderId, AIAttemptOutcome>();
  const lastDetail = new Map<AIProviderId, string | undefined>();
  for (const a of attempts) { last.set(a.provider, a.outcome); lastDetail.set(a.provider, a.detail); }
  const names = [...last.keys()].map((p) => PROVIDERS[p].name);
  if (allBusy && names.length > 0) {
    const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `${list} ${names.length === 1 ? 'is' : 'are'} at ${names.length === 1 ? 'its' : 'their'} free limit right now. Try again in a minute.`;
  }
  if (names.length === 0) return 'No live AI provider could answer. Try again in a moment.';
  return [...last.entries()].map(([p, o]) => {
    const why = o === 'bad_answer' ? DETAIL_WORDS[lastDetail.get(p) ?? ''] : undefined;
    return `${PROVIDERS[p].name} ${OUTCOME_WORDS[o]}${why ? ` (${why})` : ''}.`;
  }).join(' ');
}

const realClock: Clock = { now: () => Date.now() };

export async function answerLive(request: AIRequest, env: LiveEnv, deps: LiveDeps): Promise<LiveOutcome> {
  const tier = tierOf(request.taskType);
  const plan = buildAttemptPlan(tier, env);
  if (plan.length === 0) return { ok: false, status: 503, code: 'unsupported', message: NOT_SET_UP_MESSAGE, trace: 'none' };

  const prompt = buildPrompt(request, pickCards(request.skillId, request.instruction), tier);
  if (!prompt.ok) {
    const tooLarge = prompt.message.startsWith('This request is too large');
    return { ok: false, status: tooLarge ? 413 : 400, code: tooLarge ? 'oversized' : 'invalid_request', message: prompt.message, trace: 'none' };
  }

  const step = async (entry: Entry, timeoutMs: number): Promise<StepResult<AIResult['response']>> => {
    const apiKey = providerKey(entry.provider, env);
    if (apiKey === undefined) return { kind: 'fail', outcome: 'error' };
    const call = await callProvider({
      provider: entry.provider,
      model: entry.model,
      apiKey,
      system: prompt.system,
      user: prompt.user,
      maxOutputTokens: entry.tier === 'heavy' ? AI_LIVE.maxOutputTokensHeavy : AI_LIVE.maxOutputTokensLight,
      timeoutMs,
      ...(deps.signal ? { signal: deps.signal } : {}),
      fetchImpl: deps.fetchImpl,
    });
    if (!call.ok) return call.outcome === 'aborted' ? { kind: 'aborted' } : { kind: 'fail', outcome: call.outcome };
    // An answer that hit the output cap is cut off in the middle: say so instead of failing to read it.
    if (call.truncated) return { kind: 'fail', outcome: 'bad_answer', detail: 'truncated' };
    // The request as the model saw it (redacted, snippets possibly shortened) is what the answer is checked against.
    const parsed = parseAnswer(call.text, prompt.request, entry.provider);
    if (!parsed.ok) return { kind: 'fail', outcome: 'bad_answer', detail: parsed.reason.split(':')[0] };
    const candidate = { requestId: request.requestId, mode: 'live' as const, response: parsed.response };
    if (containsSecret(candidate)) return { kind: 'fail', outcome: 'bad_answer', detail: 'secret_in_answer' };
    if (!validateAIResult(request, candidate).ok) return { kind: 'fail', outcome: 'bad_answer', detail: 'invalid_result' };
    return { kind: 'ok', value: parsed.response };
  };

  const run = await runAttempts(plan, step, deps.clock ?? realClock, deps.signal);
  switch (run.kind) {
    case 'aborted':
      return { ok: false, aborted: true };
    case 'no_providers':
      return { ok: false, status: 503, code: 'unsupported', message: NOT_SET_UP_MESSAGE, trace: 'none' };
    case 'failed': {
      const message = describeFailures(run.attempts, run.code === 'rate_limited');
      const trace = traceOf(run.attempts);
      return run.code === 'rate_limited'
        ? { ok: false, status: 429, code: 'rate_limited', message, trace }
        : { ok: false, status: 502, code: 'upstream_failure', message, trace };
    }
    case 'ok': {
      const result: AIResult = {
        requestId: request.requestId,
        mode: 'live',
        response: run.value,
        meta: {
          tier: run.entry.tier,
          provider: run.entry.provider,
          model: run.entry.model,
          lighter: run.entry.lighterPart,
          // Only provider and outcome go to the browser; the detail code words stay on the server.
          attempts: run.attempts.map((a) => ({ provider: a.provider, outcome: a.outcome })),
        },
      };
      if (!AIResultSchema.safeParse(result).success) {
        return { ok: false, status: 502, code: 'upstream_failure', message: 'The AI answer could not be checked.', trace: traceOf(run.attempts, run.entry.provider) };
      }
      return { ok: true, result, trace: traceOf(run.attempts, run.entry.provider) };
    }
  }
}
