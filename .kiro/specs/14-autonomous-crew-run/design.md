# Design: 14 Autonomous Crew Run v2 (Phase 3, Sub-phase 3B-3)

Implements `requirements.md` in this folder. Names below are the as-built names found by reading the code on 2026-11-27. If a name differs when a task starts, the task adapts the call and the report says so.

## 1. Decisions already made

| Source | Decision |
|---|---|
| You, 2026-11-27 | Build order 3B-1, 3B-3, 3B-2. The run is **autonomous while the page is open**. Review is the default; one Autopilot switch per run. Undo whole run. Single-file AI fixes with re-scan or re-measure and automatic undo. 429 wait-time passthrough from `api/assistant.ts`. |
| You, 2026-11-27 | `Current Active Phase` is `Phase 3 (Sub-phase 3B-3)` (done). |
| 3A | The 3-attempt cap per finding, "the AI never approves", the first-live-request notice, no AI text in Log, storage, or errors. All stay. |
| 3B-1 | Recipes with three-width re-measure and automatic undo; `refreshFindings` re-scan; the strict privacy and static tests. All reused unchanged. |
| This spec | A run is **one existing `Run` of kind `crew`** plus one new in-memory `crewRun` state. No new storage key. No checkpoints (decision 1). |

## 2. Phase 3 compliance

| build-phases rule | How 3B-3 complies |
|---|---|
| Strict phase boundary (3B-3 only) | No Library, Repo Map, or templates. No Phase 4 styling. |
| Mock-first | The free stages run in `mock`. The `ai` stage is skipped in `mock` with a plain reason. Tests use fake providers. No real key is needed. |
| Server-side keys, free-tier fallback chain | Unchanged. Only the adapter's reading of the 429 headers is new, on the server. |
| 3-attempt runtime cap per error | `maxAttemptsPerFinding` 3 stays and is tested through the queue (R7.5, gate 8). |
| No half-applied change after a stop | A change is applied only after its checks; an unfinished change is undone on Stop; waits happen before any change. |
| Wireframe UI | `#000` and `#fff` only, no `transition`, no `animation`. |
| Forbidden in Phase 3: unapproved features | Everything here is named in the requirements you approved. |

## 3. Lightweight-architecture audit

| Check | Result |
|---|---|
| New dependency | None. |
| New browser storage key | None. One optional field (`runId`) on saved History entries. |
| Bundle | About 6 small modules (queue, verify, wait plan, controller, panel). Estimate under 25 kB minified. The live engine stays out of the browser bundle (existing static test). |
| Background work | One `setTimeout` for the current wait or step, one `visibilitychange` listener, one `AbortController`. All disposed when the run ends. |
| Free tier | The `ai` stage is last, capped at 8 items and 20 requests, and falls back across providers as in 3A. |
| Complexity | The run reuses `Run`, `runCommand`, `refreshFindings`, `buildFixProposal`, `createRecipeController`, `checkAIProposal`, and `assistant.send`. New logic is the queue order, the keep-or-undo decision, the wait plan, and run-level undo. |

## 4. Files

