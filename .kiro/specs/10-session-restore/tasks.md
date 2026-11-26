# Tasks: 10 Session Restore (Phase 2, Sub-phase 2G)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2G-SESSION` and the F10 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2G** (PatchBay's own screens black-and-white wireframe, no animation, `AI_MODE=mock` only). **These tasks start only after 2A to 2F are built and you have advanced the active sub-phase to 2G.**

Task ids are **K1 to K9**, so they cannot be confused with T, M, S, B, C, D, E, P, or J (earlier specs).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F10.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network, `fetch`, AI, `mockAssistant`, `aiAssistant`, or `useAssistant` import in any 2G file. The only network use is the existing ingestion path that `restore` starts. No `innerHTML`, `eval`, `new Function`, or `dangerouslySetInnerHTML`.
- **The session record holds an address and a view, never contents.** No file content, secret, token, key, instruction, snippet, selection, or scripts-on state may be written to any saved part. Tests use sentinels to prove it.
- Do not touch the files in design section 4.3. The files in design section 4.2 may change **only** as described there. The 2E-1 isolation files stay unchanged.
- The control names of earlier sub-phases (`pvWidth`, `pvMode`, `pvEntry`, `pvComponent`, `ensure`, `openSkeleton`, `openDomain`, and so on) are used through their as-built names. If a name differs from the spec, the task adapts the call and the report says so. No behavior of an earlier sub-phase changes.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

The spec on `spec/10-session-restore`, code on `feat/session-restore` from the spec branch, **one commit per task**, a pull request after K9.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| K1 | F10.1 | Limits, the record, storage helpers, the saved-data inventory | 2A (layout store), 2B (`repoKeyOf`) |
| K2 | F10.2 | The restore store and the reset action | K1 |
| K3 | F10.3 | The persistence subscriber | K1, K2 |
| K4 | F10.4 | `ingestion.restore`, the controller, apply, Back to Start, Reset session | K1, K2, K3, 2C (C8), 2E-1, 2E-2 |
| K5 | F10.5 | The scan also starts on Screen 5 | 2D (D9, D11) |
| K6 | F10.6 | The new components | K1, K2 |
| K7 | F10.7 | Wiring and the restore integration test | K4, K5, K6 |
| K8 | F10.8 | The Phase 2 exit tests (refresh matrix, rapid actions, privacy) | K7 |
| K9 | F10 | Final gate, browser refresh matrix, Phase 2 exit evidence, independent review | K1 to K8 |

---

