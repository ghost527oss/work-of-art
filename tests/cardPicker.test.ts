// @node: F11.2
import { describe, expect, it } from 'vitest';
import { AI_LIVE } from '../src/config/aiLive';
import { cutOnSentence, pickCards, questionWords } from '../src/engine/live/cardPicker';
import { PLAYBOOK } from '../src/skillbook/playbook';

describe('questionWords', () => {
  it('lower-cases, drops short and filler words, de-duplicates, longest first, at most 12', () => {
    expect(questionWords('What is the Route route for validation?')).toEqual(['validation', 'route']);
    expect(questionWords('')).toEqual([]);
    expect(questionWords('a an it of')).toEqual([]);
    expect(questionWords(Array.from({ length: 30 }, (_, i) => `word${i}x`).join(' ')).length).toBe(12);
  });
  it('never throws on odd input', () => {
    expect(() => questionWords(undefined as unknown as string)).not.toThrow();
    expect(() => questionWords('💥 \u0000 <script>')).not.toThrow();
  });
});

describe('cutOnSentence', () => {
  it('returns short text unchanged', () => {
    expect(cutOnSentence('Short text.', 700)).toBe('Short text.');
  });
  it('cuts at the last full sentence past the halfway point', () => {
    const t = 'First sentence is here. Second sentence is here. Third sentence runs on and on without an end';
    const out = cutOnSentence(t, 60);
    expect(out).toBe('First sentence is here. Second sentence is here.');
    expect(out.length).toBeLessThanOrEqual(60);
  });
  it('falls back to a word edge and never exceeds the limit', () => {
    const out = cutOnSentence('word '.repeat(300), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(' ')).toBe(false);
  });
});

describe('pickCards', () => {
  it('puts the cards for the scan skill first, practical level, with the title', () => {
    const cards = pickCards('scan.frontend.img-alt', 'why does this matter');
    expect(cards[0]!.id).toBe('lesson.scan.frontend.img-alt');
    const card = PLAYBOOK.cards.find((c) => c.id === 'lesson.scan.frontend.img-alt')!;
    expect(cards[0]!.text.startsWith(card.title)).toBe(true);
    expect(cards[0]!.text).toContain(card.levels.practical.slice(0, 40));
    expect(cards[0]!.text).not.toContain(card.levels.deeper.slice(0, 40));
  });
  it('returns at most 2 cards, each at most 700 characters', () => {
    for (const q of ['route validation secret import page', 'explain everything about stylesheet layout', 'x']) {
      const cards = pickCards('scan.backend.input-validation', q);
      expect(cards.length).toBeLessThanOrEqual(AI_LIVE.maxCards);
      for (const c of cards) expect(c.text.length).toBeLessThanOrEqual(AI_LIVE.maxCardChars);
    }
  });
  it('finds a concept card from the words of the question', () => {
    const cards = pickCards(undefined, 'What is a stylesheet?');
    expect(cards.map((c) => c.id)).toContain('concept.stylesheet');
  });
  it('matches a long question by single words when no card holds every word', () => {
    const cards = pickCards(undefined, 'Please walk me through how the route handler receives data');
    expect(cards.length).toBeGreaterThan(0);
  });
  it('returns nothing when nothing matches', () => {
    expect(pickCards(undefined, 'zzzzqqqq xxxxwwww')).toEqual([]);
    expect(pickCards(undefined, '')).toEqual([]);
    expect(pickCards('scan.not.real', '')).toEqual([]);
  });
  it('is deterministic and de-duplicates', () => {
    const a = pickCards('scan.security.eval', 'eval code text run');
    const b = pickCards('scan.security.eval', 'eval code text run');
    expect(a).toEqual(b);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
  });
  it('never throws on odd input', () => {
    expect(() => pickCards('', '💥'.repeat(5000))).not.toThrow();
    expect(() => pickCards(undefined, undefined as unknown as string)).not.toThrow();
  });
  it('every card text is real playbook text (the browser cannot supply card text)', () => {
    const all = PLAYBOOK.cards.map((c) => c.levels.practical);
    for (const c of pickCards('scan.frontend.button-name', 'button name')) {
      expect(all.some((p) => c.text.includes(p.slice(0, 30)))).toBe(true);
    }
  });
});
