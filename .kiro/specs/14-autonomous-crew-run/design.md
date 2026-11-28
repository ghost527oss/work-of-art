# Design: 14 Autonomous Crew Run v2 (Phase 3, Sub-phase 3B-3)

Implements `requirements.md` in this folder. Names below are the as-built names found by reading the code on 2026-11-27. If a name differs when a task starts, the task adapts the call and the report says so.

## 1. Decisions already made

| Source | Decision |
|---|---|
| You, 2026-11-27 (round 1) | Build order 3B-1, 3B-3, 3B-2. Autonomous while the page is open. Review default, one Autopilot switch per run. Undo whole run. AI fixes with re-scan or re-measure and automatic undo. 429 wait-time passthrough. |
| You, 2026-11-27 (round 2, "best version") | Add AI Deep Audit with the exact-quote guard and "Possible (AI)" label. AI fixes for visual findings. Run bookmark plus Resume run. Autopilot cap 20 then Review. 15 AI items and 35 AI requests. Auto-measure the Sandbox at Start. History 120, `maxDiffChars` 4,000 if storage is safe. Router kept. No `focus` or `skip` commands. |
| 3A | 3-attempt cap per finding, "the AI never approves", the first-live-request notice, the code-lines consent, no AI text in Log, storage, or errors. All stay. |
| 3B-1 | Recipes with three-width re-measure and automatic undo; `refreshFindings`; strict privacy and static tests. Reused unchanged. |
| This design | A run is **one existing `Run` of kind `crew`** plus one new in-memory `crewRun` state. **One new storage key** (the bookmark). AI-found bugs and the queue stay in memory only. |

## 2. Phase 3 compliance

| build-phases rule | How 3B-3 complies |
|---|---|
| Strict phase boundary (3B-3 only) | No Library, Repo Map, or templates. No Phase 4 styling. |
| Mock-first | The free stages run in `mock`. Audit and AI fixes are skipped in `mock` with a plain reason; the mock adapter still answers `audit` with an empty valid answer so the contract is tested. Tests use fake providers; no real key is needed. |
| Server-side keys, free-tier fallback chain | Unchanged. Only the 429 reading in the adapter is new, on the server. |
| 3-attempt cap per error | `maxAttemptsPerFinding` 3 stays and is tested through the queue. |
| No half-applied change after a stop | A change is applied only after its checks; an unfinished change is undone on Stop; waits happen before any change. |
| Wireframe UI | `#000` and `#fff` only, no `transition`, no `animation`. |
| No unapproved features | Everything here is named in the requirements you approved. |

## 3. Lightweight-architecture audit

| Check | Result |
|---|---|
| New dependency | None. |
| New browser storage key | **One**: `patchbay.run.v1`, at most 4 KiB, ids and numbers only. |
| Bundle | About 12 small modules. Estimate under 45 kB minified. The live engine stays out of the browser bundle (existing static test). |
| Background work | One `setTimeout` for the current wait or step, one `visibilitychange` listener, one `AbortController`. All disposed when the run ends. |
| Memory | Queue at most 60 items; audit windows built one at a time; AI-found bugs at most 40. |
| Free tier | Audit (light tier, 12 requests) and AI fixes (heavy tier, 35 requests) can exhaust a daily free quota. The free stages come first; `paused_quota` is a clean stop. |

## 4. Files

