# Requirements: 14 Autonomous Crew Run v2 (Phase 3, Sub-phase 3B-3)

Sources: `PHASE_3B_IMPLEMENTATION_PLAN.md` (3B-3 and section 6); `Skeleton_Crew_Autonomous_Vision.md`; your answers of 2026-11-27 (build order 3B-1, 3B-3, 3B-2; "autonomous while open"; Review plus Autopilot; Undo whole run; AI fixes with re-scan or re-measure and automatic undo; 429 wait-time passthrough) and your **second round of 2026-11-27 ("best version")**: AI Deep Audit, AI fixes for visual bugs, a saved run bookmark with "Resume run", automatic Sandbox measuring on Start, caps 15 AI items and 35 AI requests, `maxDiffChars` 4,000; steering `build-phases.md` (3B block); specs 04, 06, 07, 08, 10, 11, 12; the real code (`workSlice.ts`, `workActions.ts`, `crewScript.ts`, `useRecipe.ts`, `aiProposal.ts`, `useAIHandoff.ts`, `useAssistant.ts`, `contextEngine.ts`, `answerParser.ts`, `promptBuilder.ts`, `liveAssistant.ts`, `modelRouter.ts`, `providers.ts`, `api/assistant.ts`, `workStorage.ts`, `sessionRecord.ts`, `SandboxPanel.tsx`, `usePreview.ts`).
Active product phase: **Phase 3, Sub-phase 3B-3**. PatchBay's own screens stay black-and-white wireframe with no animation. `AI_MODE=mock` stays the default and keeps working. Free tiers only. **No new runtime dependency.** Only the practice copy changes. Nothing is pushed to GitHub.

## 1. Purpose

Today the Skeleton Crew run is a short script. 3B-3 turns it into a **run that keeps working while the page is open**:

1. **Deep Audit (optional, live AI only).** The AI reads key files in Frontend, Backend, Security, and APIs & Data and reports **possible logic bugs the offline rules cannot see**. Every report must quote the exact line; PatchBay checks the quote really is on that line and drops any report that fails. Survivors are labelled **"Possible (AI)"**.
2. **A queue** over all findings, worked in a fixed order: free code fixes, free visual recipes, then single-file AI fixes (for static findings, visual findings, and AI-found bugs). The AI is used last.
3. **Review** is the default: you approve each change. **Autopilot** is one switch per run: the app applies a change by itself, **only** after its own checks pass, re-checks it (re-scan, and re-measure at 375, 768, and 1024 px), and undoes it automatically if the re-check fails.
4. **Undo this whole run**, **wait-and-resume** when every free provider is busy, a safe **`paused_quota`** stop, a **429 wait-time passthrough** from `api/assistant.ts`, and a tiny saved **run bookmark** so a refresh can be followed by **Resume run**.
5. **Start measures the Sandbox for you**, so visual fixes work without an extra manual step.

In simple words: you press one button, PatchBay audits, fixes, and measures on its own (free fixes first), never keeps a change that did not help, tells you what it did, and lets you undo the whole run in one click. If the free AI is rate-limited it waits and carries on. If you refresh, you can resume.

## 2. Scope

### In scope
Deep Audit (R16); queue, order, caps (R1); free fixes (R2); recipes (R3); Review (R4); Autopilot (R5); Undo this run (R6); AI fixes for static and visual findings and AI-found bugs (R7); re-check and automatic undo (R8); wait-and-resume (R9); quota states (R10); 429 passthrough (R11); Stop and cleanup (R12); UI (R13); safety (R14); testing (R15); run bookmark and Resume run (R17); automatic Sandbox measuring (R18); limits (R19).

