# Phase 2 report

**Status:** all eight sub-phases of Phase 2 (2A, 2B, 2C, 2D, 2E-1, 2E-2, 2F, 2G) are built, tested, reviewed, and pushed. This report replaces the checkpoint report that covered 2A to 2D.

`Current Active Phase` in `.kiro/steering/build-phases.md` was **not** changed. It still says Phase 1. Moving to Phase 3 is your decision.

All numbers are real command output from this workspace. **Unverified** means it was not run, or could not be run here, and the reason is given.

## Summary table

| Sub-phase | Branch | Tests (files / tests) | Build JS / gzip | Mutation checks | Browser run (on its own build) | Independent review |
|---|---|---|---|---|---|---|
| Baseline (Phase 1) | main | 21 / 785 | not recorded | | | |
| 2A Studio shell | feat/studio-shell | 27 / 868 | 384.14 / 116.98 kB | 10 of 10 killed | 28 of 28 | 1 finding, fixed |
| 2B Action harness | feat/action-harness | 36 / 1,185 | 416.17 / 127.17 kB | 11 of 11 killed | 47 of 47 | 7 findings, fixed |
| 2C Project understanding | feat/project-understanding | 48 / 1,303 | 477.73 / 145.51 kB | 9 killed, 1 equivalent | 24 of 24 | 12 findings, 11 fixed |
| 2D Scanner and Skeleton Crew | feat/scanner-skeleton-crew | 57 / 1,385 | 525.46 / 159.99 kB | 10 of 10 killed | 25 of 25 | 16 items, most fixed |
| 2E-1 Sandbox preview and isolation | feat/sandbox-preview | 62 / 1,448 | 567.65 / 174.85 kB | 9 of 9 killed | 24 of 24 | 10 findings, 8 fixed |
| 2E-2 Edit pad | feat/edit-pad | 64 / 1,482 | 604.44 / 186.17 kB | 8 killed, 1 equivalent | 20 of 20 | 17 items, 16 fixed |
| 2F Journal and export | feat/journal-export | 79 / 1,582 | 671.40 / 207.44 kB | 27 of 27 killed | 34 of 34 | 11 findings, 8 fixed |
| 2G Session restore | feat/session-restore | 92 / 1,666 | 684.48 / 211.65 kB | 22 killed, 1 equivalent | 49 of 49 | 4 findings, all handled |

These hold for every sub-phase:
- `npm run typecheck` is clean.
- `npm audit` reports 0 vulnerabilities.
- No runtime dependency was added (still `react`, `react-dom`, `zod`).
- The UI is black and white, with no transition or animation.
- `AI_MODE=mock` only. No new AI or network call.

The branches are stacked: each one starts from the previous sub-phase. `feat/session-restore` holds all of Phase 2. No pull request has been opened yet.

**How browser runs work here.** They use headless Chromium on the built app (`vite preview`) with real clicks and reloads. The dev-server command is blocked in this sandbox. `/api/repo` is served from fixtures through request interception, and the GitHub hosts are intercepted as well, so nothing leaves the sandbox. The 2A run uses a small server that hosts the real `api/assistant.ts` handler with `AI_MODE=mock`.

---

## 2A. Studio shell

**What was built.** After a repository loads, the Studio is a workspace with a vertical toolbar on the right: Edit, AI Chat, Log, History, Journal, and Skeleton Crew.
- The first five buttons open one panel at a time. A panel can collapse, switch between narrow and wide, and close.
- Skeleton Crew opens Screen 4. Its area buttons open Screen 5.
- The panel layout is saved under `patchbay.studio-layout.v1`: four fields, no repository data.

**Files.** Created:
- `src/store/{layoutSlice,layoutStorage,shellView}.ts`
- `src/hooks/{useLayout,useShell}.ts`
- `src/components/{StudioToolbar,PanelFrame,PlaceholderPanel,SandboxPlaceholder,SkeletonCrewScreen,DomainScreen,ProjectInfo,LogPanel}.tsx`
- 6 test files

