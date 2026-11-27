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

// ---------------------------------------------------------------------------
// A whole Phase 3A system in memory: the real client controller, the real /api/assistant handler, and fake providers.
// ---------------------------------------------------------------------------
import { handleAssistantRequest } from '../../api/assistant';
import { createAIHandoff } from '../../src/hooks/useAIHandoff';
import { createAssistantController, type AssistantController } from '../../src/hooks/useAssistant';
import { fetchAIStatus } from '../../src/engine/aiStatus';
import { requestAssistant } from '../../src/engine/aiAssistant';
import { mergedFindings } from '../../src/engine/scanView';
import { createStore, type Store } from '../../src/store/useStudioStore';
import { makeFakeFetch, type FakeCall, type FakeStep } from './fakeProviders';
import type { ActionName, CommandArg } from '../../src/engine/commands';

export interface System {
  store: Store<StudioState>;
  controller: AssistantController;
  actions: AssistantController['actions'];
  calls: FakeCall[];
  ran: string[];
  finding: ReturnType<typeof mergedFindings>[number] | undefined;
  /** Waits until no AI request is pending. */
  settle(): Promise<void>;
  send(over?: Record<string, unknown>): string | null;
  command(text: string): void;
  setEnv(env: Record<string, string | undefined>): void;
}

export async function makeSystem(opts: {
  files?: Record<string, SampleFile>;
  env?: Record<string, string | undefined>;
  script: (call: FakeCall, index: number) => FakeStep | Promise<FakeStep>;
  /** Skip the status check (the controller then treats the mode as mock). */
  noStatus?: boolean;
}): Promise<System> {
  const state = await loadedState(opts.files ?? IMG_FIXTURE);
  const store: Store<StudioState> = createStore(state);
  let env: Record<string, string | undefined> = opts.env ?? { AI_MODE: 'live', GEMINI_API_KEY: 'KEY_G_sentinel', GROQ_API_KEY: 'KEY_Q_sentinel', OPENROUTER_API_KEY: 'KEY_O_sentinel' };
  const fake = makeFakeFetch(opts.script);
  const route = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handleAssistantRequest(new Request(new URL(String(input), 'http://localhost'), init), env, { fetchImpl: fake.fetch })) as typeof fetch;
  let clock = 10_000;
  let ids = 0;
  const controller = createAssistantController(store, {
    requestAssistant: (req, { signal }) => requestAssistant(req, { signal, fetchImpl: route }),
    now: () => ++clock,
    newId: () => `sys-${++ids}`,
    ...(opts.noStatus ? {} : { fetchStatus: () => fetchAIStatus({ fetchImpl: route }) }),
  });
  const ran: string[] = [];
  const harness = {
    run: (name: ActionName, arg?: CommandArg) => {
      ran.push(arg ? `${name} ${arg}` : name);
      store.update((s) => runCommand(s, { name, ...(arg ? { arg } : {}) }, wctx()).state);
    },
  };
  controller.actions.setResultHandler!(createAIHandoff(store, harness, { now: () => ++clock, newId: () => `aip-${++ids}` }));
  const finding = mergedFindings(state)[0];
  const sys: System = {
    store, controller, actions: controller.actions, calls: fake.calls, ran, finding,
    async settle() {
      for (let i = 0; i < 200 && store.getState().ai.status === 'pending'; i++) await new Promise((r) => setTimeout(r, 1));
      await new Promise((r) => setTimeout(r, 1));
    },
    send(over = {}) {
      return controller.actions.send({
        snapshot: store.getState().snapshot!, instruction: 'Add a description to the image', taskType: 'suggest_change',
        selectedPaths: ['index.html'], includeContent: true,
        ...(finding ? { finding: { path: finding.path, skillId: finding.skillId, firstLine: finding.firstLine }, findingId: finding.id } : {}),
        edges: store.getState().understanding.result?.edges,
        ...over,
      } as never);
    },
    command(text) { store.update((s) => cmd(s, text).state); },
    setEnv(next) { env = next; },
  };
  if (!opts.noStatus) await controller.actions.refreshStatus!();
  return sys;
}

/** The model's JSON for a one-edit patch to index.html (line 5 is the image in IMG_FIXTURE). */
export const modelPatch = (newText: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ kind: 'patch', summary: 'Add a text description', path: 'index.html', edits: [{ start_line: 5, end_line: 5, new_text: newText }], tests: ['Run the checks'], risks: ['AI-written'], ...over });
export const FIX_IMG = '<img src="logo.png" alt="Shop logo">';
export const NO_FIX_IMG = '<img src="logo.png" class="logo">';
