// @node: F5.1
import type { FileClassification } from '../types/contracts';

export type SkillStrength = 'strong' | 'moderate' | 'weak';
export type ClueFamily = 'name' | 'folder' | 'manifest' | 'import' | 'syntax' | 'reference';

/** One sorting skill: a plain-English reason for a label. The matching code lives in sortFiles.ts, keyed by `id`. */
export interface SortSkill {
  id: string;
  title: string;
  strength: SkillStrength;
  label: FileClassification;
  family: ClueFamily;
  /** One or two plain sentences, no jargon. */
  explain: string;
}

export interface SkillBook {
  version: number;
  sort: readonly SortSkill[];
}
