# Requirements: 14 Autonomous Crew Run v2 (Phase 3, Sub-phase 3B-3)

Sources: `PHASE_3B_IMPLEMENTATION_PLAN.md` (3B-3 and section 6); `Skeleton_Crew_Autonomous_Vision.md`; your answers of 2026-11-27 (build order 3B-1, 3B-3, 3B-2; "autonomous while open"; Review plus Autopilot; Undo whole run; single-file AI fixes with re-scan or re-measure and automatic undo; 429 wait-time passthrough from `api/assistant.ts`); steering `build-phases.md` (3B block); specs 04 (action harness), 06 (scanner and crew), 08 (Edit pad), 10 (session restore), 11 (live AI), 12 (checks, linter, recipes); the real code (`workSlice.ts`, `workActions.ts`, `crewScript.ts`, `useRecipe.ts`, `aiProposal.ts`, `useAIHandoff.ts`, `useAssistant.ts`, `liveAssistant.ts`, `modelRouter.ts`, `providers.ts`, `api/assistant.ts`, `workStorage.ts`).
Active product phase: **Phase 3, Sub-phase 3B-3**. PatchBay's own screens stay black-and-white wireframe with no animation. `AI_MODE=mock` stays the default and keeps working. Free tiers only. **No new runtime dependency.** Only the practice copy changes. Nothing is pushed to GitHub.

## 1. Purpose

Today the Skeleton Crew run is a short script. It narrates findings and, for a few fixable ones, proposes one change at a time that you approve. 3B-3 turns it into a **run that keeps working while the page is open**:

1. It builds a **queue** from the scan findings and works through it in a fixed order: first the free code fixes, then the free visual recipes, then (only if needed and only in live AI mode) single-file AI fixes. The AI is used last.
2. **Review** is the default: you approve each change, as today. **Autopilot** is one switch per run: PatchBay applies a change by itself, **only** after its own checks pass, re-checks the result, and undoes it automatically if the re-check fails.
3. **Undo this whole run** reverts every change the run made, in reverse order, or changes nothing.
4. If every free AI provider is busy, the run **waits and resumes by itself**, with a visible countdown. If the daily free quota is used up, it **stops safely** and says so.
5. `api/assistant.ts` tells the browser **how long a busy provider asked to wait** and whether it looks like a per-minute or a daily limit.

In simple words: you press one button, PatchBay works down the list of problems on its own (free fixes first), never keeps a change that did not help, tells you what it did, and lets you undo the entire run with one click. If the free AI is rate-limited, it waits and carries on.

## 2. Scope

### In scope
- Run queue, order, caps, skip reasons, and a plain summary (R1 to R3).
- Review and Autopilot (R4, R5).
- Undo this whole run (R6).
- Single-file AI fixes inside the queue with re-scan and re-measure and automatic undo (R7, R8).
- Wait-and-resume and quota states (R9, R10).
- Provider wait-time passthrough in `api/assistant.ts` and its chain (R11).
- Stop, refresh, and cleanup behaviour (R12).
- Wireframe UI (R13), safety carried over (R14), testing and honesty (R15).

### Out of scope (not built in 3B-3)
- **Background work after the tab closes.** The run lives only while the page is open (your decision). No server queue, no service worker, no scheduled task.
- **Saved run checkpoints and resuming a run after a refresh** (see decision 1 in section 7; only a small run label on History entries is saved).
- Raising the Phase 2 practice limits (`maxSteps` 8, `maxPracticeFiles` 2): the crew run does not use them (decision 7).
- The Knowledge Library, Repo Map, and templates (3B-2).
- AI fixes for visual findings, AI fixes that touch more than one file, AI-created or AI-deleted files.
- Task-based routing changes in the Model Router (decision 8).
- Pushing to GitHub, opening pull requests, or writing to the real repository.
- New colours, themes, animation (Phase 4).

## 3. Glossary

