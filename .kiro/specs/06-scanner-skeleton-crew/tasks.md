# Tasks: 06 Scanner and Skeleton Crew (Phase 2, Sub-phase 2D)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2D-CREW` and the F6 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2D** (black-and-white wireframe, no animation, `AI_MODE=mock` only, no AI and no network). **These tasks start only after 2A, 2B, and 2C are built and you have advanced the active sub-phase to 2D.**

Task ids are **D1 to D12**, so they cannot be confused with T (spec 01), M (spec 02), S (spec 03), B (spec 04), or C (spec 05).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F6.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network, `fetch`, AI, `mockAssistant`, `aiAssistant`, or `useAssistant` import in any 2D file.
- Do not touch the files in design section 4.3. The 2B and 2C files in design section 4.2 may change **only** as described there. The only existing tests that may change are the 2B tests that assert `start` takes no argument (D8). Everything else must pass unedited.
- The worked examples in design section 10 are the hand-written truth: if the code disagrees, stop and discuss before changing either.
- A secret value must never appear in a snippet, narration, Log entry, saved record, diff, or test failure message. Tests use sentinel fixtures that look like secrets and check every string.
- Snippets are never saved or logged. Narration and Log entries hold paths, line numbers, check titles, counts, and fixed sentences only.
- No score, grade, or percentage anywhere. Never the words "secure" or "no problems" for a scan.
- Hitting any limit must produce a plain-words partial reason. A limit must never silently drop data.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

Same pattern as before: the spec on `spec/06-scanner-skeleton-crew`, code on `feat/scanner-skeleton-crew` from the spec branch, **one commit per task**, a pull request after D12.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| D1 | F6.1 | Limits and the 16 scan skills in the skill-book | 2C (C1) |
| D2 | F6.2 | Scan helpers, Frontend checks, APIs & Data checks | D1, 2C (C2) |
| D3 | F6.3 | Security checks and the one automatic fix | D1, D2 |
| D4 | F6.4 | Backend checks and the route-mismatch check | D1, D2, 2C (C5) |
| D5 | F6.5 | Scan engine, view helpers, sample expectations | D2, D3, D4 |
| D6 | F6.6 | Scan state, actions, store slice, Security row | D5, 2C (C6, C7) |
| D7 | F6.7 | Crew script and the run changes (pure) | D3, D5, D6, 2B (B4, B5) |
| D8 | F6.8 | Commands, saved-record guard, harness changes | D7, 2B (B2, B6, B7) |
| D9 | F6.9 | Scan controller | D6 |
| D10 | F6.10 | Screen 4 and Screen 5 components, command box | D5 |
| D11 | F6.11 | Wire Screens 4 and 5, Studio, App | D8, D9, D10, 2A |
| D12 | F6 | Final gate, browser run, mutation checks, independent review | D1 to D11 |

---

