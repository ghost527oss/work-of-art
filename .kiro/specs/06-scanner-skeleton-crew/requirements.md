# Requirements: 06 Scanner and Skeleton Crew (Phase 2, Sub-phase 2D)

Sources: steering `build-phases.md` (Phase 2 text, sub-phase 2D and its gate); the approved Phase 2 blueprint (sections 4 and 6: Screens 4 and 5, the four-area scanner, the Skeleton Crew); specs 01 to 05 (what is built or specified); your answers so far (offline first, honest fix labels, proof for every finding, no invented scores, approve and undo for every change, never save secrets).
Active product phase: **Phase 2, Sub-phase 2D**. Black-and-white wireframe only, no animation, `AI_MODE=mock` only, no new runtime dependency, **no AI call and no network call**. **This spec assumes 2A, 2B, and 2C are built and approved.**

## 1. Purpose

2D teaches PatchBay to **find real problems** in the loaded project with a built-in set of checks, and builds the **Skeleton Crew**: an automatic run that goes through the findings area by area, says what it is checking and what it plans to do, and waits for your approval before it changes anything. It fills Screen 4 (the map and the worker slots) and Screen 5 (one area's findings and the crew's narration).

In simple words: PatchBay reads your code with a checklist, shows every problem with the exact file, lines, and a short piece of the code, and tells you why it matters. The crew then walks through them one by one. It can fix only a few things safely on its own. For everything else it explains what to do. It never invents a score.

## 2. Scope

### In scope
- **The scanner:** 16 offline checks in four areas (section 4, R2), driven by scan skills added to the skill-book from 2C.
- **Findings with proof:** every finding has the file, the line range, a short code snippet (secrets hidden), a plain-English explanation, why it matters, a plan for fixing it, a severity, and an honest fix label (Auto-supported, Guided, or Explanation only).
- **No fake scores:** only real counts by severity, by area, and by fix label, plus what was and was not checked.
- **The scan run:** automatic when you open Screen 4, batched and cancellable, with partial results marked clearly. After you approve or undo a fix, the affected files are checked again.
- **The Skeleton Crew run:** started by typing `start crew`. It reuses the 2B run controls (`pause`, `resume`, `step`, `stop`, `approve`, `reject`, `undo`, `redo`). It narrates each step, proposes the one kind of fix that is safe to automate, and verifies it by checking the file again.
- **Screen 4:** the four-area map (a plain-text wireframe), the helper groups, the four worker slots, and the scan summary.
- **Screen 5:** one area's findings, a finding detail view, the crew's narration, the pending proposal card, and the changes made.
- **A command box** on Screens 4 and 5 (the toolbar is hidden there), so the commands, Approve, and Reject still work.
- Updating the Security row in Project info from "pending scan (2D)" to the real count once a scan exists.
- Tests, a browser check, and `traceability/PLAN.md` entries.

### Out of scope (later sub-phases or phases)
- Layout and overflow checks measured in the live sandbox (2E). Visual editing (2E). Preview of the imported app (2E).
- Data-shape mismatch checks between a request and a response, and any check that needs running the imported code.
- Journal lessons and teaching templates (2F). Session restore (2G).
- AI explanations or AI-written fixes, and the free-sentence control of the crew (Phase 3).
- Any change to the real repository. Fixes change only the in-memory practice copy (as in 2B).
- Colors, themes, the drawn spider-web, animation (Phase 4). Live AI (Phase 3).

## 3. Glossary

- **Scan skill:** one check in the skill-book, with an id such as `scan.security.target-blank`, a title, areas, a severity, a fix label, and plain-English text.
- **Finding:** one problem that a scan skill found at one place.
- **Area:** Frontend, Backend, Security, or APIs & Data. A finding has one **primary** area and may also belong to others. Security cuts across the other areas.
- **Severity:** High, Medium, or Low. It is fixed by the check, never calculated from a formula or a score.
- **Certainty:** **Found** (the check matched exactly what it describes) or **Possible** (the check could not see everything, for example "no sign of a login check in the files that were read").
- **Fix label:** **Auto-supported** (PatchBay has a tested, safe fix ready), **Guided** (PatchBay explains the steps and a person should do and review them), or **Explanation only** (no fix is offered).
- **Crew:** the Skeleton Crew, the automatic run. **Worker slot:** one of four boxes, one per area, that shows what the crew is doing for that area.
- **Narration:** the plain sentences the crew writes to the Log as it works.
- **Snippet:** at most 12 lines of code around the finding, with secret values hidden. Never saved or logged.
- **Effective content:** the file as it is after your approved changes (the practice copy), or the loaded file when there are none.

