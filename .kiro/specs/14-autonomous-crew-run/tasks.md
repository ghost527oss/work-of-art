# Tasks: 14 Autonomous Crew Run v2 (Phase 3, Sub-phase 3B-3)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P3B3-AUTONOMOUS-RUN` and the F14 nodes in `traceability/PLAN.md`. Active product phase: **Phase 3, Sub-phase 3B-3** (PatchBay's own screens stay black-and-white wireframe, no animation, `AI_MODE=mock` stays the default). **Batch "Go" for all of 3B-3 (A1 to A14, in order) was given by you on 2026-11-27.** It covers only this plan and scope, not 3B-2.

Task ids are **A1 to A14**, so they cannot be confused with T, M, S, B, C, D, E, P, J, K, L (earlier specs), V (3B-1), or R (3B-2).

## How each task runs

1. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F14.x`.
2. Run the task's verify command after the last edit and report the real exit code and counts. Commit the task (one commit per task).
3. With a batch Go: write a short progress note (task, commit, verify result) and continue with the next task.

**What stops the batch (I stop and ask you, and write nothing more until you answer):**
- Two consecutive verify failures on the same error (2-strike rule): I hand a read-only diagnosis to `bug-auditor` and wait.
- A task needs a file outside its scope, a new dependency, a change to a file in design 4.4, or a weakened existing assertion. (Changes listed in design 4.3 are approved: numbers, lists, and exact strings only.)
- The Sandbox cannot supply a measurable frame on the Skeleton Crew screen (design 6.1).
- A real conflict between this spec and the code that I can't resolve by adapting a call name.
- Anything that would delete or overwrite a file I did not create in this work.
- A privacy, sandbox, or "AI never approves" test fails in a way that suggests the design (not just the code) is wrong.
After A14 the batch ends. I report and return to `[MODE: DISCUSSION]`.

Rules for every task:
- **No new dependency.** Runtime dependencies stay `acorn, react, react-dom, zod`.
- No `eval`, `new Function`, `innerHTML`, or `dangerouslySetInnerHTML` in `src/`. All text is rendered as React text.
- **No AI text, question text, file text, quote, key, or provider error text** in the Log, History (diffs excepted), storage, the bookmark, errors, or exports. Tests use sentinel values.
- **One new storage key only** (`patchbay.run.v1`, A11), plus `runId` on saved History entries. No other new storage.
- New CSS uses only `#000` and `#fff`, no `transition`, no `animation`.
- Browser code never imports `src/engine/live/`. Provider calls stay in `providers.ts`.
- Keep `AI_MODE=mock` working at every task.
- `scripts/traceability/*` do not exist. Approval is recorded in this chat. The checks are the `npm` commands.
- I do not change `Current Active Phase` again and do not start 3B-2.

## Branch and commits

Spec on `spec/14-autonomous-crew-run` (from `feat/3b-1-checks-linter`). Code on `feat/3b-3-autonomous-run` from the spec branch, **one commit per task**, a pull request after A14. If pull request #7 (3B-1) is merged first, I rebase onto `main` before the pull request and say so.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| A1 | F14.1 | Limits files; History 120, diffs 4,000, saved-data cap 768 KiB; `runId` on History | 3B-1 |
| A2 | F14.2 | 429 wait-time passthrough (providers, router, `api/assistant.ts`, contracts, browser error) | 3A |
| A3 | F14.3 | Audit contracts: `audit` task, `audit_findings`, `measured` field, validator, prompt, server quote check, mock, view | A1 |
| A4 | F14.4 | Audit engine: file ranking, window request builder, browser quote check, AI-found findings, skill and card | A3 |
| A5 | F14.5 | Queue builder (pure) and in-memory run state | A1, A4 |
| A6 | F14.6 | Run-level undo (all or nothing) and the run-aware merge rule | A1 |
| A7 | F14.7 | Keep-or-undo decision and Autopilot apply, re-check, undo | A5, A6 |
| A8 | F14.8 | Run controller: auto-measure at Start, fix stage, Review, Stop, dispose | A5, A7 |
| A9 | F14.9 | Recipe stage and AI stage (static, visual, AI-found; queue-owned requests) | A8, A2, A3 |
| A10 | F14.10 | Audit stage, wait and resume, quota states | A2, A4, A9 |
| A11 | F14.11 | Run bookmark, Resume run, saved-data row, Reset | A8, A10 |
| A12 | F14.12 | Run panel, summary, labels (wireframe UI) | A8 to A11 |
| A13 | F14.13 | Privacy, static, hostile-input, and exit-gate tests | A1 to A12 |
| A14 | F14 | Final gate: full suite, build, browser run, mutation checks, review, report | A1 to A13 |

