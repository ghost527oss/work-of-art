# Phase 2 report (checkpoint)

**Status of this report:** it covers sub-phases 2A, 2B, 2C, and 2D, which are built and verified. Sub-phases 2E-1, 2E-2, 2F, and 2G are **not built yet**; their sections below say so. `Current Active Phase` in `.kiro/steering/build-phases.md` was not changed.

All numbers below are real command output from this workspace. "Unverified" means it was not run or could not be run here.

## Summary table

| Sub-phase | Branch | Tests (files / tests) | Build (JS / gzip) | Mutation checks | Browser run | Independent review |
|---|---|---|---|---|---|---|
| Baseline (Phase 1) | main | 21 / 785 | not recorded | | | |
| 2A Studio shell | feat/studio-shell | 27 / 868 | 384.14 kB / 116.98 kB | 10 of 10 killed | 28 of 28 pass | NEEDS_CHANGES, focus bug fixed |
| 2B Action harness | feat/action-harness | 36 / 1,185 | 416.17 kB / 127.17 kB | 11 of 11 killed | 47 of 47 pass | NEEDS_CHANGES, 7 findings fixed |
| 2C Project understanding | feat/project-understanding | 48 / 1,303 | 477.73 kB / 145.51 kB | 9 killed, 1 equivalent | 24 of 24 pass | NEEDS_CHANGES, 11 of 12 fixed |
| 2D Scanner and Skeleton Crew | feat/scanner-skeleton-crew | 57 / 1,385 | 525.46 kB / 159.99 kB | 10 of 10 killed | 25 of 25 pass | NEEDS_CHANGES, most fixed |
| 2E-1, 2E-2, 2F, 2G | not started | | | | | |

For every built sub-phase: `npm run typecheck` is clean, `npm audit` reports 0 vulnerabilities, and no runtime dependency was added (still `react`, `react-dom`, `zod`).

---

## 2A. Studio shell

**What was built (plain English).** After a repository loads, the Studio is now a proper workspace. A vertical toolbar on the right has six buttons: Edit, AI Chat, Log, History, Journal, and Skeleton Crew. The first five open one panel at a time, which can collapse, switch between narrow and wide, and close. Skeleton Crew opens an empty Screen 4, whose four area buttons open empty Screen 5 pages. The panel layout is saved in the browser under `patchbay.studio-layout.v1` (four fields, no repository data).

**Files.** Created: `src/store/{layoutSlice,layoutStorage,shellView}.ts`, `src/hooks/{useLayout,useShell}.ts`, `src/components/{StudioToolbar,PanelFrame,PlaceholderPanel,SandboxPlaceholder,SkeletonCrewScreen,DomainScreen,ProjectInfo,LogPanel}.tsx`, and 6 test files. Changed: `StudioLayout.tsx` (rewritten as the shell), `App.tsx`, `styles.css`, `README.md`, `traceability/PLAN.md`.

**Results.** 27 files, 868 tests pass; build 384.14 kB JS (116.98 kB gzip). 10 of 10 mutations killed. Browser run 28 of 28 checks, zero console errors. The review found a keyboard-focus loss when collapsing a panel; it was fixed.

**Known limits.** The AI form text and Project info local state reset when you visit Screens 4 and 5. Scoped-reload status is not shown on Screens 4 and 5.

## 2B. Action harness

**What was built.** AI Chat now understands fixed command words (`help`, `status`, `start`, `pause`, `resume`, `step`, `stop`, `approve`, `reject`, `undo`, `redo`, `open <panel>`, `reset`). `start` runs a labelled offline **practice run** that proposes one practice comment per file. Proposals have Approve and Reject buttons; approving changes only an in-memory practice copy, with Undo and Redo checked by fingerprints. A Stop button is always visible. Opening Edit pauses the run and closing it does not resume. History and the Log are real. The work (run, proposal, history, last 200 Log lines) is saved for one repository under `patchbay.work.v1` as diffs and short fingerprints only, and restored after a refresh (a running run returns paused).