### 4.1 New
| File | Node | Purpose |
|---|---|---|
| `src/config/crewRunLimits.ts` | F14.1 | All 3B-3 limits (provisional): `maxItems` 60, `maxAiItems` 8, `maxAiRequests` 20, `maxAutoApplied` 20, `minWaitSeconds` 5, `longWaitSeconds` 300, `maxWaitsPerItem` 3, `maxWaitSecondsPerRun` 900, `defaultWaitSeconds` 60, `recheckTimeoutMs`, `countdownTickMs` 1000, `stepGapMs`. |
| `src/engine/crewQueue.ts` | F14.3 | Pure. `buildCrewQueue(findings, ctx) -> {items, guided, leftOut}`: stage choice, order, caps, skip reasons. |
| `src/engine/runVerify.ts` | F14.5 | Pure. `decideKeep({target, before, after, visualBefore?, visualAfter?}) -> {keep:boolean, reason}`: the R8 rule (target gone, no new skill count, no new visual key). |
| `src/engine/waitPlan.ts` | F14.8 | Pure. `planWait(error, counters, now) -> {kind:'wait', resumeAt} | {kind:'skip', reason} | {kind:'quota'}` applying R9.4 and R10. |
| `src/store/crewRunState.ts` | F14.3 | Pure state and transitions for the in-memory run: `CrewRunState`, `startCrewRun`, `setMode`, `markItem`, `setWait`, `finishRun`, plain notes, summary builder. |
| `src/store/runUndo.ts` | F14.4 | Pure plan and apply for **Undo this run**: `planRunUndo(work, runId) -> {ok, steps}|{ok:false, reason}`; applied through the existing single-undo steps. |
| `src/hooks/useCrewRun.ts` | F14.6 to F14.8 | `createCrewRunController(store, services)` and `useCrewRun()`: the async driver (steps, recipe, AI request, waits, Stop, dispose). |
| `src/components/CrewRunPanel.tsx` | F14.9 | Run panel: Start, Autopilot switch and confirm, queue, current item, wait line, Stop, Undo this run, summary. |
| `src/components/CrewRunSummary.tsx` | F14.9 | The final plain summary list. |
| Tests | F14.x | See section 11 and the tasks. Helpers `tests/helpers/{runFixtures,fakeProviderServer,clockHarness}.ts`. |

### 4.2 Modified (listed so nothing is a surprise)
| File | Change |
|---|---|
| `src/config/workLimits.ts` | `maxHistoryEntries` 50 to 120. Nothing else. |
| `src/store/workSlice.ts` | `HistoryEntry` gains optional `runId`; `Run` gains optional `runId` and `kind:'crew'` carries it; new `undoRunRefusal`. Existing behaviour unchanged when `runId` is absent. |
| `src/store/workActions.ts` | `crew` start creates the `runId` and `crewRun` state; `approve` and `applyUserEdit` stamp `runId` (merge never crosses runs); new `undoRun`. |
| `src/store/workStorage.ts` | Schema: optional `runId` on History entries, limits follow `maxHistoryEntries`. Crew runs are still never saved. |
| `src/engine/commands.ts` | New command `undo run` (an argument of `undo`, not a new action name); never an AI action. |
| `src/engine/aiProposal.ts` | `checkAIProposal` takes `{queueOwned?:boolean}`; the "run is active" refusal is skipped only when it is true. Every other refusal stays. |
| `src/engine/practiceScript.ts`, `src/engine/crewScript.ts` | Two new `StepKind` values, `recipe` and `ai`, in the crew script only (not in the saved-work schema). |
| `src/engine/live/providers.ts` | On 429 read `Retry-After` and (where documented) a body hint; return `{outcome:'rate_limited', waitSeconds?, limit?}` only. |
| `src/engine/live/modelRouter.ts`, `liveAssistant.ts` | Carry the two values; combine across providers (shortest wait; day only if all say day). |
| `api/assistant.ts` | `jsonError` for 429 adds `retryAfterSeconds` and `limit`; also the standard `Retry-After` response header (integer seconds). |
| `src/types/contracts.ts` | `ApiErrorSchema` gains optional `retryAfterSeconds` (int 0 to 86,400) and `limit` (`minute|day|unknown`); strict schema, so contract tests change on purpose. |
| `src/engine/aiAssistant.ts` | `requestAssistant` copies both fields into `AssistantError`. |
| `src/store/aiActions.ts`, `src/store/aiSlice.ts` | The failed state keeps the two numbers (not text). |
| `src/hooks/useAssistant.ts`, `src/hooks/useAIHandoff.ts` | A second, queue-owned result handler path (`send({queueOwned:true})`); the normal hand-off is unchanged. |
| `src/hooks/useRecipe.ts` | Export a small `startRecipeFor(finding)` that the run uses; behaviour of the Edit-panel button is unchanged. |
| `src/components/SkeletonCrewScreen.tsx`, `StopBar.tsx`, `ChangesMade.tsx`, `HistoryPanel.tsx`, `CrewNarration.tsx` | Mount the Run panel; show "Run <id>" on entries; Stop also stops the run. |
| `src/engine/scanView.ts` | `crewStartState` also reports "a recipe is being measured". |
| `README.md`, `traceability/PLAN.md`, `.kiro/steering/build-phases.md` | Docs, nodes, phase line. |

