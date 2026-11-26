// @node: F5.1
// The skill-book. 2D adds `scan` skills to the same book without changing the sorting code.
import { SCAN_SKILLS } from './scanSkills';
import { SORT_SKILLS } from './sortSkills';
import type { SkillBook, SortSkill } from './types';

export type { SkillBook, SortSkill, ScanSkill, SkillStrength, ClueFamily } from './types';

export const SKILLBOOK: SkillBook = { version: 1, sort: SORT_SKILLS, scan: SCAN_SKILLS };

const BY_ID = new Map(SORT_SKILLS.map((s) => [s.id, s]));

export function skillById(id: string): SortSkill | undefined {
  return BY_ID.get(id);
}

const SCAN_BY_ID = new Map(SCAN_SKILLS.map((s) => [s.id, s]));

export function scanSkillById(id: string) {
  return SCAN_BY_ID.get(id);
}

export { PLAYBOOK } from './playbook';
export { cardById, cardsByTag, cardsForSkill, searchCards } from './playbookLookup';
export type { Card, Level, Playbook } from './playbookSchema';
