# Tasks: 14 Autonomous Crew Run v2 (Phase 3, Sub-phase 3B-3)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P3B3-AUTONOMOUS-RUN` and the F14 nodes in `traceability/PLAN.md`. Active product phase: **Phase 3, Sub-phase 3B-3** (PatchBay's own screens stay black-and-white wireframe, no animation, `AI_MODE=mock` stays the default). **These tasks stay unstarted until you say "Go". No application code is written by this spec step.**

Task ids are **A1 to A11**, so they cannot be confused with T, M, S, B, C, D, E, P, J, K, L (earlier specs), V (3B-1), or R (3B-2).

## How each task runs

1. **Wait for your explicit "Go".** Either a "Go" naming one task, or a **batch "Go" for all of 3B-3** (A1 to A11, in order). A batch Go is one approval for this one plan and scope; it does not cover 3B-2 or anything outside the task scopes. Nothing is written before the first Go.
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F14.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts. Commit the task (one commit per task).
4. Check the diff against the scope myself and note what changed, the evidence, and anything **Unverified**. With a single-task Go, return to `[MODE: DISCUSSION]` and wait. With a batch Go, write a short progress note (task, commit, verify result) and continue.

**What stops a batch run (I stop and ask you, and write nothing more until you answer):**
- Two consecutive verify failures on the same error (2-strike rule): I hand a read-only diagnosis to `bug-auditor` and wait.
- A task needs a file outside its scope, a new dependency, a change to a file in design 4.4, or a weakened existing assertion.
- The Sandbox cannot stay mounted while the crew screen runs (design 14), so the recipe stage cannot work as specified.
- 2,000 characters proves too small for real AI patches (requirements decision 7).
- A real conflict between this spec and the code that I can't resolve by adapting a call name.
- Anything that would delete or overwrite a file I did not create in this work.
- A privacy, sandbox, or "AI never approves" test fails in a way that suggests the design (not just the code) is wrong.
After A11 the batch ends. I report and return to `[MODE: DISCUSSION]`.

Rules for every task:
- **No new dependency.** Runtime dependencies stay `acorn, react, react-dom, zod`.
- No `eval`, `new Function`, `innerHTML`, or `dangerouslySetInnerHTML` in `src/`. All text is rendered as React text.
- **No AI text, question text, file text, key, or provider error text** in the Log, History (except diffs as today), storage, errors, or the summary. Tests use sentinel values.
- No new browser storage key. The only saved addition is `runId` on History entries (A1, A4).
- New CSS uses only `#000` and `#fff`, no `transition`, no `animation`.
- Browser code never imports `src/engine/live/`. Provider calls stay in `providers.ts`.
- Do not touch the files in design 4.4. Existing tests change only as listed in design 4.3, and only numbers and exact strings.
- Keep `AI_MODE=mock` working at every task.
- `scripts/traceability/*` do not exist. Approval is recorded in this chat. The checks are the `npm` commands.
- I do not change `Current Active Phase` again and do not start 3B-2.

## Branch and commits

Spec on `spec/14-autonomous-crew-run` (from `feat/3b-1-checks-linter`, so 3B-3 can use the 3B-1 recipes). Code on `feat/3b-3-autonomous-run` from the spec branch, **one commit per task**, a pull request after A11. If pull request #7 (3B-1) is merged first, I rebase the 3B-3 branch onto `main` before the pull request and say so.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| A1 | F14.1 | Limits file, history cap 120, `runId` on History entries and saved record | 3B-1 |
| A2 | F14.2 | 429 wait-time passthrough: providers, router, `api/assistant.ts`, contracts, browser error | 3A |
| A3 | F14.3 | Queue builder (pure) and in-memory run state | A1 |
| A4 | F14.4 | Run-level undo (all or nothing) and run-aware merge rule | A1 |
| A5 | F14.5 | Keep-or-undo decision (pure) and Autopilot apply, re-check, undo | A3, A4 |
| A6 | F14.6 | Run controller: start, fix stage, Review mode, Stop, dispose | A3, A5 |
| A7 | F14.7 | Recipe stage and single-file AI stage (queue-owned requests) | A6, A2 |
| A8 | F14.8 | Wait and resume, quota states, clock and tab-sleep handling | A2, A7 |
| A9 | F14.9 | Run panel, summary, History labels (wireframe UI) | A6 to A8 |
| A10 | F14.10 | Privacy, static, hostile-input, and exit-gate tests | A1 to A9 |
| A11 | F14 | Final gate: full suite, build, browser run with fake providers, mutation checks, review, report | A1 to A10 |