### 4.3 Existing tests that change on purpose (numbers and exact strings only)
`contracts.test.ts` (new optional fields), `assistantApiLive.test.ts`, `liveProviders.test.ts`, `liveAssistant.test.ts` (429 body), `workStorage.test.ts` and `sessionRestore.test.ts` (`runId`, 120), `workState`/`workActions` tests (history cap 120), `aiProposal.test.ts` (new option, default unchanged), `aiStatic.test.ts` (file lists, new node tags), `commands.test.ts` (`undo run`), `crewRun.test.ts` (new step kinds). No assertion is weakened.

### 4.4 Not touched
`src/engine/checks/*`, `src/preview/*` (except through the existing recipe controller), `src/engine/ingestPipeline.ts`, `mediaLoader.ts`, `contextEngine.ts`, `api/repo.ts`, the host lists, the provider key handling, `aiValidate.ts`, the Journal and export code, `previewDocument.ts`.

## 5. Data model

```
CrewRunState (memory only, never saved)
  runId: string                  // short id, e.g. "r-k3f9"
  mode: 'review' | 'autopilot'
  status: 'running' | 'waiting' | 'paused_quota' | 'stopped' | 'finished'
  items: Item[]                  // frozen at start
  index: number                  // current item
  autoApplied: number            // for the run cap
  aiRequests: number             // for the 20-request cap
  waitSecondsUsed: number        // for the 900 s cap
  resumeAt: number | null        // epoch ms, set only while waiting
  summary: SummaryCounts         // built from items at the end

Item
  id, stage: 'fix'|'recipe'|'ai', skillId, path, line, area
  status: queued|working|waiting|kept|undone|rejected|skipped|failed
  note: string                   // plain words from fixed phrases, never AI text
  waits: number, tries: number   // tries mirrors state.ai.attempts[findingKey]
  rechecked: 'scan+measure' | 'scan-only' | 'none'
```

`HistoryEntry` gains `runId?: string` (`/^[a-z0-9-]{1,40}$/`). `Run` (kind `crew`) gains `runId`.

## 6. The run loop (`useCrewRun.ts`)

One async function drives the queue; each loop turn is one item. Pseudo-flow:

```
start(mode='review'):
  refuse via crewStartState; runId = newId()
  state: Run(kind crew) + CrewRunState (queue from buildCrewQueue)
  Log run_started (existing) + crew_run_started
  loop while status=='running' and index < items.length and not disposed:
    item = items[index]
    if stage == 'fix':    await doFix(item)
    if stage == 'recipe': await doRecipe(item)
    if stage == 'ai':     await doAi(item)       // may set waiting / paused_quota
    index++
  finish -> summary, Log crew_run_finished
```

Each `do*` ends with the item `kept`, `undone`, `rejected`, `skipped`, or `failed`, never half done. Between items the loop yields (`await` of a zero timer) so the page stays responsive. The existing narration steps (`area`, `finding`) still go to the Log from the existing `crewScript` for areas the run touches, so `CrewNarration` keeps working; the new run adds its own fixed-phrase Log actions (section 9).

### 6.1 `doFix`
1. Build the proposal with `buildFixProposal` (R2). No proposal: `skipped` with the reason.
2. Review: `createProposal` (existing); wait for the store to show `approved` or `rejected` for that proposal id (a subscription, disposed after). Approved: run R8 result display only. Rejected: `rejected`.
3. Autopilot: `autoApply(item, proposal)` (section 7).