| Term | Meaning |
|---|---|
| Run | One Crew run, from Start to finished or stopped. Has a `runId`. |
| Queue | The ordered list of work items for one run. Built once at the start. |
| Work item | One finding to work on, with a stage and a status. |
| Stage | `fix` (free code fixes), `recipe` (free visual recipes), `ai` (single-file AI fixes). Always in this order. |
| Review mode | Default. Every change waits for your Approve or Reject. |
| Autopilot | One switch per run. The app applies a change after its own checks, re-checks, and undoes it if the re-check fails. |
| Re-check | Re-scan of the changed file, plus a re-measure at 375, 768, and 1024 px when the file is part of the open preview. |
| Kept / Undone | Final result of a change: it passed its re-check, or it was reverted. |
| Wait | A pause until a saved clock time (`resumeAt`), because a provider said "busy for N seconds". |
| `paused_quota` | The run stopped because the free daily quota looks used up (or a wait would be too long). |
| Run cap | The largest number of changes Autopilot may apply in one run. |

## 4. Functional requirements

### R1. The queue
1. Starting a Crew run builds the queue from `mergedFindings(state)` (the same findings the Skeleton Crew already shows). The queue is **frozen** at the start; findings that appear later because of a fix are not added (they are listed in the summary as "new since the run started").
2. Each item has: `id` (finding id), `stage` (`fix | recipe | ai`), `skillId`, `path`, `line`, `area`, a `status`, a short plain `note`, and counters (`waits`, `tries`).
3. Stage choice for a finding: `fix` if `buildFixProposal` can fix its skill (`fix === 'auto'`); else `recipe` if a recipe exists for its kind (R3); else `ai` if it is eligible (R7.1); else it is listed as **Guided** (not queued, no change, explained).
4. Order: all `fix` items, then all `recipe` items, then all `ai` items. Within a stage: severity high to low, then path, then line.
5. Caps (provisional, one file `crewRunLimits.ts`): at most **60** items, at most **8** `ai` items, at most **20** AI requests in all. When a cap cuts items off, the summary says how many were left out and why.
6. Statuses: `queued`, `working`, `waiting` (for you or for a wait), `kept`, `undone`, `rejected`, `skipped` (with a plain reason), `failed` (with a plain reason).
7. Starting is refused (plain reason) in the same cases as today (a run is already active, Edit is open, no scan) and also while a recipe is being measured.
8. The queue is data in memory only. It is never written to browser storage.

### R2. Free code fixes (`fix` stage)
1. Each item uses the existing `buildFixProposal(finding, content, recheck)` (target-blank, JavaScript syntax, HTML structure). Nothing new is invented in 3B-3.
2. Review mode: the proposal is shown as today and waits for Approve or Reject.
3. Autopilot: see R5. The same proposal is applied by the app after R5.1.
4. A fix that cannot be built (`buildFixProposal` says no) makes the item `skipped` with the plain reason it gives.

### R3. Free visual recipes (`recipe` stage)
1. Recipes are the 3B-1 recipes (`recipeFor`) and use the 3B-1 keep-or-undo rule unchanged (all three widths re-measured; undone if the problem remains or a new one appears).
2. The `recipe` stage needs: the Sandbox open in Look-only mode, a finished Full check at all three widths, and an editable plain `.html` target. If any is missing when the stage starts, every recipe item is `skipped` with the reason ("Open the Sandbox and press Full check to include visual fixes.") and the run continues.
3. One recipe at a time. In Review mode a recipe is applied only after you press **Apply** on that item (the 3B-1 recipe button rule is kept: recipes are never applied without a click, except in Autopilot). In Autopilot a recipe is applied by the app, and the 3B-1 re-measure keeps or undoes it.
4. If the Sandbox is closed or changes mode while a recipe is active, that recipe is undone automatically (3B-1 `dispose`) and the rest of the recipe items are `skipped`.