**Files.** Created: `src/engine/{diffApply,commands,practiceScript}.ts`, `src/config/workLimits.ts`, `src/store/{workSlice,workActions,workStorage}.ts`, `src/hooks/useHarness.ts`, `src/components/{StopBar,ProposalCard,HistoryPanel,EditPanel}.tsx`, 9 test files. Changed: `useStudioStore.ts` (adds `work`), `layoutSlice.ts` (adds `openPanelById`), `AIAssistantPanel.tsx`, `LogPanel.tsx`, `StudioLayout.tsx`, `App.tsx`, `styles.css`, `README.md`, `PLAN.md`, and 3 assertions in `tests/studioLayout.test.tsx` (the 2A placeholders that 2B replaces).

**Results.** 36 files, 1,185 tests; build 416.17 kB JS (127.17 kB gzip). 11 of 11 mutations killed (one needed a double mutation because two guards overlap). Browser run 47 of 47 on the built app, zero console errors, including 50 rapid presses of Approve, Reject, and Stop, refresh and restore, another repository replacing the slot, and blocked storage. The review's 7 findings were fixed (honest "verified" per run, tampered saved proposal discarded, refused text kept in the box, save check skipped for unrelated updates, job errors cannot strand the timer, saved Log text redacted).

**Deviations.** Reversing a diff swaps the two `@@` range tokens as written (so reversing twice returns the original text exactly). The `/api/assistant` call is answered like the dev server in the browser script because `vite preview` has no API functions.

**Known limits.** `reset` has no confirmation (as specified). The proposal card says "in-memory practice copy" although approved diffs are saved and restored.

## 2C. Project understanding

**What was built.** When a repository finishes loading, an offline analysis (no AI, no network) runs as the real "Classify files" loading stage. The result appears in Project info as **Project understanding**: every file gets labels (Frontend, Backend, Shared, APIs & Data, Images and fonts, Settings, Tests, Docs, Infrastructure), a confidence, and plain reasons that name the skill-book rule that fired. Files with no clue go to **Needs Review** instead of being guessed. A connection map lists imports, page loads, routes, API calls, outside calls, and setting reads, each marked Confirmed, Inferred, or Broken in words. JavaScript, TypeScript, HTML, CSS, and basic Python are read; other languages are listed as not scanned. Limits mark the result Partial with a reason. You can set the labels of any file; corrections are saved per repository (`patchbay.corrections.v1`, paths and label names only).

**Files.** Created: `src/skillbook/{types,sortSkills,index}.ts`, `src/config/understandingLimits.ts`, `src/engine/{sourceScan,sourceScanPy,scanTypes,sortFiles,connectionMap,analyzeProject,understandTypes,understandingView}.ts`, `src/store/{understandingSlice,understandingActions,correctionsStorage}.ts`, `src/hooks/useUnderstanding.ts`, `src/components/{UnderstandingSection,FileLabelsTable,ConnectionsTable,LabelEditor}.tsx`, 12 test files. Changed: `useStudioStore.ts`, `useIngestion.ts` (the stage inside the loading run), `LoadingScene.tsx`, `ProjectInfo.tsx`, `StudioLayout.tsx`, `App.tsx`, `contracts.ts` (one list), `styles.css`, `README.md`, `PLAN.md`, and exactly two tests in `tests/store.test.ts`, as the spec named.

**Results.** 48 files, 1,303 tests; build 477.73 kB JS (145.51 kB gzip). The hand-written expected results for all three samples pass. 9 of 10 mutations killed, 1 equivalent. Browser run 24 of 24, zero console errors. The review's 12 findings: 11 fixed (calls with unknown addresses are never Broken, `public/` loads, credentials and query strings stripped, and more); one (area counts include Low labels) follows the spec and was documented.

**Deviations.** Images and unsupported types are not marked Ignored (the worked examples need images to be Images and fonts). `src/main.tsx` lists the manifest clue the rules give it, which the design table omitted.