### 6.2 `doRecipe`
Uses the existing recipe controller (3B-1) through `startRecipeFor(finding)`. The controller already: applies via `applyUserEdit`, waits for the three-width re-measure, keeps or undoes. The run adds only: `runId` stamping (through `applyUserEdit` context), and for Review mode a **pending** item that starts only after your Apply click on that item. Preconditions are checked once when the stage starts (R3.2); if they fail all recipe items are `skipped` together.

### 6.3 `doAi`
1. Preconditions (R7.1, R7.2): live mode, eligible file, attempts below 3, caps. Else `skipped` with the reason.
2. Send the request through the existing assistant with `queueOwned: true`, `taskType:'suggest_change'`, one file, the existing request builder and Context Engine. The first-live-request notice (3A) still appears and must be accepted; if it is discarded or cancelled the item is `skipped` ("The AI notice was not accepted.") and the AI stage stops.
3. Result handling uses a queue-owned handler: `checkAIProposal(state, request, result, {findingId, queueOwned:true})`. A refusal uses one try (`aiCountAttempt` already happens inside the accepted-proposal path in 3A; an unusable answer is counted by the queue so the cap holds).
4. Review: the usual card; wait for the decision. Autopilot: `autoApply`.
5. Failure `rate_limited`: do not count a try; `planWait` (section 8).

## 7. Autopilot: apply, re-check, keep or undo (`autoApply`)

```
autoApply(item, proposal):
  1. before = scan findings for item.path (counts per skill) and visual keys (if measured)
  2. runCommand(state, {name:'approve'})        // the SAME code path as the Approve button
        (Approve already runs: exact apply, exact reverse, size, secret, one file, history cap;
         a refusal -> item skipped with that reason, nothing changed)
  3. entry = newest History entry; it carries runId (stamped in approve)
  4. after = refreshFindings result for item.path   (re-scan, always)
  5. if file in preview and Full check exists: wait for re-measure (3 widths) up to recheckTimeoutMs
  6. decideKeep(...)  -> keep: item 'kept', autoApplied++, Log
                       -> not keep or timeout: runCommand(state,{name:'undo'}) only if entry is still newest;
                          item 'undone' with the plain reason; else stop run as 'failed' (R8.4)
  7. if autoApplied == maxAutoApplied: mode = 'review', note the switch
```

The app calls `approve` itself. The AI's answer has no way to call it: `aiActionPolicy` still lists approve, undo, reset as never-AI, and the queue-owned flag only exists in the controller (not in any request or answer field). The static test greps that no AI-answer type carries `queueOwned`, `mode`, or `autopilot`.