### Out of scope (not built in 3B-3)
- **Background work after the tab closes** (no server queue, service worker, or scheduled task). The run lives while the page is open.
- **Saving the queue, AI answers, file text, or any AI text.** Only the small bookmark of R17 is saved.
- The **`focus` and `skip` commands** from the vision (you said they are not needed).
- Raising `maxSteps` (8) and `maxPracticeFiles` (2): the crew run does not use them.
- Knowledge Library, Repo Map, templates (3B-2). Model Router tier changes beyond adding the `audit` task as a light task.
- AI fixes that touch more than one file, or create or delete files. A visual problem whose style lives in a file other than the selected page is listed **Guided** if the one-file patch cannot apply.
- Pushing to GitHub, pull requests, writing to the real repository. New colours, themes, animation (Phase 4).

## 3. Glossary

| Term | Meaning |
|---|---|
| Run | One Crew run, from Start to finished or stopped. Has a `runId`. |
| Deep Audit | The optional first phase where the AI looks for possible logic bugs. Uses the `audit` task. |
| AI-found bug | A finding created by Deep Audit, labelled **"Possible (AI)"**. Lives in memory only. |
| Queue | The ordered list of work items for one run. Built once, after the Deep Audit. |
| Stage | `fix` (free code fixes), `recipe` (free visual recipes), `ai` (single-file AI fixes). Always in this order. |
| Review mode | Default. Every change waits for your Approve or Apply. |
| Autopilot | One switch per run. The app applies a change after its own checks, re-checks, and undoes it if the re-check fails. |
| Re-check | Re-scan of the changed file, plus a re-measure at 375, 768, and 1024 px when the change touches a previewable page. |
| Wait / `resumeAt` | A pause until a saved clock time because a provider said "busy for N seconds". |
| `paused_quota` | The run stopped because the free daily quota looks used up or a wait would be too long. |
| Bookmark | The tiny saved record of R17. Never holds file text, AI text, or secrets. |
| Code-lines consent | The existing "Include the contents" tick of 3A. Needed for anything that sends code to the AI. |

## 4. Functional requirements

### R1. The queue
1. Starting a Crew run first runs the Sandbox auto-measure (R18) and, if allowed, the Deep Audit (R16). Then it builds the queue from `mergedFindings(state)` (scan findings, measured findings, and AI-found bugs). The queue is **frozen** at that moment; findings that appear later because of a fix are not added (listed in the summary as "new since the run started").
2. Each item has: `id` (finding id), `stage` (`fix | recipe | ai`), `skillId`, `path`, `line`, `area`, `origin` (`scan | measured | ai`), `status`, a short plain `note`, and counters (`waits`, `tries`).
3. Stage choice: `fix` if `buildFixProposal` can fix its skill (`fix === 'auto'`); else `recipe` if a recipe exists for its kind (R3); else `ai` if eligible (R7.1); else listed **Guided** (not queued, explained).
4. Order: all `fix` items, then all `recipe`, then all `ai`. Within a stage: severity high to low, then path, then line.
5. Caps (provisional, one file `crewRunLimits.ts`): at most **60** items, at most **15** `ai` items, at most **35** AI fix requests in all (Deep Audit requests are counted separately, R16.5). When a cap cuts items off, the summary says how many were left out and why.
6. Statuses: `queued`, `working`, `waiting`, `kept`, `undone`, `rejected`, `skipped` (with a plain reason), `failed` (with a plain reason).
7. Starting is refused (plain reason) when a run is already active, Edit is open, no scan exists, or a recipe is being measured.
8. The queue is memory only and is never written to browser storage.

### R2. Free code fixes (`fix` stage)
1. Each item uses the existing `buildFixProposal(finding, content, recheck)` (target-blank, JavaScript syntax, HTML structure). Nothing new is invented.
2. Review: the proposal waits for Approve or Reject. Autopilot: see R5.
3. A fix that cannot be built makes the item `skipped` with the plain reason it gives.

