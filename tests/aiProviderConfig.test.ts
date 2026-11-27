// @node: F11.1
import { describe, expect, it } from 'vitest';
import {
  LIVE_ENV_NAMES, PROVIDERS, PROVIDER_ORDER, configuredProviders, isValidModelName, providerKey, resolveModel,
} from '../src/config/aiProviders';

describe('provider table', () => {
  it('has the fixed order Gemini, Groq, OpenRouter', () => {
    expect(PROVIDER_ORDER).toEqual(['gemini', 'groq', 'openrouter']);
  });
  it('uses only fixed https endpoints', () => {
    for (const id of PROVIDER_ORDER) expect(PROVIDERS[id].endpoint).toMatch(/^https:\/\/[a-z.]+\//);
    expect(PROVIDERS.gemini.endpoint).toContain('{model}');
    expect(PROVIDERS.groq.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(PROVIDERS.openrouter.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
  it('has the verified default models', () => {
    expect(PROVIDERS.gemini.defaults).toEqual({ light: 'gemini-3.1-flash-lite', heavy: 'gemini-3.6-flash' });
    expect(PROVIDERS.groq.defaults).toEqual({ light: 'openai/gpt-oss-20b', heavy: 'openai/gpt-oss-120b' });
    expect(PROVIDERS.openrouter.defaults).toEqual({ light: 'openrouter/free', heavy: 'openrouter/free' });
  });
  it('holds names of variables, never a value, and none has a VITE_ prefix', () => {
    const text = JSON.stringify(PROVIDERS);
    expect(LIVE_ENV_NAMES).toHaveLength(9);
    for (const n of LIVE_ENV_NAMES) {
      expect(n.startsWith('VITE_')).toBe(false);
      expect(n).toMatch(/^(GEMINI|GROQ|OPENROUTER)_(API_KEY|MODEL_LIGHT|MODEL_HEAVY)$/);
    }
    expect(text).not.toMatch(/AIza|sk-|Bearer /);
  });
});

describe('model-name validation', () => {
  it('accepts the defaults', () => {
    for (const id of PROVIDER_ORDER) {
      expect(isValidModelName(id, PROVIDERS[id].defaults.light)).toBe(true);
      expect(isValidModelName(id, PROVIDERS[id].defaults.heavy)).toBe(true);
    }
  });
  it('rejects path tricks, spaces, empty, and over 80 characters', () => {
    for (const id of PROVIDER_ORDER) {
      for (const bad of ['../x', 'a/../b', 'a b', '', 'x'.repeat(81), 'a?b=1', 'a#b', '/abs', 'trail/', 'a//b', 'a\nb']) {
        expect(isValidModelName(id, bad), `${id}:${bad}`).toBe(false);
      }
      expect(isValidModelName(id, 'x'.repeat(80))).toBe(true);
    }
  });
  it('rejects "/" and ":" for Gemini only', () => {
    expect(isValidModelName('gemini', 'a/b')).toBe(false);
    expect(isValidModelName('gemini', 'a:b')).toBe(false);
    expect(isValidModelName('groq', 'openai/gpt-oss-20b')).toBe(true);
    expect(isValidModelName('openrouter', 'vendor/model:free')).toBe(true);
  });
});

describe('environment helpers', () => {
  it('a missing, blank, or whitespace key is not configured', () => {
    expect(providerKey('groq', {})).toBeUndefined();
    expect(providerKey('groq', { GROQ_API_KEY: '' })).toBeUndefined();
    expect(providerKey('groq', { GROQ_API_KEY: '   ' })).toBeUndefined();
    expect(providerKey('groq', { GROQ_API_KEY: ' k1 ' })).toBe('k1');
  });
  it('configuredProviders keeps the fixed order', () => {
    expect(configuredProviders({ OPENROUTER_API_KEY: 'a', GEMINI_API_KEY: 'b' })).toEqual(['gemini', 'openrouter']);
    expect(configuredProviders({})).toEqual([]);
  });
  it('an empty model variable uses the default; a set one overrides it', () => {
    expect(resolveModel('gemini', 'heavy', {})).toBe('gemini-3.6-flash');
    expect(resolveModel('gemini', 'heavy', { GEMINI_MODEL_HEAVY: '  ' })).toBe('gemini-3.6-flash');
    expect(resolveModel('gemini', 'heavy', { GEMINI_MODEL_HEAVY: 'gemini-x' })).toBe('gemini-x');
    expect(resolveModel('openrouter', 'light', {})).toBe('openrouter/free');
    expect(resolveModel('openrouter', 'light', { OPENROUTER_MODEL_LIGHT: 'vendor/m:free' })).toBe('vendor/m:free');
    expect(resolveModel('groq', 'light', {})).toBe('openai/gpt-oss-20b');
  });
  it('a set but invalid model name makes the entry unusable instead of using the default', () => {
    expect(resolveModel('groq', 'light', { GROQ_MODEL_LIGHT: '../evil' })).toBeUndefined();
    expect(resolveModel('gemini', 'light', { GEMINI_MODEL_LIGHT: 'a/b' })).toBeUndefined();
  });
});