## 4. Functional requirements

### R1. Scan skills in the skill-book
1. THE SYSTEM SHALL add **scan skills** to the same skill-book as the 2C sort skills (`SKILLBOOK.scan`). Each has: an id (`scan.<area>.<name>`), a title, its areas (one primary, any others), a severity, a fix label, a certainty (`found` or `possible`), a one-or-two-sentence `explain` (what is wrong), a `why` sentence (why it matters), and a list of plain `how` steps (how to fix it). All text is plain English with no jargon.
2. THE SYSTEM SHALL use the 16 skills in R2 and no others. The id, title, severity, fix label, and certainty of each are fixed data.
3. EVERY finding SHALL cite its skill id. No finding SHALL be created by code outside a scan skill.
4. THE skill-book SHALL stay data and code in the bundle and SHALL NOT be fetched.

### R2. The 16 checks (version 1)

| Id | Primary area (also) | What it finds | Severity | Certainty | Fix label |
|---|---|---|---|---|---|
| `scan.frontend.img-alt` | Frontend | An `<img>` tag (HTML or JSX) with no `alt` attribute | Medium | Found | Guided |
| `scan.frontend.button-name` | Frontend | A `<button>` with no text and no `aria-label` or `title` (empty element) | Medium | Found | Guided |
| `scan.frontend.listener-cleanup` | Frontend | In a React file, `addEventListener` on `window` or `document` with no `removeEventListener` anywhere in the file | Low | Possible | Guided |
| `scan.backend.input-validation` | Backend (Security) | A route file that reads `req.body`, `req.query`, or `req.params` and shows no sign of checking them (no validation word and no `typeof` check in the file) | Medium | Possible | Guided |
| `scan.backend.error-leak` | Backend (Security) | A response that sends `err.stack`, or `err.message`, straight to the client | Medium | Found | Guided |
| `scan.backend.sql-concat` | Backend (Security, APIs & Data) | A database call (`query`, `execute`, `raw`) whose text is built with `+`, a template `${...}`, `%`, `.format`, or an f-string | High | Found | Guided |
| `scan.backend.no-auth-limit` | Backend (Security) | A repository with at least one write route (POST, PUT, PATCH, DELETE) and no sign of authentication or rate limiting in any file that was read; reported once, at the first write route | Medium | Possible | Explanation only |
| `scan.api.route-mismatch` | APIs & Data (Frontend, Backend) | A call whose address matches no route while the repository does have routes (a Broken connection from 2C), or whose method differs | Medium | Found | Guided |
| `scan.security.hardcoded-secret` | Security (any) | A likely secret in a code or configuration file: a token, key, private key, JWT, or a password or key assigned a literal value. The value is never shown | High | Found | Explanation only |
| `scan.security.dangerous-html` | Security (Frontend) | `dangerouslySetInnerHTML`, `.innerHTML =`, `insertAdjacentHTML`, `document.write(`, or `v-html` | Medium | Found | Guided |
| `scan.security.eval` | Security (any) | `eval(` or `new Function(` | High | Found | Guided |
| `scan.security.target-blank` | Security (Frontend) | A link with `target="_blank"` and no `rel` containing `noopener` | Low | Found | **Auto-supported** |
| `scan.security.cors-wildcard` | Security (Backend) | A CORS setting that allows every origin (`'*'`, or `cors()` with no options) | Medium | Found | Guided |
| `scan.security.env-file` | Security (any) | A real environment file (`.env`, `.env.local`, `.env.production`) is part of the repository (not `.env.example`, `.env.sample`, or `.env.template`) | High | Found | Explanation only |
| `scan.api.fetch-no-ok-check` | APIs & Data (Frontend) | A `fetch(...)` result whose body is read (`.json()` or `.text()`) in a file that never looks at `.ok` or `.status` | Low | Possible | Guided |
| `scan.api.insecure-url` | APIs & Data (Security) | A call to an external `http://` address (not `localhost` or `127.0.0.1`) | Medium | Found | Guided |

