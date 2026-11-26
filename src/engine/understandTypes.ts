// @node: F5.4
// Shared data types for the project understanding result. Plain data only.
import type { ClassificationConfidence, ClassificationEvidence, FileClassification } from '../types/contracts';

export type Label = FileClassification;

export interface FileUnderstanding {
  path: string;
  labels: Label[];
  confidence: ClassificationConfidence;
  evidence: ClassificationEvidence[];
  needsReview: boolean;
  basis: 'content' | 'path_only';
  ignored: boolean;
  ignoredReason?: string;
  /** Set only on an effective result: the user changed the labels. `before` keeps the automatic result. */
  corrected?: boolean;
  before?: { labels: Label[]; confidence: ClassificationConfidence; evidence: ClassificationEvidence[] };
}

export type EdgeKind = 'imports' | 'loads' | 'defines_route' | 'calls_api' | 'calls_external' | 'reads_config';
export type Certainty = 'confirmed' | 'inferred' | 'broken';

export interface Edge {
  id: string;
  kind: EdgeKind;
  from: string;
  target: string;
  targetPath?: string;
  certainty: Certainty;
  line: number;
  note?: string;
}

export interface AnalysisCoverage {
  fileEntries: number;
  read: number;
  pathOnly: number;
  ignored: number;
  scanned: number;
  notScanned: Record<string, number>;
  aliasImportsNotFollowed: number;
  djangoUrlFilesSeen: boolean;
  partial: boolean;
  partialReasons: string[];
  notAnalysed: number;
}

export interface AnalysisResult {
  snapshotId: string;
  skillbookVersion: number;
  files: FileUnderstanding[];
  edges: Edge[];
  externals: string[];
  coverage: AnalysisCoverage;
}

export interface ManifestFacts {
  pkgFrontend: boolean;
  pkgServer: boolean;
  pyServer: boolean;
}