Changed: `StudioLayout.tsx` (rewritten as the shell), `App.tsx`, `styles.css`, `README.md`, `PLAN.md`.

**Results.**
- 27 files, 868 tests. Build 384.14 kB (116.98 kB gzip).
- 10 of 10 mutations killed.
- Browser run 28 of 28, zero console errors. It covered panels, wide, collapse, layout after a refresh, 50 and 51 rapid presses, Screens 4 and 5, AI Chat, 375 px, and blocked storage.
- The review found a keyboard-focus loss on collapse and close. It was fixed.

**Known limits.** The AI form text and Project info local state reset when you visit Screens 4 and 5.

**Unverified.** None.

## 2B. Action harness

**What was built.** AI Chat understands fixed command words: `help`, `status`, `start`, `pause`, `resume`, `step`, `stop`, `approve`, `reject`, `undo`, `redo`, `open <panel>`, and `reset`.
- `start` runs an offline **practice run** that proposes practice comments.
- Approving a proposal changes only PatchBay's practice copy. Undo and Redo are checked by fingerprints.
- A Stop button is always visible. Opening Edit pauses the run.
- History and the Log are real. The work (run, proposal, History diffs, last 200 Log lines) is saved for one repository under `patchbay.work.v1`. After a refresh it comes back, and a running run comes back paused.

**Files.** Created:
- `src/engine/{diffApply,commands,practiceScript}.ts`
- `src/config/workLimits.ts`
- `src/store/{workSlice,workActions,workStorage}.ts`
- `src/hooks/useHarness.ts`
- `src/components/{StopBar,ProposalCard,HistoryPanel,EditPanel}.tsx`
- 9 test files

Changed: `useStudioStore.ts`, `layoutSlice.ts`, `AIAssistantPanel.tsx`, `LogPanel.tsx`, `StudioLayout.tsx`, `App.tsx`, `styles.css`, docs, and 3 named assertions in `tests/studioLayout.test.tsx`.

**Results.**
- 36 files, 1,185 tests. Build 416.17 kB (127.17 kB gzip).
- 11 of 11 mutations killed.
- Browser run 47 of 47, zero console errors. It included rapid Approve, Reject, and Stop presses, refresh and restore, slot replacement, and blocked storage.
- All 7 review findings were fixed.

**Known limits.** The `reset` command has no confirmation, as specified.

**Unverified.** One scripted item, "refused text stays in the box", is tested only by logic.

## 2C. Project understanding

**What was built.** An offline analysis runs as the "Classify files" loading stage.
- Every file gets labels, a confidence, and plain reasons.
- Files with no clue go to **Needs Review** instead of being guessed.
- A connection map lists imports, page loads, routes, API calls, outside calls, and setting reads. Each is marked Confirmed, Inferred, or Broken.
- You can correct labels. Corrections are saved per repository (`patchbay.corrections.v1`, paths and label names only).

**Files.** Created:
- `src/skillbook/{types,sortSkills,index}.ts`
- `src/config/understandingLimits.ts`
- `src/engine/{sourceScan,sourceScanPy,scanTypes,sortFiles,connectionMap,analyzeProject,understandTypes,understandingView}.ts`
- `src/store/{understandingSlice,understandingActions,correctionsStorage}.ts`
- `src/hooks/useUnderstanding.ts`
- 4 components, 12 test files

Changed: `useIngestion.ts`, `LoadingScene.tsx`, `ProjectInfo.tsx`, `StudioLayout.tsx`, `App.tsx`, and two named tests in `tests/store.test.ts`.

**Results.**
- 48 files, 1,303 tests. Build 477.73 kB (145.51 kB gzip).
- 9 mutations killed, 1 equivalent.
- Browser run 24 of 24.
- 11 of 12 review findings fixed. The 12th (area counts include Low labels) follows the spec text.

**Unverified.** A real GitHub repository load. The browser runs use fixtures and samples.

