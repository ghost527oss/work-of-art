// @node: F6.2
import type { AreaId } from '../store/shellView';

export type Severity = 'high' | 'medium' | 'low';
export type FixLabel = 'auto' | 'guided' | 'explanation';
export type FindingCertainty = 'found' | 'possible';

export interface Finding {
  id: string;
  skillId: string;
  primary: AreaId;
  areas: AreaId[];
  severity: Severity;
  certainty: FindingCertainty;
  fix: FixLabel;
  fixNote?: string;
  path: string;
  firstLine: number;
  lastLine: number;
  /** Redacted, at most 12 lines. Never saved, logged, or put in a record. */
  snippet: string[];
  extra?: string;
}

export interface RawFinding {
  skillId: string;
  path: string;
  firstLine: number;
  lastLine: number;
  extra?: string;
}

export interface ScanCoverage {
  filesScanned: number;
  filesNotRead: number;
  notChecked: Record<string, number>;
  couldNotCheck: Array<{ path: string; skillId: string }>;
}

export interface ScanResult {
  findings: Finding[];
  coverage: ScanCoverage;
  ruleCounts: Record<string, number>;
  partial: boolean;
  partialReasons: string[];
  labelsKey: string;
}
