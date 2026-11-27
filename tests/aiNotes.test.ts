// @node: F11.10
import { describe, expect, it } from 'vitest';
import {
  LIGHTER_WARNING, LIVE_LINE, MOCK_LINE, NOT_SET_UP_HINT, NOT_SET_UP_LINE, SAVED_LABEL, UNKNOWN_LINE, bannerFor, fallbackSentence, noticeLines, providerLine,
} from '../src/engine/aiNotes';
import type { AIMeta } from '../src/types/contracts';

const meta = (over: Partial<AIMeta> = {}): AIMeta => ({ tier: 'light', provider: 'groq', model: 'm', lighter: false, attempts: [], ...over });

describe('fixed phrases', () => {
  it('match the wording agreed with the user', () => {
    expect(LIGHTER_WARNING).toBe('Answered by a lighter model; review carefully.');
    expect(SAVED_LABEL).toBe('Saved answer from earlier in this session.');
    expect(NOT_SET_UP_LINE).toBe('Live AI is not set up.');
    expect(UNKNOWN_LINE).toBe('Could not check the AI mode.');
    expect(LIVE_LINE).toBe('Live AI: answers come from a free outside AI provider.');
    expect(MOCK_LINE).toBe('Mock mode: responses are canned examples. No AI model is used and nothing is sent to an AI provider.');
    expect(NOT_SET_UP_HINT).toContain('GEMINI_API_KEY');
  });
});

describe('providerLine and fallbackSentence', () => {
  it('names the provider and tier', () => {
    expect(providerLine(meta())).toBe('Answered by Groq (light).');
    expect(providerLine(meta({ provider: 'openrouter', tier: 'heavy' }))).toBe('Answered by OpenRouter (heavy).');
  });
  it('no failed attempt, no sentence', () => {
    expect(fallbackSentence(meta())).toBeUndefined();
  });
  it('one failed provider: the user example', () => {
    expect(fallbackSentence(meta({ attempts: [{ provider: 'gemini', outcome: 'rate_limited' }] }))).toBe('Gemini was busy, so Groq answered.');
  });
  it('two failed providers are joined with "and"', () => {
    const m = meta({ provider: 'openrouter', attempts: [{ provider: 'gemini', outcome: 'rate_limited' }, { provider: 'groq', outcome: 'timeout' }] });
    expect(fallbackSentence(m)).toBe('Gemini was busy and Groq took too long, so OpenRouter answered.');
  });
  it('each outcome has its own plain phrase', () => {
    const phrase = (o: AIMeta['attempts'][number]['outcome']) => fallbackSentence(meta({ attempts: [{ provider: 'gemini', outcome: o }] }));
    expect(phrase('timeout')).toBe('Gemini took too long, so Groq answered.');
    expect(phrase('error')).toBe('Gemini had a problem, so Groq answered.');
    expect(phrase('bad_answer')).toBe('Gemini gave an answer PatchBay could not use, so Groq answered.');
    expect(phrase('key_rejected')).toBe('Gemini did not accept its key, so Groq answered.');
    expect(phrase('out_of_time')).toBe('Gemini was not tried because time ran out, so Groq answered.');
  });
  it('a provider that failed twice is named once, with its last outcome; the answering provider is never listed as failed', () => {
    const m = meta({ attempts: [{ provider: 'gemini', outcome: 'bad_answer' }, { provider: 'gemini', outcome: 'rate_limited' }, { provider: 'groq', outcome: 'error' }] });
    expect(fallbackSentence(m)).toBe('Gemini was busy, so Groq answered.');
  });
});

describe('bannerFor', () => {
  it('mock, checking, unknown', () => {
    expect(bannerFor({ kind: 'mock' })).toEqual({ main: MOCK_LINE, kind: 'mock' });
    expect(bannerFor({ kind: 'checking' }).kind).toBe('checking');
    expect(bannerFor({ kind: 'unknown' })).toEqual({ main: UNKNOWN_LINE, kind: 'unknown' });
  });
  it('live ready lists only the configured providers in the fixed order', () => {
    const b = bannerFor({ kind: 'live', ready: true, providers: [{ id: 'gemini', configured: false }, { id: 'groq', configured: true }, { id: 'openrouter', configured: true }] });
    expect(b).toEqual({ main: LIVE_LINE, hint: 'Order tried: Groq, then OpenRouter.', kind: 'live' });
  });
  it('live not ready says it is not set up, with the hint', () => {
    expect(bannerFor({ kind: 'live', ready: false, providers: [] })).toEqual({ main: NOT_SET_UP_LINE, hint: NOT_SET_UP_HINT, kind: 'not_set_up' });
  });
});

describe('noticeLines', () => {
  it('has the five points of the notice', () => {
    const lines = noticeLines({ kind: 'live', ready: true, providers: [] });
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('outside AI company');
    expect(lines[0]).toContain('redacted');
    expect(lines[1]).toContain('Free plans may let that company');
    expect(lines[2]).toContain('File contents stay off unless you tick');
    expect(lines[3]).toContain('Secrets are removed first');
    expect(lines[4]).toContain('unless you press Approve');
    expect(lines[4]).toContain('practice copy');
  });
  it('an unknown mode uses the "if this server is live" wording', () => {
    expect(noticeLines({ kind: 'unknown' })[0]).toMatch(/^If this server is in live mode/);
  });
});
