# Design: 04 Action Harness (Phase 2, Sub-phase 2B)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2B**. Wireframe only, no animation, `AI_MODE=mock` only, no new dependency. Built on top of the 2A shell (`03-studio-shell`): it uses `layoutStore`, `shellStore`, `StudioLayout`, `LogPanel`, and `PlaceholderPanel`.

## 1. Decisions already made

| Source | Decision |
|---|---|
| Interview answers | Fixed command words in AI Chat (free sentences wait for Phase 3). One always-visible Stop button. Opening Edit pauses automation until you resume. Approve and Reject as typed words and as buttons on proposal cards. Log and History are separate. Never save secrets. |
| 2A spec, R9 | Everything saved must use its own versioned key, hold plain data, and never hold secrets or file contents. The Studio reads state from stores. 2B follows this. |
| Requirements section 7 (pending your answers) | Only practice proposals are approvable. Commands share the AI instruction box. One saved slot. Undo and redo only when paused or idle. Stop also cancels AI and rejects the proposal. Provisional limits. Edit closing does not resume. |

## 2. Phase 2B compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2B) | Action list, commands, practice run, proposals, History with Undo and Redo, modes, Log, saved work. No scanner, no sorting, no sandbox, no editor, no Journal. |
| One safe action list used by the AI Chat harness; chat-driven control; no separate pause/resume buttons | One data table of actions. Only Stop (always visible), Approve and Reject (on proposal cards) are buttons, as you approved. |
| Browser storage for layout, log, and history; never secrets or whole repositories | The saved work holds the log, the run script, the waiting proposal, and the history as **zero-context diffs and fingerprints**. No file content is stored. |
| AI Chat in `AI_MODE=mock` only; no real LLM calls | The practice run makes no AI call. The only AI interaction is cancelling a pending request. |
| Black-and-white wireframe, no animation | New CSS uses only `#000`, `#fff`, and borders. Timer ticks change text, not visuals. |
| New runtime dependencies need approval | None added. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | No package. The diff applier is about 120 lines, hand-written. Zod validates the saved record. `localStorage` is a browser built-in. |
| 2. Memory and bundle | PASS | At most 8 steps, 1 proposal, 50 history entries, 500 log entries, 20 chat replies. Each saved diff is at most 2,000 characters, so the saved record stays well under 256 KB. Bundle growth is reported in the final task against the 2A baseline. |
| 3. Free-tier resilience | PASS | No network and no external service. A blocked or full storage degrades to in-memory work. |
| 4. Teardown | PASS | One timer (cleared on pause, decision wait, stop, finish, snapshot change, and dispose) and two store subscriptions (studio store and layout store), all released in `dispose`. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/config/workLimits.ts` | Every 2B limit in one place, marked provisional: tick 1,200 ms, 8 steps, 2 practice files, 20 KB per practice file, 50 history entries, 20 chat replies, 200 saved log entries, 256 KB saved text, 2,000-character diff. |
| `src/engine/diffApply.ts` | `applyUnifiedDiff(content, diff)`, `reverseUnifiedDiff(diff)`, `hashText(text)`. Pure. Strict: every context and removed line must match exactly. |
| `src/engine/commands.ts` | `ACTIONS` table, `parseCommand(text)`, `HELP_LINES`. Pure. |
| `src/engine/practiceScript.ts` | `buildPracticeScript(snapshot)` and `practiceContent(snapshot, applied, path)`. Pure. Uses `redact` and `buildInsertDiff` from spec 02. |
| `src/store/workSlice.ts` | Types (`Run`, `RunStep`, `Proposal`, `HistoryEntry`, `ChatLine`, `WorkState`), `idleWork()`, and the pure transitions on `WorkState` alone. |
| `src/store/workActions.ts` | Whole-state actions with Log entries: `runCommand`, `tickRun`, `enterSelfEditing`, `restoreWork`, `clearWork`. Imports `withLog` from `useStudioStore`. |
| `src/store/workStorage.ts` | `WorkRecordSchema`, `repoKeyOf(snapshot)`, `buildRecord`, `trimRecord`, `loadWork`, `saveWork`, `clearWorkSlot`, `attachWorkPersistence` helpers. Never throws. |
| `src/hooks/useHarness.ts` | `createHarnessController(...)` and `useHarness(assistant)`: the timer, the layout bridge, restore and save with the restore gate, and the actions the UI calls. |
| `src/components/StopBar.tsx` | The always-visible status line with the Stop button. Props only. |
| `src/components/ProposalCard.tsx` | The proposal card with Approve and Reject. Props only. |
| `src/components/HistoryPanel.tsx` | The History list. Props only. |
| `src/components/EditPanel.tsx` | The 2B Edit panel: mode text and the resume hint. Props only. |
| Tests | `diffApply`, `commands`, `practiceScript`, `workState`, `workActions`, `workStorage`, `harnessController` (`*.test.ts`); `harnessUi` (`*.test.tsx`). |

### 4.2 Modified (small, listed so nothing is a surprise)
| File | Change |
|---|---|
| `src/store/useStudioStore.ts` | `StudioState` gains `work: WorkState`. `initialState()` sets `idleWork()`. The four actions that already set `ai: idleAI()` also set `work: idleWork()`. No other change. |
| `src/store/layoutSlice.ts` | Adds one pure action `openPanelById(state, id)`: opens and expands that panel, keeps `width`, returns the same object if already open and expanded. |
| `src/components/AIAssistantPanel.tsx` | Gains a `harness` prop. Send first offers the text to `harness.submitText`. The command replies and a one-line hint ("Type help for commands") appear above the form, and the proposal card appears above the replies. The existing form, limits, and AI behavior are unchanged. |
| `src/components/LogPanel.tsx` | Removes the 2B placeholder note. |
| `src/components/StudioLayout.tsx` | Gains a `harness` prop. Renders `StopBar` above all three screens, `HistoryPanel` and `EditPanel` for those panels, and passes `harness` to the AI panel. |
| `src/App.tsx` | Calls `useHarness(assistant)` once and passes the result down. |
| `src/styles.css` | A new black-and-white block for the stop bar, cards, history, and replies. |
| `traceability/PLAN.md` | Adds plan `P2B-HARNESS` with nodes F4.1 to F4.9. |

### 4.3 Not touched
`api/*`, `src/engine/{aiAssistant,aiValidate,mockAssistant,redact,unifiedDiff,...}.ts` (used, not changed), `src/types/contracts.ts`, `src/store/{aiSlice,aiActions,layoutStorage}.ts`, `src/hooks/{useAssistant,useIngestion,useLayout,useShell}.ts`, `AIResponseView.tsx`, `CoveragePanel.tsx`, `ProjectInfo.tsx`, and all existing tests. The log entry type stays the existing `SessionLogEntry`, so `contracts.ts` does not change.

## 5. Data model (`workSlice.ts`)

```ts
type RunStatus = 'running' | 'paused' | 'awaiting_decision' | 'stopped' | 'finished'
type StepKind  = 'info' | 'plan' | 'propose' | 'verify' | 'finish'
interface RunStep  { kind: StepKind; title: string; skill?: string; path?: string }
interface Run      { id: string; status: RunStatus; autoAdvance: boolean; position: number; steps: RunStep[] }
interface Proposal { id: string; path: string; title: string; diff: string }
interface HistoryEntry { id: string; path: string; title: string; at: number; diff: string; beforeHash: string; afterHash: string }
interface ChatLine { id: number; command: string; reply: string; ok: boolean }
interface WorkState { run: Run | null; proposal: Proposal | null; applied: HistoryEntry[]; undone: HistoryEntry[]; chat: ChatLine[]; runSeq: number }
```

- `run: null` means `idle`. `position` is the number of steps already run, so the next step is `steps[position]`.
- The **mode is not stored.** It is `self_editing` exactly when `layoutStore.openPanel === 'edit'`. The controller passes the mode into each command as context, so there is one source of truth.
- Everything is plain data, so it survives `JSON.stringify` unchanged. `chat` and `runSeq` are not saved.
- Invariants (checked by tests after every random step): at most one proposal; `status === 'awaiting_decision'` if and only if `proposal !== null`; `run === null` implies `proposal === null`; `applied.length + undone.length <= 50`; `position <= steps.length`; `chat.length <= 20`.

## 6. Commands (`commands.ts`)

`ACTIONS` is a table (name, one-line help, takes argument). Names: `help`, `status`, `start`, `pause`, `resume`, `step`, `stop`, `approve`, `reject`, `undo`, `redo`, `open`, `reset`.

`parseCommand(text)` returns one of:
- `{ kind: 'command', name, arg? }`: after trimming, removing one leading `/`, lower-casing, and splitting on spaces, the text is exactly an action name, or `open` plus one valid panel word (`edit`, `chat`, `log`, `history`, `journal`).
- `{ kind: 'refused', reply }`: the first word is an action name, the text has at most two words, and it is not an accepted command (`stop now`, `open banana`, `open`). The reply names the correct form.
- `{ kind: 'none' }`: anything else. This goes to the AI as before. A text of three or more words is never a command.

The panel word `chat` maps to the layout id `ai`.

## 7. The run state machine

Transitions on `Run` (all in `workSlice.ts`, all pure, a refusal returns the same state object):

| From | Input | To | Notes |
|---|---|---|---|
| none, `stopped`, `finished` | `start` | `running`, position 0, `autoAdvance` true | New run id, script from `buildPracticeScript`. |
| `running` | tick | `running`, `position + 1` | Runs `steps[position]`. |
| `running` | tick runs the last step | `finished` | Timer stops. |
| `running` | tick runs a `propose` step | `awaiting_decision` | Creates the proposal. |
| `running` | `pause` | `paused`, `autoAdvance` false | |
| `paused` | `resume` | `running`, `autoAdvance` true | |
| `paused` | `step` | `paused`, runs one step | A `propose` step moves to `awaiting_decision`. A last step moves to `finished`. |
| `running`, `paused`, `awaiting_decision` | `stop` | `stopped` | Waiting proposal rejected and logged. |
| `awaiting_decision` | `pause` / `resume` | same status, `autoAdvance` false / true | Only the flag changes. |
| `awaiting_decision` | `approve` or `reject` | `running` if `autoAdvance` else `paused` | A `verify` step and a `finish` step always follow a proposal, so a decision never ends the run. |
| `running`, `awaiting_decision` | Edit panel opens | `paused` / `awaiting_decision`, `autoAdvance` false | R6.2. |

Tick guard: `tickRun(state, runId, position)` does nothing unless the run is `running`, has that id, and is at that position. Two ticks for the same position therefore run the step only once.

## 8. The practice script (`practiceScript.ts`)

`buildPracticeScript(snapshot)`:
1. Candidates: files with `loadStatus === 'loaded'`, `truncated === false`, defined `content`, at most 20 KB, `isSafeRepoPath(path)` true, and `redact(content).count === 0`. Sorted by path. Take at most two.
2. No candidate returns `null` (the `start` refusal).
3. Steps: `info` "Read the repository summary" (skill "repo-overview (practice)"), `info` "Check coverage" (skill "coverage-check (practice)"), `plan` "Plan a change to <path>" (skill "change-planner (practice)"), `propose` "Propose a change to <path>" with `path`, `verify` "Verify the change to <path>" (skill "verify-check (practice)") with `path`, then the same `propose` and `verify` for the second file, then `finish` "Finish the practice run".

Running a step writes one Log entry with the step title and one with "Skill used: <label>". The two `info` steps include real numbers from the snapshot: paths indexed, files loaded, and whether source analysis is complete. A `propose` step builds the diff with `buildInsertDiff({ path, comment: commentLineFor(path, PRACTICE_COMMENT) })` and **no `content`**, which gives the zero-context form `@@ -0,0 +1 @@`. `PRACTICE_COMMENT` is a fixed sentence beginning "PRACTICE:".

`practiceContent(snapshot, applied, path)`: starts from the loaded file content and applies each applied entry for that path in order with `applyUnifiedDiff`. It returns `undefined` when the file is missing or any diff fails to apply. Nothing is cached or stored.

## 9. Diff apply, reverse, and fingerprint (`diffApply.ts`)

- `applyUnifiedDiff(content, diff)` returns `{ ok: true, text }` or `{ ok: false, reason }`. It parses one file with `---` and `+++` headers (names must match), then hunks `@@ -a[,b] +c[,d] @@` with lines starting with space, `-`, or `+`. A count of 0 means "after line `a`" (so `-0,0` inserts at the top). Every context and removed line must equal the file line exactly, and every hunk's counts must match its lines. It rejects overlapping or out-of-order hunks and any text before the first hunk other than the headers. There is no fuzzy matching.
- The line ending used for inserted lines is the file's own first line ending (`\r\n` if the first line ends with it, otherwise `\n`). The "no newline at end" marker is supported only where needed to keep a file without a final newline unchanged.
- `reverseUnifiedDiff(diff)` swaps the old and new sides and `+` and `-` in each hunk and writes the counts explicitly (`-1,1 +0,0`).
- `hashText(text)`: 32-bit FNV-1a over the UTF-16 code units, written as 8 hex digits. It detects change, it is not security. It cannot be turned back into the text for any file larger than a few bytes.
- The independent test-side applier from spec 02 (`tests/helpers/applyDiff.ts`) is used as an oracle on the same fixtures.

## 10. Whole-state actions (`workActions.ts`)

All take `(state: StudioState, …, ctx: { now: number; mode: 'automation' | 'self_editing'; newId(): string })` and return `{ state, effects }` or just `state`. Effects are plain markers the controller turns into side effects: `cancel_ai`, `clear_slot`, and `open_panel`.

- `runCommand(state, command, ctx)`: looks the command up in the action rules table (section 5 of the requirements), returns the same `state` (plus a chat line) on refusal, otherwise applies the transition, writes the Log entries through `withLog`, appends a chat line `{ command, reply, ok }` (trimmed to 20), and adds `cancel_ai` for `stop` and `reset`, and `clear_slot` for `reset`.
  - `approve`: `current = practiceContent(...)`, `result = applyUnifiedDiff(current, proposal.diff)`. On success: new history entry with `beforeHash = hashText(current)` and `afterHash = hashText(result.text)`, `undone = []`, proposal cleared, run to `running` or `paused`, Log "approved" and "applied". On failure: state unchanged except a Log "failed" entry and a chat reply.
  - `undo`, `redo`: check the current practice text hash against the stored `afterHash` (undo) or `beforeHash` (redo), apply the reversed or original diff, move the entry between the two lists, and log "undone" or "applied".
  - `status`, `help`: reply only.
  - `open <panel>`: returns an effect `open_panel` with the layout id. The controller applies `openPanelById` to the layout store.
- `tickRun(state, runId, position, ctx)`: the tick guard from section 7, then run one step: write Log lines, create a proposal for `propose`, check the practice copy for `verify`, set `finished` for `finish`.
- `enterSelfEditing(state, ctx)`: the R6.2 pause and Log line. Returns the same state when nothing is running.
- `restoreWork(state, record, ctx)` and `clearWork(state, ctx)`: see section 11.

`useStudioStore.ts` stays free of work logic. `workActions.ts` imports from it, as `aiActions.ts` does, and `useStudioStore.ts` imports only `idleWork` from `workSlice.ts` (no cycle).

## 11. Saved work (`workStorage.ts`)

- Key: `patchbay.work.v1`. One slot.
- Record: `{ version: 1, repoKey, savedAt, run, proposal, applied, undone, log }`, strict, with bounds: at most 8 steps; 50 entries in `applied` plus `undone`; 2,000 characters per diff; 200 log entries (the existing `SessionLogEntrySchema`); `run.autoAdvance` always saved as `false`; a saved `running` status is stored as `paused`.
- `repoKeyOf(snapshot)` = `` `${source}:${owner}/${name}@${ref}` ``.
- `buildRecord(state, now)` writes only those fields from the current state. Chat lines, `runSeq`, the AI state, file contents, and the mode are never included. `trimRecord` applies R8.9.
- `loadWork(storage)`: returns `null` for no storage, a throw, a missing value, text over 256 KB, bad JSON, or a schema failure.
- `saveWork(storage, record)` and `clearWorkSlot(storage)`: inside `try`, failures swallowed.
- `restoreWork` (pure, in `workActions.ts` using this schema): checks `record.repoKey`, then re-applies `applied` in order from the loaded files using `applyUnifiedDiff` and compares `beforeHash` and `afterHash` for each entry. It also checks that the waiting proposal's path is a loaded file. Any failure discards history, run, and proposal and writes the discard Log line (R8.5). The log part is restored once per page load (R8.6).

### 11.1 The restore gate

The controller keeps `restoredFor: string | null` (a snapshot id). The persistence step runs only when `snapshot !== undefined && restoredFor === snapshot.id`. The restore step sets `restoredFor` after it has dispatched. This is why a freshly emptied work state can never overwrite the saved slot between "snapshot loaded" and "restore finished".

## 12. The controller (`useHarness.ts`)

```ts
createHarnessController(studio: Store<StudioState>, layout: Store<LayoutState>, services): { actions, dispose }
services: { storage, setTimer, clearTimer, now, newId, cancelAI(): void }
actions:  { submitText(text): boolean;  run(name, arg?): void;  stop(): void }
```

- `submitText(text)`: `parseCommand`. For `none` returns `false` (the panel then sends it to the AI). For `refused` adds a chat line and returns `true`. For `command` runs it and returns `true`.
- `run(name)` is what the buttons call (`approve`, `reject`, `stop`), so a button press and a typed command are the same code path.
- After every dispatch, `syncTimer()`: if the run is `running` and no timer exists, start one; otherwise clear it. The timer is a single `setTimeout` that re-arms after each tick, so ticks cannot pile up.
- Effects: `cancel_ai` calls `services.cancelAI()` (the existing assistant `cancel`); `open_panel` applies `openPanelById`; `clear_slot` removes the saved slot and makes the persistence step skip the save for that one update, so the slot is not recreated by the "Work reset." line. The next change saves normally.
- Studio-store subscriber (one function): (1) if the snapshot id changed, clear the timer and run restore; (2) `syncTimer()`; (3) if the gate allows and `work` or `log` changed, build and save the record (unless a `clear_slot` effect asked to skip it).
- Layout-store subscriber: on the Edit panel opening, dispatch `enterSelfEditing`.
- Re-entrancy: dispatches made from inside a subscriber are queued and run after the current notification, in order, so a nested update never runs half-way through another.
- `dispose()`: clears the timer, unsubscribes both stores, and ignores later ticks.
- `useHarness(assistant)`: `useMemo` creates the controller with the real services, and an effect disposes it.

## 13. User interface

- **`StopBar`** (props: `mode`, `run summary`, `waiting`, `onStop`): one row at the top of the Studio, on all three screens. Text: "Practice run: <state>, step N of M" or "No run. Type start in AI Chat." plus "Mode: Automation" or "Mode: Self-editing" plus "Waiting for your decision." when a proposal is pending, plus "Type resume in AI Chat to continue." when paused in Self-editing mode or by the Edit panel. One **Stop** button, 44 px tall, disabled when `run` is null, `stopped`, or `finished` and no AI request is pending.
- **`ProposalCard`** (props: `proposal`, `onApprove`, `onReject`): title, path, the diff in a `pre`, the practice line, two buttons. Shown at the top of the AI Chat panel.
- **AI Chat panel:** below the card, the last replies as an ordered list (`aria-live="polite"`), then the existing form. The form's Send first calls `harness.submitText(instruction)`. If it returns `true` the box is cleared and nothing is sent to the AI. The hint line says "Type help for commands."
- **`HistoryPanel`**: the empty state, or the list (newest first) with path, title, time, state, and the diff in a `pre`, plus "Type undo or redo in AI Chat."
- **`EditPanel`**: the heading "Edit", the mode text, the resume line, and "Editing tools arrive in sub-phase 2E."
- **`LogPanel`**: the existing list, without the placeholder note.
- All text is React text. No new color, transition, or animation.

## 14. Data flow for one command

```
AI Chat Send -> harness.submitText("pause")
  -> parseCommand -> command
  -> studio.update(s => runCommand(s, cmd, ctx))     one atomic pure step: run, history, log, chat
  -> subscribers: syncTimer clears the timer; persistence builds the record and saves (gate allows)
  -> effects: none here; "stop" would call cancelAI()
Stop button      -> harness.run('stop')      the same path
Toolbar "Edit"   -> layout store changes -> enterSelfEditing -> run paused, Log line
```

## 15. Failure handling

| Failure | Handling |
|---|---|
| Command refused | Same state object, one chat reply with the reason. No Log entry unless something changed. |
| Diff does not apply on approve, undo, or redo | State unchanged, Log "failed" with the reason, chat reply. The proposal stays waiting. |
| Stale tick | Ignored by the id and position guard. |
| Rapid commands | Each is one pure update in order. Repeats refuse with "Already ..." or "No proposal is waiting." |
| Saved record bad, old, oversized, or from another repository | Empty work, no message (a different repository is not an error). |
| Fingerprint mismatch on restore | History, run, and proposal discarded, log kept, one Log line. |
| Storage blocked or full | Work stays in memory. Next change tries again. |
| 51st history entry | Approval refused with a reason. The proposal stays waiting. |
| Snapshot replaced while a run is active | Work cleared in memory, timer cleared, restore runs for the new snapshot. |
| Component unmounts while a run is running | `dispose` clears the timer and subscriptions. |

## 16. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Diff apply | `tests/diffApply.test.ts` (B1) |
| 2. Commands | `tests/commands.test.ts` (B2) |
| 3. Script | `tests/practiceScript.test.ts` (B3) |
| 4. State machine | `tests/workState.test.ts` (B4), `tests/workActions.test.ts` (B5) |
| 5. Log and privacy | B5, B6, B7 |
| 6. Storage | `tests/workStorage.test.ts` (B6) |
| 7. Controller | `tests/harnessController.test.ts` (B7) |
| 8. Components | `tests/harnessUi.test.tsx` (B8, B9) |
| 9. Static checks | B1 to B9 acceptance, B10 |
| 10. Regression | B5, B9, B10 |
| 11. Browser run | B10 |
| 12. Phase 2B gate | B10 |

## 17. Risks and known limits

- **The run is a script, not an agent.** It exists so the controls can be tested. Phase 3 replaces the script source with real AI steps and keeps the same states and actions.
- **Practice diffs add one comment line at the top of a file.** They are labelled as practice and only change the in-memory copy. They do not look at what the code means.
- **Zero-context diffs cannot detect a changed file when applied.** The fingerprints do, on restore, undo, and redo. 2E adds context diffs and must revisit 2A R9.6 for what it saves.
- **Timers pause in background tabs.** Browsers slow `setTimeout` in hidden tabs. The run is slower then, never wrong, because every tick is guarded.
- **One saved slot** means working on two repositories in turn loses the older work (it says so in the Log). This is a provisional choice (open question 3).
- **The saved log can be up to 200 entries from a previous page load.** It is shown first, before the new page's entries.
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 18. PLAN.md nodes

Plan `P2B-HARNESS`, feature `F4 — Action Harness`, with nodes F4.1 (diff apply and fingerprint), F4.2 (limits and commands), F4.3 (practice script and copy), F4.4 (work state), F4.5 (work actions and store integration), F4.6 (saved work), F4.7 (controller), F4.8 (components), F4.9 (wiring into Chat, Studio, and App). Full text is in `traceability/PLAN.md`.
