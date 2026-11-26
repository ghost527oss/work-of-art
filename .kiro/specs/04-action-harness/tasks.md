# Tasks: 04 Action Harness (Phase 2, Sub-phase 2B)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2B-HARNESS` and the F4 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2B** (black-and-white wireframe, no animation, `AI_MODE=mock` only). **These tasks start only after 2A (`03-studio-shell`) is built and you have advanced the active sub-phase to 2B.**

Task ids are **B1 to B10**, so they cannot be confused with T (spec 01), M (spec 02), or S (spec 03).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F4.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network call in any 2B code or test. No import of `mockAssistant`, `aiAssistant`, `useAssistant`, or any `fetch` use in the new engine, store, or harness files. The only allowed AI interaction is the `cancelAI` function passed in as a service.
- Do not touch the files listed in design section 4.3.
- The instruction text, file content, secrets, and diff bodies must never appear in the log, the chat replies, or the saved record. Tests use sentinel strings to prove it.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

Same pattern as 2A (decision in the 2A tasks file): the spec on `spec/04-action-harness`, code on `feat/action-harness` from the spec branch, **one commit per task**, a pull request after B10.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| B1 | F4.1 | Diff apply, reverse, and fingerprint | none |
| B2 | F4.2 | Limits and command parser | none |
| B3 | F4.3 | Practice script and practice copy | B1, B2 |
| B4 | F4.4 | Work state and pure transitions | B1, B2, B3 |
| B5 | F4.5 | Work actions, store integration, `openPanelById` | B4, 2A |
| B6 | F4.6 | Saved work: record, load, save, restore | B1, B4, B5 |
| B7 | F4.7 | Harness controller and hook | B5, B6 |
| B8 | F4.8 | Stop bar, proposal card, History panel, Edit panel | B4 |
| B9 | F4.9 | Wire Chat, Log, Studio, App, styles | B5, B7, B8 |
| B10 | F4 | Final gate, browser run, mutation checks, independent review | B1 to B9 |

---

## B1. Diff apply, reverse, and fingerprint
- **plan_id:** P2B-HARNESS  **node_id:** F4.1
- **scope:** `src/engine/diffApply.ts`, `tests/diffApply.test.ts`
- **goal:** Build design section 9: `applyUnifiedDiff`, `reverseUnifiedDiff`, `hashText`.
- **acceptance:**
  - Zero-context insert at the top (`@@ -0,0 +1 @@`) applies to an empty file, a one-line file, a file with CRLF line endings (the inserted line gets `\r\n`), and a file with no final newline.
  - Context diffs produced by `buildInsertDiff` (with content) apply and agree with the independent oracle `tests/helpers/applyDiff.ts` on every fixture (same output text).
  - Multi-hunk diffs apply. Overlapping or out-of-order hunks, wrong counts, a context or removed line that does not match, mismatched file names, text before the first hunk, and a diff with two files are each rejected with a reason and no partial result.
  - `reverseUnifiedDiff` then `applyUnifiedDiff` restores the original text exactly for every fixture, including CRLF and no-final-newline files. Reversing twice gives back the original diff text.
  - `hashText` is stable across calls, differs for texts that differ by one character, and handles empty and very long strings. Output is 8 lowercase hex digits.
  - Applying never throws on arbitrary text (a seeded fuzz of 500 random diffs and contents returns `ok: false` or `ok: true`, never an exception) and runs in under 1 second for a 20 KB file.
  - The file imports nothing from React, the stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/diffApply.test.ts`

## B2. Limits and command parser
- **plan_id:** P2B-HARNESS  **node_id:** F4.2
- **scope:** `src/config/workLimits.ts`, `src/engine/commands.ts`, `tests/commands.test.ts`
- **goal:** Build design section 6 and the limits in design section 4.1 (`provisional: true`). Export `ACTIONS` with the 13 names, their help lines, and whether they take an argument, `PANEL_WORDS` mapping `edit`, `chat`, `log`, `history`, `journal` to layout ids (`chat` to `ai`), and `parseCommand`.
- **acceptance:**
  - Every action name parses with upper case, mixed case, surrounding spaces, and one leading `/`. `open` parses with each of the five panel words and maps `chat` to `ai`.
  - `stop now`, `pause please`, `open`, `open banana`, `/approve it` (two words) return `refused` with a reply that names the correct form. A text with three or more words starting with an action name (`stop everything right now`) returns `none`. Text that is not an action name (`explain the login file`) returns `none`. An empty string returns `none`.
  - A seeded fuzz of 1,000 random strings never throws and never returns `command` for a text whose first word is not an action name.
  - `ACTIONS` has exactly the 13 names in requirements R1 and no Pause, Resume, or Step control wording is defined as a button label anywhere in this file.
  - `workLimits.ts` holds the values in design section 4.1 and `provisional: true`.
  - Both files import nothing from React, the stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/commands.test.ts`