`decideKeep` (pure, `runVerify.ts`):
- `target gone`: no finding with the target's skill in that file at the target's place **or** the file's count of that skill went down by at least one and the specific finding key is gone (keys are skill plus nearest-line within a small window, because lines move).
- `no new skill`: for every skill, `after.count <= before.count` (the target's skill may drop).
- `no new visual key` when measured (3B-1 `problemKey` set comparison).
- Returns plain reasons: "still found", "a new problem appeared (<skill title>)", "a new layout problem appeared", "could not be re-checked in time".

## 8. Wait, resume, quota (`waitPlan.ts`, controller)

`planWait(err, counters, now, limits)`:
```
seconds = err.retryAfterSeconds ?? limits.defaultWaitSeconds (60), at least minWaitSeconds (5)
if err.limit == 'day'                         -> quota
if seconds > longWaitSeconds (300)            -> quota
if counters.waits >= maxWaitsPerItem (3)      -> skip "The free AI stayed busy."
if run.waitSecondsUsed + seconds > 900        -> quota
else                                          -> wait, resumeAt = now + seconds*1000
if err.limit == 'unknown' and counters.waits >= 2 and no wait time was given -> quota
```
Controller wait handling:
- `setWait` stores `resumeAt`; the status is `waiting`; the panel shows the countdown computed as `max(0, resumeAt - now())` each second (a text refresh, not an animation).
- One `setTimeout` per check (`min(1000, resumeAt - now)`), and a `visibilitychange` listener that checks at once on return. A clock jump (sleeping tab) is handled because only `now() >= resumeAt` decides.
- On resume the same item is retried (`doAi` again). `waits++`, `waitSecondsUsed += seconds`.
- Stop during a wait: clear the timer, status `stopped`, nothing else to undo.
- `paused_quota`: items not started stay `queued` with note "Not tried: daily free limit"; the run is finished from the loop's point of view. **Continue** (button) restarts only the `ai` items once; it resets nothing else.

## 9. Log actions (fixed phrases only, no AI text)
`crew_run_started` (mode, item counts), `crew_item_kept`, `crew_item_undone` (plain reason), `crew_item_skipped` (plain reason), `crew_run_waiting` ("Free AI busy, retrying in N seconds"), `crew_run_resumed`, `crew_run_quota`, `crew_autopilot_on`, `crew_autopilot_off` (with "cap reached" or "you turned it off"), `crew_run_undone` (counts), `crew_run_finished` (counts). Messages go through the existing `redact`. Paths and numbers only.

## 10. Run-level undo (`runUndo.ts`, `workActions.undoRun`)

```
planRunUndo(work, runId):
  stack = work.applied                           // oldest ... newest
  mine = entries with runId (not already undone)
  if mine is empty -> {ok:false, "Nothing to undo for this run."}
  tail check: the newest |mine| entries on the stack must be exactly mine (in order)
        else -> {ok:false, "You made changes after the run. Undo those first."}
  simulate each undo newest->oldest on the practice content:
        hashText(current) must equal entry.afterHash, then reverse diff must give beforeHash
        any mismatch -> {ok:false, "<path> changed since the run."}
  -> {ok:true, steps}
undoRun: apply `steps` in one atomic store update (one refreshFindings at the end, one Log line)
```
Because the check is a full simulation first, the result is all or nothing. The undone entries move to `undone` in order, so existing Redo works one at a time. `maxHistoryEntries` 120 counts applied plus undone as today.

Recipe entries go through `applyUserEdit`, which merges bursts by `editKey`: the merge condition gains "same `runId`" so a run entry never merges into a user entry or another run's entry.

## 11. Passthrough design (R11)

`providers.ts` (the only place that calls providers) `statusOutcome(429)` becomes `rateLimited(headers, bodyText)`:
- `Retry-After`: integer seconds, or an HTTP date converted to seconds from the server clock. Anything else is ignored.
- Body hints, parsed leniently by plain string and JSON reading, only to extract a number and a kind:
  - a retry delay such as `"retryDelay": "12s"` (Google-style error details),
  - quota names or messages that contain "per day", "PerDay", "daily", or "RPD" mean `day`; "per minute", "PerMinute", "TPM", "RPM" mean `minute`,
  - rate-limit reset headers (`x-ratelimit-reset*`) where a provider sends them, read as seconds or milliseconds-since-epoch and converted.
- **These formats are from the providers' public documentation as I remember it; task A2 re-checks them against current docs (web check) and the tests use fake providers shaped like those docs. Real rate-limit headers are Unverified until a real run.** If nothing can be read the adapter returns no wait and `unknown`.
- Output is clamped: `waitSeconds` is an integer 0 to 86,400; `limit` is one of three words. The provider's text is dropped. A sentinel test proves it.

`runAttempts` keeps one `{waitSeconds?, limit?}` per limited provider. `answerLive` combines when all attempts were rate limits: `retryAfterSeconds` = the smallest wait present (omitted if none); `limit` = `day` only if every limited provider said `day`, else `minute` if any said `minute`, else `unknown`. `api/assistant.ts` writes both fields into the error JSON and sets the `Retry-After` header (integer seconds, only when known). The message text is unchanged.

`requestAssistant` copies both fields (validated by the schema) into `AssistantError`; `failAIRequest` keeps them in the failed state (numbers and a word only).

## 12. Mutation checks (A11), each must be killed by a test
1. Order: put `ai` before `recipe`. 2. Drop the 8-AI-item cap. 3. Drop the 20-request cap. 4. Review mode applies without a click. 5. Autopilot applies without the safety checks (skip the `approve` path). 6. Autopilot keeps a change whose target is still found. 7. Autopilot keeps a change that adds a new skill finding. 8. Skip the visual-key comparison. 9. Skip the undo after a failed re-check. 10. Undo the wrong entry on failed re-check. 11. Run cap not enforced. 12. AI answer can set mode (add a field and read it). 13. `queueOwned` set on non-queue requests. 14. A rate limit counts as a try. 15. A fourth try allowed. 16. `planWait` ignores `day`. 17. `planWait` allows a wait over 300 s. 18. No minimum wait. 19. Wait cap per item dropped. 20. Run wait cap dropped. 21. Resume decided by a counter, not the clock. 22. `visibilitychange` not handled (sleep test). 23. Stop during wait leaves a timer. 24. Run-level undo skips the tail check. 25. Run-level undo skips the simulation (half undo). 26. Merge across runs allowed. 27. Provider text passed into the 429 body. 28. `day` when only one of two providers said day. 29. Largest wait instead of shortest. 30. `Retry-After` header not clamped. 31. `runId` accepted with a bad shape. 32. Queue saved to storage. 33. Mock mode sends an AI request. 34. Dispose leaves the listener. 35. Summary says "fixed".

## 13. Failure handling
- **Recipe times out or the Sandbox closes:** recipe undone (3B-1), remaining recipe items skipped.
- **Re-check times out:** treated as failed (R8.3).
- **Store changed under the run (you edit while it runs):** Edit is closed while a run is active (existing gate), and manual Approve of another proposal cannot happen because one proposal exists at a time. A change by you outside these paths ends the run safely as `stopped` with the reason.
- **Network error or timeout on an AI request:** the item is `failed` with the 3A plain message; the run continues with the next item (no wait, since this is not a rate limit).
- **Provider returns 5xx on all:** same as network error.
- **Hostile answer:** refused by `checkAIProposal` and `aiValidate`; counts one try.
- **Browser tab hidden:** timers may be slow; clock checks make waits correct; the AI request in flight completes or times out normally.

## 14. Risks and known limits
- **Real provider headers are Unverified.** The tests use fakes shaped like the documentation. A real daily quota is not tested.
- **Visual stage needs the Sandbox mounted.** If the Skeleton Crew screen cannot keep the preview mounted, the recipe stage ships as "available when the Sandbox is open" and I stop and ask before adding more (batch stop rule).
- **Re-scan compares counts per skill, not exact lines.** A fix that removes one problem and adds a different one of the same skill is not seen. This is stated in the summary.
- **Autopilot trusts the checks, not the meaning.** A change can pass every check and still be wrong for the project. Undo this run is the safety net.
- **Free AI quota is small.** A live run will often hit the limit; the free stages are why the run is still useful.
- **No resume after refresh** (decision 1). Applied changes remain in History and can be undone.
- Background tabs on real devices and phones are Unverified.

## 15. PLAN.md nodes
`F14` with `F14.1` limits and model, `F14.2` wait passthrough, `F14.3` queue and state, `F14.4` run-level undo, `F14.5` verify and Autopilot, `F14.6` fix stage and Review, `F14.7` recipe and AI stages, `F14.8` wait and resume, `F14.9` UI, `F14.10` tests, and the `F14` gate. Plan id `P3B3-AUTONOMOUS-RUN`. (`F13` is reserved for 3B-2.)
