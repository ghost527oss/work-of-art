// @node: F11.4
// The Model Router: which models to try, in what order, with what time. Server only. Pure apart from the injected clock and step.
import { AI_LIVE } from '../../config/aiLive';
import {
  PROVIDER_ORDER, providerKey, resolveModel, type LiveEnv, type Tier,
} from '../../config/aiProviders';
import type { AIAttemptOutcome, AIProviderId, AITaskType } from '../../types/contracts';

export interface Entry {
  provider: AIProviderId;
  model: string;
  tier: Tier;
  /** True for the light entries that follow the heavy ones in a heavy plan: an answer from one is a "lighter answer". */
  lighterPart: boolean;
}

/** `detail` is a fixed code word (for example `wrong_shape`), never text from an answer. It is for the server log and the error message only. */
export interface Attempt { provider: AIProviderId; outcome: AIAttemptOutcome; detail?: string }

/** Light jobs: explanations, finding reviews, safe actions. Heavy jobs: code-change proposals. */
export function tierOf(taskType: AITaskType): Tier {
  return taskType === 'suggest_change' ? 'heavy' : 'light';
}

/**
 * The attempt order (design 8.1). Providers without a key, entries without a usable model, and repeated provider-and-model
 * pairs are dropped. A heavy plan ends with the light entries.
 */
export function buildAttemptPlan(tier: Tier, env: LiveEnv): Entry[] {
  const plan: Entry[] = [];
  const seen = new Set<string>();
  const add = (entryTier: Tier, lighterPart: boolean): void => {
    for (const provider of PROVIDER_ORDER) {
      if (providerKey(provider, env) === undefined) continue;
      const model = resolveModel(provider, entryTier, env);
      if (model === undefined) continue;
      const key = `${provider}:${model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plan.push({ provider, model, tier: entryTier, lighterPart });
    }
  };
  if (tier === 'heavy') {
    add('heavy', false);
    add('light', true);
  } else {
    add('light', false);
  }
  return plan;
}

export type StepResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'fail'; outcome: AIAttemptOutcome; detail?: string }
  | { kind: 'aborted' };

export interface Clock { now(): number }

export type RunResult<T> =
  | { kind: 'ok'; entry: Entry; value: T; attempts: Attempt[] }
  | { kind: 'failed'; code: 'rate_limited' | 'upstream_failure'; attempts: Attempt[] }
  | { kind: 'aborted' }
  | { kind: 'no_providers' };

/**
 * Runs the plan. One attempt per entry, never the same model twice. A 429 or a rejected key skips the rest of that provider
 * for this request. Each attempt gets at most `attemptTimeoutMs`, the whole run at most `totalBudgetMs`; below `minAttemptMs`
 * no new attempt starts.
 */
export async function runAttempts<T>(
  plan: readonly Entry[],
  step: (entry: Entry, timeoutMs: number) => Promise<StepResult<T>>,
  clock: Clock,
  signal?: AbortSignal,
): Promise<RunResult<T>> {
  if (plan.length === 0) return { kind: 'no_providers' };
  const start = clock.now();
  const attempts: Attempt[] = [];
  const skipped = new Set<AIProviderId>();
  for (const entry of plan) {
    if (signal?.aborted) return { kind: 'aborted' };
    if (skipped.has(entry.provider)) continue;
    const remaining = AI_LIVE.totalBudgetMs - (clock.now() - start);
    if (remaining < AI_LIVE.minAttemptMs) {
      attempts.push({ provider: entry.provider, outcome: 'out_of_time' });
      break;
    }
    const r = await step(entry, Math.min(AI_LIVE.attemptTimeoutMs, remaining));
    if (signal?.aborted || r.kind === 'aborted') return { kind: 'aborted' };
    if (r.kind === 'ok') return { kind: 'ok', entry, value: r.value, attempts };
    attempts.push({ provider: entry.provider, outcome: r.outcome, ...(r.detail !== undefined ? { detail: r.detail } : {}) });
    if (r.outcome === 'rate_limited' || r.outcome === 'key_rejected') skipped.add(entry.provider);
  }
  const allBusy = attempts.length > 0 && attempts.every((a) => a.outcome === 'rate_limited');
  return { kind: 'failed', code: allBusy ? 'rate_limited' : 'upstream_failure', attempts };
}
