// @node: F5.6
import { analyzeProject, type AnalyzeOptions } from '../../src/engine/analyzeProject';
import { buildSnapshotFromFiles, type SampleFile } from '../../src/engine/ingestPipeline';
import type { RepoSnapshot } from '../../src/types/contracts';

export function snapshotOf(files: Record<string, SampleFile>): RepoSnapshot {
  return buildSnapshotFromFiles({ owner: 'o', name: 'n', ref: 'main', source: 'sample', loadedAt: 1 }, files);
}
export const fast: AnalyzeOptions = { yieldToMain: async () => undefined };
export async function analyze(files: Record<string, SampleFile>, options: AnalyzeOptions = fast) {
  return analyzeProject(snapshotOf(files), options);
}
export const labelsOf = (r: Awaited<ReturnType<typeof analyze>>, path: string) => r.files.find((f) => f.path === path)!;