**Unverified.** A real GitHub repository load and a scoped folder reload with the new stage (only samples were used in the browser).

## 2D. Scanner and Skeleton Crew

**What was built.** Skeleton Crew (Screen 4) scans the loaded files offline with 16 checks and groups findings into Frontend, Backend, Security, and APIs & Data. Every finding shows the file, lines, a redacted snippet, a plain explanation, why it matters, and **Found** or **Possible**. There are no scores, and the page lists what was and was not checked. Screen 4 has the map with real counts and links, four worker boxes (workers take turns), a **Start Crew** button, and a command box. Screen 5 shows one area's findings, details, crew narration, the pending proposal, changes made, and the request trace for APIs & Data. `start crew` (or the button) walks the findings with the same controls as the practice run. The only automatic fix adds `rel="noopener noreferrer"` to a link, and only when it applies exactly, the check no longer fires, nothing new appears, and the change holds no secret. Approve, undo, and redo re-check the file in the same update. The crew run and its proposal are never saved.

**Files.** Created: `src/config/scanLimits.ts`, `src/skillbook/scanSkills.ts`, `src/engine/{scanText,scanFrontend,scanBackend,scanSecurity,scanApi,scanFix,scanProject,scanView,scanFindingTypes,crewScript}.ts`, `src/store/{scanSlice,scanActions}.ts`, `src/hooks/useScan.ts`, 11 components (`AreaMap`, `WorkerSlots`, `FindingsTable`, `FindingDetail`, `CrewNarration`, `RequestTrace`, `ChangesMade`, `CommandBar`, `WhatWasChecked`, and the live Screens 4 and 5), 10 test files. Changed: `commands.ts` (`start` takes `practice` or `crew`), `workSlice.ts` (run `kind`, proposal `source`), `workActions.ts`, `workStorage.ts` (crew not saved, secret check on History), `useHarness.ts` (1.0 s crew tick), `StopBar`, `ProposalCard`, `StudioLayout`, `SkeletonCrewScreen`, `DomainScreen`, `UnderstandingSection`, `understandingView.ts`, `styles.css`, `README.md`, `PLAN.md`; tests: `commands.test.ts` (named by the design) and type-only fields in `workState.test.ts` and `workStore.test.ts`.

**Results.** 57 files, 1,385 tests; build 525.46 kB JS (159.99 kB gzip). The expected results for the three samples pass (one finding each). 10 of 10 mutations killed. Browser run 25 of 25, zero console errors, including blocked storage and 375 px. The review's 16 items were mostly fixed (a private key body leaking into a snippet, `data-rel` editing, stale findings after `reset`, placeholder secrets, text inside strings, and more).

**Known limits.** The checks are pattern based, not program analysis. `rescanPaths` does not re-apply the finding caps. Only one automatic fix exists.

**Unverified.** The automatic fix in a real browser (the samples have no `target="_blank"` link; it is proven with fixtures in unit tests). Real GitHub repositories.

---

## 2E-1. Sandbox preview and security — NOT BUILT
Spec: `.kiro/specs/07-sandbox-preview/`. Tasks E1 to E11 were not started.

## 2E-2. Edit pad — NOT BUILT
Spec: `.kiro/specs/08-edit-pad/`. Tasks P1 to P9 were not started.

## 2F. Journal and export — NOT BUILT
Spec: `.kiro/specs/09-journal-export/`. Tasks J1 to J11 were not started.

## 2G. Session restore — NOT BUILT
Spec: `.kiro/specs/10-session-restore/`. Tasks K1 to K9 were not started.

## Phase 2 exit evidence

Not complete. The Phase 2 exit gate (every control updates state predictably, state survives a refresh, rapid repeated clicks do not desync) is proven for the controls built so far (2A to 2D) by the browser runs above. It cannot be claimed for the whole of Phase 2 until 2E to 2G exist.