## K1. Limits, the record, storage helpers, and the saved-data inventory
- **plan_id:** P2G-SESSION  **node_id:** F10.1
- **scope:** `src/config/sessionLimits.ts`, `src/store/sessionRecord.ts`, `tests/sessionRecord.test.ts`, `tests/sessionBuild.test.ts`, `tests/savedData.test.ts`
- **goal:** Build design sections 5, 6, and 7.1: `SessionRecordSchema`, `validateTarget`, `toIngestTarget`, `loadSession`, `saveSession`, `clearSessionRecord`, `clearAllSession`, `describeSavedData`, and `buildSessionRecord`.
- **acceptance:**
  - **Schema:** a valid GitHub record, a scoped GitHub record, and a sample record round-trip. Each bad variant is rejected with no throw: missing field, bad JSON, over 4 KB, wrong version, unknown field (including at every nesting level), a bad owner or repository or ref (each validator from `repoUrl.ts`), more than 20 or unsafe or over-long folders, an unknown sample id, a bad width, a bad mode, an unsafe page, a bad component, a bad area, a `domain` screen without an area, a `studio` screen with an area, and `previewOnlyCount` outside 0 to 50. No schema key name contains `token`, `key`, `secret`, `password`, or `auth` (checked over the schema's shape).
  - **Storage helpers:** `loadSession` returns `null` for missing, throwing, blocked, or bad data; `saveSession` writes only the record text (at most 4 KB) and never throws; `clearSessionRecord` removes only `patchbay.session.v1`; `clearAllSession` removes exactly `patchbay.session.v1`, `patchbay.work.v1`, and `patchbay.corrections.v1` and nothing else (a recording storage fake sees only those three removals); all of them survive blocked and throwing storage.
  - **`toIngestTarget`:** a GitHub record gives `{ owner, repo, ref, scope, source: 'github' }`; a sample gives `{ owner: 'sample', repo: id, source: 'sample', sampleId }`.
  - **Building:** `buildSessionRecord` for a GitHub load, a scoped load, and a sample load; the mode is saved only when `chosenBy` is `user`; the page only when it differs from the detected page; the component only when set; the screen from the view; `crewWasActive` from a crew run that is running, paused, or waiting (and false for a finished or stopped one, or a practice run); `previewOnlyCount` from the list; **`null`** for the Start and Loading experiences, for no snapshot, for a running foreground or background load, and for a pending or applying restore. `savedAt` is not part of the built value.
  - **Inventory:** `describeSavedData` returns exactly the five rows of design section 6 in that order, with the fixed descriptions, the byte length of each stored text or "nothing saved", and never any stored value.
  - `sessionLimits.ts` holds the design values and `provisional: true`.
  - The files import nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/sessionRecord.test.ts tests/sessionBuild.test.ts tests/savedData.test.ts`

## K2. The restore store and the reset action
- **plan_id:** P2G-SESSION  **node_id:** F10.2
- **scope:** `src/store/sessionStore.ts`, `src/store/sessionActions.ts`, `tests/sessionStore.test.ts`
- **goal:** Build design sections 5 (`SessionStoreState`), 8.1, and 9 (`resetSessionState` and the Log lines).
- **acceptance:**
  - Every transition in the design diagram, and each ignored case: a run id that is not the pending one changes nothing (same object); `begin` while already `pending` is ignored; `applied` before `loaded` is ignored; `reset` clears the record and returns to `idle`; `failed` and `cancelled` keep the record.
  - `resetSessionState(state)` equals the initial state except for the ingestion run counter, which is kept; the log and its counter are empty; the experience is `start`; every slice (`ai`, `work`, `understanding`, `scan`, `preview`, `edit`) is idle; the input is not mutated (deep freeze).
  - The Log lines `session_restored` ("Session restored: <owner/name>, screen <3, 4, or 5>."), the crew note ("The Skeleton Crew run was not restored. Start it again with Start Crew."), the Preview Only note ("<n> Preview Only changes were not restored."), and the mode note ("The saved preview mode is not available, so the automatic mode was used.") have the exact text and hold names and counts only (sentinel tests for a snippet and a secret fixture).
  - The store is plain data that survives `JSON.parse(JSON.stringify(...))`.
  - The files import nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/sessionStore.test.ts tests/store.test.ts`

## K3. The persistence subscriber
- **plan_id:** P2G-SESSION  **node_id:** F10.3
- **scope:** `src/store/sessionPersistence.ts`, `tests/sessionPersistence.test.ts`
- **goal:** Build design section 7.2.
- **acceptance:**
  - With fake stores and a recording storage: nothing is written on the Start or Loading experiences, while a foreground or background load runs, or while the restore is `pending` or `applying`; one write happens when a snapshot first becomes visible in the Studio; a repeated notification with unchanged content writes nothing; a change of screen, width, chosen mode, chosen page, component, scope, or notes writes once; a change that does not affect the record (selection, panel layout, console line, scan result) writes nothing.
  - **Rapid sequence:** 200 navigation and setting changes (with repeats and reversals) produce at most one write per distinct content, and the stored text is always valid.
  - `savedAt` changes only when the content changes.
  - It never deletes or changes the record when the app is on Start or a restore failed.
  - Blocked and throwing storage never throw and never stop later writes from being tried.
  - The returned unsubscribe function releases all three subscriptions (counted).
  - The file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/sessionPersistence.test.ts`

## K4. `ingestion.restore`, the controller, apply, Back to Start, and Reset session
- **plan_id:** P2G-SESSION  **node_id:** F10.4
- **scope:** `src/hooks/useIngestion.ts` (add `restore` only), `src/hooks/useSessionRestore.ts`, `src/store/previewSlice.ts`, `src/store/previewActions.ts`, `src/hooks/usePreview.ts` (**only** to add or expose `pvComponent` if the as-built code has no way to set the picked component), `tests/sessionApply.test.ts`, `tests/sessionReset.test.ts`, `tests/useIngestion.test.ts` (**append new tests for `restore` only**)
- **goal:** Build design sections 8 and 9.
- **acceptance:**
  - **`restore`:** a valid GitHub or sample target starts a foreground load with the right `IngestTarget` (fake services); an invalid target (a bad owner, a folder with `..`, an unknown sample) starts nothing and returns the message; the existing `useIngestion` tests pass unedited.
  - **Startup:** with a valid record and the Start experience, `startup()` begins once and starts the load; a second call and a second controller built over the same stores in the same tick (React's double effect) start nothing more; with no record, a bad record, or a non-Start experience it does nothing.
  - **Completion:** after the fake load completes, the controller moves `pending` to `applying`, applies the screen (`skeleton`, `domain` with its area, `studio`; an invalid area falls back to the Studio screen), waits for the preview slice to be initialised and then applies the width, the mode (only when possible, else the mode note), the page (only a known HTML page), and the component (only a known one); writes `session_restored` and the note lines for the notes; moves to `done`. The 3,000 ms timer applies the rest and finishes when the preview never initialises. Each part is applied once.
  - **Stale and wrong runs:** a completion of another run does nothing; a completion for a different repository key does nothing.
  - **Failure:** a failed load moves to `failed`; the record, the work slot, and the corrections slot are untouched (recording storage sees no write or removal); Retry through the existing retry restarts the same target and can succeed; no automatic retry.
  - **Cancel:** Cancel on the Loading screen moves to `cancelled`, keeps the record, and Resume starts the restore again.
  - **Back to Start:** calls `ingestion.backToStart()`, deletes only the session record, leaves the work and corrections slots, and resets the session store.
  - **Reset session:** aborts a running load, removes exactly the three keys, applies `resetSessionState`, resets the shell view, keeps the layout and reading-level keys, and sets the notice; a refresh after it (new controller over the same storage) finds no record.
  - The 2B `reset` command still clears only the current work (its tests pass unedited).
  - Everything is released on `dispose` (counted), and the controller can attach again after a dispose without a second startup.
  - The files import no `fetch`, AI, or `mockAssistant` module (source-text check).
- **verify:** `npm run typecheck && npx vitest run tests/sessionApply.test.ts tests/sessionReset.test.ts tests/useIngestion.test.ts tests/previewState.test.ts tests/previewController.test.ts`

## K5. The scan also starts on Screen 5
- **plan_id:** P2G-SESSION  **node_id:** F10.5
- **scope:** `src/hooks/useScan.ts` (no change unless needed), `src/components/DomainScreen.tsx` (call `ensure()` when it mounts), `tests/crewUi.test.tsx` and `tests/scanController.test.ts` (**only the assertion that the scan starts when Screen 4 opens**, extended to Screen 5)
- **goal:** Build requirements R3.5.
- **acceptance:**
  - Opening Screen 5 calls `ensure()` once (fake controller); it never runs on Screen 3 or during loading; a scan that already exists or is running is not started again.
  - Restoring directly to Screen 5 (store-level, fake services) ends with a finished scan and Screen 5 findings.
  - **The only test change** is the extension of the "scan starts when Screen 4 opens" assertion to Screen 5. The report shows the diff. Every other 2D test passes unedited.
- **verify:** `npm run typecheck && npx vitest run tests/crewUi.test.tsx tests/scanController.test.ts`

## K6. The new components
- **plan_id:** P2G-SESSION  **node_id:** F10.6
- **scope:** `src/components/ResumeBanner.tsx`, `SavedDataPanel.tsx`, `ResetSessionButton.tsx`, `RestoreNotice.tsx` (all in `src/components/`), `src/styles.css` (append the 2G block only), `tests/sessionUi.test.tsx`
- **goal:** Build design section 10 as components that take props only.
- **acceptance:**
  - With `react-dom/server`: `ResumeBanner` with a record (the text "Last session: owner/name at ref, saved <time>.", **Resume last session**, **Reset session**), without a record (nothing), and while a restore runs (nothing); `SavedDataPanel` with five rows (sizes and fixed descriptions) and with nothing saved ("nothing saved"), the privacy sentence, and the Reset button; no stored value appears.
  - `ResetSessionButton` shows the button first, and after the first press the exact confirmation text with **Yes, reset** and **Cancel** (state is passed in by props; the test renders both states); only **Yes, reset** calls `onReset`.
  - `RestoreNotice` shows the heading "Restoring your session", the line with the repository and ref, and, in failure, the kept-session sentence "Your saved session is kept until you press Reset session or Back to Start."
  - All text from the record (owner, repository, ref) appears escaped (a markup-looking owner is escaped).
  - No Apply, Approve, Reject, Pause, Resume, or Step button; no color other than `#000` and `#fff`; no `transition`; no `animation`; no `dangerouslySetInnerHTML`; every new file tagged `@node: F10.6`.
  - Real clicks are **not** claimed here. They are verified in K9.
- **verify:** `npm run typecheck && npx vitest run tests/sessionUi.test.tsx`

## K7. Wiring and the restore integration test
- **plan_id:** P2G-SESSION  **node_id:** F10.7
- **scope:** `src/components/StartScreen.tsx`, `src/components/LoadingScene.tsx`, `src/components/StudioLayout.tsx`, `src/components/ProjectInfo.tsx`, `src/App.tsx`, `src/styles.css` (only to fix a class from K6), `tests/sessionUi.test.tsx` (append wiring tests), `tests/sessionRestore.test.ts`
- **goal:** Build design sections 4.2 and 10: `App` calls `useSessionRestore(ingestion)` and `attachSessionPersistence`, composes the Back to Start and Reset session handlers, and passes the record and the controller actions down; the Start, Loading, and Studio components render the new parts.
- **acceptance:**
  - **The existing suite passes with no edit** apart from the tests named in K5, including the 2A, 2B, 2C, 2D, 2E-1, 2E-2, and 2F suites.
  - With a seeded store and `react-dom/server`: the Start screen shows the Resume banner and the saved-data block only when expected; the Loading screen shows the restore heading and Reset session while a restore is pending and the failure sentence on failure; the Studio header shows Back to Start and Reset session; the Project info shows the saved-data block; Screens 4 and 5 are unchanged.
  - **`tests/sessionRestore.test.ts`:** an end-to-end store-level restore with fake ingestion services over fake storage: build a session on the static sample (Screen 3, a chosen width, the Journal panel open), refresh, and check the Loading screen text, the Studio, the screen, the width, the layout, the Log line, and the saved record; the same for the full-stack sample on Screen 5 (area Backend) with a crew fix approved before the refresh (History restored, the finding gone after the scan), and for a scoped GitHub load (fake services check the request carried the scope).
  - Back to Start and Reset session handlers produce the effects in design section 9's table (slots checked in the fake storage).
  - `App`, `StartScreen`, `LoadingScene`, and `StudioLayout` import no engine module they did not need before, apart from types and the new components.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## K8. The Phase 2 exit tests
- **plan_id:** P2G-SESSION  **node_id:** F10.8
- **scope:** `tests/refreshMatrix.test.ts`, `tests/phase2Rapid.test.ts`, `tests/storagePrivacy.test.ts`, and a small shared test helper `tests/helpers/sessionHarness.ts` (fake storage that records every write and removal, a `refresh()` that rebuilds stores and controllers over the same storage, fake ingestion services for the three samples and a fixture project)
- **goal:** Build design section 11.1 to 11.3. No source files change in this task; if a test finds a bug, the task stops and the report proposes the minimal fix for your approval.
- **acceptance:**
  - **Refresh matrix:** every scenario in requirements section 6, item 8, with the comparison of the restorable state and the check of the non-restorable items and their Log lines, including: the Journal panel open on Screen 3; Screen 4 with a finished scan; each of the four Domain areas; a crew fix then a refresh; a paused practice run with a pending proposal; an Edit pad change with undo and redo; corrections; a scoped GitHub load; a sample; a failed restore then a successful Retry; a cancelled restore then Resume; an invalid record; blocked storage; a moved branch (a changed file: History discarded, the session restored).
  - **Rapid actions:** at least 1,000 seeded random actions over all the controls in R8.1 with a refresh every 50 actions, for three different seeds. After every step the invariants of the earlier specs hold; after every refresh the restorable state equals the pre-refresh state; the number of storage writes is at most the number of distinct record contents plus the writes of the earlier saved parts (each bounded by its own rule); no invalid record is ever stored.
  - **Privacy:** a full scripted session on the three samples and on a fixture with secret-looking lines (with instructions typed into AI Chat, a preview built, an export made, and findings scanned) writes only the five keys; no stored value contains any trimmed line of at least 8 characters from any loaded file, any secret fixture (`ghp_` plus 36 characters, an AWS key id, a private-key header), the instruction sentinel, any HTML from a preview document, any snippet line, or any forbidden key name; the sizes are within the caps (session at most 4 KB).
  - The helper never reads real browser storage and uses fake timers.
- **verify:** `npm run typecheck && npx vitest run tests/refreshMatrix.test.ts tests/phase2Rapid.test.ts tests/storagePrivacy.test.ts`

## K9. Final gate, browser refresh matrix, Phase 2 exit evidence, and independent review
- **plan_id:** P2G-SESSION  **node_id:** F10
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts, fixture repositories, and screenshots live outside the repo and are deleted afterwards. `README.md` (a short section on saving and resetting a session) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase, then prove Phase 2.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2F baseline.
  2. Static checks: no new dependency; no network, AI, or `mockAssistant` import in any 2G file; none of `innerHTML`, `eval`, `new Function`, or `dangerouslySetInnerHTML`; the 2E-1 isolation files unchanged; every new file tagged; the diff of existing tests shows only the named ones.
  3. Mutation checks (break, see tests fail, restore): the write-only-on-change rule, each save gate (load running, restore pending, Start screen), the record schema bounds and the forbidden key names, the run-id check, the once-per-page-load start, the apply order and the 3,000 ms finish, each fallback and its Log line, the cancel and failure keep-the-record rules, the exact set of keys cleared by Back to Start and by Reset session, the confirmation requirement, the preferences being kept, and the privacy test's sentinels.
  4. **Browser refresh matrix (headless Chromium, built app, real reloads)** of every item in requirements section 6, item 14, with the dev server's `/api/repo` and request interception for the failure cases (offline, a `429` with a reset time, a `404` for a private repository, a timeout). Include rapid clicking with reloads. Dump the browser storage after each scenario and check it against the privacy rules. Record zero console errors in each run.
  5. **Phase 2 exit evidence (acceptance item 15):** re-run the 2A, 2B, 2C, 2D, 2E-1 (with the isolation attack page), 2E-2, and 2F browser runs on the final build, and give a table mapping the original Phase 2 gate and each sub-phase gate (2A to 2G) to fresh command output and run results. Mark anything not verified as **Unverified** with the reason.
  6. Independent behavioral review with `semantic_reviewer`, focused on anything that could store a secret or file content, a restore that could apply to the wrong repository, a way to lose saved work without a confirmation, and the 2G scope rules. Fix findings only with your approval.
  7. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the sixteen acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2G passes its gate and whether Phase 2 as a whole passes its exit gate, with the evidence table. Advancing `Current Active Phase` to Phase 3 stays your decision, and I will not change that line.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 The session record | K1, K3 |
| R2 Automatic restore on page load | K2, K4, K6, K7 |
| R3 What is restored, and what is not | K4, K5, K7, K8 |
| R4 When the repository cannot be loaded again | K4, K6, K7 |
| R5 Back to Start, Reset session, and Resume | K2, K4, K6, K7 |
| R6 Saved in this browser | K1, K6, K7 |
| R7 Privacy and secrets | K1, K8 |
| R8 Rapid actions and consistency | K3, K8 |
| R9 Wiring into earlier specs | K4, K5, K7 |
| R10 Safety, privacy, and resources | K1 to K8, K9 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Record | K1 |
| 2. Record building | K1 |
| 3. Persistence | K3 |
| 4. State machine | K2, K4 |
| 5. Apply | K4 |
| 6. Reset and Back to Start | K4 |
| 7. Saved-data panel | K1, K6 |
| 8. Refresh matrix | K8 |
| 9. Rapid actions | K8 |
| 10. Privacy | K8 |
| 11. Components | K6, K7 |
| 12. Static checks | K1 to K8, K9 |
| 13. Regression | K5, K7, K8, K9 |
| 14. Browser matrix | K9 |
| 15. Phase 2 exit evidence | K9 |
| 16. Phase 2G gate | K9 |

## Questions

1. **Requirements questions 1 to 11** at the end of `requirements.md` (also written out in the chat message).
2. **Branch pattern** for code: same as before. Confirm or change.
3. **Approval of the spec**, and then, once 2A to 2F are built and you advance the active sub-phase to 2G, your explicit "Go" naming **K1**.

---

## Build report (sub-phase 2G, as built)

Copied from `PHASE_2_REPORT.md` at the repository root, which also has the summary table and the Phase 2 exit evidence. Numbers are real command output; **Unverified** items say why.


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
