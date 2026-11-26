// @node: F11.1
// The provider table for live mode. Endpoints are fixed constants: no address ever comes from a request.
// This file holds environment VARIABLE NAMES and default model names, never a key value, and reads no environment itself:
// callers pass an `env` object. Only server code (`api/assistant.ts`, `src/engine/live/`) may call the helpers with a real one.
import type { AIProviderId } from '../types/contracts';

export type { AIProviderId };
export type Tier = 'light' | 'heavy';
export type LiveEnv = Readonly<Record<string, string | undefined>>;

export interface ProviderInfo {
  id: AIProviderId;
  /** Plain name shown to the user. */
  name: string;
  /** Fixed endpoint. For Gemini, `{model}` is replaced by a validated model name. */
  endpoint: string;
  keyVar: string;
  modelVars: Record<Tier, string>;
  /** Default model per tier. Verified 2026-11-26 (see design 7.1); free-tier access for Gemini is Unverified until a real key runs. */
  defaults: Record<Tier, string>;
}

/** The fixed fallback order. */
export const PROVIDER_ORDER: readonly AIProviderId[] = ['gemini', 'groq', 'openrouter'];

export const PROVIDERS: Readonly<Record<AIProviderId, ProviderInfo>> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    keyVar: 'GEMINI_API_KEY',
    modelVars: { light: 'GEMINI_MODEL_LIGHT', heavy: 'GEMINI_MODEL_HEAVY' },
    defaults: { light: 'gemini-3.1-flash-lite', heavy: 'gemini-3.6-flash' },
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyVar: 'GROQ_API_KEY',
    modelVars: { light: 'GROQ_MODEL_LIGHT', heavy: 'GROQ_MODEL_HEAVY' },
    defaults: { light: 'openai/gpt-oss-20b', heavy: 'openai/gpt-oss-120b' },
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyVar: 'OPENROUTER_API_KEY',
    modelVars: { light: 'OPENROUTER_MODEL_LIGHT', heavy: 'OPENROUTER_MODEL_HEAVY' },
    defaults: { light: 'openrouter/free', heavy: 'openrouter/free' },
  },
};

/** The only environment names live mode may read (besides `AI_MODE`). */
export const LIVE_ENV_NAMES: readonly string[] = PROVIDER_ORDER.flatMap((id) => [
  PROVIDERS[id].keyVar,
  PROVIDERS[id].modelVars.light,
  PROVIDERS[id].modelVars.heavy,
]);

/**
 * A model name is put in a URL path (Gemini) or a request body. Gemini names allow no `/` or `:`.
 * No `..`, no leading or trailing `/`, no `//`, and at most 80 characters.
 */
export function isValidModelName(provider: AIProviderId, name: string): boolean {
  if (typeof name !== 'string' || name.length < 1 || name.length > 80) return false;
  if (provider === 'gemini') return /^[A-Za-z0-9._-]+$/.test(name) && !name.includes('..');
  if (!/^[A-Za-z0-9._:/-]+$/.test(name)) return false;
  return !name.includes('..') && !name.includes('//') && !name.startsWith('/') && !name.endsWith('/');
}

/** The key, trimmed, or undefined when missing or blank. Never logged. */
export function providerKey(provider: AIProviderId, env: LiveEnv): string | undefined {
  const v = env[PROVIDERS[provider].keyVar];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/**
 * The model for a provider and tier: the environment value when set (blank means "use the default"), otherwise the default.
 * A set but invalid name makes the entry unusable (undefined), so a typo never silently runs a different model.
 */
export function resolveModel(provider: AIProviderId, tier: Tier, env: LiveEnv): string | undefined {
  const info = PROVIDERS[provider];
  const raw = env[info.modelVars[tier]];
  const set = typeof raw === 'string' ? raw.trim() : '';
  const name = set === '' ? info.defaults[tier] : set;
  return isValidModelName(provider, name) ? name : undefined;
}

/** Providers that have a key, in the fixed order. */
export function configuredProviders(env: LiveEnv): AIProviderId[] {
  return PROVIDER_ORDER.filter((id) => providerKey(id, env) !== undefined);
}