---

## A1. Limits, history 120, diffs 4,000, saved-data cap, `runId`
- **node_id:** F14.1
- **scope:** `src/config/crewRunLimits.ts`, `src/config/auditLimits.ts`, `src/config/workLimits.ts`, `src/config/aiLive.ts`, `src/store/workSlice.ts`, `src/store/workStorage.ts`, `tests/crewRunLimits.test.ts`, `tests/auditLimits.test.ts`, `tests/workStorage.test.ts`, `tests/workState.test.ts`, `tests/sessionRestore.test.ts`, `tests/aiLiveConfig.test.ts`, `tests/commands.test.ts`, `tests/aiStatic.test.ts`
- **do:** limits of design 4.1; `maxHistoryEntries` 120; `maxDiffChars` and `AI_LIVE.maxProposalDiffChars` 4,000 (free-fix caps stay 2,000); `maxSavedBytes` 768 KiB; optional `runId` on `HistoryEntry` and the saved History schema; a test that 120 entries of 4,000 characters (worst case, with quotes and newlines escaped) save, load, and replay; a record still too big is skipped with the Log note and the old record stays.
- **verify:** `npm run typecheck && npx vitest run tests/crewRunLimits.test.ts tests/auditLimits.test.ts tests/workStorage.test.ts tests/workState.test.ts tests/sessionRestore.test.ts tests/aiLiveConfig.test.ts tests/commands.test.ts tests/aiStatic.test.ts tests/scanFix.test.ts tests/checkLimits.test.ts`
- **done when:** old saved records without `runId` still load; a bad `runId` is rejected; the worst-case record fits.

## A2. 429 wait-time passthrough
- **node_id:** F14.2
- **scope:** `src/engine/live/providers.ts`, `src/engine/live/modelRouter.ts`, `src/engine/live/liveAssistant.ts`, `api/assistant.ts`, `src/types/contracts.ts`, `src/engine/aiAssistant.ts`, `src/store/aiActions.ts`, `src/store/aiSlice.ts`, `tests/waitPassthrough.test.ts`, `tests/liveProviders.test.ts`, `tests/liveAssistant.test.ts`, `tests/assistantApiLive.test.ts`, `tests/contracts.test.ts`, `tests/aiPrivacy.test.ts`, `tests/aiStatic.test.ts`
- **do:** read the providers' current public rate-limit documentation first (web check) and note the real header and body names in the report; implement design 10; clamp; combine across providers; add the `Retry-After` response header; copy the fields in `requestAssistant`; keep them in the failed AI state as numbers.
- **verify:** `npm run typecheck && npx vitest run tests/waitPassthrough.test.ts tests/liveProviders.test.ts tests/liveAssistant.test.ts tests/assistantApiLive.test.ts tests/contracts.test.ts tests/aiPrivacy.test.ts tests/aiStatic.test.ts`
- **done when:** a fake 429 with `Retry-After: 7` gives `retryAfterSeconds: 7`; a body sentinel never appears in the response; older answers still parse; a hostile `Retry-After: 99999999` is clamped.

## A3. Audit contracts and the server guard
- **node_id:** F14.3
- **scope:** `src/types/contracts.ts`, `src/engine/aiValidate.ts`, `src/engine/live/answerParser.ts`, `src/engine/live/promptBuilder.ts`, `src/engine/live/modelRouter.ts`, `src/engine/live/liveAssistant.ts`, `src/engine/mockAssistant.ts`, `src/engine/contextEngine.ts`, `src/engine/aiAssistant.ts`, `src/components/AIResponseView.tsx`, `src/components/AIAssistantPanel.tsx` (only if an exhaustive list needs the new value), and their tests: `tests/contracts.test.ts`, `tests/aiContracts.test.ts`, `tests/aiValidate.test.ts`, `tests/answerParser.test.ts`, `tests/promptBuilder.test.ts`, `tests/modelRouter.test.ts`, `tests/mockAssistant.test.ts`, `tests/aiResponseView.test.tsx`, `tests/auditGuard.test.ts`, `tests/aiStatic.test.ts`
- **do:** `audit` task (light tier); `audit_findings` response; optional `measured` request field (max 200, secret-checked, shown in a `MEASURED:` data block); server check of design 11 in `parseAnswer`; mock `audit` answer; a render branch that shows only a count in the AI panel; `audit` is not offered as a choice in the AI Chat task list.
- **verify:** `npm run typecheck && npx vitest run tests/contracts.test.ts tests/aiContracts.test.ts tests/aiValidate.test.ts tests/answerParser.test.ts tests/promptBuilder.test.ts tests/modelRouter.test.ts tests/mockAssistant.test.ts tests/aiResponseView.test.tsx tests/auditGuard.test.ts tests/aiStatic.test.ts tests/aiInjection.test.ts`
- **done when:** a good audit answer parses; wrong line, made-up quote, other path, short quote, punctuation-only quote, redacted quote, and over-cap lists are removed; no existing task or response behaviour changed.

