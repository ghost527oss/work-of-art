# Requirements: 04 Action Harness (Phase 2, Sub-phase 2B)

Sources: steering `build-phases.md` (Phase 2 text, sub-phase 2B and its gate); the approved Phase 2 blueprint (sections 7 and 8); the approved 2A spec (`03-studio-shell`) and its R9 (do not block session restore); specs 01 and 02 (what is already built); your answers: fixed command words in chat, one always-visible Stop button, Edit auto-pauses automation, approve/reject by typed word and by button, Log and History kept separate, never save secrets.
Active product phase: **Phase 2, Sub-phase 2B**. Black-and-white wireframe only, no animation, `AI_MODE=mock` only, no new runtime dependency. **This spec assumes 2A is built and approved.**

## 1. Purpose

2B builds the **control system** that Phase 3 will later hand to the real AI: one short list of safe actions, a way to run them by typing fixed words in AI Chat, and a practice run so there is something to pause, step, approve, reject, undo, and stop. It also makes the **Log** and **History** panels real, and saves that work in the browser.

In simple words: this step builds the steering wheel and the brakes. The "car" is a fake practice run, so you can test the controls safely before any real AI drives it.

## 2. Scope

### In scope
- **The action list:** `help`, `status`, `start`, `pause`, `resume`, `step`, `stop`, `approve`, `reject`, `undo`, `redo`, `open <panel>`, `reset`. Each is a pure, checked action that either runs or refuses with a plain reason.
- **Typed commands in AI Chat:** the instruction box accepts the fixed words. A command never goes to the AI.
- **The practice run:** a fixed, labelled, offline script of up to 8 steps built from the loaded repository. It reads real numbers from the snapshot, writes Log lines, and proposes a small practice change to up to two files. It makes **no AI call** and is never presented as AI.
- **Proposal cards:** each practice proposal appears as a card with the diff and **Approve** and **Reject** buttons. The typed `approve` and `reject` do the same thing.
- **The practice copy:** an approved proposal changes an in-memory practice copy of the file, never the original repository. Undo and Redo move through the approved changes.
- **The always-visible Stop bar:** a status line and one **Stop** button, shown on Screens 3, 4, and 5.
- **Modes:** Automation and Self-editing. Opening the Edit panel switches to Self-editing and pauses a running automation.
- **Log panel:** real entries for planning steps, skills used, commands, proposals, and decisions.
- **History panel:** the list of approved changes with their state (applied or undone) and diffs.
- **Saved work:** log, run, pending proposal, and history are saved in browser storage, in one slot per repository, and restored when the same repository is loaded again.
- Tests, a browser check, and `traceability/PLAN.md` entries.

### Out of scope (later sub-phases or phases)
- File sorting, connection map, scanner, skill-book (2C, 2D). The "skills" named in 2B's Log are fixed practice labels, not real scans.
- Real Skeleton Crew content (2D). Sandbox preview and the working Edit pad (2E). Journal and export (2F).
- Approving or applying **AI Chat patch proposals**. They stay display-only as today (see open question 1).
- Free-sentence commands and the real AI calling these actions (Phase 3).
- Saving the repository address, the current screen, or auto-reloading after a refresh (the session-restore sub-phase). In 2B, after a refresh you load the same repository again and your saved work comes back.
- Colors, themes, animation (Phase 4). Live AI (Phase 3).

## 3. Glossary

- **Action:** one safe thing the app can do, from the action list. Anything that changes state goes through an action.
- **Command:** a fixed word typed in AI Chat that asks for an action.
- **Practice run (run):** the fake automation. It has a **script** of **steps** and a **position**.
- **Proposal:** a practice change waiting for your decision. At most one at a time.
- **Practice copy:** the in-memory version of each file after your approved changes. It is **derived** from the loaded file plus the approved diffs, never stored whole.
- **Mode:** `automation` or `self_editing`.
- **Work:** the run, the pending proposal, the history, and the log for the current repository.
- **Repository key:** `owner/name@ref` for a GitHub repository, or `sample:<id>` for a sample.
- **Tick:** one automatic move of a running run, every 1.2 seconds (provisional).