1. EACH check SHALL run only on the files that its rule applies to (R3.3) and SHALL be documented with the exact patterns it uses in the design.
2. THE checks SHALL ignore text in comments (as the 2C scanner does) and SHALL NOT report the same place twice for the same skill.
3. THE system SHALL NOT claim that a "Possible" finding is a bug. Its text SHALL say what was not seen ("no sign of ... in the files that were read").

### R3. Findings and proof
1. EACH finding SHALL have: an id, the skill id, the primary area and other areas, the severity, the certainty, the fix label, the file path, the first and last line, a snippet, the explanation, the "why it matters" sentence, and the plan steps.
2. THE id SHALL be stable for the same skill, file, and place, so the same finding keeps its id after an unrelated change elsewhere in the project.
3. THE scanner SHALL decide which checks run on a file from the file's effective labels from 2C (including your corrections): Frontend checks on `frontend` and `shared` files, Backend checks on `backend`, `shared`, and `api_data` files, API checks on files that make or define requests, and **Security checks on every loaded code and configuration file**, whatever its label. A file in Needs Review gets the Security checks only.
4. THE snippet SHALL be the finding's lines plus up to 2 lines before and after, at most 12 lines in all and at most 200 characters per line (longer lines are cut with "..."). Every line SHALL be passed through `redact()` so secret values show as `[REDACTED:<kind>]`. For `scan.security.hardcoded-secret` the line with the secret SHALL show only the redacted form.
5. THE snippet, the explanation, and every other text of a finding SHALL be shown as React text.
6. THE snippet SHALL NOT be saved, written to the Log, or included in any record.
7. A finding for a file that was not read (path only) SHALL exist only for `scan.security.env-file`, which needs only the path.

### R4. No fake scores, honest counts
1. THE SYSTEM SHALL NOT show any score, grade, percentage, or "out of 100" number for any area or for the project.
2. THE SYSTEM SHALL show only real counts: findings per severity, findings per area (a finding is counted in each of its areas, and the **unique total** is shown separately), findings per fix label, and files scanned.
3. THE SYSTEM SHALL always show **what was and was not checked**: the number of files scanned, files not read, the 16 checks by title, the file types that have no checks, and the checks that do not exist yet ("Layout overflow is measured in the sandbox, sub-phase 2E.", "Mismatched data shapes are not checked.", "Imported code is never run.").
4. THE SYSTEM SHALL say "No findings from the checks that ran" when there are none, and SHALL NOT say "secure" or "no problems".

### R5. The scan run
1. THE SYSTEM SHALL start a scan automatically when Screen 4 opens and no current scan exists for the loaded snapshot. THE user MAY press **Scan again** at any time, and **Cancel** while it runs.
2. THE scan SHALL need the 2C analysis result. WHEN the result is missing or failed, THE Screen 4 SHALL say "Project understanding is not ready, so the scan cannot start" and offer **Try again** for the analysis.
3. THE scan SHALL work in batches of 40 files and hand control back to the browser between batches. It SHALL stop with the same Cancel, and when the snapshot is replaced or cleared, and when the app unmounts, and leave no partial result when cancelled.
4. THE scan SHALL have these limits (provisional): 2,000 files scanned, 8 seconds, 500 findings in total, 50 findings per check. WHEN any limit is reached, THE SYSTEM SHALL keep the findings so far, mark the whole scan **Partial**, and give a plain-words reason for each limit reached ("Finding limit (500) reached: later findings are missing.", "Limit of 50 findings for <check title> reached: <n> more were not listed.", "File limit (2,000) reached: <n> files were not scanned.", "Time limit (8 seconds) reached: <n> files were not scanned.").
5. A failure inside one file or one check SHALL be caught, SHALL be listed under "Could not be checked" with the path and check title, and SHALL NOT stop the scan.
6. WHEN you approve, undo, or redo a change, THE SYSTEM SHALL check again the files whose effective content changed and update the findings (R6.6). WHEN you correct labels (2C), THE SYSTEM SHALL mark the scan **out of date** and offer **Scan again**; it SHALL NOT scan again by itself.
7. THE scan SHALL make no network call and no AI request, SHALL NOT change the snapshot, and SHALL NOT be saved.
8. THE results SHALL be deterministic: sorted by severity (High first), then path, then line, then skill id.