## B3. Practice script and practice copy
- **plan_id:** P2B-HARNESS  **node_id:** F4.3
- **scope:** `src/engine/practiceScript.ts`, `tests/practiceScript.test.ts`
- **goal:** Build design section 8: `PRACTICE_COMMENT`, `buildPracticeScript`, and `practiceContent`. Tests build snapshots with `buildSampleSnapshot` and by editing copies of its files.
- **acceptance:**
  - The same snapshot always gives byte-identical scripts (call twice, and with the file array reversed).
  - One suitable file gives the 6-step script. Two or more give the 8-step script using the first two paths in sorted order.
  - Files that are `truncated`, not `loaded`, without content, over 20 KB, or whose content contains a secret (`ghp_` plus 36 characters in a fixture) are skipped. No suitable file gives `null`.
  - Every step has a non-empty title. `propose` and `verify` steps carry the path. No step title or skill contains file content.
  - A `propose` diff built for each sample file is zero-context (`@@ -0,0 +1 @@`), inserts exactly one line starting with the right comment syntax and the text "PRACTICE:", and contains no line of the file.
  - `practiceContent` returns the loaded content with no history, applies applied diffs in order, returns `undefined` for a missing file, and returns `undefined` when a diff does not apply.
  - The loaded snapshot object is never mutated (deep-frozen snapshot test).
  - The file imports nothing from React, the stores, or the network, and does not import `mockAssistant`.
- **verify:** `npm run typecheck && npx vitest run tests/practiceScript.test.ts`

## B4. Work state and pure transitions
- **plan_id:** P2B-HARNESS  **node_id:** F4.4
- **scope:** `src/store/workSlice.ts`, `tests/workState.test.ts`
- **goal:** Build design sections 5 and 7: the types, `idleWork()`, and pure transitions on `WorkState`: `startRun`, `pauseRun`, `resumeRun`, `stepRun`, `stopRun`, `runOneStep` (used by ticks and `step`), `createProposal`, `decideProposal` (approve with a ready history entry, or reject), `undoChange`, `redoChange`, `setSelfEditingPause`, `addChat`. These work on `WorkState` and plain inputs only. They write no Log entries (B5 does).
- **acceptance:**
  - Every row of the design section 7 table has a test, including both `pause` and `resume` while `awaiting_decision`, and the `autoAdvance` rule after a decision.
  - Every refusal returns the same object (`Object.is`).
  - A frozen input is never mutated.
  - A seeded random sequence of 3,000 transitions (start, pause, resume, step, stop, tick, approve, reject, undo, redo, Edit open) never breaks the five invariants in design section 5 after any step.
  - 100 repeats of `pause`, of `resume`, of `stop`, and of `approve` end in the same state as the first press.
  - A second `approve` for one proposal is refused. The 51st history entry is refused.
  - `chat` never exceeds 20 lines (oldest dropped).
  - The state survives `JSON.parse(JSON.stringify(state))` for everything except `chat` and `runSeq`, which are allowed to be dropped.
  - The file imports nothing from React, `useStudioStore`, the network, or the AI files.
- **verify:** `npm run typecheck && npx vitest run tests/workState.test.ts`