## 4. Functional requirements

### R1. Action list and commands
1. THE SYSTEM SHALL define the action list as data: for each action its name, one-line help, whether it takes an argument, and a pure rule for when it is allowed.
2. THE SYSTEM SHALL parse a command as: trim the text, remove one optional leading `/`, compare case-insensitively with the action names. `open` takes exactly one argument from `edit`, `chat`, `log`, `history`, `journal` (`chat` means the AI Chat panel).
3. THE SYSTEM SHALL treat text that exactly matches a command as a command and any other text as an AI request. A command SHALL NOT create an AI request, and its text SHALL NOT be sent anywhere.
4. WHEN the first word is an action name and the text has at most two words but is not an accepted command (for example `stop now`, `open banana`, or `open`), THE SYSTEM SHALL answer with a refusal that names the correct form, and SHALL NOT send it to the AI. Text of three or more words is never a command and goes to the AI.
5. THE SYSTEM SHALL answer every command with one short plain-English reply, shown in AI Chat, and SHALL write a Log entry when the command changes anything.
6. WHEN an action is not allowed in the current state, THE SYSTEM SHALL change nothing and reply with the reason (table in section 5).
7. THE SYSTEM SHALL keep the last 20 replies (command word, reply, ok or refused) in memory only. The text of AI requests SHALL NOT be stored there.
8. THE `help` reply SHALL list every command with its one-line help. THE `status` reply SHALL state the mode, the run state and position, whether a proposal is waiting, and the counts of applied and undone changes.

### R2. The practice run
1. WHEN `start` is accepted, THE SYSTEM SHALL build a script from the loaded snapshot and start a run in the `running` state at position 0.
2. THE SYSTEM SHALL refuse `start` while a run is active (`running`, `paused`, or `awaiting_decision`), when no snapshot is loaded, or when no file is suitable (R2.4). A finished or stopped run does not block `start`.
3. THE script SHALL have at most 8 steps of these kinds: `info` (reads the snapshot and writes real numbers to the Log), `plan`, `propose` (creates the proposal), `verify` (checks the practice copy), and `finish`. For one suitable file the script is: overview, coverage check, plan, propose, verify, finish. For two files: overview, coverage check, plan, propose, verify, propose, verify, finish.
4. A file is suitable when it is `loaded` (never `truncated`), has content, is at most 20 KB, has a path that is safe to show, and `redact()` finds no secret in its content. THE SYSTEM SHALL choose up to two suitable files in path order, so the same repository always gives the same script.
5. EACH step SHALL have a title, and an optional **skill label** such as "repo-overview (practice)". THE Log SHALL say "Skill used: <label>" when a step runs. These are fixed labels, not real scans.
6. THE SYSTEM SHALL label the run as practice everywhere it appears: "Practice run (no AI)".
7. THE run states SHALL be `idle`, `running`, `paused`, `awaiting_decision`, `stopped`, and `finished`, with these meanings:
   - `running`: each tick runs the next step.
   - `paused`: ticks do nothing. `step` runs one step.
   - `awaiting_decision`: a `propose` step created a proposal. The run waits. Ticks and `step` do nothing.
   - `stopped`: ended by `stop`. `finished`: the last step ran.
8. THE run SHALL keep a flag `autoAdvance` (true while the user wants it to run on its own). `pause` sets it false and `resume` sets it true, in any active state. WHEN a decision is made, the run goes to `running` if `autoAdvance` is true and `paused` if false.
9. THE ticks SHALL be driven by one timer owned by the harness controller. THE timer SHALL exist only while a run is `running`, SHALL be cleared on pause, decision wait, stop, finish, snapshot change, and unmount, and a tick that carries an old run id or position SHALL be ignored.
10. THE run SHALL make no network call and no AI request. It SHALL read file content only from the loaded snapshot in memory.