### R6. The Skeleton Crew run
1. WHEN the user types `start crew` (R6.8), THE SYSTEM SHALL build a **crew script** from the current findings and start a run with the 2B run controls. `start` alone still starts the 2B practice run and is unchanged.
2. THE system SHALL refuse `start crew` when no scan is `done` ("Open Skeleton Crew and wait for the scan first."), when a run is already active, when the mode is Self-editing ("Close the Edit panel first."), or when no snapshot is loaded.
3. THE script SHALL contain, in this order: an intro step; then for each area in the order Frontend, Backend, Security, APIs & Data, an area step and then one step per finding **whose primary area is that area** (so no finding is narrated twice), sorted by severity, path, and line, at most 12 findings per area; and a finish step. A finding with an Auto-supported fix that passes the safety check (R7.2) adds a `propose` step and a `verify` step right after its step. The script is capped at 150 steps. WHEN findings were left out, THE area step and the finish step SHALL say how many and why.
4. EACH step SHALL write narration to the Log in plain sentences: what it is checking ("Checking <check title> in <path>, lines <a> to <b>."), what is wrong ("Problem: <explanation>"), and what it plans to do ("Plan: <first how step>" for Guided, "Plan: <fix description>" for Auto-supported, "No fix is offered; <why it matters>" for Explanation only). Narration SHALL contain no code lines.
5. THE worker slots on Screen 4 SHALL show, for each area, one of: "Waiting", "Checking <check title>", "Waiting for your decision", "Done: <n> findings", or "Paused". Only one worker is active at a time. THE page SHALL say "Workers take turns in this version."
6. THE run states, the tick, `autoAdvance`, pause, resume, step, stop, Edit auto-pause, and refusals SHALL be exactly those of 2B (R2 and R3 of that spec). The crew tick is 1.0 second (provisional).
7. THE crew SHALL NEVER change anything without a decision. A `propose` step creates a proposal and the run waits (R7).
8. THE command `start` SHALL accept one optional word, `practice` or `crew`. `start` and `start practice` start the practice run. `start crew` starts the crew. Any other word is refused with "Use: start, start practice, or start crew."
9. WHEN the crew run finishes or is stopped, THE Log SHALL say how many findings were narrated, how many fixes were approved, and how many were rejected.
10. THE crew run and its pending proposal SHALL NOT be saved. After a refresh the run is gone and the findings are scanned again. The approved changes in History are restored by 2B.

### R7. Fixes, approval, and undo
1. THE only Auto-supported fix in version 1 SHALL be `scan.security.target-blank`: it adds `rel="noopener noreferrer"` to the link (or adds the two words to an existing `rel`). It SHALL produce a unified diff with up to 3 lines of context, at most 2,000 characters.
2. A fix SHALL be offered as Auto-supported only when all of these hold at the moment the proposal is made: the diff applies exactly to the effective content (2B `applyUnifiedDiff`); after applying it, the same check no longer reports that finding; no new finding of any check appears in that file; the diff contains no likely secret (`containsSecret`). WHEN any condition fails, THE finding SHALL be shown as **Guided** with the note "A safe automatic fix could not be built here."
3. THE proposal SHALL use the 2B proposal card and the 2B decision rules: Approve and Reject buttons and the typed words, one proposal at a time, applied to the practice copy only, one History entry, undo and redo with the 2B fingerprint checks, and a rejected proposal changes nothing.
4. THE crew's `verify` step SHALL check the file again. WHEN the finding is gone and no new finding appeared, THE Log SHALL say "verified". WHEN the proposal was rejected, it SHALL say "nothing to verify". WHEN the finding is still there or a new one appeared, it SHALL say "failed" with the reason. It SHALL never say "verified" without having checked.
5. THE `undo` and `redo` commands SHALL work as in 2B and SHALL trigger the same re-check (R5.6). Screen 5 SHALL list the changes made for that area and say "Type undo to reverse the latest change."
6. THE Guided and Explanation-only findings SHALL never produce a proposal, a diff, or a change. They show their plan steps only.
7. NOTHING SHALL touch the real repository.