## 2D. Scanner and Skeleton Crew

**What was built.** Skeleton Crew (Screen 4) scans the loaded files offline and groups findings into Frontend, Backend, Security, and APIs & Data.
- Each finding shows the file, lines, a redacted snippet, a plain explanation, why it matters, and **Found** or **Possible**. There are no scores.
- `start crew` walks the findings.
- The one automatic fix adds `rel="noopener noreferrer"` to a link. It is applied only after you approve, and only when the fix is re-checked as exact and safe.
- Screen 5 shows one area: its findings, details, narration, changes made, and the request trace.

There were 16 checks in 2D. 2E-1 adds a 17th, a layout check measured in the preview.

**Files.** Created:
- `src/config/scanLimits.ts`
- `src/skillbook/scanSkills.ts`
- 9 engine files
- `src/store/{scanSlice,scanActions}.ts`
- `src/hooks/useScan.ts`
- 11 components, 10 test files

Changed: `commands.ts`, the work slice, actions and storage, `useHarness.ts`, `StopBar`, `ProposalCard`, and Screens 4 and 5.

**Results.**
- 57 files, 1,385 tests. Build 525.46 kB (159.99 kB gzip).
- 10 of 10 mutations killed.
- Browser run 25 of 25.
- Most of the 16 review items were fixed (items 10, 11, and 16 only in part). Not fixed: `rescanPaths` does not re-apply the finding caps (documented).

**Unverified.** None left: the automatic fix in a real browser was later proven in the 2F and 2G runs (fixture repository).

## 2E-1. Sandbox preview and isolation

**What was built.** The Sandbox panel shows the project in a locked frame.
- **Look-only:** the frame sandbox is exactly `allow-same-origin`. The page is rebuilt by an allowlist, and the security policy (CSP) comes first.
- **Scripts on:** the frame sandbox is exactly `allow-scripts`, after a confirmation that names the remaining risks.
- **Other views:** a component **workbench** shows an approximate picture of React components, and **Source** view shows the files.
- A **layout check** measures text that does not fit at chosen widths. The result appears as a Measured finding (the 17th check).

**Files.** Created: `src/preview/*` (tokenizer, allowlist, document builder, flags and CSP, bridge, workbench, mode detection, layout check, source view), `src/store/{previewSlice,previewActions}.ts`, `src/hooks/usePreview.ts`, `SandboxPanel` and `PreviewParts`, and tests.

**Results.**
- 62 files, 1,448 tests. Build 567.65 kB (174.85 kB gzip).
- 9 of 9 mutations killed.
- **Isolation browser test with a hostile page: 24 of 24.**
  - Parent document, top location, local and session storage, IndexedDB, and cookies were all blocked.
  - fetch, XHR, WebSocket, beacon, image, iframe, popup, form, worker, and dynamic import made zero network requests.
  - The one documented exception is a self-navigation of the frame. It is detected and reset to look-only, with a Log line.
- 8 of 10 review findings fixed.

**Unverified.** WebRTC and data:/blob: self-navigation in scripts mode were not probed. **Open in viewer** was not built in 2E-1; 2F added it.

## 2E-2. Edit pad

**What was built.** The Edit panel became an edit pad over the preview.
- A clear overlay takes every click, so page code never receives one.
- Tools: Select, Lasso, Background, Pick from list, and drag handles.
- A property form with checked values only: size, corners, spacing, border, shadow, text, and background.
- On plain HTML, a change is written to the practice copy at once as a `style` change and recorded in History. Changes it cannot map are **Preview Only** and never saved.
- After each change the layout check runs again, and **Try a fix** offers fixed suggestions.

**Files.** Created: `src/edit/*` (style model, inline style, text diff, element map, geometry, preview handle, suggestions), `src/store/{editSlice,editActions}.ts`, `src/hooks/useEditPad.ts`, `EditOverlay`, `EditPads`, `EditPanel`, and tests.