## A4. Audit engine
- **node_id:** F14.4
- **scope:** `src/engine/audit/auditRank.ts`, `src/engine/audit/auditRequest.ts`, `src/engine/audit/auditVerify.ts`, `src/engine/scanFindingTypes.ts`, `src/skillbook/scanSkills.ts`, `src/skillbook/playbook.ts`, `src/engine/scanView.ts`, `tests/helpers/auditFixtures.ts`, `tests/auditRank.test.ts`, `tests/auditRequest.test.ts`, `tests/auditVerify.test.ts`, `tests/scanSkills.test.ts`, `tests/lessons.test.ts`
- **do:** ranking with area quotas and caps; window request builder (one file, at most 100 lines and 6 KiB, redacted, numbered, validated); browser quote check against the practice copy; `Finding` `origin`, `aiTitle`, `aiNote`; skill `scan.ai.possible-bug` and its lesson card ("Possible (AI)" wording); `mergedFindings` includes AI-found bugs; area from PatchBay's own file-to-area rule.
- **verify:** `npm run typecheck && npx vitest run tests/auditRank.test.ts tests/auditRequest.test.ts tests/auditVerify.test.ts tests/scanSkills.test.ts tests/lessons.test.ts tests/scanView.test.ts tests/aiStatic.test.ts`
- **done when:** same input gives the same chunks; no unloaded, truncated, minified, secret-path, or oversize file is chosen; every dropped quote is counted; AI-found findings never carry AI text into the Log or saved record.

## A5. Queue builder and run state
- **node_id:** F14.5
- **scope:** `src/engine/crewQueue.ts`, `src/store/crewRunState.ts`, `src/engine/practiceScript.ts`, `src/engine/crewScript.ts`, `tests/helpers/runFixtures.ts`, `tests/crewQueue.test.ts`, `tests/crewRunState.test.ts`, `tests/crewRun.test.ts`
- **do:** pure `buildCrewQueue` (stage choice for scan, visual, and AI-found origins, order, caps 60/15/35, guided list, skip reasons, "left out" counts); `CrewRunState` and transitions; fixed plain notes; summary builder; new `StepKind` values for the crew script only.
- **verify:** `npm run typecheck && npx vitest run tests/crewQueue.test.ts tests/crewRunState.test.ts tests/crewRun.test.ts`
- **done when:** the same findings build the same queue twice; order is fix, recipe, ai; each cap cuts and reports; mock mode and missing consent mark `ai` items skipped; no note can contain file or AI text.

## A6. Run-level undo
- **node_id:** F14.6
- **scope:** `src/store/runUndo.ts`, `src/store/workActions.ts`, `src/store/workSlice.ts`, `src/engine/commands.ts`, `tests/runUndo.test.ts`, `tests/workActions.test.ts`, `tests/commands.test.ts`, `tests/aiActionPolicy.test.ts`
- **do:** `planRunUndo` simulation; `undoRun` atomic apply; `undo run` command (never an AI action); `approve` and `applyUserEdit` stamp `runId` from the active crew run; merge never crosses runs.
- **verify:** `npm run typecheck && npx vitest run tests/runUndo.test.ts tests/workActions.test.ts tests/commands.test.ts tests/aiActionPolicy.test.ts tests/workState.test.ts`
- **done when:** undo reverts exactly the run's entries newest first; refuses with the exact reason after a later user change or hash mismatch and changes nothing; a recipe burst never merges into a user edit; Redo works one at a time afterward.

## A7. Keep-or-undo decision and Autopilot apply
- **node_id:** F14.7
- **scope:** `src/engine/runVerify.ts`, `src/store/workActions.ts` (an `autoApply` helper), `src/store/crewRunState.ts`, `tests/runVerify.test.ts`, `tests/autoApply.test.ts`, `tests/workActions.test.ts`
- **do:** `decideKeep` for scan, visual, and other findings (AI-found bugs are refused by design); `autoApply` through the real `approve` path, re-scan, optional wait for the re-measure with timeout, keep or undo; run cap switches to Review with a note.
- **verify:** `npm run typecheck && npx vitest run tests/runVerify.test.ts tests/autoApply.test.ts tests/workActions.test.ts`
- **done when:** a good change is kept; target-still-found, new-skill, new-visual-key, a worse width, and timeout are each undone; the undo is of the right entry; if the entry is no longer newest the run stops with a reason; an AI-found bug never reaches `autoApply`.