### R4. Review mode (default)
1. Every run starts in Review. Autopilot is never on by default and never remembered between runs.
2. In Review, every change waits for you: Approve or Reject (fix and AI) or Apply (recipe). Nothing changes by itself.
3. In Review, a kept change still gets its re-check result shown ("the problem is no longer found" or "still found"), as `ai_recheck` does today. PatchBay does not undo it for you, because you decided. (Undo stays one click.)
4. Review mode never waits for you silently: the current item and what it needs ("Waiting for your Approve") are always shown.

### R5. Autopilot
1. **One switch per run.** Turning it on needs one explicit confirmation sentence ("PatchBay will apply changes to your practice copy by itself. Each change is re-checked and undone if it did not help. Nothing is pushed to GitHub.") and one click. It can be turned off at any moment; the run continues in Review.
2. Before applying a change, the app runs every safety check that Approve runs today (diff applies exactly, reverses exactly, size cap, no secret added, one file, history not full). If any check fails, the item is `skipped` with the reason and nothing changes.
3. After applying, the app re-checks (R8). If the re-check fails the app **undoes that change at once**, marks the item `undone`, and logs why in plain words.
4. **Run cap:** at most **20** changes applied by Autopilot per run. At the cap Autopilot turns itself off and the rest of the run continues in Review, with a plain line saying so.
5. Autopilot applies one change at a time and does not start the next item until the previous one is `kept` or `undone`.
6. The AI never approves, rejects, undoes, resets, or switches Autopilot. Only the app's own code applies a change, and only after its own checks. A test proves that no AI answer can change the run mode.
7. Autopilot applies only to the practice copy. It never changes the repository.