### 4.1 New
| File | Node | Purpose |
|---|---|---|
| `src/config/crewRunLimits.ts` | F14.1 | Run limits (provisional): `maxItems` 60, `maxAiItems` 15, `maxAiRequests` 35, `maxAutoApplied` 20, `minWaitSeconds` 5, `longWaitSeconds` 300, `maxWaitsPerItem` 3, `maxWaitSecondsPerRun` 900, `defaultWaitSeconds` 60, `recheckTimeoutMs`, `measureTimeoutMs`, `stepGapMs`, `countdownTickMs` 1000, `bookmarkBytes` 4096. |
| `src/config/auditLimits.ts` | F14.1 | Audit limits: `maxChunks` 12, `perArea` 3, `maxWindowLines` 100, `maxWindowBytes` 6144, `maxFindingsPerChunk` 6, `maxAiBugs` 40, `quoteMin` 8, `quoteMax` 200, `titleMax`, `explanationMax`. |
| `src/engine/audit/auditRank.ts` | F14.4 | Pure. Ranks loaded files and picks up to 12 chunks (area quotas). |
| `src/engine/audit/auditRequest.ts` | F14.4 | Builds one audit request (one file, one window, redacted, numbered) with the existing `validateAIRequest`. |
| `src/engine/audit/auditVerify.ts` | F14.4 | Pure. Browser-side quote check against the practice copy; creates `Finding` objects with origin `ai`. |
| `src/engine/crewQueue.ts` | F14.5 | Pure. `buildCrewQueue`. |
| `src/store/crewRunState.ts` | F14.5 | Pure in-memory run state and transitions, notes, summary. |
| `src/store/runUndo.ts` | F14.6 | Pure plan for **Undo this run**. |
| `src/engine/runVerify.ts` | F14.7 | Pure `decideKeep`. |
| `src/engine/visualMeasured.ts` | F14.9 | Pure. Fixed-phrase `measured` line from a finding's measure. |
| `src/engine/waitPlan.ts` | F14.10 | Pure `planWait`. |
| `src/store/runStorage.ts` | F14.11 | Bookmark schema, `loadRun`, `saveRun`, `clearRun`, `validateBookmark`. Takes a `KeyValueStorage`. |
| `src/hooks/useCrewRun.ts` | F14.8+ | `createCrewRunController` and `useCrewRun`. |
| `src/hooks/useRunResume.ts` | F14.11 | Offers and performs Resume run after restore. |
| `src/components/CrewRunPanel.tsx`, `CrewRunSummary.tsx` | F14.12 | Wireframe UI. |
| Tests and helpers | F14.x | Section 12 and the tasks. Helpers `tests/helpers/{runFixtures,fakeProviderServer,clockHarness,auditFixtures}.ts`. |

