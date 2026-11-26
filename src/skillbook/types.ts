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
  scan: readonly ScanSkill[];
}

export type ScanSeverity = 'high' | 'medium' | 'low';

/** A scanning skill (sub-phase 2D). The matching code lives in the engine, keyed by `id`. */
export interface ScanSkill {
  id: string;
  title: string;
  primary: 'frontend' | 'backend' | 'security' | 'api_data';
  also: Array<'frontend' | 'backend' | 'security' | 'api_data'>;
  severity: ScanSeverity;
  certainty: 'found' | 'possible';
  fix: 'auto' | 'guided' | 'explanation';
  explain: string;
  why: string;
  how: string[];
}