### R6. Undo this whole run
1. Every History entry made by a run (fix, recipe, AI) carries the run's `runId`. Entries made by you (Edit pad, manual Approve outside a run) carry none.
2. **Undo this run** is one button (and the command `undo run`). It reverts all of the run's entries that are still applied, newest first, using the same hash checks as a single Undo.
3. **All or nothing:** it first checks the whole chain (each file hash must equal the entry's `afterHash` in turn). If any check fails, or the run's entries are not the newest ones on the stack (you made a change after the run), it changes nothing and says exactly why ("You changed <path> after the run. Undo your later changes first.").
4. After a successful undo, the entries move to the redo list as usual (Redo works one at a time). Findings are re-scanned once at the end. One Log line records the result.
5. Undo this run is refused while a proposal waits, a request is pending, a wait is active, or the run is still running. (Stop first.)
6. Entries that were already `undone` by the run itself (Autopilot auto-undo) are not reverted twice.

### R7. Single-file AI fixes (`ai` stage)
1. **Eligible finding:** a static scan finding (not a visual one) whose file is fully loaded, not truncated, safe path, under the practice file size, free of secrets, and whose `fix` is not `auto`; at most 3 AI tries per finding (the 3A cap `maxAttemptsPerFinding` stays).
2. **Live mode only.** If the server is in `mock` mode or not set up, every `ai` item is `skipped` with "AI is in practice (mock) mode, so no AI fixes were tried." The free stages still run.
3. One request per item, `suggest_change`, one file, using the existing request builder and Context Engine (the same data as the AI Chat "fix this finding" request). **No picture bytes, no whole repository, nothing new is sent.**
4. The answer must be a `patch_proposal` for exactly that file, and passes the existing `checkAIProposal` checks, with one change: the old "a run is active" refusal does not apply to a **queue-owned** request (a flag set only by the run controller; a hostile AI answer or a manual request cannot set it).
5. A rate-limit failure does not use up one of the 3 tries (no answer was judged). It triggers R9. A bad answer, an unusable patch, or a failed re-check does use one.
6. In Review the patch becomes the usual "AI-proposed change" card. In Autopilot the app applies it after R5.2.
7. The AI text is never written to the Log, History, storage, or errors (only the diff, as today in History, and fixed phrases in the Log).

### R8. Re-check and automatic undo
1. **Re-scan (always):** after a change, the changed file is re-scanned (`refreshFindings`). The change is **kept** only if (a) the target finding (same skill, same file) is no longer found, and (b) the file has no finding of any skill that it did not have before (compared as counts per skill; line numbers move, so lines are not compared).
2. **Re-measure (when it applies):** when the changed file is `.html` or `.css`, the Sandbox is open in Look-only mode, and a Full check exists, the preview is re-measured at 375, 768, and 1024 px. The change is kept only if no new visual problem key appears (the 3B-1 rule). If it cannot be re-measured, the summary says "re-scanned only, not re-measured" for that item.
3. If a re-check does not finish within the time limit (`recheckTimeoutMs`), the change is treated as failed and undone (Autopilot) or reported as "could not re-check" (Review).
4. A failed re-check in Autopilot undoes only that change and only if it is still the newest History entry; otherwise it stops the run and reports (no silent leftovers).
5. The words used are "no longer found" and "still found". PatchBay never says "fixed" or "valid".

### R9. Wait and resume
1. When a live request fails with `rate_limited` and the answer carries a wait time (R11), the item becomes `waiting` and the run status becomes `waiting` with `resumeAt` = now + wait (a clock time, not a countdown).
2. The screen shows the provider-neutral reason ("The free AI is busy.") and a live countdown computed from `resumeAt` and the current clock. A timer only **checks** the clock; if the tab slept, the next check sees the right time. Returning to the tab (`visibilitychange`) checks at once.
3. At `resumeAt` the same item is tried again. Other items are not started while a wait is active (the queue stays in order), except that **free items that come before the AI stage have already finished**, because the AI stage is last.
4. Wait rules (provisional): minimum wait 5 s (never retry faster, even if the provider says 0); a single wait of more than **300 s** is treated as a long limit (R10); at most **3 waits per item**; at most **900 s** of waiting in one run. When a rule is hit, the item is `skipped` ("The free AI stayed busy.") and the run continues with the next item, or stops as `paused_quota` if the next AI try would need to wait again.
5. **Stop** during a wait cancels it at once; nothing is half-applied (waits happen before any change is applied).
6. The wait is never a loop: each wait ends in a retry, a skip, or `paused_quota`. A test proves the run always finishes or stops in a bounded number of steps.

### R10. Quota states
- **Per-minute limit** (wait up to 300 s): R9.
- **Daily limit used up** (the server says `limit: 'day'`, or a wait over 300 s, or all providers limited with no wait time and two waits already used on the item): the run becomes `paused_quota`. All items that have not started stay `queued` (shown as "Not tried: daily free limit"). Items already `kept` stay kept. No change is half-applied. The panel says: "The free daily AI limit looks used up. The free fixes above were applied. Try again later or ask again tomorrow." and offers **Continue** (starts the remaining AI items again, once, after you press it) and **Undo this run**.
- `paused_quota` is a normal final state, not an error.

### R11. Provider wait-time passthrough (`api/assistant.ts` and its chain)
1. When a provider returns HTTP 429, the adapter reads, **on the server only**: the `Retry-After` header (seconds or HTTP date), and where a provider documents it, a wait value in the error body (for example a retry delay) and a hint whether the limit is per-minute or per-day. Only two small values leave the adapter: an integer number of seconds (0 to 86,400) and `limit` = `minute | day | unknown`. **The provider's error text is never passed on.**
2. When every attempt of a request failed with a rate limit, the existing 429 answer gains two optional fields: `retryAfterSeconds` (the **shortest** wait among the limited providers; the request would be possible again then) and `limit` (`day` only if every limited provider said day; else `minute` if any said minute; else `unknown`). The existing fields and message are unchanged.
3. The browser's `requestAssistant` copies the two fields into `AssistantError` and into the failure state. They are numbers and a three-value word; they are shown and used, never stored.
4. The server never waits for a provider longer than the existing request budget (`totalBudgetMs`). Waiting is the browser's job.
5. A test proves that a provider error body full of sentinel text never reaches the response, the Log, or storage.
6. Older answers without the fields still work (the fields are optional). When the fields are missing, the browser uses a default wait of 60 s and `limit: 'unknown'` (R9.4 and R10 apply).

### R12. Stop, refresh, and cleanup
1. **Stop** (button or `stop`) stops the run at once: cancels a pending request and any wait, rejects a waiting proposal, undoes an active unfinished recipe, and leaves every change that already passed its re-check in place (the summary says so; **Undo this run** removes them).
2. **Refresh or closing the tab ends the run.** The queue is not saved. When the session is restored (2G), History comes back as today (replayed only if file hashes match); entries keep their `runId`, so **Undo this run** still works on them (decision 1). The restored page shows no running run.
3. A restore never resumes an AI request or a wait.
4. All timers, listeners (`visibilitychange`), `AbortController`s, and store subscriptions made by the run are removed when the run ends, when Stop is pressed, and when the component unmounts. A test proves that nothing keeps running afterwards.

### R13. Wireframe UI (black and white, no motion)
1. The Skeleton Crew screen gets a **Run panel**: Start (Review) button, **Autopilot** switch with its confirmation, the queue list (stage, file, line, status, plain note), the current item, a wait line with a countdown, **Stop**, **Undo this run**, and a final summary.
2. The summary lists, in plain words: kept, undone, rejected, skipped (with reasons), not tried (quota), guided, new since start, and "re-scanned only" items. It names no AI text.
3. Every state has text: empty queue ("Nothing to work on."), loading, waiting, `paused_quota`, error. No colour other than `#000` and `#fff`, no `transition`, no `animation`. A countdown is text that changes once per second; it is not an animation.
4. Existing Skeleton Crew screen parts (narration, Stop bar, Changes made) keep working. The run labels History entries "Run <short id>".

### R14. Safety carried over
- No key, AI text, question text, file content, or picture bytes in the Log, History, browser storage, the saved record, or an error. (History keeps diffs, as today.)
- No new browser storage key. The saved work record gains one optional field (`runId`) on History entries and nothing else.
- Browser code never imports the live engine; provider calls stay in `providers.ts`; no `eval`, `new Function`, or raw HTML.
- The 3-attempt cap per finding holds. The AI cannot approve, reject, undo, reset, or change the run mode.
- Only the practice copy changes. Nothing is pushed.
- `AI_MODE=mock` stays the default and the free stages work in it.
- Free tiers only. No paid service.

### R15. Testing and honesty
- Full 3A and 3B-1 rigor: unit and integration tests for each task, privacy and static tests, a hostile-input test, a real-browser run (with a fake provider server that returns 429 with `Retry-After`), mutation checks, and an independent review.
- The report lists exactly what ran and what is **Unverified**: real provider rate-limit headers (the run uses fakes), real daily quotas, sleeping background tabs on real devices, phones.

## 5. Non-functional requirements
- **Memory (4 GB laptops):** the queue holds at most 60 small items; no file contents are copied into it; timers are single and disposed.
- **Responsiveness:** the run advances one item per step with `await` points; it never blocks the main thread for a whole queue. Re-scan is the existing per-file `rescanPaths`.
- **Determinism:** the queue order and the free stages are deterministic for the same findings. A test builds the same queue twice.
- **Limits live in one file** (`src/config/crewRunLimits.ts`), marked provisional.
- **Clock use** goes through an injectable `now()` so tests can run a sleeping tab and a wait without real time.

## 6. Acceptance and verification gate (3B-3 exit)
1. All Phase 2, 3A, and 3B-1 tests still pass (counts reported).
2. **Queue:** a fixture with fix, recipe, AI, and guided findings builds the right queue in the right order with caps and skip reasons.
3. **Review:** nothing changes without Approve or Apply; Reject changes nothing.
4. **Autopilot:** a good change is kept; a change whose re-check fails (new problem, target still found, timeout) is undone; the run cap switches to Review; an AI answer cannot change the mode.
5. **Undo this run:** reverts exactly the run's entries in reverse order; refuses (changing nothing) after a later change by you or a hash mismatch.
6. **Wait and resume:** a fake provider returns 429 with `Retry-After: 7`; the run waits, then resumes and finishes; a slept tab (clock jump) resumes correctly; Stop during a wait leaves nothing half-applied.
7. **Quota:** a daily-limit 429 ends in `paused_quota` with free fixes kept and no half-applied change; a hostile "wait 99999 s" is treated as a long limit; the run always terminates.
8. **3-attempt cap:** a fourth AI try for one finding never happens.
9. **Passthrough:** the 429 response carries only the two numbers, never provider text.
10. **Privacy and static tests** (R14) pass, including sentinels for key, AI answer, provider error body, and file text.
11. **Real-browser run** (as in 3B-1) with fake providers: Review run, Autopilot run with one forced bad patch auto-undone, wait and resume, `paused_quota`, Undo this run, Stop; zero unexpected console errors; 375 px layout has no sideways scroll.
12. **Mutation checks** (design 12) are all killed. **Independent review** done and its findings handled. `npm run typecheck`, `npx vitest run`, `npm run build`, and `npm audit` pass.

## 7. Decisions (to answer before the batch Go)

Already decided by you on 2026-11-27: build order 3B-1, then 3B-3, then 3B-2; the run is **autonomous while the page is open**; Review is the default with one Autopilot switch per run; Undo whole run; single-file AI fixes with re-scan or re-measure and automatic undo; 429 wait-time passthrough from `api/assistant.ts`; `Current Active Phase` becomes `Phase 3 (Sub-phase 3B-3)` (done in this step).

### Open questions (each has a default I build unless you say otherwise)

1. **Checkpoints and refresh.** The older plan had saved checkpoints so a run could resume after a refresh. "Autonomous while open" does not need them, and they are the riskiest part (storage, replay, privacy). **Default: no checkpoints.** A refresh ends the run. The only saved addition is a small `runId` label on History entries (a tiny change to the strict saved-work schema), so **Undo this run** still works after a refresh when History is restored. Alternative: no `runId` saved (Undo this run works only until a refresh).
2. **Autopilot cap.** **Default: 20 applied changes per run**, then Autopilot switches off and the rest continues in Review. Alternative: stop the run at the cap.
3. **AI limits per run.** Free quota is tiny (3A saw about 20 Gemini requests a day). **Default: at most 8 AI items and 20 AI requests per run.**
4. **Wait limits.** **Default:** minimum wait 5 s; a single wait over 300 s counts as a long limit (`paused_quota`); at most 3 waits per item; at most 900 s of waiting per run; unknown wait defaults to 60 s.
5. **Recipes in a run need the Sandbox open** and a finished Full check. **Default: if not, recipe items are skipped with a plain reason** (the run does not open the Sandbox for you). Alternative: the run opens the Sandbox and runs Full check itself (more code, and risky if the preview cannot mount on the crew screen).
6. **AI fixes cover static scan findings only.** Visual findings that no recipe can fix stay **Guided** (no AI). **Default: as stated.**
7. **Limits I will and will not change.** **Default:** `maxHistoryEntries` 50 to **120** (a run can make many changes); `maxSteps` 8 and `maxPracticeFiles` 2 are **not** raised (the crew run does not use them; the plan proposed 60 and 10 but they would be dead settings); `maxDiffChars` stays **2,000** (all 3B-1 fixes are tiny and the AI path is capped at 3 edits of 40 lines). If the browser run shows 2,000 is too small for real AI patches I will stop and ask.
8. **Task-based routing (in the earlier plan).** Code-change requests already go to the stronger model tier. **Default: no router change in 3B-3** (dropped from the list).
9. **Findings that appear after a fix** are not added to the running queue. **Default: listed in the summary as "new since the run started"** so a run cannot grow without limit.
10. **Autopilot confirmation wording** is in R5.1. **Default: used exactly as written.**
