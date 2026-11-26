// @node: F10.8
// A whole "page" of PatchBay controllers over a fake storage, with fake services and manual timers.
// refresh() builds a fresh page over the SAME storage, like a browser reload. Never reads real storage.
import { buildSampleSnapshot, isSampleId } from '../../src/data/sampleRepos';
import { analyzeProject } from '../../src/engine/analyzeProject';
import { scanProject } from '../../src/engine/scanProject';
import { createHarnessController } from '../../src/hooks/useHarness';
import { createIngestionController } from '../../src/hooks/useIngestion';
import { createPreviewController } from '../../src/hooks/usePreview';
import { createScanController } from '../../src/hooks/useScan';
import { createSessionController } from '../../src/hooks/useSessionRestore';
import { createUnderstandingController } from '../../src/hooks/useUnderstanding';
import { loadCorrectionsFor } from '../../src/store/correctionsStorage';
import { loadLayout, attachLayoutPersistence } from '../../src/store/layoutStorage';
import type { LayoutState } from '../../src/store/layoutSlice';
import { attachSessionPersistence } from '../../src/store/sessionPersistence';
import { createSessionStore } from '../../src/store/sessionStore';
import { INITIAL_VIEW, viewWhenStudio, type ShellView } from '../../src/store/shellView';
import { createStore, initialState, type StudioState } from '../../src/store/useStudioStore';
import type { ApiError, RepoRequest, RepoSnapshot } from '../../src/types/contracts';
import { IngestError } from '../../src/engine/githubSource';
import { recordingStorage } from './sessionFakes';

export type Storage = ReturnType<typeof recordingStorage>;

export interface Network {
  /** GitHub repositories by "owner/repo"; each call gets the request (scope, ref). */
  repos: Map<string, (req: RepoRequest) => RepoSnapshot>;
  /** When set, the next GitHub loads fail with this error. */
  fail?: ApiError;
  requests: RepoRequest[];
}

export function network(): Network { return { repos: new Map(), requests: [] }; }

const fast = { yieldToMain: async () => undefined };

export function makePage(storage: Storage, net: Network) {
  let clock = 1_000_000;
  let ids = 0;
  const timers: Array<{ fn: () => void; at: number; id: number; live: boolean }> = [];
  const setTimer = (fn: () => void, ms: number) => { const t = { fn, at: clock + ms, id: ++ids, live: true }; timers.push(t); return t; };
  const clearTimer = (h: unknown) => { if (h && typeof h === 'object') (h as { live: boolean }).live = false; };
  const now = () => clock;

  const studio = createStore<StudioState>(initialState());
  const shell = createStore<ShellView>(INITIAL_VIEW);
  const layout = createStore<LayoutState>(loadLayout(storage));
  const session = createSessionStore();
  const offLayout = attachLayoutPersistence(layout, storage);
  const offShell = studio.subscribe(() => shell.update((v) => viewWhenStudio(v, studio.getState().experience === 'studio')));

  const ingestion = createIngestionController(studio, {
    now,
    ingestSample: async (id) => { if (!isSampleId(id)) throw new Error('bad'); return buildSampleSnapshot(id, clock); },
    ingestRepository: async (req) => {
      net.requests.push(req);
      if (net.fail) throw new IngestError(net.fail.code, net.fail.message, net.fail.resetAt);
      const make = net.repos.get(`${req.owner}/${req.repo}`);
      if (!make) throw new IngestError('not_found', 'Repository not found or private.');
      return make(req);
    },
    analyze: (snap, opts) => analyzeProject(snap, { ...opts, ...fast }),
    loadCorrections: (snap) => loadCorrectionsFor(storage, snap),
  });
  const understanding = createUnderstandingController(studio, { storage, now, analyze: (s, o) => analyzeProject(s, { ...o, ...fast }), ...fast });
  const harness = createHarnessController(studio, layout, { storage, setTimer, clearTimer, now, newId: () => `id${++ids}`, cancelAI: () => undefined, page: { logRestored: false } });
  const scan = createScanController(studio, { now, scan: (i, o) => scanProject(i, { ...o, ...fast }), ...fast });
  const preview = createPreviewController(studio, { now, setTimer, clearTimer, raf: async () => undefined, addMessageListener: () => () => undefined });
  const sessionCtl = createSessionController({ studio, shell, session, ingestion: ingestion.actions, preview: preview.actions, storage, setTimer, clearTimer, now, page: { started: false } });
  const offSession = sessionCtl.attach();
  const offSave = attachSessionPersistence({ studio, shell, session, storage, now });

  /** Runs due timers (in order) after moving the clock. */
  function advance(ms: number) {
    const end = clock + ms;
    for (;;) {
      const due = timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      clock = due.at; due.live = false; due.fn();
    }
    clock = end;
  }
  /** Lets promises settle (loads, analysis, scans). */
  async function settle(rounds = 30) { for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setTimeout(r, 0)); }
  /** What the mounted SandboxPanel does: initialise the preview for the snapshot. */
  function mountSandbox() { if (studio.getState().snapshot) preview.actions.init(); }

  function dispose() {
    offSession(); offSave(); offLayout(); offShell();
    sessionCtl.dispose(); harness.dispose(); scan.dispose(); preview.dispose(); understanding.dispose(); ingestion.dispose();
  }
  return { studio, shell, layout, session, ingestion, understanding, harness, scan, preview, sessionCtl, storage, net, advance, settle, mountSandbox, dispose, now: () => clock, setClock: (t: number) => { clock = t; } };
}

export type Page = ReturnType<typeof makePage>;

/** A browser reload: the old page goes away (in-flight work lost); a new page starts over the same storage. */
export async function refresh(old: Page | null, storage: Storage, net: Network): Promise<Page> {
  old?.dispose();
  const p = makePage(storage, net);
  p.sessionCtl.actions.startup();
  await p.settle();
  p.mountSandbox();
  await p.settle();
  return p;
}

/** Loads a sample from the Start screen like a user. */
export async function openSample(p: Page, id: string) {
  p.ingestion.actions.startSample(id);
  await p.settle();
  p.mountSandbox();
  await p.settle();
}

export function githubFixture(owner: string, repo: string, ref: string, files: Record<string, string>): (req: RepoRequest) => RepoSnapshot {
  return (req) => {
    const base = buildSampleSnapshot('static-site', 1);
    const fl = Object.entries(files).map(([path, content]) => ({ path, content, language: 'text', sizeBytes: content.length, loadStatus: 'loaded' as const, classifications: ['unknown'], classificationConfidence: 'low', classificationEvidence: [], needsUserReview: false, truncated: false }));
    const entries = fl.map((f) => ({ path: f.path, entryType: 'file', loadStatus: 'loaded', classifications: ['unknown'], confidence: 'low', evidence: [], extension: f.path.split('.').pop() ?? '', sizeBytes: f.sizeBytes }));
    return { ...base, id: `${owner}/${repo}@${req.ref ?? ref}#1`, source: 'github', owner, name: repo, ref: req.ref ?? ref, files: fl, inventory: { ...base.inventory, entries } } as unknown as RepoSnapshot;
  };
}