---

## A1. Limits, history cap, `runId`
- **plan_id:** P3B3-AUTONOMOUS-RUN  **node_id:** F14.1
- **scope:** `src/config/crewRunLimits.ts`, `src/config/workLimits.ts`, `src/store/workSlice.ts`, `src/store/workStorage.ts`, `tests/crewRunLimits.test.ts`, `tests/workStorage.test.ts`, `tests/workState.test.ts`, `tests/sessionRestore.test.ts`, `tests/aiStatic.test.ts`
- **do:** add all limits of design 4.1 (provisional, one file); `maxHistoryEntries` 120; optional `runId` (`/^[a-z0-9-]{1,40}$/`) on `HistoryEntry` and the saved History schema; saved record limits follow the new cap and still obey `maxSavedBytes`.
- **verify:** `npm run typecheck && npx vitest run tests/crewRunLimits.test.ts tests/workStorage.test.ts tests/workState.test.ts tests/sessionRestore.test.ts tests/aiStatic.test.ts`
- **done when:** old saved records without `runId` still load; a bad `runId` is rejected; the 120 cap and byte cap both hold.

## A2. 429 wait-time passthrough
- **node_id:** F14.2
- **scope:** `src/engine/live/providers.ts`, `src/engine/live/modelRouter.ts`, `src/engine/live/liveAssistant.ts`, `api/assistant.ts`, `src/types/contracts.ts`, `src/engine/aiAssistant.ts`, `src/store/aiActions.ts`, `src/store/aiSlice.ts`, `tests/liveProviders.test.ts`, `tests/liveAssistant.test.ts`, `tests/assistantApiLive.test.ts`, `tests/contracts.test.ts`, `tests/waitPassthrough.test.ts`, `tests/aiPrivacy.test.ts`, `tests/aiStatic.test.ts`
- **do:** read the providers' current public rate-limit documentation first (web check) and note the real header and body names in the report; implement design section 11; clamp values; combine across providers (shortest wait; `day` only if all say day); add the `Retry-After` response header; copy the fields in `requestAssistant`; keep them in the failed AI state as numbers.
- **verify:** `npm run typecheck && npx vitest run tests/liveProviders.test.ts tests/liveAssistant.test.ts tests/assistantApiLive.test.ts tests/contracts.test.ts tests/waitPassthrough.test.ts tests/aiPrivacy.test.ts tests/aiStatic.test.ts`
- **done when:** a fake provider 429 with `Retry-After: 7` yields `retryAfterSeconds: 7`; a body sentinel never appears in the response; old answers without the fields still parse; a hostile `Retry-After: 99999999` is clamped.

## A3. Queue builder and run state
- **node_id:** F14.3
- **scope:** `src/engine/crewQueue.ts`, `src/store/crewRunState.ts`, `src/engine/practiceScript.ts`, `src/engine/crewScript.ts`, `tests/helpers/runFixtures.ts`, `tests/crewQueue.test.ts`, `tests/crewRunState.test.ts`, `tests/crewRun.test.ts`
- **do:** pure `buildCrewQueue` (stage choice, order, caps, guided list, skip reasons, "left out" counts); `CrewRunState` and transitions; fixed plain notes; summary builder; two new `StepKind` values for the crew script only.
- **verify:** `npm run typecheck && npx vitest run tests/crewQueue.test.ts tests/crewRunState.test.ts tests/crewRun.test.ts`
- **done when:** the same findings build the same queue twice; order is fix, recipe, ai; each cap cuts and reports; mock mode marks `ai` items skipped; nothing from file text or AI text can enter a note.

