// @node: F11.11
// A loaded Studio state (snapshot, analysis, scan) plus helpers to make live-style AI results, for the Phase 3A tests.
import { analyzeProject } from '../../src/engine/analyzeProject';
import { buildEditDiff, type Edit } from '../../src/engine/live/answerParser';
import type { SampleFile } from '../../src/engine/ingestPipeline';
import { practiceContent } from '../../src/engine/practiceScript';
import { scanProject } from '../../src/engine/scanProject';
import { parseCommand } from '../../src/engine/commands';
import { idleScan } from '../../src/store/scanSlice';
import { understandingDone } from '../../src/store/understandingSlice';
import { initialState, type StudioState } from '../../src/store/useStudioStore';
import { runCommand, type Mode, type WorkCtx } from '../../src/store/workActions';
import type { AIRequest, AIResult, RepoSnapshot } from '../../src/types/contracts';
import { snapshotOf } from './analyzeFixture';

let n = 0;
export const wctx = (mode: Mode = 'automation', now = 1000): WorkCtx => ({ now, mode, newId: () => `id-${++n}` });

export async function loadedState(files: Record<string, SampleFile>, snapshot: RepoSnapshot = snapshotOf(files)): Promise<StudioState> {
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const base: StudioState = { ...initialState(), experience: 'studio', snapshot, understanding: understandingDone(analysis, {}) };
  const result = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => practiceContent(snapshot, [], p) }, { yieldToMain: async () => undefined });
  return { ...base, scan: { ...idleScan(), status: 'done', runId: 1, snapshotId: snapshot.id, result } };
}

export function cmd(s: StudioState, text: string, mode: Mode = 'automation') {
  const p = parseCommand(text);
  if (p.kind !== 'command') throw new Error(`not a command: ${text}`);
  return runCommand(s, { name: p.name, arg: p.arg }, wctx(mode));
}

/** A single-file request as the live path builds it: the whole file as the snippet. */
export function patchRequest(state: StudioState, path: string, over: Partial<AIRequest> = {}): AIRequest {
  const content = practiceContent(state.snapshot!, state.work.applied, path)!.replace(/\r\n/g, '\n');
  return {
    requestId: 'req-ai-1', instruction: 'Fix this', taskType: 'suggest_change', selectedPaths: [path],
    sourceContext: [{ filePath: path, content }], ...over,
  };
}

/** A live patch_proposal result with a diff built from real lines. Throws when the edits are not valid. */
export function patchResult(request: AIRequest, edits: Edit[], over: Partial<AIResult> = {}): AIResult {
  const ctx = request.sourceContext![0]!;
  const built = buildEditDiff(ctx.filePath, ctx.startLine ?? 1, ctx.content, edits);
  if (!built.ok) throw new Error(built.reason);
  return {
    requestId: request.requestId, mode: 'live',
    response: { type: 'patch_proposal', summary: 'Add a description', affectedPaths: [ctx.filePath], unifiedDiff: built.diff, tests: ['Run the checks'], risks: ['AI-written'] },
    meta: { tier: 'heavy', provider: 'groq', model: 'openai/gpt-oss-120b', lighter: false, attempts: [] },
    ...over,
  };
}

export const IMG_FIXTURE = { 'index.html': '<!doctype html>\n<html>\n<body>\n<h1>Shop</h1>\n<img src="logo.png">\n<p>Welcome</p>\n</body>\n</html>\n' };