### R3. Free visual recipes (`recipe` stage)
1. Recipes are the 3B-1 recipes (`recipeFor`) with the 3B-1 keep-or-undo rule unchanged (three widths re-measured; undone if the problem remains or a new one appears).
2. The stage needs a measurable Sandbox (R18) and an editable plain `.html` target. If measuring is impossible, every recipe item is `skipped` with the plain reason and the run continues.
3. One recipe at a time. In Review a recipe is applied only after you press **Apply** on that item. In Autopilot the app applies it and the 3B-1 re-measure keeps or undoes it.
4. If the Sandbox closes or changes mode while a recipe is active, the recipe is undone (3B-1 `dispose`) and the remaining recipe items are `skipped`.

### R4. Review mode (default)
1. Every run starts in Review. Autopilot is never on by default and never remembered between runs or saved in the bookmark.
2. In Review every change waits for you: Approve or Reject (fix and AI) or Apply (recipe). Nothing changes by itself.
3. A kept change still shows its re-check result ("no longer found" or "still found"; for visual changes the three-width result). PatchBay does not undo it for you, because you decided. (Undo stays one click.)
4. The current item and what it needs ("Waiting for your Approve") is always shown.

### R5. Autopilot
1. **One switch per run.** Turning it on needs the confirmation sentence "PatchBay will apply changes to your practice copy by itself. Each change is re-checked and undone if it did not help. Nothing is pushed to GitHub." and one click. It can be turned off at any moment; the run continues in Review.
2. Before applying, the app runs every safety check that Approve runs today (diff applies exactly, reverses exactly, size cap, no secret added, one file, history not full). A failed check makes the item `skipped` with the reason and changes nothing.
3. After applying, the app re-checks (R8). A failed re-check **undoes that change at once**, marks the item `undone`, and logs why in plain words.
4. **Run cap:** at most **20** changes applied by Autopilot per run. At the cap Autopilot turns itself off and the run **continues in Review** with a plain line saying so.
5. One change at a time; the next item starts only when the previous one is `kept` or `undone`.
6. **AI-found bugs are never applied by Autopilot.** The app can show that a fix parses and adds no new finding, but it cannot prove an AI-reported bug was real or is fixed. Those items always wait for your Approve, and the note says why.
7. The AI never approves, rejects, undoes, resets, or switches Autopilot. Only the app's own code applies a change, and only after its own checks. A test proves no AI answer field can change the run mode.
8. Autopilot changes only the practice copy.

### R6. Undo this whole run
1. Every History entry made by a run (fix, recipe, AI) carries the run's `runId`. Entries made by you carry none.
2. **Undo this run** (button and the command `undo run`) reverts all of the run's entries that are still applied, newest first, with the same hash checks as a single Undo.
3. **All or nothing:** it first checks the whole chain. If any check fails, or the run's entries are not the newest ones on the stack, it changes nothing and says exactly why ("You changed <path> after the run. Undo your later changes first.").
4. After success the entries move to the redo list as usual (Redo works one at a time). Findings are re-scanned once at the end. One Log line records the result.
5. It is refused while a proposal waits, a request is pending, a wait is active, or the run is still running (Stop first).
6. Entries the run already undid itself (Autopilot auto-undo) are not reverted twice.
7. After a refresh and restore, the same works for restored History entries that carry the `runId` (R17).

### R7. AI fixes (`ai` stage): static findings, visual findings, AI-found bugs
1. **Eligible finding:** a finding of any origin whose file is fully loaded, not truncated, a safe path, under the practice file size, free of secrets, and whose fix is not `auto`; at most **3 AI tries per finding** (the 3A cap `maxAttemptsPerFinding` stays). A visual finding is eligible only if no free recipe exists for it and the page is `.html` that the Sandbox can measure (R18). Visual findings with no usable one-file fix stay **Guided**.
2. **Needs live mode and code-lines consent.** In `mock` mode, or when the consent is off, every `ai` item is `skipped` with a plain reason ("AI is in practice (mock) mode" or "Tick 'Let the AI read code lines' to allow AI fixes"). The free stages still run.
3. One request per item, task `suggest_change` (heavy tier), exactly one file, built by the existing request builder and Context Engine. Visual findings add one new field, `measured` (R19.4), a short fixed-phrase line with the kind, tag, column, number, limit, and widths. **No picture bytes, no whole repository, nothing else new is sent.**
4. The answer must be a `patch_proposal` for exactly that file and passes the existing `checkAIProposal` checks, with one change: the "a run is active" refusal does not apply to a **queue-owned** request (a flag set only inside the run controller; no request or answer field can carry it).
5. A rate-limit failure does not use up one of the 3 tries. It triggers R9. A bad answer, an unusable patch, or a failed re-check uses one.
6. In Review the patch becomes the usual "AI-proposed change" card. In Autopilot the app applies it after R5.2 (not for AI-found bugs, R5.6).
7. The AI text is never written to the Log, History (except the diff, as today), storage, or errors.