**Results.**
- 64 files, 1,482 tests. Build 604.44 kB (186.17 kB gzip).
- 8 mutations killed, 1 equivalent.
- Browser run 20 of 20.
- 16 of 17 review items fixed. Not fixed: Try a fix matches by line only. Also left as known limits: no live preview while typing in number fields, no narrow-window re-check on resize, and workbench "line N" labels.

**Unverified.** Touch input on a real device. The colour picker in other browsers.

## 2F. Journal and export

**What was built.**
- **Learning Journal** panel with three reading levels (Simple, Practical, Deeper). The level is saved under `patchbay.journal.v1`. It has these parts:
  - **Application overview**
  - **How things flow:** page, request, route, and setting traces that stop with a plain reason
  - **Lessons from your project**
  - **Concepts:** 12 cards
  - **Download**
- All teaching text is in one playbook file, `src/skillbook/playbook.ts`: 30 cards (12 concepts, 17 checks, 1 sorting card) with tags, keywords, and lookups ready for Phase 3.
- **Open in viewer** jumps to a file and line in the Source viewer. **Learn more** on a Screen 5 finding opens its lesson.
- **Export changes** (History panel) downloads a git patch of your applied changes. Practice-run files are unchecked by default. Partly read files, odd paths, likely secrets, and patches that fail their own check are excluded, each with a reason.
- **Log** downloads (Markdown and JSON, redacted) and a **Journal** download.

**Files.** Created:
- `src/config/journalLimits.ts`
- `src/skillbook/{playbookSchema,playbook,playbookLookup}.ts`
- `src/journal/{lessonRules,packageFacts,overview,flows,journalModel}.ts`
- `src/export/{diffLines,unifiedDiff,patchExport,logExport,journalExport,exportName,download}.ts`
- `src/store/{journalPrefs,exportActions}.ts`
- `src/hooks/useJournal.ts`
- 11 components (`JournalPanel`, `LevelPicker`, `OverviewSection`, `FlowsSection`, `LessonsSection`, `ConceptsSection`, `JournalDownload`, `ExportChanges`, `LogExportButtons`, `ExportButton`, `Fold`)
- 16 test files, plus a new independent test applier `tests/helpers/applyHunks.ts`

Changed: `HistoryPanel`, `LogPanel`, `FindingDetail`, `DomainScreen`, `StudioLayout`, `App`, `SandboxPanel` and `previewHandle.ts` (for Open in viewer), `workSlice.ts` (see deviations), `styles.css`, and docs. Deleted: `PlaceholderPanel.tsx` (approved).

**Results.**
- 79 files, 1,582 tests. Build 671.40 kB (207.44 kB gzip). Most of the growth is lesson text.
- 27 of 27 mutations killed. Five survived at first; new tests now kill them.
- The design's worked patch example is reproduced exactly. Every diff applies with two independent appliers and reverses exactly.
- **`git apply`:** downloaded patches applied with `git apply --check`, `git apply`, and `patch -p1 --dry-run` in throwaway repositories for four projects: the fixture (crew fix plus Edit pad change) and the static, React, and full-stack samples.
- Browser run 34 of 34.
- The review found no secret leak (sentinel probes) and ran about 7,000 patches against real `git apply` with zero failures. 8 of 11 findings fixed:
  - Open in viewer opened the wrong line on "uses" steps.
  - The Journal showed an all-clear when no scan had run.
  - The Journal header was not redacted.
  - Size caps now count bytes and stop at the first file that does not fit.
  - The download helper now cleans up after a failure.
  - The diff memory is banded (it was about 900 MB on a full 20,000-line rewrite).
  - The lesson focus is kept while the Journal builds.
  - One lesson wording was changed (see below).

**Deviations.**
- Open in viewer is new (2E-1 had not built it).
- Undo now closes the Edit pad key (`#u`) instead of removing it, so an undone and redone edit is still exported as **Your edits**. One 2E-2 test assertion was updated for this.
- Learn more is on Screen 5 only (Screen 4 has no finding detail).
- The test file names differ from the design; the list is in `PLAN.md` "F9 as built".