### R3. Pause, resume, step, stop
1. `pause`: allowed when the run is `running`, `paused`, or `awaiting_decision` (see R2.8). WHEN already paused, reply "Already paused." and change nothing.
2. `resume`: allowed in the same states. WHEN `autoAdvance` is already true, reply "Already running." and change nothing. WHILE `awaiting_decision`, it sets `autoAdvance` true and replies "The run continues after you approve or reject."
3. `step`: allowed only when `paused`. It runs exactly one step. WHEN that step is `propose`, the run becomes `awaiting_decision`.
4. `stop`: allowed in every state except `idle`. It ends the run (`stopped`), clears the timer, rejects a waiting proposal (logged as "rejected: run stopped"), and cancels a pending AI request. It SHALL always work, even when nothing else does.
5. THE **Stop button** in the Stop bar SHALL do exactly what `stop` does, and SHALL be visible on Screens 3, 4, and 5 at every width. WHEN there is nothing to stop, THE button SHALL stay visible and be disabled.
6. THE Stop bar SHALL show the mode, the run state, the position ("step 3 of 6"), and "Waiting for your decision" when a proposal is pending.
7. THE SYSTEM SHALL add no Pause, Resume, or Step button anywhere.

### R4. Proposals, approve, reject
1. WHEN a `propose` step runs, THE SYSTEM SHALL create one proposal: the chosen path, a title, and a unified diff that inserts one practice comment line at the top of the file (built with the existing diff builder in its zero-context form, so it contains no repository content).
2. THE system SHALL hold at most one proposal. IT SHALL never create a second while one is waiting.
3. THE proposal card SHALL show: the title, the path, the diff in a preformatted block, the line "Practice proposal: it changes only the in-memory practice copy, never your repository", and **Approve** and **Reject** buttons. THE card SHALL appear in the AI Chat panel and the Stop bar SHALL say a decision is waiting.
4. `approve` and the Approve button: apply the diff to the practice copy, add a History entry (state `applied`), clear the redo list, and log "approved" then "applied". WHEN the diff does not apply, change nothing and log "failed" with the reason. The proposal stays waiting.
5. `reject` and the Reject button: drop the proposal, add no History entry, and log "rejected".
6. WHEN no proposal is waiting, `approve` and `reject` refuse with "No proposal is waiting."
7. A decision SHALL be applied once. A second `approve` for the same proposal, however fast, SHALL refuse.
8. THE `verify` step that follows a proposal SHALL log "verified" when the practice copy now contains the inserted line, or "nothing to verify" when the proposal was rejected, and SHALL never claim a verification that did not run.
9. THE AI Chat patch-proposal cards from spec 02 SHALL stay display-only with their existing notice. 2B adds no Approve or Reject to them.

### R5. Practice copy, History, undo, redo
1. THE practice copy of a file SHALL be computed as the loaded content with the applied history diffs applied in order. It SHALL NOT be stored whole, and the loaded snapshot SHALL NOT be modified.
2. EACH History entry SHALL hold: an id, the path, the title, the time, the diff, the state (`applied` or `undone`), and a hash of the file text before and after the change (a short change-detection fingerprint, not the content).
3. THE history SHALL be two lists: applied changes (oldest first) and undone changes (the redo list).
4. `undo`: allowed when there is an applied change, no proposal is waiting, and the run is not `running`. It reverses the most recent applied change and moves it to the redo list. THE reversal SHALL check that the text matches the recorded "after" fingerprint, and otherwise refuse and log "failed: file changed since".
5. `redo`: same conditions. It re-applies the most recently undone change, after checking the "before" fingerprint.
6. WHEN a new change is approved, THE redo list SHALL be cleared.
7. THE History panel SHALL list the entries newest first with path, title, time, state, and the diff in a preformatted block, and the line "Type undo or redo in AI Chat." It SHALL show an empty state when there are none.
8. THE history SHALL hold at most 50 entries. WHEN a 51st would be added, THE SYSTEM SHALL refuse the approval with a clear reason and keep the proposal waiting.