### R8. Re-check and automatic undo
1. **Re-scan (always):** after a change, the changed file is re-scanned. A change to a **scan finding** is kept only if (a) the target (same skill, same file, same place within a small line window) is no longer found, and (b) for every skill the file's count of findings did not go up. For an **AI-found bug** the target cannot be re-scanned; the rule is (b) only plus "the quoted line changed", and Review is required (R5.6).
2. **Re-measure (when it applies):** when the changed file is `.html` or `.css` and the Sandbox is measurable, the preview is re-measured at 375, 768, and 1024 px. For a **visual finding** the change is kept only if its problem key is gone and **no new problem key appears** at any width (the 3B-1 rule). For other findings the change is kept only if no new visual key appears. If it cannot be re-measured the summary says "re-scanned only, not re-measured".
3. A re-check that does not finish within `recheckTimeoutMs` counts as failed (undone in Autopilot, "could not re-check" in Review).
4. In Autopilot a failed re-check undoes only that change, and only if it is still the newest History entry; otherwise the run stops and reports (no silent leftovers).
5. The words are "no longer found" and "still found". PatchBay never says "fixed" or "valid".

### R9. Wait and resume
1. When a live request fails with `rate_limited` and the answer carries a wait time (R11), the item becomes `waiting`, and the run status `waiting` with `resumeAt` = now + wait (a clock time, not a countdown).
2. The screen shows "The free AI is busy." and a live countdown computed from `resumeAt` and the current clock. A timer only **checks** the clock; if the tab slept, the next check is right. Returning to the tab (`visibilitychange`) checks at once.
3. At `resumeAt` the same item is tried again. No other item starts during a wait (the queue stays in order).
4. Wait rules (provisional): minimum wait 5 s; a single wait over **300 s** is a long limit (R10); at most **3 waits per item**; at most **900 s** of waiting per run; unknown wait defaults to 60 s. When a rule is hit the item is `skipped` ("The free AI stayed busy.") and the run continues, or stops as `paused_quota` if the next AI try would need to wait again.
5. **Stop** during a wait cancels it at once; waits happen before any change is applied, so nothing is half done.
6. Every wait ends in a retry, a skip, or `paused_quota`. A test proves the run always terminates in a bounded number of steps.

### R10. Quota states
- **Per-minute limit** (wait up to 300 s): R9.
- **Daily limit used up** (`limit: 'day'`, or a wait over 300 s, or all providers limited with no wait time and two waits already used on the item): the run becomes `paused_quota`. Items that have not started stay `queued` ("Not tried: daily free limit"). Items already `kept` stay kept. No change is half applied. The panel says: "The free daily AI limit looks used up. The free fixes above were applied. Try again later or ask again tomorrow." with **Continue** (restarts the remaining AI items once, after you press it) and **Undo this run**.
- `paused_quota` is a normal final state, not an error.

