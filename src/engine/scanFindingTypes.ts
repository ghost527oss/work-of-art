// @node: F6.2
// @node: F12.1 (confidence and measure)
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
  /** 3B-1: how sure a measurement is (never saved). */
  confidence?: 'high' | 'medium' | 'low';
  /** 3B-1: what was measured (never saved). */
  measure?: { kind: string; value: number; limit: number; /** What a recipe needs (colours as hex, the display value). Fixed short values only. */ info?: Record<string, string> };
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
  /** 3B-1: how many files had part of the code checks skipped, by plain reason (absent when none). */
  codeNotChecked?: Record<string, number>;
}

export interface ScanResult {
  findings: Finding[];
  coverage: ScanCoverage;
  ruleCounts: Record<string, number>;
  partial: boolean;
  partialReasons: string[];
  labelsKey: string;
}