## A8. Run controller: auto-measure, fix stage, Review, Stop
- **node_id:** F14.8
- **scope:** `src/hooks/useCrewRun.ts`, `src/edit/previewHandle.ts`, `src/components/SandboxPanel.tsx`, `src/store/workActions.ts` (start and stop wiring), `src/engine/scanView.ts`, `tests/helpers/clockHarness.ts`, `tests/crewRunController.test.ts`, `tests/crewAutoMeasure.test.ts`, `tests/sandboxUi.test.tsx`, `tests/harnessController.test.ts`
- **do:** `createCrewRunController(store, services)` with injectable `now`, `setTimer`, `newId`; `start`, `setMode`, `stop`, `dispose`; the loop of design 6; the Sandbox hooks `checkAll`, `ensureMeasurable`, `canMeasureNow`; auto-measure at Start with the rules of R18; `doFix` for Review and Autopilot; Log actions.
- **verify:** `npm run typecheck && npx vitest run tests/crewRunController.test.ts tests/crewAutoMeasure.test.ts tests/crewRun.test.ts tests/harnessController.test.ts tests/sandboxUi.test.tsx tests/previewController.test.ts`
- **done when:** Review applies nothing without Approve; Reject changes nothing; Autopilot is never default; Start measures three widths itself when needed and never turns scripts on; a project with no previewable HTML skips visual stages and still runs; Stop mid-run leaves kept changes and nothing half done; `dispose` removes every timer and subscription.

## A9. Recipe stage and AI stage
- **node_id:** F14.9
- **scope:** `src/hooks/useCrewRun.ts`, `src/hooks/useRecipe.ts`, `src/hooks/useAssistant.ts`, `src/hooks/useAIHandoff.ts`, `src/engine/aiProposal.ts`, `src/store/aiProposalActions.ts`, `src/engine/visualMeasured.ts`, `src/engine/contextEngine.ts`, `tests/crewRecipeStage.test.ts`, `tests/crewAiStage.test.ts`, `tests/visualMeasured.test.ts`, `tests/aiProposal.test.ts`, `tests/aiProposalFlow.test.ts`, `tests/recipeController.test.ts`, `tests/aiActionPolicy.test.ts`
- **do:** recipe stage with its start conditions and skip reasons; AI stage for static, visual, and AI-found findings with eligibility, `queueOwned` (set only inside the controller), try accounting, the 3-attempt cap, the first-live-notice handling, mock and consent skips; the `measured` line for visual findings; no AI text anywhere.
- **verify:** `npm run typecheck && npx vitest run tests/crewRecipeStage.test.ts tests/crewAiStage.test.ts tests/visualMeasured.test.ts tests/aiProposal.test.ts tests/aiProposalFlow.test.ts tests/recipeController.test.ts tests/aiActionPolicy.test.ts tests/contextEngine.test.ts`
- **done when:** with fakes, a run goes fix, recipe, then AI in order; a visual AI fix that worsens a width is undone; a fourth try never happens; no answer field can set `queueOwned` or the mode; normal AI Chat still refuses while a run is active.

## A10. Audit stage, wait and resume, quota
- **node_id:** F14.10
- **scope:** `src/engine/waitPlan.ts`, `src/hooks/useCrewRun.ts`, `src/store/crewRunState.ts`, `tests/waitPlan.test.ts`, `tests/crewWait.test.ts`, `tests/crewAudit.test.ts`, `tests/crewRunController.test.ts`
- **do:** the audit stage (design 6.2); `planWait` per design 8; clock-based resume; `visibilitychange`; `paused_quota`; **Continue**; a bounded loop; audit consent and mock skips.
- **verify:** `npm run typecheck && npx vitest run tests/waitPlan.test.ts tests/crewWait.test.ts tests/crewAudit.test.ts tests/crewRunController.test.ts`
- **done when:** good quotes become "Possible (AI)" findings and bad ones are dropped and counted; `Retry-After: 7` waits, resumes, and finishes; a clock jump resumes at once; Stop during a wait leaves no timer; `day`, an over-300 s wait, three waits, or 900 s each end the right way; a randomised test proves the run always terminates.

