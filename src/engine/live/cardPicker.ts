// @node: F11.2
// Picks the playbook cards the live AI may read. Runs on the server only: the browser never chooses card text.
// Order: cards for the scan skill first, then cards that match the question's words. At most `maxCards`, `practical` level,
// each cut at `maxCardChars` on a sentence edge. Pure and deterministic.
import { AI_LIVE } from '../../config/aiLive';
import { cardsForSkill, searchCards } from '../../skillbook/playbookLookup';
import type { Card } from '../../skillbook/playbookSchema';

export interface PickedCard {
  id: string;
  title: string;
  /** Title plus the practical-level text, at most `maxCardChars` characters. */
  text: string;
}

const STOP = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'has', 'how', 'why', 'what',
  'when', 'where', 'who', 'this', 'that', 'with', 'from', 'have', 'does', 'did', 'into', 'about', 'there', 'their', 'than',
  'then', 'them', 'these', 'those', 'will', 'would', 'could', 'should', 'file', 'files', 'please', 'tell', 'explain', 'show',
  'make', 'need', 'want', 'like', 'just', 'any', 'its', 'is', 'it', 'in', 'on', 'of', 'to', 'a', 'an', 'my', 'me', 'do', 'be',
]);

/** Lower-case words of at least 3 letters, without filler words, unique, at most 12, longest first. */
export function questionWords(text: string): string[] {
  const raw = String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  const unique = [...new Set(raw)];
  return unique.sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).slice(0, 12);
}

/** Cuts `text` to at most `max` characters, at the last sentence end when there is one past the halfway point. */
export function cutOnSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.'));
  if (end >= Math.floor(max / 2)) return head.slice(0, end + 1);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).trimEnd();
}

function toPicked(card: Card): PickedCard {
  return { id: card.id, title: card.title, text: cutOnSentence(`${card.title}: ${card.levels.practical}`, AI_LIVE.maxCardChars) };
}

export function pickCards(skillId: string | undefined, instruction: string): PickedCard[] {
  const chosen: Card[] = [];
  const add = (c: Card): void => {
    if (chosen.length < AI_LIVE.maxCards && !chosen.some((x) => x.id === c.id)) chosen.push(c);
  };
  if (typeof skillId === 'string' && skillId !== '') for (const c of cardsForSkill(skillId)) add(c);
  const words = questionWords(instruction);
  if (chosen.length < AI_LIVE.maxCards && words.length > 0) {
    // Every word together first, then each word on its own, scored by how many words reach a card.
    for (const c of searchCards(words)) add(c);
    if (chosen.length < AI_LIVE.maxCards) {
      const score = new Map<string, { card: Card; hits: number; keyword: number }>();
      for (const w of words) {
        for (const c of searchCards([w])) {
          const e = score.get(c.id) ?? { card: c, hits: 0, keyword: 0 };
          e.hits += 1;
          if (c.keywords.some((k) => k.toLowerCase() === w)) e.keyword += 1;
          score.set(c.id, e);
        }
      }
      const ranked = [...score.values()].sort((a, b) => b.hits - a.hits || b.keyword - a.keyword || (a.card.id < b.card.id ? -1 : 1));
      for (const e of ranked) add(e.card);
    }
  }
  return chosen.map(toPicked);
}