## D1. Limits and the 16 scan skills
- **plan_id:** P2D-CREW  **node_id:** F6.1
- **scope:** `src/config/scanLimits.ts`, `src/skillbook/types.ts` (add `ScanSkill`), `src/skillbook/scanSkills.ts`, `src/skillbook/index.ts` (add `SKILLBOOK.scan` and `scanSkillById`), `tests/scanSkills.test.ts`
- **goal:** Build design sections 4.1 (limits), 5 (`ScanSkill`), and 6 (the 16 skills with their plain `explain`, `why`, and `how`).
- **acceptance:**
  - The 16 skills match the table in requirements R2 row for row (ids, primary area, other areas, severity, certainty, fix label), written out by hand in the test. Exactly one skill has the fix label `auto` (`scan.security.target-blank`).
  - Every `explain` and `why` is 1 to 2 sentences, at most 240 characters, and contains none of the banned jargon list used in C1 (`regex`, `AST`, `heuristic`, `token`, `parse`, `boilerplate`, `idempotent`, `namespace`) plus `sanitize` and `payload`. Every skill has at least one `how` step. No text contains "secure" as a claim, a score, or a percentage.
  - The primary area counts are 3 Frontend, 4 Backend, 6 Security, and 3 APIs & Data. The `also` lists contain no duplicate of the primary.
  - `scanSkillById` returns each skill and `undefined` otherwise. The book is frozen. The 31 sort skills from 2C are unchanged (their test still passes).
  - `scanLimits.ts` holds the design values and `provisional: true`.
  - The files import nothing from React, stores, the engine, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/scanSkills.test.ts tests/skillbook.test.ts`

## D2. Scan helpers, Frontend checks, and APIs & Data checks
- **plan_id:** P2D-CREW  **node_id:** F6.2
- **scope:** `src/engine/sourceScan.ts` (export `maskComments` only), `src/engine/scanText.ts`, `src/engine/scanFrontend.ts`, `src/engine/scanApi.ts`, `tests/scanChecks.test.ts` (the Frontend and APIs & Data groups)
- **goal:** Build design sections 6 and 7.9 and 7.10: the helpers (`lineIndex`, `lineOf`, `snippetFor`, `makeFindingId`) and the checks `scan.frontend.img-alt`, `scan.frontend.button-name`, `scan.frontend.listener-cleanup`, `scan.api.fetch-no-ok-check`, and `scan.api.insecure-url`.
- **acceptance:**
  - For each check: a positive fixture with the exact first and last line; a negative fixture; a decoy in a comment and in a string that is not the target; and every language the design lists for it.
  - `img-alt`: HTML and JSX, a multi-line tag, a tag with `alt=""` (no finding), a tag with a `{...spread}` (no finding). `button-name`: an empty `<button></button>`, a self-closing button, a button with text (no finding), with `aria-label` (no finding). `listener-cleanup`: a React file with and without a matching `removeEventListener`, and a non-React file (no finding). `fetch-no-ok-check`: with `.ok`, with `.status`, and neither. `insecure-url`: `http://example.com` (finding, `extra` is the host), `http://localhost:3000` and `https://` (no finding), a Python `requests.get('http://...')`.
  - **Snippets:** at most 12 lines, at most 200 characters per line (longer lines end with "..."), the lines before and after, and every secret fixture in a snippet appears as `[REDACTED:<kind>]` (sentinel test).
  - **Ids:** the same finding gets the same id after an unrelated line is added above it elsewhere in the file only when its own text is unchanged and in the same occurrence order; two identical lines get different ids by occurrence.
  - Hostile input (200 KB of repeated `<img`, `<button`, `fetch(`, and unbalanced quotes) finishes in under 1 second per check and never throws.
  - The files import nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/scanChecks.test.ts tests/sourceScan.test.ts`

## D3. Security checks and the one automatic fix
- **plan_id:** P2D-CREW  **node_id:** F6.3
- **scope:** `src/engine/scanSecurity.ts`, `src/engine/scanFix.ts`, `tests/scanChecks.test.ts` (the Security group), `tests/scanSecrets.test.ts`, `tests/scanFix.test.ts`
- **goal:** Build the checks `scan.security.hardcoded-secret`, `dangerous-html`, `eval`, `target-blank`, `cors-wildcard`, and `env-file`, and design section 8 (`buildTargetBlankFix`, `buildFixProposal`).
- **acceptance:**
  - **Checks:** each has positive, negative, and decoy fixtures. `env-file` fires for `.env`, `.env.local`, and `.env.production`, even when the file was not read, and not for `.env.example`, `.env.sample`, `.env.template`, or `.env.dist`. `eval` covers `eval(`, `new Function(`, and Python `eval(` and `exec(`. `cors-wildcard` covers the JavaScript and Python forms in the design. `dangerous-html` covers all five forms.
  - **Secrets:** a fixture with a GitHub token (`ghp_` plus 36 characters), an AWS key id, a private-key block, a JWT, a bearer token, and `password = "hunter2hunter2"` each produce a finding with the kind named in plain words in `extra`; the **sentinel test** checks every string the finding can produce (snippet, extra, explain, why, how, title, narration text from `narrate`) and fails if any contains a value; the multi-line private key reports the BEGIN line.
  - **Auto fix:** `target-blank` finds `<a ... target="_blank">` in HTML and JSX, with and without `rel`, with `rel="nofollow"` only (appends the words), with `noopener` already (no finding), and with two links on one line. The diff has at most 3 lines of context and at most 2,000 characters, applies with 2B `applyUnifiedDiff`, makes the finding disappear, creates no new finding, contains no secret, and `reverseUnifiedDiff` plus apply restores the exact original text, including CRLF and a file with no trailing newline.
  - **Downgrade:** a `rel={dynamic}`, a `rel` on a different line from `target`, a diff over 2,000 characters, a diff that does not apply (the content changed), and a fix whose rescan still shows the finding or a new one each return `{ ok: false, reason }`, and the finding is shown as Guided with the note "A safe automatic fix could not be built here."
  - Hostile input stays under 1 second per check. The files import nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/scanChecks.test.ts tests/scanSecrets.test.ts tests/scanFix.test.ts`

## D4. Backend checks and the route-mismatch check
- **plan_id:** P2D-CREW  **node_id:** F6.4
- **scope:** `src/engine/scanBackend.ts`, `tests/scanChecks.test.ts` (the Backend group)
- **goal:** Build `scan.backend.input-validation`, `error-leak`, `sql-concat`, `no-auth-limit`, and `scan.api.route-mismatch` (from 2C edges).
- **acceptance:**
  - `input-validation`: JavaScript `req.body`, `req.query`, `req.params` and Python `request.json`, `request.args`, `request.form`, `request.get_json(` with no validation word (finding, Possible); the same file with `zod`, `validate`, `typeof`, or `isinstance` (no finding); the full-stack sample's route and middleware files (no finding).
  - `error-leak`: `res.send(err.message)`, `res.json({ error: err.stack })`, and `res.status(500).send(e.message)` (finding); `res.json({ error: 'failed' })` (none).
  - `sql-concat`: JavaScript `db.query("SELECT ... " + id)`, `db.query(\`SELECT ... ${id}\`)`, Python `cursor.execute(f"SELECT ... {x}")`, `cursor.execute("SELECT ... %s" % x)`, `cursor.execute("SELECT ... {}".format(x))` (finding); `db.query("SELECT ... WHERE id = $1", [id])` and `cursor.execute("SELECT ... WHERE id = %s", (x,))` (none); a string without a SQL keyword (none).
  - `no-auth-limit`: a repository with a PUT route and no auth word in any file gives one finding at the first write route (Possible, Explanation only, areas Backend and Security); the same repository with a file containing `passport`, `jwt`, `rateLimit`, or `helmet` gives none; a repository with only GET routes gives none; the full-stack sample gives the finding in design section 10.
  - `route-mismatch`: a Broken `calls_api` edge gives one finding with the edge's path, line, and note in `extra`; a Confirmed or Inferred edge gives none (the React sample's call gives none).
  - Hostile input stays under 1 second per check. The file imports nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/scanChecks.test.ts`

## D5. Scan engine, view helpers, and the sample expectations
- **plan_id:** P2D-CREW  **node_id:** F6.5
- **scope:** `src/engine/scanProject.ts`, `src/engine/scanView.ts`, `tests/scanProject.test.ts`, `tests/scanSamples.test.ts`, `tests/scanView.test.ts`
- **goal:** Build design sections 7 and 5 (`scanProject`, `rescanPaths`, `scanFile`) and the view helpers (`countsBy`, `areaCounts`, `filterFindings`, `linksBetweenAreas`, `workerSlots`, `whatWasChecked`).
- **acceptance:**
  - **Samples:** `scanSamples.test.ts` writes out, as plain data, the findings and counts in design section 10 for the three samples, builds each with `buildSampleSnapshot`, runs 2C `analyzeProject` and then `scanProject`, and compares exactly (skill id, path, first and last line, areas, severity, certainty, fix label, snippet line range, `filesScanned`, `partial: false`, empty `partialReasons`, unique total, counts per area, severity, and fix label). Any difference is reported and **not** fixed by editing the expectations without your approval.
  - **Run:** with a fake yield and clock: batches of 40 yield and report progress; an abort leaves no result; each limit (2,000 files, 8 seconds, 50 per check, 500 total) gives its own plain-words reason in the fixed order, keeps the findings found so far, and sets `partial`; a throwing check is isolated and listed in `couldNotCheck`; findings are sorted by severity, path, line, skill id, and identical with the input reversed; the snapshot and the 2C result are not mutated (deep-freeze test); no network (the global `fetch` throws).
  - **Applicability:** a corrected label changes which checks run on a file; a Needs Review file gets Security checks only; a path-only file gets only `env-file`; a `.md` file gets none and is counted under `notChecked`.
  - **Incremental:** `rescanPaths` after applying the target-blank fix removes that finding, leaves all others unchanged, keeps `partial` and `labelsKey`, and after undo brings it back with the same id.
  - **Views:** counts per severity, area, and fix label match a hand-written fixture; a multi-area finding counts in each of its areas and once in the unique total; `linksBetweenAreas` on the full-stack sample returns the rows derived from its edges and omits rows with no edges; `workerSlots` returns the right text for idle, checking, waiting for decision, paused, and done states; `whatWasChecked` lists all 16 titles and the three "not checked" lines; no output field contains a number out of 100, a percentage, a grade, "secure", or "no problems".
  - The files import nothing from React or stores, and `scanProject` imports no network or AI module.
- **verify:** `npm run typecheck && npx vitest run tests/scanProject.test.ts tests/scanSamples.test.ts tests/scanView.test.ts`

## D6. Scan state, actions, store slice, and the Security row
- **plan_id:** P2D-CREW  **node_id:** F6.6
- **scope:** `src/store/scanSlice.ts`, `src/store/scanActions.ts`, `src/store/useStudioStore.ts` (add `scan` only), `src/engine/understandingView.ts` (the optional third argument of `summarize`), `src/components/UnderstandingSection.tsx` (the Security row text only), `tests/scanState.test.ts`
- **goal:** Build design section 11 (state and actions) and the 2C summary change in design section 4.2.
- **acceptance:**
  - **Existing tests still pass with no edits** (`store`, `aiState`, `workStore`, `understandingState`, `understandingView`, `understandingUi`, and the 2A tests), and `initialState().scan` equals `idleScan()`.
  - Every transition: begin, progress, complete, fail, cancel, refresh, clear. A stale `runId` or another snapshot id changes nothing (same object). `sRefresh` does nothing unless `status` is `done`.
  - The log entries `scan_started`, `scan_done` (with "Partial result." when partial), `scan_failed`, and `scan_cancelled` have the expected text and hold counts and titles only (sentinel tests for a snippet line and a secret fixture).
  - The state clears with `ai`, `work`, and `understanding` on snapshot replacement, `reset`, and foreground cancel.
  - `summarize(result, corrections)` still gives Security "pending scan (2D)" exactly as before (the 2C tests are unchanged). `summarize(result, corrections, scanDone)` gives "<n> findings" (and "Partial" when partial), never a score.
  - `stale` is true when the scan's `labelsKey` differs from the current corrections' key, and false otherwise.
  - The slice file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/scanState.test.ts tests/store.test.ts tests/understandingView.test.ts tests/understandingUi.test.tsx tests/workStore.test.ts`

## D7. Crew script and the run changes (pure)
- **plan_id:** P2D-CREW  **node_id:** F6.7
- **scope:** `src/engine/crewScript.ts`, `src/store/workSlice.ts` (add `kind`, step kinds, proposal `source`, per-kind step limit), `src/store/workActions.ts` (crew steps and the same-update re-check), `tests/crewScript.test.ts`, `tests/crewRun.test.ts`
- **goal:** Build design sections 9.1 and 9.2 and the 2B changes in design sections 4.2 and 5. `startRun` takes the kind. `runOneStep` handles `area` and `finding`, and `propose` and `verify` for the crew. `approve`, `undo`, and `redo` call `rescanPaths` and update `scan.result` in the same update.
- **acceptance:**
  - **The whole 2B suite passes unedited** (`workState`, `workActions`, `workStore`, `harnessController`, `harnessUi`), proving the practice run is unchanged.
  - **Script:** the order of areas; severity, path, and line order; each finding narrated once under its primary area; at most 12 per area and at most 150 steps, with the "left out" notes on the area step and the finish step; `propose` and `verify` exist only for findings whose fix is `auto` and whose proposal passes the safety check at script time; no findings gives intro, four area steps, finish and the sentence "No findings to go through."; the script for the full-stack sample is the 7 steps in design section 10; deterministic (same input, same output; input reversed, same output).
  - **Narration:** one Log entry per `finding` step with the three sentences of R6.4, built only from skill text, path, and line numbers (sentinel tests: no snippet line and no secret value, including for `hardcoded-secret`). Entries use the actions `crew_info`, `crew_frontend`, `crew_backend`, `crew_security`, and `crew_api_data`.
  - **Run:** every row of the 2B state table holds for `kind: 'crew'`; a crew `propose` creates a proposal with `source: 'crew'` and moves to `awaiting_decision`; `approve` applies the fix to the practice copy, adds the History entry, and removes the finding from `scan.result` in the same update; `verify` says "verified" only after a real re-check with the finding gone and nothing new, "nothing to verify" when rejected, and "failed" with a reason otherwise; `undo` brings the finding back with the same id; a fix that fails the safety check at step time writes the "could not be built" line and the run continues; `stop` rejects a crew proposal and logs the counts of narrated, approved, and rejected; `start crew` refusals (no finished scan, run active, Self-editing, no snapshot) each return the exact reply and the same state.
  - **Invariants:** after a seeded random sequence of 3,000 commands and ticks over both run kinds: at most one proposal; `awaiting_decision` iff a proposal exists; `idle` implies none; at most 50 history entries; `position <= steps.length`; the applied fixes and `scan.result` never disagree (rescanning from scratch gives the same findings as the incrementally updated ones).
  - Repeating `pause`, `resume`, `stop`, and `approve` 100 times ends where the first press ends.
  - The files import nothing from React or the network. `workSlice.ts` and `crewScript.ts` import nothing from `useStudioStore`.
- **verify:** `npm run typecheck && npx vitest run tests/crewScript.test.ts tests/crewRun.test.ts tests/workState.test.ts tests/workActions.test.ts tests/workStore.test.ts`

## D8. Commands, saved-record guard, and harness changes
- **plan_id:** P2D-CREW  **node_id:** F6.8
- **scope:** `src/engine/commands.ts`, `src/store/workStorage.ts`, `src/hooks/useHarness.ts`, `src/components/StopBar.tsx`, `src/components/ProposalCard.tsx`, `tests/commands.test.ts` (**only the tests that assert `start` takes no argument**), `tests/crewStorage.test.ts`, `tests/crewRun.test.ts` (controller cases)
- **goal:** Build design section 9.3 and the 2B changes in section 4.2.
- **acceptance:**
  - **Commands:** `start`, `start practice`, `/Start Crew`, and `start crew` parse; the two-word near misses `start now` and `start crews` are refused with "Use: start, start practice, or start crew."; the three-word texts `start crew now` and `start practice crew` are not commands and go to the AI path. Every other 2B command test passes unedited. The report shows the diff of the `start` tests that changed and nothing else.
  - **Saving:** a crew run is saved as `run: null`; a crew proposal as `proposal: null`; a practice run is saved exactly as before; context diffs of up to 2,000 characters round-trip and restore with the fingerprint checks; a history diff that contains a secret fixture makes the record builder skip history, write the Log line "Saved work was not updated: a change contains a likely secret.", and leave the previous saved slot untouched; the 2B storage tests pass unedited.
  - **Controller (fake timers):** a crew run ticks every 1,000 ms and a practice run every 1,200 ms; `pause` clears the timer; the existing 2B controller tests pass unedited; stop and reset still call `cancelAI` once; Edit open pauses a crew run and closing it does not resume.
  - **UI text:** the Stop bar says "Skeleton Crew run: ..." for a crew run and "Practice run: ..." for a practice run; the proposal card shows the crew line for `source: 'crew'` and the practice line otherwise; both still have only Stop, Approve, and Reject buttons.
- **verify:** `npm run typecheck && npx vitest run tests/commands.test.ts tests/crewStorage.test.ts tests/crewRun.test.ts tests/workStorage.test.ts tests/harnessController.test.ts tests/harnessUi.test.tsx`

## D9. Scan controller
- **plan_id:** P2D-CREW  **node_id:** F6.9
- **scope:** `src/hooks/useScan.ts`, `tests/scanController.test.ts`
- **goal:** Build design section 11: `createScanController(studio, services)` and `useScan()`.
- **acceptance:**
  - `ensure()` starts one scan when the 2C analysis is `done`, there is no scan for this snapshot, and none is running; it does nothing when a scan exists, when one is running, and when the analysis is missing or failed (the state stays idle and the reason is exposed for the screen).
  - `run()` starts a new scan even when one exists. `cancel()` aborts, leaves no result, and returns to `idle`. A second `ensure()` while running is ignored.
  - Progress reaches the store. The result and the Log entries match the actions in D6. Time and file limits (fake clock) produce a partial result.
  - Replacing or clearing the snapshot aborts a running scan and clears the state. Changing the corrections marks the scan stale and starts nothing. `dispose` aborts, unsubscribes, and ignores later results.
  - A scan never starts during loading (no call before the experience is `studio`).
  - The file imports no `fetch`, AI, or `mockAssistant` module (source-text check).
- **verify:** `npm run typecheck && npx vitest run tests/scanController.test.ts`

## D10. Screen 4 and Screen 5 components and the command box
- **plan_id:** P2D-CREW  **node_id:** F6.10
- **scope:** `src/components/AreaMap.tsx`, `WorkerSlots.tsx`, `ScanSummary.tsx`, `WhatWasChecked.tsx`, `FindingsTable.tsx`, `FindingDetail.tsx`, `CrewNarration.tsx`, `RequestTrace.tsx`, `ChangesMade.tsx`, `CommandBar.tsx` (all in `src/components/`), `src/styles.css` (append the 2D block only), `tests/crewUi.test.tsx`
- **goal:** Build design section 12 as components that take props only.
- **acceptance:**
  - With `react-dom/server` and the hand-written results of the three samples: `AreaMap` shows four boxes with the area names, file counts, severity counts or "No findings from the checks that ran.", and **Open**; the links table rows; the helper-group line; `WorkerSlots` shows four slots with the right status text and "Workers take turns in this version."; `ScanSummary` shows each scan state line (running with Cancel, done, cancelled, failed, out of date, understanding not ready) and the Partial line; `WhatWasChecked` is a closed `details` with the 16 titles and the three "not checked" lines.
  - `FindingsTable` shows the columns, "also in ..." for multi-area findings, severity words, certainty words, and fix labels in words; `FindingDetail` shows path and lines, the snippet in a `pre` (redacted), explanation, why, plan steps, certainty, skill id, and fix label with its meaning; a markup-looking snippet (`<img src=x onerror=alert(1)>`) is escaped.
  - `CrewNarration`, `ChangesMade`, and `RequestTrace` render their lists and empty states. `CommandBar` shows the hint, the input and Run button, the last 3 replies, and calls the `submit` prop; its not-a-command reply is the exact sentence in R10.2 (tested through a fake `submit` that reports `false`).
  - **No score, grade, percentage, "secure", or "no problems"** appears in any markup (checked by a text scan of every rendered fixture). No Apply button anywhere.
  - Tables have header cells and sit in boxes with a maximum height and their own scroll.
  - Static checks: no `dangerouslySetInnerHTML`, no color other than `#000` and `#fff`, no `transition`, no `animation`, every new file tagged `@node: F6.10`.
  - Browser behavior is **not** claimed here. It is verified in D12.
- **verify:** `npm run typecheck && npx vitest run tests/crewUi.test.tsx`

## D11. Wire Screens 4 and 5, Studio, and App
- **plan_id:** P2D-CREW  **node_id:** F6.11
- **scope:** `src/components/SkeletonCrewScreen.tsx`, `src/components/DomainScreen.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css` (only to fix a class from D10), `tests/crewUi.test.tsx` (append wiring tests)
- **goal:** Replace the 2A empty pages with the real screens built from the D10 components, add `useScan()` to `App`, and pass the scan state, the harness, and the controllers through `StudioLayout`.
- **acceptance:**
  - **The existing suite passes with no existing test edited** apart from the tests named in D8, including the 2A shell tests (their Screen 4 and Screen 5 assertions are kept true: the headings, the area buttons, the Back buttons, and no toolbar), the 2B harness tests, and the 2C tests.
  - With a seeded store and `react-dom/server`: Screen 4 shows the Stop bar, the heading, the command box, the scan line, the map, the worker slots, the narration, the pending proposal card when set, and the closed "what was checked" block, and **no toolbar**; Screen 5 for each of the four areas shows its table, detail, narration, changes made, and (APIs & Data) the request trace, and **no toolbar**.
  - Opening Screen 4 calls `ensure()` once (fake controller) and never during Screen 3 or loading.
  - `open edit` typed in the command box returns to Screen 3 with the Edit panel open (store-level test).
  - `StudioLayout` and the screens import no engine module they did not need before, apart from types.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## D12. Final gate and independent review
- **plan_id:** P2D-CREW  **node_id:** F6
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts live outside the repo and are deleted afterwards. `README.md` (a short section on the scanner and the crew) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase and its Phase 2D gate.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2C baseline.
  2. Static checks: no new dependency; no network, AI, or `mockAssistant` import in any 2D file; no color other than `#000` and `#fff`; no `transition` or `animation`; every new file tagged; every finding cites an existing skill id; no score, grade, percentage, or "secure" text in any source or markup; the diff of existing tests shows only the `start` tests named in D8.
  3. Mutation checks (break, see tests fail, restore): each check's core pattern and its decoy handling, the secret redaction in snippets, the 12-line and 200-character snippet bounds, each partial reason, the per-check and total finding caps, the auto-fix safety conditions (apply, rescan clean, no new finding, no secret), the one-update re-check after approve and undo, the "verified only after a real check" rule, the crew script order and caps, the `start crew` refusals, the crew run and proposal not being saved, the history secret guard, the scan-not-during-loading rule, and the abort handling.
  4. Timing: the hostile-input tests per check, and a synthetic repository of 2,000 files with 200 KB each, stay inside the 8 second limit, give a Partial result with a reason when slow, and keep the page responsive.
  5. Browser run (headless Chromium on the built app) of every item in requirements section 6, item 15, including the three samples against the hand-written findings, a fixture repository with a `target="_blank"` link, a hard-coded secret fixture, and an unmatched API call, the crew run with `pause`, `step`, `resume`, Approve, `undo`, Reject, and `stop`, refresh and restore, Cancel a scan, a forced small limit, no toolbar on Screens 4 and 5, the command box, 375 px, zero console errors, and that AI Chat, the 2B commands, and the 2C section still work.
  6. Independent behavioral review with `semantic_reviewer`, focused on invented certainty, secret leakage in any text, the honesty of Found and Possible, the crew's "never without a decision" rule, and the 2D scope rules. Fix findings only with your approval.
  7. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the sixteen acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2D passes its gate: every finding shows its file, lines, snippet, and reason, and no score is invented. Advancing to 2E stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 Scan skills | D1 |
| R2 The 16 checks | D2, D3, D4 |
| R3 Findings and proof | D2, D3, D5 |
| R4 No fake scores, honest counts | D1, D5, D6, D10 |
| R5 The scan run | D5, D6, D9 |
| R6 The Skeleton Crew run | D7, D8 |
| R7 Fixes, approval, undo | D3, D7, D8 |
| R8 Screen 4 | D10, D11 |
| R9 Screen 5 | D10, D11 |
| R10 Command box | D10, D11 |
| R11 Wiring | D6, D7, D8, D11 |
| R12 Safety, privacy, resources | D1 to D11, D12 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Skill-book | D1 |
| 2. Checks | D2, D3, D4 |
| 3. Secrets | D3 |
| 4. Auto fix | D3 |
| 5. Scan run | D5, D9 |
| 6. Samples | D5 |
| 7. Counts and views | D5 |
| 8. Crew script | D7 |
| 9. Run machine | D7, D8 |
| 10. Storage | D8 |
| 11. Controller | D8, D9 |
| 12. Components | D10, D11 |
| 13. Static checks | D1 to D11, D12 |
| 14. Regression | D6, D8, D11, D12 |
| 15. Browser run | D12 |
| 16. Phase 2D gate | D12 |

## Questions

1. **Requirements questions 1 to 9** at the end of `requirements.md` (they are also written out in the chat message).
2. **Branch pattern** for code: same as before. Confirm or change.
3. **Approval of the spec**, and then, once 2A to 2C are built and you advance the active sub-phase to 2D, your explicit "Go" naming **D1**.