### R11. Provider wait-time passthrough (`api/assistant.ts` and its chain)
1. On HTTP 429 the adapter reads, **on the server only**, the `Retry-After` header (seconds or HTTP date) and, where a provider documents it, a wait value or per-minute/per-day hint in the error body or rate-limit headers. Only two small values leave the adapter: an integer number of seconds (0 to 86,400) and `limit` = `minute | day | unknown`. **The provider's error text is never passed on.**
2. When every attempt of a request failed with a rate limit, the 429 answer gains two optional fields: `retryAfterSeconds` (the **shortest** wait among limited providers) and `limit` (`day` only if every limited provider said day; else `minute` if any said minute; else `unknown`), and a standard `Retry-After` response header (integer seconds) when known. Existing fields and message are unchanged.
3. The browser's `requestAssistant` copies the two fields into `AssistantError` and the failed state. They are a number and a three-value word; they are used, never stored.
4. The server never waits for a provider longer than `totalBudgetMs`. Waiting is the browser's job.
5. A test proves provider error text never reaches the response, the Log, or storage.
6. Answers without the fields still work. Missing fields mean a default wait of 60 s and `limit: 'unknown'`.

### R12. Stop, refresh, and cleanup
1. **Stop** stops the run at once: cancels a pending request and any wait, rejects a waiting proposal, undoes an active unfinished recipe, and leaves every change that already passed its re-check (the summary says so; **Undo this run** removes them). Stop clears the bookmark.
2. **Refresh or closing the tab ends the running loop.** The queue is not saved. If a bookmark exists, the restored page offers **Resume run** (R17). History comes back as today (replayed only if file hashes match), keeping `runId`, so **Undo this run** works.
3. A restore never resumes an AI request or a wait by itself; Resume run is always your click.
4. All timers, listeners (`visibilitychange`), `AbortController`s, and store subscriptions made by the run are removed when the run ends, on Stop, and on unmount. A test proves nothing keeps running afterwards.

### R13. Wireframe UI (black and white, no motion)
1. The Skeleton Crew screen gets a **Run panel**: **Start** (Review), **Deep Audit** tick (off by default, with the code-lines consent sentence), **Autopilot** switch with its confirmation, **Resume run** (only when a valid bookmark exists), the queue list (stage, file, line, origin label, status, plain note), the current item, a wait line with a countdown, **Stop**, **Undo this run**, **Continue** (after `paused_quota`), and a final summary.
2. Findings with origin `ai` show the label **"Possible (AI)"** wherever findings are listed (Skeleton Crew, domain screens, finding detail). Their explanation text is AI text: shown as plain React text, never stored or logged.
3. The summary lists, in plain words: Deep Audit result (files audited, found, dropped because the quote was not found), kept, undone, rejected, skipped (with reasons), not tried (quota), guided, new since start, "re-scanned only", and "measured at 375, 768, 1024".
4. Every state has text: empty queue ("Nothing to work on."), loading, auditing (file n of m), waiting, `paused_quota`, error. Only `#000` and `#fff`, no `transition`, no `animation`. A countdown is text that changes once per second.
5. Existing Skeleton Crew parts (narration, Stop bar, Changes made) keep working. History entries show "Run <short id>".

### R14. Safety carried over
- No key, AI text, question text, file content, or picture bytes in the Log, History (diffs excepted, as today), browser storage, the saved record, the bookmark, or an error.
- **One new storage key** (`patchbay.run.v1`, the bookmark of R17), one optional `runId` on saved History entries, and nothing else. The key is listed in "Saved in this browser" and removed by Reset session.
- Browser code never imports the live engine; provider calls stay in `providers.ts`; no `eval`, `new Function`, or raw HTML.
- The 3-attempt cap per finding holds. The AI cannot approve, reject, undo, reset, or change the run mode.
- **Code lines go to the AI only with the 3A consent tick,** are redacted exactly as in 3A, and the first-live-request notice still applies.
- Only the practice copy changes. Nothing is pushed. `AI_MODE=mock` stays the default; the free stages work in it.
- Free tiers only. No paid service.

### R15. Testing and honesty
- Full 3A and 3B-1 rigor: unit and integration tests per task, privacy and static tests, a hostile-input test (including hostile AI audit answers and hostile `Retry-After`), a real-browser run with a fake provider server (429 with `Retry-After`, audit answers with good and bad quotes, a deliberately bad patch), mutation checks, and an independent review.
- The report lists exactly what ran and what is **Unverified**: real provider rate-limit headers and real daily quotas (fakes only), real AI audit quality, sleeping background tabs on real devices, phones.