### 4.2 Modified (listed so nothing is a surprise)
| File | Change |
|---|---|
| `src/config/workLimits.ts` | `maxHistoryEntries` 120; `maxDiffChars` 4,000; `maxSavedBytes` 768 KiB. |
| `src/config/aiLive.ts` | `maxProposalDiffChars` 4,000 (the existing equality test follows). |
| `src/types/contracts.ts` | `AITaskTypeSchema` + `'audit'`; `AIResponseSchema` + `audit_findings`; `AIRequestSchema` + optional `measured` (max 200); `ApiErrorSchema` + `retryAfterSeconds`, `limit`. All strict. |
| `src/engine/aiValidate.ts` | Validate `audit` requests (one path, one source file, no skill) and `audit_findings` results (path in selection, line >= 1, count cap, task match); check `measured` for secrets. |
| `src/engine/live/answerParser.ts` | `audit_findings` kind, caps, **server-side quote check** against the snippet the model saw. |
| `src/engine/live/promptBuilder.ts` | `audit` answer shape and rules; `MEASURED:` data block. |
| `src/engine/live/modelRouter.ts`, `liveAssistant.ts` | `tierOf('audit')` is light; carry wait values; new detail words (`quote_not_found`). |
| `src/engine/live/providers.ts` | On 429 read `Retry-After` and documented hints; return only `{waitSeconds?, limit?}`. |
| `api/assistant.ts` | 429 body gains the two fields; `Retry-After` header. |
| `src/engine/mockAssistant.ts` | Mock `audit` answer (valid, empty findings). |
| `src/components/AIResponseView.tsx` | Render branch for `audit_findings` (count only; the crew shows details). |
| `src/engine/contextEngine.ts` | Optional `measured` text carried into the built context for visual findings. |
| `src/engine/aiAssistant.ts` | Copy `retryAfterSeconds` and `limit` into `AssistantError`; `buildLiveRequest` passes `measured`. |
| `src/store/aiSlice.ts`, `aiActions.ts` | Failed state keeps the two numbers. |
| `src/hooks/useAssistant.ts`, `useAIHandoff.ts` | `SendInput.queueOwned` and per-send result and error callbacks; normal hand-off unchanged. |
| `src/engine/aiProposal.ts` | `{queueOwned?}` option; the "run is active" refusal is skipped only when true. |
| `src/store/workSlice.ts`, `workActions.ts`, `workStorage.ts` | `runId` on `HistoryEntry` and the saved schema; stamping in `approve` and `applyUserEdit`; merge never crosses runs; `undoRun`; crew start creates run state. Crew runs are still never saved in the work record. |
| `src/engine/commands.ts` | `undo run` (an argument of `undo`, never an AI action). |
| `src/engine/scanFindingTypes.ts`, `scanSkills.ts`, `playbook.ts`, `scanView.ts` | Finding `origin?: 'scan'|'measured'|'ai'`; skill `scan.ai.possible-bug` plus one lesson card; `mergedFindings` includes AI-found bugs; `crewStartState` also reports "a recipe is being measured". |
| `src/engine/practiceScript.ts`, `crewScript.ts` | New `StepKind` values for the crew script only. |
| `src/edit/previewHandle.ts`, `src/components/SandboxPanel.tsx` | Publish `checkAll()` (same as "Check all"), `ensureMeasurable()` (switch scripts off when needed), `canMeasureNow()`. |
| `src/hooks/useRecipe.ts` | Export `startRecipeFor(finding)`; button behaviour unchanged. |
| `src/store/sessionRecord.ts` | `RUN_KEY_NAME`, `SAVED_PARTS` gains the run bookmark row, `clearAllSession` removes it. |
| `src/hooks/useSessionRestore.ts` | Reset removes the bookmark (through `clearAllSession`); Back to Start leaves it. |
| `src/components/SkeletonCrewScreen.tsx`, `StopBar.tsx`, `ChangesMade.tsx`, `HistoryPanel.tsx`, `CrewNarration.tsx`, `FindingDetail.tsx`, `SavedDataPanel.tsx`, `src/styles.css` | Mount the Run panel; "Run <id>" and "Possible (AI)" labels; sixth saved row; new rules (`#000`/`#fff`). |
| `README.md`, `traceability/PLAN.md`, `.kiro/steering/build-phases.md` | Docs, nodes, phase line. |

### 4.3 Existing tests that change on purpose (numbers, lists, and exact strings only; no assertion weakened)
`contracts.test.ts`, `aiContracts.test.ts`, `aiValidate.test.ts`, `answerParser.test.ts`, `promptBuilder.test.ts`, `modelRouter.test.ts`, `mockAssistant.test.ts`, `aiResponseView.test.tsx` (new task and response type); `assistantApiLive.test.ts`, `liveProviders.test.ts`, `liveAssistant.test.ts` (429 body); `aiLiveConfig.test.ts` and `commands.test.ts` (pinned limits: 120, 4,000, 768 KiB); `checkLimits.test.ts` stays (free-fix cap is unchanged); `workStorage.test.ts`, `sessionRestore.test.ts` (`runId`); `storagePrivacy.test.ts`, `savedData.test.ts`, `sessionRecord.test.ts`, `sessionReset.test.ts`, `sessionUi.test.tsx` (the saved parts go from five to six); `scanSkills.test.ts`, `lessons.test.ts`, `crewUi.test.tsx`, `aiStatic.test.ts` (skill and card counts, dependency list unchanged, file lists, tags, a new storage allowance for `runStorage.ts` only); `crewRun.test.ts` (new step kinds); `commands.test.ts` (`undo run`).

### 4.4 Not touched
`src/engine/checks/*`, `src/preview/*` (except through the existing recipe controller and the published hook), `ingestPipeline.ts`, `mediaLoader.ts`, `api/repo.ts`, host lists, key handling, the Journal and export code, `previewDocument.ts`, `correctionsStorage.ts`.