### R8. Screen 4 (Skeleton Crew)
1. THE screen SHALL keep the left Sandbox placeholder (2A) and show on the right: the heading "Skeleton Crew", the command box (R10), the Stop bar above everything, and **no toolbar**.
2. THE map (a plain-text wireframe) SHALL show four boxes in a 2-by-2 grid, one per area, each with: the area name, the number of files in it (from 2C labels, Security showing "all code files"), findings by severity ("High 1, Medium 2, Low 0" or "No findings from the checks that ran"), and an **Open** button to Screen 5 for that area.
3. BELOW the boxes THE map SHALL show a **Links between areas** table built from the 2C connections: rows such as "Frontend to APIs & Data: 3 Confirmed, 1 Inferred, 0 Broken" and "APIs & Data to Backend: 1 Confirmed, 0 Inferred, 0 Broken", each from the real edges and nothing guessed. A row with no edges is omitted.
4. THE screen SHALL show the helper groups as one line each with their file counts (Images and fonts, Tests, Settings, Docs).
5. THE screen SHALL show the four worker slots (R6.5), the scan state and Partial line, **Scan again**, **Cancel** (while scanning), and "Out of date: labels changed" with **Scan again** when applicable.
6. THE screen SHALL show the crew's current narration (last 5 lines) and the pending proposal card, if any.
7. THE screen SHALL show the "what was and was not checked" block (R4.3) in a collapsible section, closed by default.
8. **Back to Studio** SHALL return to Screen 3.

### R9. Screen 5 (Domain Debugging)
1. THE screen SHALL keep the left Sandbox placeholder and show on the right: the area name as heading, the Stop bar above, the command box, and **no toolbar**.
2. THE screen SHALL show the area's counts (severity and fix label), the Partial line when applicable, and the findings table: severity, check title, file and lines, certainty, fix label. At most 200 rows with **Show more**. A finding appears in every area it belongs to, and its row says "also in <other areas>".
3. SELECTING a row (a **Details** button) SHALL show the finding detail: path and lines, the snippet in a preformatted block, the explanation, why it matters, the plan steps, the certainty in words ("Found by the check" or "Possible: <what was not seen>"), the skill id, and the fix label with its meaning.
4. THE screen SHALL show the crew narration for the area (last 30 lines of entries written by the crew, filtered by area), the pending proposal card (R7.3) when it belongs to this area, and the list of changes made for this area.
5. FOR the APIs & Data area, THE screen SHALL also show the **request trace**: every API call and route from the 2C connections (kind, from, to, certainty, line), so the requests are visible even when no finding exists.
6. **Back to Skeleton Crew** and **Back to Studio** SHALL work as in 2A.

### R10. The command box on Screens 4 and 5
1. BECAUSE the toolbar is hidden, THE SYSTEM SHALL show a one-line command box on Screens 4 and 5 with the hint "Type a command, for example help, start crew, pause, resume, step, stop, approve, reject, undo."
2. THE box SHALL use the 2B command parser and controller. A text that is not a command SHALL NOT be sent to the AI. It SHALL reply "Only commands work here. Use AI Chat on the Studio screen to ask questions."
3. THE box SHALL show the last 3 replies and SHALL work by keyboard and touch.
4. `open <panel>` SHALL still work: it sets the layout and returns to Screen 3 so the panel is visible.

### R11. Wiring into 2A, 2B, and 2C
1. THE scan state SHALL live in the studio store next to the AI, work, and understanding state, changed only by pure whole-state actions, and cleared when the snapshot is replaced or cleared.
2. THE 2B run SHALL gain a `kind` (`practice` or `crew`), the step kinds `area` and `finding`, and a per-kind step limit (8 for practice, 150 for crew). The 2B practice run SHALL behave exactly as before.
3. THE 2B saved work SHALL NOT include a crew run or a crew proposal. THE saved record's history SHALL accept diffs with context lines (still at most 2,000 characters). BEFORE saving, the record builder SHALL check every diff with `containsSecret`; if any history diff contains a likely secret, THE system SHALL skip saving the history and write "Saved work was not updated: a change contains a likely secret." to the Log.
4. THE 2C summary SHALL show the Security row as "pending scan (2D)" until a scan has finished, then as "<n> findings" (with "Partial" when applicable), and the three 2C area rows keep their file counts.
5. THE Stop bar SHALL show "Skeleton Crew run: ..." for a crew run and "Practice run: ..." for the practice run.
6. THE existing ingestion, AI, shell, harness, and understanding behavior and tests SHALL stay unchanged except where this spec says so (R6.8, R11.2, R11.3, R11.4, R11.5, and the modified files in the design).

