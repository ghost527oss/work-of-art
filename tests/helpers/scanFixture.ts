// @node: F6.5
import { analyzeProject } from '../../src/engine/analyzeProject';
import type { SampleFile } from '../../src/engine/ingestPipeline';
import { scanProject, type ScanOptions } from '../../src/engine/scanProject';
import type { Label } from '../../src/engine/understandTypes';
import { snapshotOf } from './analyzeFixture';

export async function scanFiles(files: Record<string, SampleFile>, corrections: Record<string, Label[]> = {}, options: ScanOptions = { yieldToMain: async () => undefined }) {
  const snapshot = snapshotOf(files);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
  const inputs = { snapshot, analysis, corrections, effective: (p: string) => content.get(p) };
  return { result: await scanProject(inputs, options), inputs };
}
export const ids = (r: Awaited<ReturnType<typeof scanFiles>>) => r.result.findings.map((f) => `${f.skillId}@${f.path}:${f.firstLine}`);