### R16. AI Deep Audit (stage 0)
1. **When it runs:** only at Start, only in live mode, only with the code-lines consent on and the **Deep Audit** tick on (off by default). Otherwise it is skipped with a plain reason and the run continues.
2. **Which files:** "key" loaded files, chosen by a deterministic ranking, at most **12 chunks** in all (up to 3 per area of Frontend, Backend, Security, APIs & Data when that many exist; leftovers fill from the strongest-ranked other area). Ranking uses things PatchBay already knows: entry pages and entry scripts, files with scan findings, files with many connections, and server or API files. Files that are not fully loaded, truncated, a secret-bearing path, minified, binary, or over the file size cap are not audited. The ranking list is shown in the summary (paths only).
3. **What is sent:** one chunk per request: one file, a window of at most **100 lines and 6 KiB** (a longer file gets later windows only if chunks remain), redacted exactly as 3A redacts, numbered lines, plus the area name and a fixed instruction. No whole repository, no pictures, no other file.
4. **What must come back:** an `audit_findings` answer: at most **6** findings, each with `path`, `line`, an exact `quote` (8 to 200 characters), a short `title`, and a short `explanation`, with limitations. The task type is `audit` (light tier: fast models first).
5. **Caps:** at most **12 audit requests** per run (separate from the 35 AI fix requests); at most **40** AI-found bugs kept per run. Rate limits during the audit use the same wait rules (R9, R10); a quota stop ends the audit and the run continues with what was found, or becomes `paused_quota` before the queue if nothing can be tried.
6. **The anti-hallucination guard (two checks):**
   a. **Server:** `parseAnswer` checks each finding against the lines the model was shown: the `line` is inside the window and the `quote` (trimmed, whitespace-normalised) is contained in that line. Failures are removed.
   b. **Browser:** each remaining finding is checked again against the **current practice copy** of that file: line `n` (after line-ending normalisation) contains the quote. Failures are dropped. The `path` must be the one requested.
   A quote of fewer than 8 non-space characters, a quote that is only punctuation, and a quote of `[REDACTED:` text are dropped. The summary counts dropped findings by number only.
7. **What an AI-found bug becomes:** a finding with skill `scan.ai.possible-bug`, origin `ai`, certainty "possible", area taken from PatchBay's own file-to-area rule (**not** from the AI), label **"Possible (AI)"**, the verified quote shown from the file, and the AI's title and explanation shown as plain text. It is merged into the findings list in memory only. It is never saved, logged (only counts and paths), or exported as AI text.
8. **No side effects:** the audit changes nothing. It never proposes a patch; fixes come later through the `ai` stage like any other finding.
9. In `mock` mode the audit is skipped with a plain reason. The mock adapter still answers an `audit` task with a valid empty `audit_findings` so the contract is exercised.

### R17. Run bookmark and Resume run
1. While a run is active (including `waiting` and `paused_quota`), PatchBay saves one tiny record under the key `patchbay.run.v1`: `version`, `runId`, `repoKey` (the same key as the saved work record), `savedAt`, `index` (items finished), `remaining` (finding ids still to do, at most 60, ids only), `resumeAt` (epoch ms or null), `status`, `tail` (the `afterHash` of the newest History entry and the count of applied entries, so the bookmark only fits exactly the History it was saved with), and the mode flags `deepAudit` and `codeConsent` as booleans. **Autopilot is never saved.** The record is at most **4 KiB**.
2. **Never saved:** file text, AI text, quotes, titles, explanations, diffs, question text, keys, the queue's notes. AI-found bugs and measured findings are not saved (they are rebuilt by a new audit or Full check).
3. It is written after each finished item and at each wait, and removed when the run finishes, on Stop, on **Reset session**, and when it fails validation.
4. **After a refresh:** once the repository is loaded again and the saved work is restored (2G), PatchBay validates the bookmark: same `repoKey`, the restored History has exactly the saved applied count and newest `afterHash`, and a scan exists. If valid, the Run panel shows **Resume run** with a plain line ("A run was in progress: N items left."). If not, the bookmark is removed and the panel says why in plain words.
5. **Resume run** (a click) starts a new run with the same `runId` (so **Undo this run** covers the earlier and the later changes), in **Review** mode, with the remaining ids that still exist in the new scan (an id that no longer exists is counted as "no longer found"). It first repeats the auto-measure (R18). AI-found bugs from the earlier audit are listed as "lost on refresh; run Deep Audit again". An old `resumeAt` in the past means "retry now"; one in the future means "wait until then".
6. The bookmark never starts anything by itself and never resumes an AI request.