## A11. Run bookmark and Resume run
- **node_id:** F14.11
- **scope:** `src/store/runStorage.ts`, `src/hooks/useRunResume.ts`, `src/hooks/useCrewRun.ts`, `src/store/sessionRecord.ts`, `src/hooks/useSessionRestore.ts`, `src/components/SavedDataPanel.tsx`, `tests/runStorage.test.ts`, `tests/runResume.test.ts`, `tests/storagePrivacy.test.ts`, `tests/savedData.test.ts`, `tests/sessionRecord.test.ts`, `tests/sessionReset.test.ts`, `tests/sessionUi.test.tsx`, `tests/aiStatic.test.ts`
- **do:** strict bookmark schema (4 KiB); save after each item and wait; clear on finish, Stop, Reset, and failed validation; `validateBookmark` (repo key, applied count, newest `afterHash`); **Resume run** (a click; same `runId`; Review; re-measure; remaining ids that still exist); sixth saved row; Reset removes it; Back to Start leaves it.
- **verify:** `npm run typecheck && npx vitest run tests/runStorage.test.ts tests/runResume.test.ts tests/storagePrivacy.test.ts tests/savedData.test.ts tests/sessionRecord.test.ts tests/sessionReset.test.ts tests/sessionUi.test.tsx tests/aiStatic.test.ts tests/sessionRestore.test.ts`
- **done when:** a valid bookmark offers Resume run; changed History, another repository, a damaged or oversize record is refused with a plain reason and removed; the saved text never contains file lines, a quote, a sentinel, or AI text; Autopilot is never saved; nothing starts by itself.

## A12. Run panel and summary
- **node_id:** F14.12
- **scope:** `src/components/CrewRunPanel.tsx`, `src/components/CrewRunSummary.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/StopBar.tsx`, `src/components/ChangesMade.tsx`, `src/components/HistoryPanel.tsx`, `src/components/CrewNarration.tsx`, `src/components/FindingDetail.tsx`, `src/styles.css` (only the new rules), `tests/crewRunUi.test.tsx`, `tests/crewUi.test.tsx`
- **do:** the wireframe UI of R13: Start, Deep Audit tick with the consent sentence, Autopilot confirm, Resume run, queue, current item, countdown, Stop, Undo this run, Continue, summary; "Possible (AI)" and "Run <id>" labels; empty, auditing, waiting, quota, and error text.
- **verify:** `npm run typecheck && npx vitest run tests/crewRunUi.test.tsx tests/crewUi.test.tsx tests/sandboxUi.test.tsx tests/findingDetail.test.tsx`
- **done when:** every run status has plain text; new CSS has only `#000` and `#fff` and no motion; only fixed phrases, paths, numbers, and the labelled AI title and note are shown.

## A13. Privacy, static, hostile, and gate tests
- **node_id:** F14.13
- **scope:** `tests/crewPrivacy.test.ts`, `tests/crewStatic.test.ts`, `tests/crewHostile.test.ts`, `tests/phase3b3Gate.test.ts`, `tests/helpers/fakeProviderServer.ts`
- **do:** sentinels for key, AI answer, audit quote and explanation, question, file text, provider error body, in Log, History, storage, bookmark, errors, summary, and exports; static checks (no live import in browser code, exactly one new storage key and one file that touches it, node tags, CSS rules, no `queueOwned`, `mode`, or `autopilot` in answer types); hostile audit answers and hostile `Retry-After`; the gate scenarios of requirements section 6.
- **verify:** `npm run typecheck && npx vitest run tests/crewPrivacy.test.ts tests/crewStatic.test.ts tests/crewHostile.test.ts tests/phase3b3Gate.test.ts`
- **done when:** every requirements section 6 item that can run in node has a passing test.

## A14. Final gate
- **node_id:** F14
- **scope:** (read and run; edits only to fix what the gate finds, with tests) `README.md`, `traceability/PLAN.md` ("F14 as built"), `PHASE_3B3_REPORT.md`, plus any file a gate finding requires
- **do:** `npx vitest run` (all earlier tests too), `npm run typecheck`, `npm run build`, `npm audit`; real-browser run with the fake provider server (all scenarios of requirements section 6, item 15); the 60 mutation checks of design 12; an independent review (`semantic_reviewer`); README section; PLAN as-built notes; plain-English report with the Unverified items and the reversible choices; push; open the pull request.
- **verify:** `npm run typecheck && npx vitest run && npm run build && npm audit`
- **done when:** all gates in requirements section 6 pass with evidence; every mutation is killed; review findings are fixed or listed; the report is written.