## 5. Data model

```
CrewRunState (memory only)
  runId, mode: 'review' | 'autopilot'
  status: 'measuring' | 'auditing' | 'running' | 'waiting' | 'paused_quota' | 'stopped' | 'finished'
  audit: { enabled, chunksTotal, chunksDone, found, dropped, files: string[] } | null
  aiFindings: Finding[]          // origin 'ai', max 40, memory only
  items: Item[]                  // frozen after the audit
  index, autoApplied, aiRequests, auditRequests, waitSecondsUsed, resumeAt
  measure: { done: boolean, widths: number[], note: string }
  summary: SummaryCounts

Item: id, stage, skillId, path, line, area, origin, status, note, waits, tries, rechecked
Bookmark (saved, <= 4 KiB, ids and numbers only):
  { version:1, runId, repoKey, savedAt, index, remaining:[findingId...<=60], resumeAt|null,
    status, tail:{ applied:number, afterHash:string }, deepAudit:boolean, codeConsent:boolean }
```
`HistoryEntry` gains `runId?: string` (`/^[a-z0-9-]{1,40}$/`). `Finding` gains `origin?` and, for AI-found bugs, `aiTitle?` and `aiNote?` (plain text, memory only, never saved or logged).

## 6. The run loop (`useCrewRun.ts`)

```
start(opts: {deepAudit, resumeFrom?}):
  refuse via crewStartState; runId = resumeFrom?.runId ?? newId()
  1. status 'measuring': autoMeasure()                         // R18
  2. if deepAudit && live && consent: status 'auditing': runAudit()   // R16
  3. status 'running': items = buildCrewQueue(mergedFindings(state), ctx)   // frozen
  4. loop while running and index < items.length and not disposed:
       fix -> doFix | recipe -> doRecipe | ai -> doAi
       saveBookmark() after each finished item
  5. finish -> summary, clear bookmark, Log crew_run_finished
```
Each `do*` ends with the item `kept`, `undone`, `rejected`, `skipped`, or `failed`; never half done. The loop yields between items. Existing narration steps still go to the Log so `CrewNarration` keeps working.

### 6.1 `autoMeasure` (R18)
Uses the published `previewHandle`: `canMeasureNow()` (static mode, entry page loaded, no check running); if scripts are on, `ensureMeasurable()` switches to Look only; then `checkAll()` and waits for `layout.status === 'done'` with `measureTimeoutMs`. Each failure becomes a plain `measure.note` and the visual stages are marked unavailable. **If the Sandbox panel cannot supply a measurable frame on the Skeleton Crew screen, I stop and ask** (the Sandbox is mounted on this screen today: `StudioScreens` renders `SandboxPanel` in the skeleton branch).

### 6.2 `runAudit` (R16)
```
chunks = auditRank(snapshot, practice copy, findings, caps)   // up to 12 {path, area, startLine}
for chunk in chunks while auditRequests < 12:
  req = buildAuditRequest(chunk)              // one file, <=100 lines/6 KiB, redacted, numbered
  result = await assistant.send({queueOwned, taskType:'audit', ...})   // first-use notice, cache, cancel
  on rate_limited -> planWait (same rules as the AI stage); on quota -> stop audit
  on audit_findings -> verified = verifyAuditFindings(practiceCopy(chunk.path), chunk, result)  // browser check
  keep verified (cap 40); count dropped
aiFindings = verified list as Finding{origin:'ai', skillId:'scan.ai.possible-bug', certainty:'possible'}
```
The audit never proposes a patch and never changes any file.

### 6.3 `doFix`
Build with `buildFixProposal`; none: `skipped`. Review: `createProposal`; wait for the store to show `approved` or `rejected`. Autopilot: `autoApply`.

### 6.4 `doRecipe`
`startRecipeFor(finding)` (3B-1 controller): applies through `applyUserEdit`, waits for the three-width re-measure, keeps or undoes. Review: the item waits for your **Apply** click. Preconditions are checked once at the start of the stage.