**Known limits.**
- Journal lines can drift after edits, because the analysis is not re-run.
- The viewer marks the line but does not scroll to it.
- Files that mix CRLF and LF fail the patch self-check and are excluded with "could not be verified".

**Needs your review.** All 30 lesson cards are written data, as the spec says. One wording was changed after the code review: the SQL lesson, Deeper level, now says "the database reads the values as data, not as part of the command".

**Unverified.** The patch's secret exclusion in a browser. No UI path can create such a change (2D and 2E-2 refuse it), so it is proved by unit tests only.

## 2G. Session restore

**What was built.** A refresh is harmless.
- A small record, `patchbay.session.v1`, holds only the repository address, the screen, the Sandbox width, mode, and page, and two notes. It is checked by a strict schema and capped at 4 KB.
- After a refresh the Loading screen says **Restoring your session** and loads the repository again. Then it puts back:
  - the screen and the Sandbox settings
  - the layout
  - History and edits
  - the Log
  - a paused practice run
  - label corrections
  - the reading level
- **Not restored, on purpose:** a crew run in progress and Preview Only changes (the Log says so for both), plus the selection, scripts-on, and AI Chat text. The scan runs again.
- **Failures** (offline, rate limited, private repository, timeout) keep everything and offer Retry, Reset session, and Back to Start.
- **Cancel** goes to Start with **Resume last session**.
- **Back to Start** forgets only the session record.
- **Reset session** asks first, then deletes the session, History, Log, and corrections, and keeps the layout and reading level.
- **Saved in this browser** lists the five saved parts with their sizes.

**Files.** Created:
- `src/config/sessionLimits.ts`
- `src/store/{sessionRecord,sessionStore,sessionActions,sessionPersistence}.ts`
- `src/hooks/useSessionRestore.ts`
- `src/components/{ResumeBanner,SavedDataPanel,ResetSessionButton,RestoreNotice}.tsx`
- 11 test files and 2 test helpers (`sessionHarness`, `sessionFakes`)

Changed: `useIngestion.ts` (adds `restore`), `StartScreen`, `LoadingScene`, `ProjectInfo`, `StudioLayout`, `DomainScreen` (starts the scan on Screen 5), `App`, `styles.css`, docs. The only existing test changed is `tests/useIngestion.test.ts`, which gained an appended block.

**Results.**
- 92 files, 1,666 tests. Build 684.48 kB (211.65 kB gzip).
- 22 mutations killed, 1 equivalent.
- **Store-level exit tests:**
  - A refresh matrix of 18 scenarios.
  - 3 seeds × 1,000 random actions over 26 controls, with a refresh every 50 actions. Each seed made 15 or 16 full state comparisons and the invariants were checked after every step.
  - A storage privacy test. It ran secret, AI, preview, and snippet sentinels and found only the five keys and no file contents outside the 2B History diffs.
- **Browser refresh matrix: 49 of 49.** Every scenario in requirements section 6, item 14 passed, including each panel, the Sandbox width and page, Screens 4 and 5, crew fix, Edit pad change, practice proposal, moved branch, Back to Start, Reset with confirmation, offline, 429 with reset time, private repository, server timeout, Retry, Cancel then Resume, invalid record, blocked storage, and rapid clicks with reloads. Storage was dumped and checked after each scenario.
- The review found 2 defects, both fixed with tests:
  - React's StrictMode double effect cancelled the startup restore in development. The restore now starts after the mount settles.
  - The saved folder scope came from the last attempted load. It now comes from the load that actually completed.

**Deviations.**
- A session `retry()` was added: the ingestion retry starts an unrelated run.
- The component is saved as `path#Name`.
- The Screen 5 scan start is proved by a store test, a source check, and the browser, because effects do not run in the server-render tests.