### R12. Safety, privacy, and resources
1. THE SYSTEM SHALL make no network call and no AI request in any 2D code.
2. THE system SHALL show a secret's value nowhere: not in a snippet, a Log entry, a narration line, a saved record, a diff, or a test failure message (tests use fixtures that look like secrets and check they are always redacted).
3. THE SYSTEM SHALL add no runtime dependency beyond `react`, `react-dom`, and `zod`.
4. THE scan SHALL keep memory bounded: at most 500 findings, snippets of at most 12 lines, no copy of file content in the result except the snippets.
5. THE scan patterns SHALL be anchored and length-bounded, and a timing test on 200 KB of hostile input SHALL finish in under 1 second per check.
6. THE SYSTEM SHALL release the scan's abort handle and its store subscriptions on unmount.

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| No snapshot loaded | Screens 4 and 5 are not reachable (as in 2A). |
| Project understanding not ready | Screen 4 says so and offers Try again for the analysis. No scan starts. |
| Scan running | Progress text ("Scanning N of M files.") and Cancel. |
| Scan cancelled | "Scan was cancelled." and Scan again. |
| Scan failed | The message and Scan again. |
| No findings | "No findings from the checks that ran." plus the what-was-checked block. Never "secure". |
| A limit reached | Partial line with one reason per limit. |
| Labels changed after a scan | "Out of date: labels changed." and Scan again. |
| A check fails on a file | Listed under "Could not be checked". The scan continues. |
| `start crew` with no finished scan | Refused with the reason. |
| `start crew` with no findings | The crew run is allowed and finishes after the intro and finish steps, saying "No findings to go through." |
| Auto fix cannot be built safely | The finding shows as Guided with the note. |
| Proposal diff no longer applies at approval | 2B behavior: Log "failed", proposal stays waiting. |
| Text typed in the command box that is not a command | The "Only commands work here" reply. Nothing is sent. |
| Snapshot replaced during a scan or a crew run | Scan aborted, scan state cleared, run and work cleared as in 2B. |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Skill-book tests:** the 16 scan skills match the table in R2 row for row (ids, areas, severity, certainty, fix label written by hand in the test); texts are plain English without banned jargon; `why` and `how` exist; the book is frozen; the sort skills from 2C are unchanged.
2. **Check tests (one group per check):** a positive fixture, a negative fixture, a decoy in a comment or string, and the exact line range; the patterns for HTML, JSX, TypeScript, JavaScript, and Python where the table says so (`sql-concat`, `eval`, `hardcoded-secret`, `route-mismatch`, `insecure-url`); Possible checks say what was not seen.
3. **Secret tests:** a fixture file with a GitHub token, an AWS key id, a private-key block, a JWT, a bearer token, and `password = "..."` produces findings whose snippet, explanation, narration, and Log text contain none of the values (sentinel check on every string the finding produces).
4. **Auto-fix tests:** `target-blank` on plain HTML, JSX, a link with an existing `rel`, a link with `noopener` already (no finding), two links on one line, CRLF files, and a file with no trailing newline: the diff applies, the finding disappears, no new finding appears, the diff is at most 2,000 characters, and undo restores the exact text. A fix that fails any safety condition (R7.2) downgrades to Guided with the note.
5. **Scan run tests (fake yield and clock):** batches yield; progress is reported; abort leaves no result; every limit (files, time, 500 findings, 50 per check) gives its own plain-words reason; a throwing check is isolated and listed; findings are sorted deterministically and identical with the input reversed; applicability follows effective labels (a corrected label changes which checks run); a Needs Review file gets Security checks only; the snapshot is not mutated; no network call (the global `fetch` throws).
6. **Sample tests:** the three bundled samples give exactly the findings in design section 10, written by hand as plain data (not produced by the code under test).
7. **Counts and view tests:** counts per severity, area, and fix label match a hand-written fixture; a multi-area finding is counted in each area and once in the unique total; no score, percentage, or grade appears anywhere in the view helpers' output or the markup.
8. **Crew script tests:** area order, severity order, the 12-per-area and 150-step caps with the "left out" notes, each finding narrated once (by primary area), `propose` and `verify` only for Auto-supported findings, narration text without code lines, deterministic output.
9. **Run machine tests (2B rules extended):** every 2B transition still holds for the practice run (the 2B suite passes unedited); the same table for the crew run; `start crew` refusals; `start` variants; `verify` says verified only after a real re-check; stop rejects the proposal and cancels; Edit open pauses; repeated commands end where the first ends; invariants after a seeded random sequence of 3,000 steps for both run kinds.
10. **Storage tests:** a crew run and a crew proposal are never in the saved record; context diffs up to 2,000 characters round-trip and restore with fingerprint checks; a history diff containing a secret fixture prevents saving history and writes the Log line; the practice-run saved record is unchanged.
11. **Controller tests (fake timers, fake yield):** the scan starts when Screen 4 opens and not before; Scan again, Cancel; incremental re-check after approve, undo, and redo changes the findings and nothing else; a label correction marks the scan out of date and does not rescan; replacing the snapshot aborts and clears; the crew tick is 1.0 second; dispose releases everything.
12. **Component tests (server render):** Screen 4 (four boxes, links table, helper groups, four worker slots, narration, proposal card, collapsed what-was-checked block); Screen 5 for each area (counts, table, "also in", detail with snippet, narration, changes made, request trace for APIs & Data); the command box and its not-a-command reply; no toolbar on either screen; the Stop bar says "Skeleton Crew run"; no score, grade, or percentage text; no Apply button anywhere; Approve and Reject only on the proposal card.
13. **Static checks:** no network, `fetch`, AI, or `mockAssistant` import in any 2D file; no new dependency; no color other than `#000` and `#fff`; no `transition` or `animation`; every new file tagged; every finding in the tests cites a skill id that exists.
14. **Regression:** the full existing suite passes unedited (specs 01 to 05), apart from tests that must change because a behavior this spec changes on purpose: only the 2C summary test for the Security row and the 2B `start` argument test, each named in the final report.
15. **Browser run (headless Chromium, built app):** load each sample; open Skeleton Crew; see the scan finish and the map, links table, and worker slots; open each area; open a finding's detail; load a fixture repository with a `target="_blank"` link, a hard-coded secret fixture, and an unmatched API call; type `start crew`; watch the narration; `pause`, `step`, `resume`; approve the auto fix and see History on Screen 3 and the finding disappear; `undo` and see it return; reject another; `stop`; refresh, reload the same repository, and see approved changes restored and findings scanned again; Cancel a scan; force a small limit and see the Partial line; no toolbar on Screens 4 and 5; zero console errors; black and white; no overflow at 375 px; AI Chat and the 2B and 2C features still work.
16. **Phase 2D gate (build-phases.md):** every finding shows its file, lines, snippet, and reason; no invented scores.