## B5. Work actions, store integration, and `openPanelById`
- **plan_id:** P2B-HARNESS  **node_id:** F4.5
- **scope:** `src/store/workActions.ts`, `src/store/useStudioStore.ts` (add `work`), `src/store/layoutSlice.ts` (add `openPanelById`), `tests/workActions.test.ts`, `tests/workStore.test.ts`
- **goal:** Build design section 10. `StudioState` gains `work`. The four existing actions that set `ai: idleAI()` also set `work: idleWork()`. `layoutSlice.ts` gains `openPanelById`.
- **acceptance:**
  - **Existing tests still pass with no edits** (`tests/store.test.ts`, `tests/aiState.test.ts`, and the 2A tests), and `initialState().work` equals `idleWork()`.
  - `runCommand` for every command in the section 5 table of the requirements: the accepted case changes state and writes the expected Log entries (status `info`, `proposed`, `approved`, `applied`, `verified`, `rejected`, `failed`, or `undone` as the requirements list), and each refusal returns the same `StudioState` object except for one chat line (counted as the allowed change) and the exact reply text of the table.
  - A full practice run is executed with `tickRun` on a sample snapshot: steps log in order with "Skill used: ..." lines, the first `propose` creates a waiting proposal, `approve` applies it (the practice copy now starts with the practice line, the snapshot is untouched), the following `verify` logs "verified", `undo` and `redo` move the entry and the copy changes back and forth, and the run ends `finished`.
  - A rejected proposal adds no History entry and its `verify` step logs "nothing to verify".
  - `stop` during `awaiting_decision` rejects the proposal, logs it, and returns the `cancel_ai` effect. `reset` returns `cancel_ai` and `clear_slot` and empties work and log.
  - `open edit` returns an `open_panel` effect with the layout id `edit`. `open chat` returns `ai`.
  - `enterSelfEditing` pauses a `running` run and a waiting run (flag only) and does nothing otherwise.
  - Stale ticks (old run id, old position) change nothing. Two ticks for the same position run the step once.
  - No Log entry, chat line, or work field contains the instruction sentinel, a file content line, a secret fixture, or (for Log and chat) a diff body.
  - `openPanelById` opens a closed panel, switches panels, expands a collapsed panel, keeps `width`, and returns the same object when already open and expanded.
  - `useStudioStore.ts` imports only `idleWork` from `workSlice.ts` and no import cycle exists (checked by importing each module in a test).
- **verify:** `npm run typecheck && npx vitest run tests/workActions.test.ts tests/workStore.test.ts tests/store.test.ts tests/aiState.test.ts tests/layoutState.test.ts`