## A4. Run-level undo
- **node_id:** F14.4
- **scope:** `src/store/runUndo.ts`, `src/store/workActions.ts`, `src/store/workSlice.ts`, `src/engine/commands.ts`, `tests/runUndo.test.ts`, `tests/workActions.test.ts`, `tests/commands.test.ts`
- **do:** `planRunUndo` simulation; `undoRun` atomic apply; `undo run` command (never an AI action); `approve` and `applyUserEdit` stamp `runId` from the active crew run; merge never crosses runs.
- **verify:** `npm run typecheck && npx vitest run tests/runUndo.test.ts tests/workActions.test.ts tests/commands.test.ts tests/aiActionPolicy.test.ts`
- **done when:** undo reverts exactly the run's entries newest first; refuses with the exact reason after a later user change or hash mismatch and changes nothing; a recipe burst never merges into a user edit; redo works one at a time afterward.

## A5. Keep-or-undo decision and Autopilot apply
- **node_id:** F14.5
- **scope:** `src/engine/runVerify.ts`, `src/store/workActions.ts` (a small `autoApply` helper), `src/store/crewRunState.ts`, `tests/runVerify.test.ts`, `tests/autoApply.test.ts`
- **do:** `decideKeep` (design 7); `autoApply` that calls the real `approve` path, re-scans, optionally waits for the re-measure with a timeout, and keeps or undoes; run cap switches to Review with a note.
- **verify:** `npm run typecheck && npx vitest run tests/runVerify.test.ts tests/autoApply.test.ts tests/workActions.test.ts`
- **done when:** a good change is kept; target-still-found, new-skill, new-visual-key, and timeout cases are each undone; the undo is of the right entry; if the entry is no longer newest the run stops with a reason.

## A6. Run controller: start, fix stage, Review, Stop
- **node_id:** F14.6
- **scope:** `src/hooks/useCrewRun.ts`, `src/store/workActions.ts` (start and stop wiring), `src/engine/scanView.ts`, `tests/crewRunController.test.ts`, `tests/helpers/clockHarness.ts`
- **do:** `createCrewRunController(store, services)` with injectable `now`, `setTimer`, `newId`; `start(mode)`, `setMode`, `stop`, `dispose`; the loop of design 6; `doFix` for Review and Autopilot; Log actions of design 9.
- **verify:** `npm run typecheck && npx vitest run tests/crewRunController.test.ts tests/crewRun.test.ts tests/harnessController.test.ts`
- **done when:** Review applies nothing without Approve; Reject changes nothing; Autopilot toggles any time and never by default; Stop mid-run leaves kept changes and nothing half done; `dispose` removes every timer and subscription.

## A7. Recipe stage and AI stage
- **node_id:** F14.7
- **scope:** `src/hooks/useCrewRun.ts`, `src/hooks/useRecipe.ts` (`startRecipeFor`), `src/hooks/useAssistant.ts`, `src/hooks/useAIHandoff.ts`, `src/engine/aiProposal.ts`, `src/store/aiProposalActions.ts`, `tests/crewRecipeStage.test.ts`, `tests/crewAiStage.test.ts`, `tests/aiProposal.test.ts`, `tests/aiProposalFlow.test.ts`
- **do:** recipe stage with its start conditions and skip reasons; AI stage with eligibility, `queueOwned` (set only inside the controller), one try accounting, the 3-attempt cap, the first-live-notice handling, mock-mode skip; no AI text anywhere.
- **verify:** `npm run typecheck && npx vitest run tests/crewRecipeStage.test.ts tests/crewAiStage.test.ts tests/aiProposal.test.ts tests/aiProposalFlow.test.ts tests/recipeController.test.ts tests/aiActionPolicy.test.ts`
- **done when:** with fakes, a run goes fix, recipe, then AI in order; a fourth AI try for one finding never happens; no answer field can set `queueOwned` or the mode; the normal AI Chat hand-off still refuses while a run is active.

