// @node: F9.1
import { describe, expect, it } from 'vitest';
import { PLAYBOOK, SKILLBOOK, cardById, cardsByTag, cardsForSkill, searchCards } from '../src/skillbook';
import { PlaybookSchema } from '../src/skillbook/playbookSchema';
import { checkLessonText, countSentences, longestSentence } from '../src/journal/lessonRules';

describe('the playbook', () => {
  it('passes the strict schema with unique ids', () => {
    expect(PlaybookSchema.safeParse(PLAYBOOK).success).toBe(true);
    const ids = PLAYBOOK.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('has one lesson per check (17), the 12 concepts, and the sorting lesson', () => {
    for (const s of SKILLBOOK.scan) expect(cardsForSkill(s.id).map((c) => c.id), s.id).toEqual([`lesson.${s.id}`]);
    const concepts = ['page', 'stylesheet', 'script', 'import', 'route', 'api-call', 'env-var', 'request-flow', 'validation', 'secret', 'layout', 'label'].map((n) => `concept.${n}`);
    expect(PLAYBOOK.cards.filter((c) => c.kind === 'concept').map((c) => c.id)).toEqual(concepts);
    expect(cardById('lesson.sorting.needs-review')?.kind).toBe('sorting');
    expect(PLAYBOOK.cards).toHaveLength(30);
  });
  it('every card and level follows the writing rules', () => {
    for (const c of PLAYBOOK.cards) for (const lvl of ['simple', 'practical', 'deeper'] as const) expect(checkLessonText(lvl, c.levels[lvl]), `${c.id} ${lvl}`).toEqual([]);
  });
  it('related ids exist and summaries are one short line', () => {
    for (const c of PLAYBOOK.cards) {
      for (const r of c.related) expect(cardById(r), `${c.id} -> ${r}`).toBeDefined();
      expect(c.summary.length).toBeLessThanOrEqual(120);
      expect(c.summary).not.toContain('\n');
    }
  });
  it('the worked examples are exact (design 6.2)', () => {
    expect(cardById('lesson.scan.security.target-blank')!.levels.simple).toBe('Some links open a new tab. A page opened that way can sometimes change the page that opened it. A small note on the link stops that.');
    expect(cardById('concept.route')!.levels.simple).toBe('A route is an address that a server listens to. When a page asks that address for something, the server answers.');
  });
  it('lookups by id, skill, tag, and words', () => {
    expect(cardsByTag('security').length).toBeGreaterThan(5);
    expect(searchCards('secret')[0]!.id).toMatch(/secret/);
    expect(searchCards(['route', 'server']).map((c) => c.id)).toContain('concept.route');
    expect(searchCards('')).toEqual([]);
    expect(cardById('nope')).toBeUndefined();
  });
  it('the rule helpers count sentences and words, and catch jargon and code characters', () => {
    expect(countSentences('One. Two! Three? Version 1.5 is fine.')).toBe(4);
    expect(longestSentence('A b c. D e.')).toBe(3);
    expect(checkLessonText('simple', 'Use the endpoint (x).')).toEqual(expect.arrayContaining(['jargon "endpoint"', 'code characters']));
    expect(checkLessonText('practical', 'This is safe and secure.')).toEqual(expect.arrayContaining([expect.stringContaining('banned')]));
  });
});
