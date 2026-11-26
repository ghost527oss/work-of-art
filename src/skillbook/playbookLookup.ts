// @node: F9.1
// Lookups on the playbook. The Journal uses them now; the Phase 3 AI will read cards through the same functions.
import { PLAYBOOK } from './playbook';
import type { Card } from './playbookSchema';

const BY_ID = new Map(PLAYBOOK.cards.map((c) => [c.id, c]));

export function cardById(id: string): Card | undefined {
  return BY_ID.get(id);
}

export function cardsForSkill(skillId: string): Card[] {
  return PLAYBOOK.cards.filter((c) => c.skillId === skillId);
}

export function cardsByTag(tag: string): Card[] {
  return PLAYBOOK.cards.filter((c) => c.tags.includes(tag));
}

/** Cards whose title, summary, tags, or keywords contain every word (case-insensitive), best matches first. */
export function searchCards(words: string | readonly string[]): Card[] {
  const list = (typeof words === 'string' ? words.split(/\s+/) : [...words]).map((w) => w.toLowerCase().trim()).filter(Boolean);
  if (list.length === 0) return [];
  const scored = PLAYBOOK.cards.map((c) => {
    const hay = [c.title, c.summary, ...c.tags, ...c.keywords].join(' ').toLowerCase();
    const hits = list.filter((w) => hay.includes(w)).length;
    const keywordHits = list.filter((w) => c.keywords.some((k) => k.toLowerCase() === w)).length;
    return { c, hits, keywordHits };
  });
  return scored.filter((s) => s.hits === list.length).sort((a, b) => b.keywordHits - a.keywordHits || (a.c.id < b.c.id ? -1 : 1)).map((s) => s.c);
}