### R18. Automatic Sandbox measuring
1. At Start, if there is no finished Full check at all three widths for the current content, the run triggers one itself (through a new published hook of the Sandbox panel, `checkAll`, that does exactly what the "Check all" button does) and waits for it, up to `measureTimeoutMs`.
2. It is possible only when the preview is `static` mode with a previewable entry `.html` page that loaded. If scripts are on ("Run scripts"), the run switches the Sandbox to **Look only** for the run (scripts off is the only measurable state) and says so in the summary; it never turns scripts on.
3. If the loaded repository has no previewable HTML (framework project, workbench or source mode, no HTML page), the visual stages are skipped with a plain reason and everything else runs.
4. A measuring failure or timeout is a plain note, never a stop: the recipe stage and visual AI fixes are skipped.
5. After every change the run re-measures through the same hook (R8.2). It never measures while another layout check is `running` (it waits for `idle` or `done`).

### R19. Limits
1. All new limits live in `src/config/crewRunLimits.ts` (queue and run) and `src/config/auditLimits.ts` (Deep Audit), marked provisional.
2. `maxHistoryEntries` 50 to **120**.
3. `maxDiffChars` and `AI_LIVE.maxProposalDiffChars` 2,000 to **4,000** (kept equal by the existing test). **Free fixes keep their own 2,000 cap** (`CHECK_LIMITS.maxFixDiffChars`, `scanFix.MAX_DIFF`).
4. `maxSavedBytes` 256 KiB to **768 KiB**. Reason: 120 entries of 4,000 characters, after JSON escaping, can need about 600 KB, which the old cap could not hold (`trimRecord` never drops applied entries, so a bigger History would simply stop saving). 768 KiB leaves room for the Log, stays well inside the roughly 5 MB a browser allows per site, and the save still skips cleanly with a Log note if a record is ever too big.
5. New request field `measured` (optional, at most 200 characters, checked for secrets) in the AI request schema, used only for visual findings.

## 5. Non-functional requirements
- **Memory (4 GB laptops):** the queue holds at most 60 small items; no file contents are copied into it; audit windows are built one at a time and released; timers are single and disposed; the bookmark is at most 4 KiB.
- **Responsiveness:** the run advances one item per step with `await` points; it never blocks the main thread for a whole queue.
- **Determinism:** queue order, the free stages, and the audit file ranking are deterministic for the same input. A test builds them twice.
- **Clock use** goes through an injectable `now()` so tests can run a sleeping tab and a wait without real time.