### 6.5 `doAi` (static, visual, AI-found)
1. Preconditions (R7.1, R7.2): live, consent on, eligible, tries below 3, caps.
2. Request: `suggest_change`, one file, existing builder and Context Engine. **Visual finding:** `measured` = `visualMeasuredLine(finding)`; the window is centred on the element's line. **AI-found bug:** the request names the verified quote line as the focus line and the instruction is a fixed sentence plus the AI's title (neutralised by the existing prompt data-block rules).
3. Result handling through the queue-owned callback: `checkAIProposal(..., {queueOwned:true})`. A refusal or bad answer uses one try.
4. Review: the usual "AI-proposed change" card. Autopilot: `autoApply` (not for AI-found bugs).
5. `rate_limited`: no try used; `planWait` (section 8).

## 7. Autopilot: apply, re-check, keep or undo (`autoApply`)

```
autoApply(item, proposal):
  1. before = per-skill finding counts for item.path, visual keys (if measured)
  2. runCommand(state, {name:'approve'})        // the SAME code path as the Approve button
        (exact apply, exact reverse, size, secret, one file, history cap; refusal -> skipped, nothing changed)
  3. entry = newest History entry (carries runId)
  4. after = refreshFindings for item.path        (re-scan, always)
  5. if the file is .html/.css and the Sandbox is measurable: checkAll() and wait (recheckTimeoutMs)
  6. decideKeep(...) -> keep: kept, autoApplied++
                      -> not keep or timeout: runCommand(state,{name:'undo'}) only if entry is still newest;
                         item 'undone' with a plain reason; else stop the run as 'failed'
  7. if autoApplied == maxAutoApplied: mode = 'review' (run continues), plain note
```
`decideKeep` (pure, `runVerify.ts`):
- **Scan finding:** target gone (same skill and file, within a small line window) **and** no skill count higher than before.
- **Visual finding:** its problem key is gone at every measured width **and** no new problem key at any width.
- **Other finding, when measured:** no new problem key.
- **AI-found bug:** never reaches `autoApply`.
- Plain reasons: "still found", "a new problem appeared (<skill title>)", "a new layout problem appeared at <w> px", "could not be re-checked in time".

The app calls `approve` itself. The AI's answer has no way to call it: `aiActionPolicy` keeps approve, undo, and reset as never-AI, and `queueOwned` exists only inside the controller. A static test proves no AI-answer type carries `queueOwned`, `mode`, or `autopilot`.

## 8. Wait, resume, quota (`waitPlan.ts`, controller)
```
planWait(err, counters, now, limits):
  seconds = max(err.retryAfterSeconds ?? defaultWaitSeconds(60), minWaitSeconds(5))
  err.limit == 'day'                          -> quota
  seconds > longWaitSeconds(300)              -> quota
  counters.waits >= maxWaitsPerItem(3)        -> skip "The free AI stayed busy."
  run.waitSecondsUsed + seconds > 900         -> quota
  err.limit == 'unknown' and no wait given and counters.waits >= 2 -> quota
  else wait, resumeAt = now + seconds*1000
```
Controller: `setWait` stores `resumeAt`; the panel countdown is `max(0, resumeAt - now())` per second (text only). One `setTimeout` per check and one `visibilitychange` listener; only `now() >= resumeAt` decides, so a sleeping tab is correct. On resume the same item is retried. Stop clears the timer. `paused_quota`: unstarted items stay `queued` ("Not tried: daily free limit"); **Continue** restarts only the `ai` items (and any unfinished audit chunks) once. The bookmark is written at each wait and each item.

## 9. Run-level undo (`runUndo.ts`)
```
planRunUndo(work, runId):
  mine = applied entries with runId
  none -> {ok:false, "Nothing to undo for this run."}
  tail check: the newest |mine| entries on the stack are exactly mine, in order
        else {ok:false, "You made changes after the run. Undo those first."}
  simulate newest->oldest: hash(current) == afterHash, reverse diff gives beforeHash
        mismatch -> {ok:false, "<path> changed since the run."}
  -> {ok:true, steps}
undoRun: apply `steps` in one atomic update (one refreshFindings, one Log line)
```
The merge rule in `applyUserEdit` gains "same `runId`", so a run entry never merges into a user entry or another run's entry. A resumed run keeps the original `runId`.

