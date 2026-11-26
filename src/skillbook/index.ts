// @node: F5.1
// The skill-book. 2D adds `scan` skills to the same book without changing the sorting code.
import { SORT_SKILLS } from './sortSkills';
import type { SkillBook, SortSkill } from './types';

export type { SkillBook, SortSkill, SkillStrength, ClueFamily } from './types';

export const SKILLBOOK: SkillBook = { version: 1, sort: SORT_SKILLS };

const BY_ID = new Map(SORT_SKILLS.map((s) => [s.id, s]));

export function skillById(id: string): SortSkill | undefined {
  return BY_ID.get(id);
}