## B6. Saved work
- **plan_id:** P2B-HARNESS  **node_id:** F4.6
- **scope:** `src/store/workStorage.ts`, `src/store/workActions.ts` (add `restoreWork` only), `tests/workStorage.test.ts`
- **goal:** Build design section 11, including the schema, `repoKeyOf`, `buildRecord`, `trimRecord`, `loadWork`, `saveWork`, `clearWorkSlot`, and the pure `restoreWork` and the restore gate helper described there.
- **acceptance:**
  - A valid record round-trips through `JSON.stringify` and `loadWork`.
  - Each bad variant returns `null` or empty work with no throw: missing, bad JSON, more than 256 KB, wrong version, unknown field, `run.steps` over 8, a diff over 2,000 characters, more than 50 history entries, more than 200 log entries.
  - `buildRecord` writes only the allowed fields. A state seeded with the sentinel instruction in an AI field, a chat line, a file content line, and a secret fixture produces text that contains none of them. A saved `running` run is stored as `paused` with `autoAdvance` false.
  - `restoreWork` with a matching key and matching files restores history, proposal, run (paused), and the log (once per page load, prepended, with fresh ids). A different key restores nothing and leaves the saved text untouched. A changed file (fingerprint mismatch) discards history, run, and proposal, keeps the log, and writes the discard Log line. A missing file does the same.
  - A run saved as `awaiting_decision` returns `awaiting_decision` with `autoAdvance` false and the same proposal.
  - Trimming drops the oldest log entries first, then the oldest undone changes, writes the "Saved work was trimmed." line, and never drops an applied change. When applied changes alone are too big, saving is skipped and the Log says so.
  - Blocked, throwing, and full storage never throw. The "replaced" Log line names the old key only.
  - The file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/workStorage.test.ts tests/workActions.test.ts`

## B7. Harness controller and hook
- **plan_id:** P2B-HARNESS  **node_id:** F4.7
- **scope:** `src/hooks/useHarness.ts`, `tests/harnessController.test.ts`
- **goal:** Build design section 12: `createHarnessController(studio, layout, services)` and `useHarness(assistant)`. Tests use `createStore`, fake storage, fake timers (`vi.useFakeTimers`), and a fake `cancelAI`.
- **acceptance:**
  - `submitText` returns `false` for ordinary text and `true` for commands and refusals, and an ordinary text never changes the work state or calls `cancelAI`.
  - `start` followed by timer advances of 1,200 ms runs one step each. `pause` clears the timer (no step runs after more time passes). `resume` restarts it. `step` while paused runs exactly one step.
  - A tick with a stale id or position is ignored. Only one timer exists at any time (count of pending timers is at most 1 after every action).
  - A proposal stops the timer. After `approve`, the timer restarts if `autoAdvance` is true and stays off if false.
  - `stop` and `reset` call `cancelAI` once, clear the timer, and `reset` removes the saved slot.
  - Opening the Edit panel in the layout store pauses a running run and logs it. Closing it does not resume. `resume` and `step` and `start` are refused while Edit is open and accepted after it closes.
  - **The restore gate:** with a saved slot for another repository and an empty work state, loading a snapshot never saves before the restore step has run (the fake storage sees no write until restore completes), and a matching slot is restored exactly once per snapshot.
  - Back to Start clears work in memory, keeps the slot, and loading the same snapshot again restores run, proposal, and history but not a second copy of the log.
  - Rapid repeats: 50 calls of `run('approve')`, `run('reject')`, and `run('stop')` in a row end in one consistent state with the invariants intact.
  - `dispose` clears the timer, unsubscribes from both stores (later store changes cause no work and no saves), and later timer firings do nothing.
  - The file does not import any `fetch`, `aiAssistant`, `mockAssistant`, or `useAssistant` module (checked by reading the source text).
- **verify:** `npm run typecheck && npx vitest run tests/harnessController.test.ts`

## B8. Stop bar, proposal card, History panel, Edit panel
- **plan_id:** P2B-HARNESS  **node_id:** F4.8
- **scope:** `src/components/StopBar.tsx`, `src/components/ProposalCard.tsx`, `src/components/HistoryPanel.tsx`, `src/components/EditPanel.tsx`, `src/styles.css` (append the 2B block only), `tests/harnessUi.test.tsx`
- **goal:** Build design section 13 as components that take props only.
- **acceptance:**
  - With `react-dom/server`: `StopBar` shows the right text for no run, running (step N of M), paused, waiting for decision, stopped, finished, Self-editing mode, and the resume hint; its one Stop button is enabled only when the design says so, and is a `button` with an accessible name "Stop".
  - `ProposalCard` shows the title, path, diff in a `pre`, the practice line, and exactly two buttons, "Approve" and "Reject". Text that looks like markup in a title or diff appears escaped.
  - `HistoryPanel` shows the empty state, and for entries shows newest first with the state, the diff in a `pre`, and the undo and redo line.
  - `EditPanel` shows the mode text, the resume line, and the 2E line.
  - No view contains a button named Pause, Resume, or Step. The only buttons in the four components are Stop, Approve, and Reject.
  - Static checks on the new files and the CSS block: no `dangerouslySetInnerHTML`, no color other than `#000` and `#fff`, no `transition`, no `animation`. Every new file carries an `@node: F4.8` tag.
  - Browser behavior is **not** claimed here. It is verified in B10.
- **verify:** `npm run typecheck && npx vitest run tests/harnessUi.test.tsx`