**Known limits.**
- Two tabs overwrite each other; the last write wins.
- A branch that moved drops your changes to files that changed.
- Every refresh downloads the repository again, so GitHub limits apply. Samples cost nothing.
- A repository whose 2B slot is held by another repository's real work does not get its Log back. This is the earlier 2E-1 rule that protects saved work.

**Unverified.**
- The StrictMode fix in a real dev-server browser. The dev server cannot run here, and the built app has no double effect.
- A real network timeout of 30 seconds or more. The server's timeout error was simulated.
- Real GitHub.

---

## Phase 2 exit evidence (fresh, on the final build `feat/session-restore`)

Final gate:

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0, 0 errors |
| `npx vitest run` | 92 files, 1,666 tests passed |
| `npm run build` | 684.48 kB JS, 211.65 kB gzip |
| `npm audit` | 0 vulnerabilities |

All browser runs repeated on this one build, 251 checks in total, with zero app console errors in every run:

| Run | Checks |
|---|---|
| 2A | 28 of 28 |
| 2B | 47 of 47 |
| 2C | 24 of 24 |
| 2D | 25 of 25 |
| 2E-1 (isolation, hostile page) | 24 of 24 |
| 2E-2 | 20 of 20 |
| 2F | 34 of 34 |
| 2G | 49 of 49 |

The only browser network line came from the deliberately aborted offline request in 2G, and it is reported separately.

| Gate | Evidence on the final build | Status |
|---|---|---|
| **Phase 2 (original): every interactive control updates state predictably** | Every sub-phase run clicks its own controls: panels, collapse, width, screens, commands, Stop, Approve, Reject, Undo, Redo, scan, Start Crew, Sandbox width, mode, page and scripts, Edit pad, Journal level, exports, Reset, Resume. The rapid-action test drives 26 controls 3,000 times, checking invariants after every step. | Verified |
| **Phase 2: state survives a page refresh** | Refresh matrix (18 scenarios); 2G browser matrix 49 of 49 with real reloads | Verified |
| **Phase 2: rapid repeated clicks without desync or crash** | 2A 50 and 51 rapid presses; 2B rapid Approve, Reject, Stop; 2G 3 rounds of 40 rapid clicks with reloads; 60 store-level refreshes across 3,000 random actions | Verified |
| 2A: panels and screens as specified, layout saved | run2a 28 of 28 | Verified |
| 2B: commands, one proposal at a time, Undo and Redo, work saved and restored | run2b 47 of 47; 2G refresh matrix | Verified |
| 2C: honest labels, Needs Review, connections, corrections saved | run2c 24 of 24; 2G corrections scenario | Verified |
| 2D: checks with proof, no scores, crew fixes only after approval | run2d 25 of 25; crew fix in run2f and run2g | Verified |
| 2E-1: the preview cannot reach PatchBay or the network | run2e1 24 of 24 with the hostile page | Verified, except WebRTC and data:/blob: navigation (not probed) |
| 2E-2: only the practice copy changes, unmapped changes never reach code, every change can be undone | run2e2 20 of 20; refresh matrix Edit pad scenario | Verified |
| 2F: Journal and exports read state only, patches apply with `git apply`, no secrets in exports | run2f 34 of 34 (git apply on 4 projects); phase2Flow test | Verified |
| 2G: refresh returns to the same screen with the same work; no secrets or file contents in storage; a failed reload shows a clear error and a reset path | run2g 49 of 49; refresh matrix, rapid actions, storage privacy | Verified |

**Recommendation.** Phase 2 meets its exit gate with the evidence above. The Unverified items are listed in each section, and none of them blocks the gate. If you agree, you can change `Current Active Phase` to Phase 3 in `.kiro/steering/build-phases.md`. I have not changed it.

## Where to look

- Code: branch `feat/session-restore` on `ghost527oss/work-of-art` (contains every sub-phase).
- Specs: `.kiro/specs/03-studio-shell` to `.kiro/specs/10-session-restore`.
- As-built notes per node: `traceability/PLAN.md` ("F3 as built" to "F10 as built").
- User guide: `README.md`, one section per sub-phase.