## 7. Open questions for approval

1. **The 16 checks (R2).** Three with Frontend as the main area, four Backend, six Security, and three APIs & Data. They are a small, honest first set. Left out on purpose: layout overflow (2E, measured in the sandbox), data-shape mismatch, and anything that needs running the code. Approve this list, or add or remove checks?
2. **Only one fix is automatic (R7.1).** Adding `rel="noopener noreferrer"` to links that open a new tab. Everything else is explained, not changed. Approve, or do you want a second automatic fix in version 1?
3. **How the crew starts (R6.1, R6.8).** You type `start crew` (and `start` alone stays the 2B practice run). Approve, or should the crew start from a button on Screen 4?
4. **Workers take turns (R6.5).** Four worker slots, one per area, but only one works at a time, because the run is one step at a time. Approve?
5. **A command box on Screens 4 and 5 (R10).** The toolbar is hidden there, so a one-line command box keeps `pause`, `resume`, `approve`, and the rest working. Approve?
6. **The scan runs when Screen 4 opens (R5.1),** not during loading, so loading stays fast. The Security row in Project info shows "pending scan (2D)" until then, then the count. Approve?
7. **One finding can belong to several areas (R3, R4.2).** It is counted in each area, with the unique total shown separately. In the crew run it is narrated once, under its primary area. Approve?
8. **What is not saved (R6.10, R11.3).** A crew run does not survive a refresh (the findings are scanned again). Approved fixes do, through History. If any change contains a likely secret, history saving is skipped and the Log says so. Approve?
9. **Limits (R5.4, R6.3):** 500 findings, 50 per check, 2,000 files, 8 seconds, 12 findings per area in the crew run, 150 crew steps, 1.0 second per crew step, 12-line snippets. Approve as placeholders?