### R6. Modes
1. THE SYSTEM SHALL have the modes `automation` and `self_editing`. THE mode is `self_editing` exactly while the Edit panel is open (expanded or collapsed).
2. WHEN the Edit panel opens while a run is `running`, THE SYSTEM SHALL set `autoAdvance` false, move the run to `paused`, and log "Paused automatically because you opened Edit." WHEN it opens while the run is `awaiting_decision`, it SHALL set `autoAdvance` false and log the same line. In other states it only changes the mode.
3. WHEN the Edit panel closes, THE mode returns to `automation`. THE SYSTEM SHALL NOT resume the run by itself. The Edit panel and the Stop bar SHALL say "Type resume in AI Chat to continue."
4. WHILE the mode is `self_editing`, `resume`, `step`, and `start` SHALL refuse with "Close the Edit panel first." (`stop`, `pause`, `approve`, `reject`, `status`, `help`, `undo`, `redo`, `open`, and `reset` still work, subject to their own rules.)
5. THE Edit panel in 2B SHALL show the current mode and the line about resuming. Its editing tools arrive in 2E.
6. THE `open <panel>` action SHALL set the layout so that panel is open and expanded, without toggling it closed. Opening Edit by command SHALL trigger R6.2 exactly like pressing the toolbar button.

### R7. Log panel
1. THE Log panel SHALL show the existing session log (last 50 entries, newest last) with the same fields as today, and SHALL replace the 2B placeholder note.
2. THE SYSTEM SHALL write Log entries for: run started, each step ("Step 3 of 6: <title>"), each skill used, proposal created, approved, rejected, applied, verified, failed, undone, redone, paused, resumed, stopped, finished, reset, work saved but trimmed, and work restored or discarded.
3. NO Log entry SHALL contain instruction text, file content, a secret, or a diff body. Paths and fixed phrases only.
4. THE log SHALL keep its existing limit of 500 entries.

### R8. Saved work
1. THE SYSTEM SHALL save the work for the current repository in browser storage under the key `patchbay.work.v1`, in **one slot**: `{ version, repoKey, savedAt, run, proposal, history, log }`.
2. THE saved record SHALL contain: the run (script steps, position, state, `autoAdvance` false), the waiting proposal (path, title, diff), the history (entries as in R5.2), and the last 200 log entries. IT SHALL NOT contain file contents, AI requests or results, command replies, secrets, or anything else.
3. THE SYSTEM SHALL save after every change to the work or the log, but only after the restore step for the current snapshot has finished (so a fresh empty state never overwrites a saved slot).
4. WHEN a snapshot finishes loading, THE SYSTEM SHALL read the slot and restore it only if its `repoKey` equals the loaded repository's key. A different key starts with empty work and leaves the slot untouched **until the first save after that load, which replaces it** (only one repository's work is kept). WHEN that happens, THE Log SHALL say "Saved work for <owner/name> was replaced." using the old key.
5. ON restore, THE SYSTEM SHALL validate the record with a strict schema. Then it SHALL re-apply the history in order to the freshly loaded files and compare each "before" and "after" fingerprint. WHEN any check fails (schema, a missing or changed file), THE SYSTEM SHALL discard the history, the run, and the proposal, keep the restored log, and log "Saved changes did not match the loaded files, so they were not restored."
6. THE saved log SHALL be restored only **once per page load**, placed before the entries already in memory, with fresh ids that cannot collide with new ones. Later restores in the same page (a scoped folder reload, or Back to Start and loading the same repository again) restore the run, proposal, and history only, because the log is still in memory.
7. A run saved as `running` SHALL come back `paused`. A run saved as `awaiting_decision` SHALL come back as `awaiting_decision` with `autoAdvance` false. The mode is recomputed from the layout.
8. WHEN the saved record is missing, unreadable, over 256 KB, from another version, or has unknown fields, THE SYSTEM SHALL start with empty work and no error. WHEN storage is blocked or full, THE SYSTEM SHALL keep working in memory without an error message.
9. WHEN the saved text would exceed 256 KB, THE SYSTEM SHALL drop the oldest log entries first, then the oldest undone changes, and log "Saved work was trimmed." It SHALL never drop an applied change silently: if applied changes alone exceed the limit, saving is skipped and the Log says so.
10. THE `reset` action SHALL clear the work for the current repository (run, proposal, history, log) in memory and remove the slot, after logging "Work reset." It is allowed in every state except while no snapshot is loaded. It SHALL also stop the timer and cancel a pending AI request.
11. **Back to Start** SHALL clear the work in memory and SHALL keep the saved slot, so loading the same repository again brings it back. Loading another repository starts with empty work and replaces the slot at its first save (R8.4).
12. EVERY saved part SHALL satisfy 2A requirement R9.6 (no secrets, no file contents).