## B9. Wire Chat, Log, Studio, and App
- **plan_id:** P2B-HARNESS  **node_id:** F4.9
- **scope:** `src/components/AIAssistantPanel.tsx`, `src/components/LogPanel.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css` (only to fix a class from B8), `tests/harnessUi.test.tsx` (append wiring tests)
- **goal:** Build design sections 4.2 and 13. Chat Send calls `harness.submitText` first. The proposal card and the replies appear above the form. `StopBar` renders above all three screens. History and Edit panels replace the 2A placeholders. `App` calls `useHarness(assistant)`.
- **acceptance:**
  - **The existing suite passes with no existing test edited**, including the AI panel and response view tests.
  - With a seeded store and `react-dom/server`: the Studio markup on Screens 3, 4, and 5 contains the Stop bar; the AI Chat panel contains the replies list and the hint; a waiting proposal shows the card with Approve and Reject; the History and Edit panels show their new content; the Log panel no longer has the 2B placeholder note.
  - The AI Chat patch-proposal view from spec 02 (`AIResponseView`) still has no Approve or Reject control.
  - Clicking is **not** claimed here (server render only). The Send hand-off is tested through the controller: with a fake `harness`, `Send` on a command text is not passed to `assistant.send`, and ordinary text is.
  - `StudioLayout` and `AIAssistantPanel` import no engine module they did not import before, apart from types.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## B10. Final gate and independent review
- **plan_id:** P2B-HARNESS  **node_id:** F4
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts live outside the repo and are deleted afterwards. `README.md` (the commands, in one short section) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase and its Phase 2B gate.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2A baseline.
  2. Static checks: no new dependency; no network, `mockAssistant`, or `aiAssistant` import in the new engine, store, and harness files; no color other than `#000` and `#fff`; no `transition` or `animation`; every new file tagged; no Pause, Resume, or Step button.
  3. Mutation checks (break, see tests fail, restore): the tick guard, the one-proposal rule, the double-approve refusal, the undo fingerprint check, the restore gate, the repository-key check, the fingerprint-mismatch discard, the "never drop applied changes" rule, the Edit auto-pause, the Stop effects, and the secret filter in the script.
  4. Browser run (headless Chromium on the built app) of every item in requirements section 6, item 11, including the refresh and restore flow, 50 rapid presses, blocked storage, 375 px, and zero console errors.
  5. Independent behavioral review with `semantic_reviewer`, focused on stale state, lost work, saved-data hygiene, the honesty of the practice labels, and the 2B scope rules. Fix findings only with your approval.
  6. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the twelve acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2B passes its gate: every command updates state predictably, survives a refresh (through restore), and handles repeated commands. Advancing to 2C stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 Action list and commands | B2, B5, B7, B9 |
| R2 Practice run | B3, B4, B5, B7 |
| R3 Pause, resume, step, stop | B4, B5, B7, B8, B9 |
| R4 Proposals, approve, reject | B3, B4, B5, B8, B9 |
| R5 Practice copy, History, undo, redo | B1, B3, B4, B5, B8 |
| R6 Modes | B5, B7, B8, B9 |
| R7 Log panel | B5, B9 |
| R8 Saved work | B6, B7 |
| R9 Wiring | B5, B7, B9 |
| R10 Appearance and safety | B8, B9, B10 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Diff apply | B1 |
| 2. Commands | B2 |
| 3. Script | B3 |
| 4. State machine | B4, B5 |
| 5. Log and privacy | B5, B6, B7 |
| 6. Storage | B6 |
| 7. Controller | B7 |
| 8. Components | B8, B9 |
| 9. Static checks | B1 to B9, B10 |
| 10. Regression | B5, B9, B10 |
| 11. Browser run | B10 |
| 12. Phase 2B gate | B10 |

## Questions

1. **Requirements questions 1 to 7** at the end of `requirements.md`: practice-only proposals, commands in the AI box, one saved slot, undo and redo only when paused, Stop effects, provisional limits, and Edit not resuming.
2. **Branch pattern** for code: same as 2A (spec branch, then a feature branch with one commit per task). Confirm or change.
3. **Approval of the spec**, and then, once 2A is built and you advance the active sub-phase, your explicit "Go" naming **B1**.

---

## Build report (sub-phase 2B, as built)

Copied from `PHASE_2_REPORT.md` at the repository root, which also has the summary table and the Phase 2 exit evidence. Numbers are real command output; **Unverified** items say why.


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