## A8. Wait and resume, quota
- **node_id:** F14.8
- **scope:** `src/engine/waitPlan.ts`, `src/hooks/useCrewRun.ts`, `src/store/crewRunState.ts`, `tests/waitPlan.test.ts`, `tests/crewWait.test.ts`
- **do:** `planWait` per design 8; clock-based resume; `visibilitychange`; `paused_quota`; Continue after a quota stop; bounded loop.
- **verify:** `npm run typecheck && npx vitest run tests/waitPlan.test.ts tests/crewWait.test.ts tests/crewRunController.test.ts`
- **done when:** `Retry-After: 7` waits, resumes, and finishes; a clock jump over `resumeAt` resumes at once; Stop during a wait leaves no timer; `day`, an over-300 s wait, three waits, or the 900 s total each end the right way; a randomised test proves the run always terminates.

## A9. Run panel and summary
- **node_id:** F14.9
- **scope:** `src/components/CrewRunPanel.tsx`, `src/components/CrewRunSummary.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/StopBar.tsx`, `src/components/ChangesMade.tsx`, `src/components/HistoryPanel.tsx`, `src/components/CrewNarration.tsx`, `src/styles.css` (only the new rules), `tests/crewRunUi.test.tsx`, `tests/crewUi.test.tsx`
- **do:** the wireframe UI of R13; Autopilot confirm; countdown text; empty, waiting, quota, error states; History "Run <id>" label; keyboard access and plain labels.
- **verify:** `npm run typecheck && npx vitest run tests/crewRunUi.test.tsx tests/crewUi.test.tsx tests/sandboxUi.test.tsx`
- **done when:** every status of R1.6 and every run status has plain text; new CSS has only `#000` and `#fff` and no motion; nothing but fixed phrases and paths is shown.

## A10. Privacy, static, hostile, and gate tests
- **node_id:** F14.10
- **scope:** `tests/crewPrivacy.test.ts`, `tests/crewStatic.test.ts`, `tests/crewHostile.test.ts`, `tests/phase3b3Gate.test.ts`, `tests/helpers/fakeProviderServer.ts`
- **do:** sentinels for key, AI answer, question, file text, provider error body; storage and Log scans; static checks (no live import in browser code, no new storage key, node tags, CSS rules, no `queueOwned`/`mode` in answer types); hostile answers and hostile `Retry-After`; the gate scenarios of requirements section 6.
- **verify:** `npm run typecheck && npx vitest run tests/crewPrivacy.test.ts tests/crewStatic.test.ts tests/crewHostile.test.ts tests/phase3b3Gate.test.ts`
- **done when:** every requirements section 6 item that can run in node has a passing test.

## A11. Final gate
- **node_id:** F14
- **scope:** (read and run; edits only to fix what the gate finds, with tests) `README.md`, `traceability/PLAN.md` ("F14 as built"), `PHASE_3B3_REPORT.md`, plus any file a gate finding requires
- **do:** `npx vitest run` (all Phase 2, 3A, 3B-1 tests too), `npm run typecheck`, `npm run build`, `npm audit`; real-browser run with the fake provider server (Review run, Autopilot with a forced bad patch undone, wait and resume, `paused_quota`, Undo this run, Stop, 375 px layout, console errors); the 35 mutation checks of design 12; an independent review (`semantic_reviewer`); README section; PLAN as-built notes; plain-English report with Unverified items; push; open the pull request.
- **verify:** `npm run typecheck && npx vitest run && npm run build && npm audit`
- **done when:** all gates in requirements section 6 pass with evidence; every mutation is killed; review findings are fixed or listed; the report is written.