### R9. Wiring into the existing app
1. THE work state SHALL live in the existing studio store next to the AI state, changed only by pure whole-state actions, so one command is one atomic update of run, history, and log.
2. WHEN the snapshot is replaced or cleared, THE work SHALL be cleared in memory (and the controller then restores from the slot per R8.4). A scoped folder reload therefore goes through the same save-and-restore path, and changes to files are caught by the fingerprints.
3. THE existing ingestion and AI behavior, texts, and tests SHALL stay unchanged.
4. THE harness SHALL add no network call and SHALL NOT import `src/engine/aiAssistant.ts` services. The only AI interaction is cancelling a pending request through the existing assistant `cancel` action.

### R10. Appearance and safety
1. THE SYSTEM SHALL use only black and white, no animation, no transition. The Stop bar and cards SHALL work by keyboard and touch, with buttons at least 44 px tall.
2. THE SYSTEM SHALL render all text, including diffs and replies, as React text, never as HTML.
3. THE Stop bar SHALL not cause horizontal scrolling at 375 px.
4. THE SYSTEM SHALL add no runtime dependency beyond `react`, `react-dom`, and `zod`.
5. THE SYSTEM SHALL release the run timer, the store subscriptions, and the layout bridge on unmount.
6. THE SYSTEM SHALL keep memory bounded: at most 8 steps, 1 proposal, 50 history entries, 500 log entries, 20 chat replies.

## 5. Command refusals (exact situations)

