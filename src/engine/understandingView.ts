// @node: F5.6
// Pure view helpers for the Project understanding section.
import type { ClassificationConfidence } from '../types/contracts';
import type { AnalysisResult, Certainty, Edge, EdgeKind, FileUnderstanding, Label } from './understandTypes';

export const LABEL_NAMES: Record<Label, string> = {
  frontend: 'Frontend', backend: 'Backend', shared: 'Shared', api_data: 'APIs & Data', assets: 'Images and fonts',
  configuration: 'Settings', tests: 'Tests', documentation: 'Docs', infrastructure: 'Infrastructure', unknown: 'Unknown',
};

export function labelName(label: Label): string {
  return LABEL_NAMES[label];
}

export const AREA_OF_LABEL: Partial<Record<Label, 'frontend' | 'backend' | 'api_data'>> = { frontend: 'frontend', backend: 'backend', api_data: 'api_data' };
export const HELPER_OF_LABEL: Partial<Record<Label, 'assets' | 'tests' | 'configuration' | 'documentation'>> = {
  assets: 'assets', tests: 'tests', configuration: 'configuration', documentation: 'documentation',
};

/** Corrections applied on top of the automatic result. The connection map is never changed by corrections. */
export function applyCorrections(result: AnalysisResult, corrections: Readonly<Record<string, readonly Label[]>>): FileUnderstanding[] {
  return result.files.map((f) => {
    const c = corrections[f.path];
    if (!c || c.length === 0 || f.ignored) return f;
    return {
      ...f, labels: [...c], confidence: 'high', needsReview: false, corrected: true,
      evidence: [{ source: 'user', description: 'Set by you.' }],
      before: { labels: f.labels, confidence: f.confidence, evidence: f.evidence },
    };
  });
}

export interface Summary {
  labels: Array<{ label: Label; name: string; count: number }>;
  areas: Array<{ id: 'frontend' | 'backend' | 'api_data'; name: string; count: number }>;
  helpers: Array<{ id: 'assets' | 'tests' | 'configuration' | 'documentation'; name: string; count: number }>;
  security: 'pending scan (2D)';
  needsReview: number;
  ignored: number;
}

export function summarize(files: readonly FileUnderstanding[]): Summary {
  const count = (label: Label) => files.filter((f) => !f.ignored && f.labels.includes(label)).length;
  const order: Label[] = ['frontend', 'backend', 'shared', 'api_data', 'assets', 'configuration', 'tests', 'documentation', 'infrastructure', 'unknown'];
  return {
    labels: order.map((label) => ({ label, name: labelName(label), count: count(label) })),
    areas: (['frontend', 'backend', 'api_data'] as const).map((id) => ({ id, name: labelName(id), count: count(id) })),
    helpers: (['assets', 'tests', 'configuration', 'documentation'] as const).map((id) => ({ id, name: labelName(id), count: count(id) })),
    security: 'pending scan (2D)',
    needsReview: files.filter((f) => f.needsReview).length,
    ignored: files.filter((f) => f.ignored).length,
  };
}

export interface FileFilter {
  group?: Label | 'all';
  confidence?: ClassificationConfidence | 'all';
  needsReviewOnly?: boolean;
  text?: string;
}

export function filterFiles(files: readonly FileUnderstanding[], f: FileFilter): FileUnderstanding[] {
  const t = (f.text ?? '').trim().toLowerCase();
  return files.filter((x) => {
    if (f.group && f.group !== 'all' && !x.labels.includes(f.group)) return false;
    if (f.confidence && f.confidence !== 'all' && (x.ignored || x.confidence !== f.confidence)) return false;
    if (f.needsReviewOnly && !x.needsReview) return false;
    if (t && !x.path.toLowerCase().includes(t)) return false;
    return true;
  });
}

export interface EdgeFilter {
  kind?: EdgeKind | 'all';
  certainty?: Certainty | 'all';
  text?: string;
}

export function filterEdges(edges: readonly Edge[], f: EdgeFilter): Edge[] {
  const t = (f.text ?? '').trim().toLowerCase();
  return edges.filter((e) => {
    if (f.kind && f.kind !== 'all' && e.kind !== f.kind) return false;
    if (f.certainty && f.certainty !== 'all' && e.certainty !== f.certainty) return false;
    if (t && !(e.from.toLowerCase().includes(t) || e.target.toLowerCase().includes(t))) return false;
    return true;
  });
}

export const CERTAINTY_TEXT: Record<Certainty, string> = { confirmed: 'Confirmed', inferred: 'Inferred', broken: 'Broken' };
export const KIND_TEXT: Record<EdgeKind, string> = {
  imports: 'imports', loads: 'loads', defines_route: 'defines route', calls_api: 'calls API', calls_external: 'calls outside', reads_config: 'reads setting',
};