## 10. Passthrough design (R11)
`providers.ts` reads, on 429 only: `Retry-After` (integer seconds, or an HTTP date turned into seconds from the server clock; anything else ignored); documented body hints (a retry delay such as `retryDelay: "12s"`; quota names that contain "per day", "PerDay", "daily" mean `day`, "per minute", "PerMinute", "RPM", "TPM" mean `minute`); documented `x-ratelimit-reset*` headers. Output is clamped: an integer 0 to 86,400 and one of three words; provider text is dropped. **Task A2 re-reads the providers' current public rate-limit documentation (web check) and the tests use fakes shaped like it. Real headers are Unverified until a real run.** `runAttempts` keeps one value per limited provider; `answerLive` combines (shortest wait; `day` only if all say day); `api/assistant.ts` writes both fields into the error JSON and sets `Retry-After`. `requestAssistant` copies them into `AssistantError`.

## 11. The Deep Audit guard (R16) in detail
- **Prompt rules (promptBuilder, `audit`):** answer only `{"kind":"audit_findings","findings":[{"path","line","quote","title","explanation"}],"limitations":[...]}`; `quote` must be copied exactly from one numbered line; at most 6 findings; report nothing you cannot quote; include nothing about style. The file text is in the existing `<data>` blocks, so text in a file cannot become an instruction.
- **Server check (`parseAnswer`):** for each finding, `path` equals the requested path; `line` is inside the snippet's `startLine` to last line; the whitespace-normalised `quote` is a substring of that numbered line; quote length 8 to 200 after trimming and has at least 8 non-space characters, is not only punctuation, and does not contain `[REDACTED:`. Failures are removed. If none remain and some existed, the answer is still valid with a limitation note (no AI text is stored).
- **Browser check (`verifyAuditFindings`):** the current practice copy of the file (`practiceContent`), line endings normalised, line `n` contains the quote. Then the finding is created with `area` from PatchBay's own file-to-area rule, never from the AI.
- **Why twice:** the server check guards against what the model saw (and enables fallback to another provider when the answer is bad); the browser check guards against redaction differences and a practice copy that changed after the request.
- AI-found findings carry `aiTitle` and `aiNote` as plain text for display only, and are excluded from every export, Log message, saved record, and bookmark. The Journal and exports are not changed.

## 12. Mutation checks (A14), each must be killed by a test
Queue and order: 1 put `ai` before `recipe`; 2 drop the 15-item cap; 3 drop the 35-request cap; 4 drop the audit 12-chunk cap; 5 drop the 40-bug cap.
Modes and Autopilot: 6 Review applies without a click; 7 Autopilot skips the `approve` path checks; 8 keeps a change whose target is still found; 9 keeps a change that raises a skill count; 10 skips the visual-key comparison; 11 keeps a visual AI fix that worsens a width; 12 skips the undo after a failed re-check; 13 undoes the wrong entry; 14 run cap not enforced; 15 run cap stops the run instead of switching to Review; 16 Autopilot applies an AI-found bug; 17 an AI answer field can set the mode; 18 `queueOwned` set on a non-queue request.
Audit: 19 skip the server quote check; 20 skip the browser quote check; 21 accept a quote on the wrong line; 22 accept a path that was not requested; 23 accept a quote under 8 characters; 24 accept a redacted quote; 25 take the area from the AI; 26 save an AI finding to storage or the bookmark; 27 audit runs without the consent tick; 28 audit runs in mock mode.
Tries and waits: 29 a rate limit counts as a try; 30 a fourth try allowed; 31 `planWait` ignores `day`; 32 allows a wait over 300 s; 33 no minimum wait; 34 per-item wait cap dropped; 35 per-run wait cap dropped; 36 resume decided by a counter, not the clock; 37 `visibilitychange` not handled; 38 Stop during a wait leaves a timer.
Undo: 39 run undo skips the tail check; 40 run undo skips the simulation (half undo); 41 merge across runs allowed; 42 a resumed run gets a new `runId`.
Passthrough: 43 provider text passed into the 429 body; 44 `day` when only one provider said day; 45 largest wait instead of shortest; 46 `Retry-After` not clamped.
Bookmark and measure: 47 bookmark holds a file line, quote, or AI text; 48 bookmark accepted with a different `repoKey`; 49 bookmark accepted when History changed; 50 Resume starts by itself; 51 Reset leaves the bookmark; 52 Autopilot saved in the bookmark; 53 no auto-measure at Start; 54 auto-measure turns scripts on; 55 measure while a check is running.
Other: 56 queue saved to storage; 57 mock mode sends an AI request; 58 dispose leaves the listener; 59 summary says "fixed"; 60 a 4,000-character History entry not saved (cap mismatch).