## 6. Acceptance and verification gate (3B-3 exit)
1. All Phase 2, 3A, and 3B-1 tests still pass (counts reported).
2. **Queue:** a fixture with fix, recipe, AI, visual, AI-found, and guided findings builds the right queue in the right order, with caps and skip reasons.
3. **Deep Audit:** with a fake provider, good quotes become "Possible (AI)" findings; a quote on the wrong line, a made-up quote, a path not requested, a too-short quote, and a redacted quote are all dropped and counted; no AI text reaches Log, storage, or the bookmark; a fake audit answer cannot change the mode or approve anything.
4. **Review:** nothing changes without Approve or Apply; Reject changes nothing.
5. **Autopilot:** a good change is kept; a change whose re-check fails (target still found, new skill finding, new visual key, timeout) is undone; a visual AI fix that makes a width worse is undone; the run cap switches to Review; an AI-found bug is never auto-applied.
6. **Undo this run:** reverts exactly the run's entries in reverse order; refuses (changing nothing) after a later change by you or a hash mismatch; works on restored History after a refresh.
7. **Wait and resume:** a fake provider returns 429 with `Retry-After: 7`; the run waits, resumes, finishes; a clock jump resumes correctly; Stop during a wait leaves nothing half applied.
8. **Quota:** a daily-limit 429 ends in `paused_quota` with free fixes kept and nothing half applied; a hostile "wait 99999 s" is a long limit; the run always terminates.
9. **3-attempt cap:** a fourth AI try for one finding never happens.
10. **Passthrough:** the 429 response carries only the two numbers, never provider text.
11. **Bookmark:** valid bookmark offers Resume run; changed History, other repository, or a damaged record is refused with a plain reason and removed; the saved bytes never contain file lines, sentinels, or AI text; Reset removes it.
12. **Auto-measure:** Start with no Full check measures three widths itself; a project without previewable HTML skips visual stages and still runs.
13. **Diff and storage limits:** 120 History entries of 4,000 characters save, restore, and replay; an oversized record is skipped with the Log note and the old saved record is kept.
14. **Privacy and static tests** (R14) pass, including sentinels for key, AI answer, audit quote and explanation, provider error body, and file text.
15. **Real-browser run** (as in 3B-1) with fake providers: Deep Audit with good and bad quotes, Review run, Autopilot run with one forced bad patch auto-undone, a visual AI fix undone because a width got worse, wait and resume, `paused_quota`, Undo this run, Stop, refresh then Resume run; zero unexpected console errors; 375 px layout has no sideways scroll.
16. **Mutation checks** (design 12) are all killed. **Independent review** done and its findings handled. `npm run typecheck`, `npx vitest run`, `npm run build`, and `npm audit` pass.

## 7. Decisions (answered 2026-11-27)

| # | Decision | Answer |
|---|---|---|
| 1 | Resume after refresh | **Yes:** a tiny run bookmark (R17) and a **Resume run** button; no checkpoints of file contents or AI text |
| 2 | Autopilot cap | **20**, then switches to Review (the run continues) |
| 3 | AI limits per run | **15 AI items and 35 AI fix requests**, plus Deep Audit requests (12 chunks) |
| 4 | Wait limits | Approved: 5 s minimum, 300 s single wait, 3 waits per item, 900 s per run, clean `paused_quota` with Continue |
| 5 | Sandbox | **The run measures it automatically at Start** (R18) |
| 6 | AI fixes for visual findings | **Yes** (R7), re-measured at three widths and auto-undone if anything gets worse |
| 7 | Limits | History 120; `maxDiffChars` **4,000**; saved-data cap raised to 768 KiB so it is safe (R19) |
| 8 | Model Router | Kept; Deep Audit is a light task, code fixes heavy |
| 9 | Findings that appear after a fix | Listed in the summary, not queued |
| 10 | Autopilot confirmation wording | Approved (R5.1) |
| 11 | AI Deep Audit | **Added** (R16) with the exact-quote guard and the "Possible (AI)" label |
| 12 | `focus` and `skip` commands | Not needed |

### Choices I made that you can reverse (flagged in the report)
1. **Deep Audit and AI fixes need the existing code-lines consent tick.** Without it no code line can go to the AI (the 3A privacy rule). Deep Audit also has its own tick, off by default.
2. **Autopilot never applies fixes for AI-found bugs** (R5.6): the app cannot prove they were real. They wait for your Approve.
3. **If Run scripts is on, Start switches the Sandbox to Look only** so it can measure (R18.2).
4. **Free fixes keep a 2,000-character cap**; only AI patches and your own edits get 4,000.