| Command | Refused when | Reply (plain text) |
|---|---|---|
| any run command | no snapshot loaded | "Load a repository first." |
| `start` | run active | "A run is already active. Type stop first." |
| `start` | no suitable file | "No suitable file for a practice change. It needs a fully loaded text file under 20 KB with no secrets." |
| `start`, `resume`, `step` | Self-editing mode | "Close the Edit panel first." |
| `pause`, `resume` | `idle`, `stopped`, `finished` | "No run is active." |
| `step` | `running` | "Pause the run first." |
| `step` | `awaiting_decision` | "Decide the waiting proposal first." |
| `step` | `idle`, `stopped`, `finished` | "No run is active." |
| `stop` | `idle` | "Nothing to stop." |
| `approve`, `reject` | no proposal | "No proposal is waiting." |
| `undo`, `redo` | proposal waiting | "Decide the waiting proposal first." |
| `undo`, `redo` | run `running` | "Pause the run first." |
| `undo` | nothing applied | "Nothing to undo." |
| `redo` | nothing undone | "Nothing to redo." |
| `open` | bad argument | "Use: open edit, chat, log, history, or journal." |
| anything with an argument that takes none | | "That command takes no argument." |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Diff apply tests:** `applyUnifiedDiff` applies zero-context and context diffs, rejects any mismatch, and agrees with the independent test-side applier from spec 02 on every fixture. `reverseUnifiedDiff` followed by apply restores the original text exactly (including CRLF, no trailing newline, and empty files). Fingerprints are stable and differ for different text.
2. **Command tests:** every accepted form (case, spaces, leading `/`), every near-miss, the `open` arguments, and that no command text can reach the AI request path.
3. **Script tests:** the same snapshot always gives the same script; one and two suitable files; unsuitable files (truncated, too large, secret-looking, no content) are skipped; no suitable file refuses; every step has a title; no step contains file content.
4. **State-machine tests:** every row of the state table and section 5, with the same state object returned on every refusal; pure and frozen-input safe; a long seeded random sequence of commands and ticks never breaks the invariants (at most one proposal, `awaiting_decision` implies a proposal, `idle` implies none, `redo` list cleared after a new approval, history at most 50); repeating `pause`, `resume`, `stop`, and `approve` 100 times ends exactly where the first press ends.
5. **Log and privacy tests:** no log entry or saved record contains the sentinel instruction, a file content line, a secret, or a diff body.
6. **Storage tests:** a valid record round-trips; each bad variant in R8.8 gives empty work; a different repository key leaves the slot untouched; fingerprint mismatch discards history but keeps the log; trimming order and the "never drop applied changes silently" rule; blocked and full storage; the restore gate (no save before restore, no overwrite by a fresh empty state).
7. **Controller tests (fake timers, fake storage):** ticks advance a running run; pause stops the timer; stale ticks are ignored; stop clears the timer, rejects the proposal, and cancels a pending AI request; opening Edit pauses a running run and closing it does not resume; the controller releases everything on dispose; restore on snapshot load; Back to Start keeps the slot; `reset` clears it.
8. **Component tests (server render):** the Stop bar and its disabled state; proposal card with both buttons and the practice line; History empty state and entries; Edit panel mode text; Log panel entries; no Pause, Resume, or Step button in any markup; AI Chat patch cards still have no Approve or Reject.
9. **Static checks:** no network import in the new engine, store, or harness code; no color other than `#000` and `#fff`; no `transition` or `animation`; no `dangerouslySetInnerHTML`; no new dependency; every new file tagged; the new code never imports `mockAssistant`.
10. **Regression:** the full existing suite still passes, including specs 01, 02, and 03.
11. **Browser run (headless Chromium, built app):** load a sample; type `help`, `status`, `start`; watch steps run on their own; `pause`, `step`, `resume`; reach a proposal; press Approve; see History; `undo`, `redo`; `start` a second run and press Reject; `stop` and the Stop button during a run; open Edit during a run and see it pause; refresh, load the same sample, and see Log and History restored and the run paused; 50 rapid presses of Approve, Reject, and Stop leave one consistent state; Back to Start then reload keeps the work; `reset` clears it; blocked storage works; zero console errors; black and white; no overflow at 375 px; AI Chat still sends a normal request.
12. **Phase 2B gate (build-phases.md):** every command updates state predictably, survives a refresh (via restore), and handles repeated commands.

## 7. Open questions for approval

**Status:** questions 1, 2, and 3 are approved by the user (practice-only proposals, commands in the AI box with three or more words going to the AI, one saved slot). Questions 4 to 7 were not answered separately and stand as written until the user objects. Question 8 is decided: session restore is sub-phase **2G**.

1. **Which proposals can be approved in 2B (R4.9).** Only the practice run's proposals. AI Chat's mock patch proposals stay display-only, because their diffs carry file lines as context and R9.6 of 2A forbids saving file contents. They become approvable when real edits and their storage rules are decided (2E or Phase 3). Approve, or do you want AI Chat patches approvable now?
2. **Commands share the AI instruction box (R1.3).** Typing exactly `stop` runs the command, not an AI request. Approve, or do you want a separate command line?
3. **One saved slot, for one repository (R8.1, R8.4).** Loading a different repository replaces the saved work at the next save, and the Log says so. Approve, or keep up to 3 repositories (more code, more storage)?
4. **Undo and redo only when paused or idle and no proposal is waiting (R5.4).** Approve?
5. **Stop also cancels a pending AI request and rejects a waiting proposal (R3.4).** Approve?
6. **Practice labels and sizes (R2.3, R2.4).** Up to two files, 20 KB each, 1.2 s ticks, 50 history entries, 256 KB saved, all provisional. Approve as placeholders?
7. **Edit closing does not resume (R6.3).** Approve?
8. **Session restore link (2A R9).** 2B restores work when you load the same repository again by hand. Sub-phase **2G** auto-reloads the repository and the screen after a refresh.