## 13. Failure handling
- **Recipe times out or the Sandbox closes:** recipe undone (3B-1), remaining recipe items skipped.
- **Auto-measure fails or times out:** plain note, visual stages skipped, everything else runs.
- **Re-check times out:** treated as failed (R8.3).
- **You change the practice copy under the run:** Edit is closed while a run is active (existing gate); only one proposal exists at a time. Any other unexpected change ends the run safely as `stopped` with the reason.
- **Network error or timeout on an AI request:** the item is `failed` with the 3A plain message; the run continues (no wait, not a rate limit). In the audit, the chunk is skipped.
- **All providers 5xx:** same as network error.
- **Hostile answer (audit or patch):** refused by the parser, validator, and `checkAIProposal`; a patch refusal uses one try; a hostile audit answer yields zero findings.
- **Hidden tab:** timers may slow down; the clock decides; an in-flight request completes or times out normally.
- **Storage full or blocked:** the bookmark save is skipped silently with one Log note; the run goes on.

## 14. Risks and known limits
- **Real provider headers and daily quotas are Unverified.** The tests use fakes shaped like the documentation.
- **AI audit quality is not tested.** The guard proves a quote exists on the line; it cannot prove the AI's explanation is right. That is why the label says "Possible (AI)" and Autopilot never applies those fixes.
- **Audit sees windows, not whole files.** At most 12 windows of 100 lines. Large files are only sampled.
- **A prompt of 12,000 characters** limits the window; very long lines shorten it.
- **Re-scan compares counts per skill, not exact lines.** A fix that removes one problem and adds a different one of the same skill is not seen. The summary says so.
- **Autopilot trusts the checks, not the meaning.** A change can pass every check and still be wrong. Undo this run is the safety net.
- **The free daily AI quota is small.** A full run (up to 12 audit plus 35 fix requests) will often hit it on one provider; the chain of three providers and `paused_quota` are the answer.
- **Resume run** repeats auto-measure, loses AI-found bugs, and always starts in Review.
- **4,000-character diffs and 120 entries** need the 768 KiB saved-data cap; a record that is still too big is skipped with a Log note, and the earlier saved record stays.
- Sleeping background tabs on real devices, phones, and non-Chromium browsers are Unverified.

## 15. PLAN.md nodes
`F14` with `F14.1` limits and storage sizes, `F14.2` 429 passthrough, `F14.3` audit contracts and server guard, `F14.4` audit engine, `F14.5` queue and state, `F14.6` run-level undo, `F14.7` keep-or-undo and Autopilot, `F14.8` controller, fix stage, Review, auto-measure, `F14.9` recipe stage and AI stage (static, visual, AI-found), `F14.10` audit stage, wait and resume, quota, `F14.11` bookmark and Resume run, `F14.12` UI, `F14.13` tests, and the `F14` gate. Plan id `P3B3-AUTONOMOUS-RUN`. (`F13` is reserved for 3B-2.)
