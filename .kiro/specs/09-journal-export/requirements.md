# Requirements: 09 Journal and Export (Phase 2, Sub-phase 2F)

Sources: steering `build-phases.md` (Phase 2 text, sub-phase 2F and its gate); the approved Phase 2 blueprint (section 7: three change layers and the activity log; section 8: the Learning Journal); specs 01 to 08 (what is built or specified); your answers so far (offline first, honest about what was and was not read, never save secrets, patch file export belongs here, three reading levels, secret values always hidden).
Active product phase: **Phase 2, Sub-phase 2F**. PatchBay's own screens stay black-and-white wireframe with no animation. `AI_MODE=mock` only. **No new runtime dependency.** No AI call and no network call. **This spec assumes 2A to 2E-2 are built and approved.**

## 1. Purpose

2F builds the **Learning Journal** (an explanation of how the loaded project works and what PatchBay found, at three reading levels) and the **exports** (a patch file of your approved changes, a summary of the activity log, and a copy of the Journal). It ends with the full Phase 2 regression test.

In simple words: the Log says what PatchBay did. The Journal explains why and how things work, using your real project's files. It starts with a short overview, traces how a click turns into a request and a server answer, and teaches each kind of problem that PatchBay found, in words you choose (Simple, Practical, or Deeper). The exports let you take your approved changes back to your own project as a patch file, and keep a clean record of the session. Nothing is uploaded. PatchBay never changes your repository.

## 2. Scope

### In scope
- **The Journal panel** (replacing the 2A placeholder): reading level picker, Application overview, flow traces, lessons from your project's findings, a concept list, and a Journal download.
- **Teaching text** in the skill-book: fixed written lessons for the 17 checks and for 12 concepts, each at the three levels.
- **Overview** and **flow traces** generated offline from the 2C connections, 2D findings, 2E-1 preview mode, and `package.json` names.
- **Patch export (layer 3):** a git-style `.patch` file of your approved changes, with a file chooser, a preview, and honest exclusions.
- **Log export:** a Markdown summary and a JSON copy of the session log.
- **Journal export:** a Markdown copy of the current Journal.
- **A download helper** that saves files in the browser only.
- **Learn more** links from findings to the matching lesson.
- **The reading-level preference** (the only thing the Journal saves).
- **The full Phase 2 regression test:** a store-level end-to-end test and a re-run of every earlier gate.
- Tests, a browser check, and `traceability/PLAN.md` entries.

### Out of scope (later sub-phases or phases)
- Session restore, including the Journal's open sections and scroll position (2G). The 2B saved work and the layout stay as they are.
- AI-written explanations, answers about the project, or translations (Phase 3 and later).
- Pushing changes to GitHub, opening pull requests, uploading anything, or writing to the repository. Never in the MVP.
- Exporting Preview Only changes (they are never written to code). Exporting the preview document or the project files themselves.
- Editing the Journal text.
- Colors, themes, animation (Phase 4).

## 3. Glossary

- **Journal:** the panel that explains the project and the findings. The Log is separate and says what happened.
- **Reading level:** **Simple**, **Practical**, or **Deeper**.
- **Lesson:** a fixed piece of teaching text with the three levels, tied to a check, a concept, or the sorting step.
- **Concept card:** a lesson about an idea (for example "What is an API route?").
- **Flow:** a step-by-step path through the project (a page flow, a request flow, or a setting flow).
- **Honest stop:** a flow step that says why the path ends (a file was not loaded, no route matches, an outside service).
- **Patch:** a text file of changes in the unified diff format, applied with `git apply` or `patch`.
- **Origin** of a change: **Your edits** (from the Edit pad), **Skeleton Crew fixes**, or **Practice run changes**.
- **Combined diff:** one diff per file from the loaded original to the current practice copy.

## 4. Functional requirements

### R1. The Journal panel
1. THE Journal toolbar button SHALL open the Journal panel (the 2A placeholder is replaced). The panel SHALL follow the 2A panel rules (open, collapse, width, close).
2. THE panel SHALL show, from the top: the title "Journal"; the line "The Journal explains how your project works and what PatchBay found. The Log shows what PatchBay did."; the **reading level picker** (R2); and these blocks, each a collapsible section with a heading:
   - **Application overview** (open by default),
   - **How things flow** (closed by default),
   - **Lessons from your project** (open when there is at least one lesson, otherwise closed),
   - **Concepts** (closed by default),
   - **Download** (closed by default).
3. THE panel SHALL be built entirely from data PatchBay already holds (the snapshot, the 2C result, the 2D scan, the 2E-1 layout findings and preview mode, the corrections, and the History). It SHALL make no network call and no AI request.
4. THE panel SHALL show clear states: "Building the Journal..." while the analysis is running, "The project analysis is not ready, so the Journal cannot be built." with the 2C **Try again** reason when the analysis failed, and an honest note when the result is partial.
5. ALL text SHALL be React text, and the panel SHALL work by keyboard and touch.

### R2. Reading levels
1. THE SYSTEM SHALL offer three levels: **Simple**, **Practical**, and **Deeper**, as three buttons with `aria-pressed`. The default is Simple.
2. THE level SHALL apply to every text in the Journal: the overview, the flow steps, the lessons, the concept cards, and the Journal download.
3. EVERY lesson SHALL define all three levels. EVERY generated sentence template (overview and flows) SHALL define all three levels.
4. THE writing rules SHALL be checked by tests:
   - **Simple:** at most 3 sentences per lesson, at most 20 words per sentence, no word from the jargon list, and no code characters (backticks, parentheses, braces, angle brackets) in lesson text.
   - **Practical:** at most 6 sentences, at most 28 words per sentence. A technical word may appear if it is explained in the same lesson.
   - **Deeper:** at most 10 sentences, at most 35 words per sentence.
   - The jargon list (for the Simple level) includes at least: `regex`, `AST`, `parse`, `token`, `payload`, `sanitize`, `middleware`, `endpoint`, `schema`, `async`, `callback`, `DOM`, `XSS`, `CSRF`, `CORS`, `SQL injection`, `namespace`, `boilerplate`.
5. THE chosen level SHALL be saved as a preference (R11) and restored on the next visit.

### R3. Application overview
1. THE overview SHALL contain these parts, each a short paragraph at the chosen level, built from fixed templates and the facts below. A part with no facts SHALL be left out, and the overview SHALL always say "This overview describes only the files PatchBay read."
   - **What this project is:** the kind (static website, React-style app shown as an approximate picture, backend or library, from the 2E-1 mode and reason), its name, and where it came from (GitHub owner, name, and ref, or the bundled sample).
   - **What it is made of:** the five most common file extensions with counts, the file counts per area (Frontend, Backend, APIs & Data) and per helper group (Images and fonts, Tests, Settings, Docs), and the number of files that need review.
   - **How it starts:** the entry page (when there is one), the script names in `package.json` (names only, such as `dev` and `build`), and the number of route files.
   - **What it talks to:** the outside hosts from `calls_external` connections, the setting names from `reads_config` connections (names only, never values), the database libraries named by the sort skills, and the first 10 routes ("PUT /api/profile/:id").
   - **What PatchBay read:** files read, files sorted by path only, files ignored, the partial reasons from the analysis and the scan, and the file types without connection scanning.
   - **What PatchBay found:** the real counts by severity, by area, and by fix label, the unique total, "pending" when no scan has run, and a pointer to the lessons. No score, grade, or percentage.
2. THE overview SHALL NOT guess. Every sentence SHALL come from a template with only these inputs: file paths, counts, names, and the Confirmed or Inferred words from the connections. An Inferred fact SHALL be worded as such ("probably", "looks like") only at the Practical and Deeper levels, and left out at Simple.
3. THE overview SHALL NEVER claim that the project is secure, safe, correct, or free of problems.
4. THE `package.json` reader SHALL parse the JSON with a try and catch, SHALL read only the `name`, the key names under `scripts`, and the key names under `dependencies` and `devDependencies`, and SHALL ignore everything else, including every script command and every value.

### R4. Flow traces
1. THE panel SHALL build three kinds of flow from the 2C connections:
   - **Page flow:** for each entry or HTML page (at most 3), the page, the stylesheets and scripts it loads, and what those scripts call.
   - **Request flow:** for each `calls_api` connection (at most 20), the call, the route that handles it (when matched), and the files that route's file imports (the route's own imports, followed up to 3 levels, at most 8 files).
   - **Setting flow:** for each setting name read in the project (at most 20), the files and lines that read it, with the note "The value is never shown."
2. AT most 30 flows SHALL be built, in this priority: page flows, request flows, setting flows. WHEN a limit hides some, the section SHALL say "<n> more flows are not shown."
3. EACH step SHALL show the file and line, a sentence at the chosen level, and the certainty in words (Confirmed, Inferred, or Broken). Each step with a file SHALL have an **Open in viewer** button (the 2E-1 action). A flow SHALL have at most 12 steps.
4. A flow SHALL stop honestly, with one of these fixed sentences, whenever it cannot continue:
   - "Stopped: no route matches this address (Broken)."
   - "Stopped: this goes to an outside service (<host>), which PatchBay does not follow."
   - "Stopped: <path> was not loaded (<reason>)." (the reason from the inventory)
   - "Stopped: this goes more than 3 files deep, so PatchBay did not follow further."
   - "Stopped: no backend routes were found in this repository; the route may live elsewhere."
   - "Nothing in the loaded files calls this route." (for a route flow with no caller)
   - "<n> imports that use shortcuts such as @/ were not followed." (a note under a flow whose files have alias imports)
5. THE flow list SHALL be a selector (page, request, setting groups) plus the steps of the chosen flow. The first flow is chosen by default.
6. THE flows SHALL be derived, never saved, and deterministic (sorted by path and line).

### R5. Lessons and concept cards
1. THE SYSTEM SHALL hold a **lesson** for each of the 17 checks (ids `lesson.scan.<area>.<name>` matching the skill ids), for each of the 12 concepts below, and one lesson for the sorting step ("Why PatchBay was unsure about some files"), each at three levels. Concepts: `concept.page` (a web page), `concept.stylesheet`, `concept.script`, `concept.import`, `concept.route`, `concept.api-call`, `concept.env-var`, `concept.request-flow`, `concept.validation`, `concept.secret`, `concept.layout`, `concept.label`.
2. THE lessons live in the skill-book as data (`SKILLBOOK.teach`) so they are fixed, reviewed text. The Journal SHALL NOT generate teaching text on its own.
3. **Lessons from your project** SHALL list one lesson for each check that has at least one finding (text or measured), ordered by the most severe finding first. Each shows: the title, the text at the chosen level, **In your project** (at most 5 instances: file and lines, severity, certainty, and fix label in words, with **Open in viewer**), and "<n> more are listed on the area screen." when there are more.
4. WHEN at least one file needs review, THE SYSTEM SHALL add the sorting lesson with up to 5 of those files and the first reason PatchBay gave for each.
5. EVERY instance line SHALL show only the path, the line range, and fixed words. For `scan.security.hardcoded-secret` it SHALL show the kind of secret in plain words and SHALL NEVER show a value. Lessons SHALL NEVER show a code snippet. (The viewer shows redacted code when the user opens it.)
6. **Concepts** SHALL list all 12 cards, each expandable, at the chosen level, with "Related:" links to other cards.
7. A **Learn more** button SHALL appear on each finding in the 2D finding detail. It SHALL close the current screen, return to Screen 3, open the Journal panel, and scroll to and open that finding's lesson.
8. THE teaching text SHALL never claim that code is secure or safe, never give a score, and never tell the user to run a command except in the patch export's apply instructions.

### R6. Honesty and secrets
1. THE Journal SHALL be built only from fixed templates, lessons, and facts (paths, names, counts, numbers, and the certainty words). A test with sentinel values SHALL prove that no snippet line, secret, setting value, or command value from the project can appear in the Journal text or its download.
2. EVERY fact string SHALL be passed through `redact()` before it is written. WHEN `redact()` changes a string, the Journal SHALL add the note "<n> values were hidden."
3. THE Journal SHALL say what it does not know ("not known from the files PatchBay read") instead of leaving a gap, and SHALL list the limits from the analysis and the scan.
4. THE Journal, every lesson, and every export SHALL contain none of the words or phrases "secure", "is safe", "no problems", "all good", "score", "grade", or a percentage. (Words such as "safer" and "security" in the sense of the Security area are allowed.)

### R7. Patch export (layer 3)
1. THE History panel SHALL gain an **Export changes** section. It SHALL list every file that has at least one applied (not undone) History entry, with a checkbox, the origin (Your edits, Skeleton Crew fixes, or Practice run changes), the number of changes, hunks, added lines, and removed lines.
2. THE origin of an entry SHALL be derived, not stored: an entry whose `editKey` starts with `edit:` is **Your edits**; an entry whose diff inserts a line that contains `PRACTICE:` is **Practice run changes**; every other entry is **Skeleton Crew fixes**. A file with entries of several origins is shown with all of them.
3. FILES whose entries are all Your edits or Skeleton Crew fixes SHALL be checked by default. A file with any Practice run change SHALL be unchecked by default, with the note "This file contains practice-run changes."
4. FOR each file THE SYSTEM SHALL build a **combined diff** from the loaded original content to the current practice copy, as a standard unified diff with up to 3 lines of context and several hunks, preserving line endings and the "\ No newline at end of file" marker, with the headers `diff --git a/<path> b/<path>`, `--- a/<path>`, and `+++ b/<path>`.
5. A file SHALL be **excluded**, with one fixed reason shown in the list, when: it was not fully loaded (truncated or no content) ("This file was only partly read."); its path contains a character outside `A-Z a-z 0-9 . _ / @ + -` ("The path has special characters that a patch cannot carry safely."); its combined diff contains a likely secret ("The changes contain a likely secret, so they are not exported."); applying the combined diff to the original does not give exactly the current practice copy ("The patch could not be verified."); the original and the current copy are equal ("No net change."); or the total size limit was reached ("Size limit reached.").
6. THE total patch SHALL be at most 512 KB. Files are added in path order. WHEN the limit is reached, later files are excluded with the size reason.
7. THE section SHALL show: "n Preview Only changes are not exported" when there are any; a **Preview patch** (a `details` with the patch text in a preformatted block, at most 2,000 lines); the line "To use it: open your project folder and run  git apply <filename>"; and a **Download .patch** button that is disabled with the reason "Nothing to export." when no file is checked or no changes exist.
8. THE patch file name SHALL be `patchbay-<owner>-<repo>-<ref>-<yyyymmdd>.patch`, with every character outside `a-z 0-9 . _ -` replaced by `-`, at most 100 characters.
9. WHEN downloaded, THE SYSTEM SHALL write the Log entry "Exported patch: <n> files, <m> hunks." (counts only) and show "Downloaded <filename>."
10. THE export SHALL NEVER change the practice copy, the History, the snapshot, or the repository, and SHALL NEVER include Preview Only changes, undone entries, or unselected files.

### R8. Log export
1. THE Log panel SHALL gain **Download log (.md)** and **Download log (.json)**.
2. THE Markdown file SHALL contain: a title with the repository name; the repository source, owner, name, and ref; the date and time of the export; a **Summary** (files read, sorted by path only, ignored; findings by severity and area and the unique total, or "not scanned"; History changes applied and undone; preview-only changes; the Journal level is not included); a **Changes** list (title, path, time, and state of each History entry, no diffs); and the **Log** as a table (time, action, status, message, paths) in order.
3. THE JSON file SHALL be `{ "version": 1, "exportedAt": <ISO text>, "repository": { source, owner, name, ref }, "summary": { ... counts ... }, "changes": [ { id, title, path, at, state } ], "log": [ { id, timestamp, action, status, affectedPaths, message } ] }`.
4. EVERY string SHALL be passed through `redact()` first, and the note "<n> values were hidden." is added to both formats when it changed anything. THE files SHALL contain no snippet, diff body, setting value, or file content.
5. THE log SHALL be exported in full (at most the 500 entries the store holds). The file name SHALL follow R7.8 with `-log` and `.md` or `.json`.
6. WHEN the log is empty, the buttons SHALL be disabled with "The log is empty."
7. WHEN downloaded, THE Log SHALL get "Exported log (<format>): <n> entries." (counts only).

### R9. Journal export
1. THE Journal panel's **Download** block SHALL offer **Download journal (.md)**, a Markdown copy of the Application overview, the flows (all, with their steps and stop sentences), and the lessons from the project (with the instance lines, no snippets), at the **current reading level**. Concept cards are included only when a lesson links to them.
2. THE file SHALL start with the project identity, the export time, the level, and the sentence "Built offline by PatchBay from the files it read." It SHALL be at most 200 KB (longer content is cut at a section boundary with the note "Shortened to fit.").
3. THE file name SHALL follow R7.8 with `-journal-<level>.md`.
4. WHEN downloaded, THE Log SHALL get "Exported journal (<level>)." (no content).

### R10. The download helper and export rules
1. THE helper SHALL create a `Blob` of type `text/plain;charset=utf-8`, an object URL, and an anchor with a `download` attribute, click it, and release the URL after 10 seconds. It SHALL make no network request and SHALL NOT navigate the page or open a window.
2. WHEN the browser refuses or the Blob API is missing, THE SYSTEM SHALL show "Your browser did not allow the download." and SHALL NOT write a Log entry for an export that did not happen.
3. EVERY export button SHALL be disabled, with its reason beside it, when there is nothing to export.
4. NO export SHALL be saved by PatchBay, uploaded, or sent anywhere.
5. THE helper's timers and object URLs SHALL be released on unmount.

### R11. State, preference, and wiring
1. THE reading level SHALL be saved under the key `patchbay.journal.v1` as `{ version: 1, level }`, validated strictly on read. A missing, unreadable, over-1 KB, unknown-version, or unknown-field record gives the default (Simple), with no error. Blocked or full storage keeps the level in memory.
2. A small journal store (like the 2A layout store) SHALL hold the level and the transient "lesson to show" id. The lesson id SHALL NOT be saved.
3. THE Journal model SHALL be computed by a pure function of the snapshot, the 2C result and corrections, the 2D scan, the preview facts, and the level. It SHALL be memoised and SHALL be recomputed only when one of those changes.
4. THE 2A Journal placeholder, the 2B History panel, the 2A Log panel, and the 2D finding detail SHALL change only as described. The 2A, 2B, and 2D tests that must change are named in the tasks.
5. THE existing ingestion, AI, shell, harness, understanding, scanner, preview, and Edit pad behavior SHALL stay unchanged.
6. THE app SHALL add no network call and no runtime dependency.

### R12. Safety, privacy, and resources
1. THE SYSTEM SHALL render every string as React text. Downloads are plain text.
2. THE SYSTEM SHALL never include a secret, a value, a snippet, or file content (other than the patch's changed lines and their context) in any Journal text, any download, or any Log entry. The patch is the only export that carries file lines, and a file with a likely secret in its diff is excluded.
3. THE patterns used to read `package.json` and build flows SHALL be bounded and finish within 1 second on hostile input.
4. THE Journal model SHALL build in under 500 ms for 2,000 files and 5,000 connections (a timing test), and the combined diff SHALL finish in under 2 seconds for a 200 KB file with up to 2,000 changed lines (when its work limit is exceeded it falls back to a single-hunk diff).
5. MEMORY SHALL be bounded: the Journal text at most 200 KB, the patch at most 512 KB, the log export at most 500 entries.

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| Analysis running or failed | The Journal says so and offers Try again (2C). |
| Partial analysis or scan | The Journal lists the partial reasons. |
| No findings | "PatchBay found nothing from the checks that ran." (never "no problems") and no lessons list, concepts still available. |
| A flow cannot continue | An honest stop sentence. |
| `package.json` missing or unreadable | The "How it starts" part leaves out the script names. |
| No applied changes | Export changes says "No changes to export." and the button is disabled. |
| All files unchecked | "Nothing to export." and the button is disabled. |
| File excluded from the patch | Listed with its fixed reason. |
| Combined diff cannot be verified | The file is excluded with "The patch could not be verified." |
| Download blocked | "Your browser did not allow the download." No Log entry. |
| Empty log | Log export buttons disabled with the reason. |
| Storage blocked or full | The level is kept for this visit only. |
| Lesson id from Learn more does not exist | The Journal opens at the top. |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Lesson data tests:** the 17 check lessons and 12 concept lessons and the sorting lesson exist, with unique ids matching the skills and concepts, a title, and all three levels; the writing rules of R2.4 hold for every lesson at every level (sentence counts, word counts, jargon list, code characters at Simple); every `related` id exists; the banned phrases of R6.4 appear in no lesson; no lesson contains a command, a URL, or a code snippet.
2. **Overview tests:** hand-written expected overview text for the three bundled samples at all three levels; a project with no `package.json`; a partial analysis; no scan yet ("pending"); every Simple template is within the Simple limits when filled with long values (a stress test); the "describes only the files PatchBay read" sentence is always present; no secret or value sentinel appears; the `package.json` reader ignores script commands and dependency versions (sentinel test) and survives bad JSON.
3. **Flow tests:** the page, request, and setting flows for the three samples written out by hand (the full-stack request flow has the steps listed in the design; the React sample's flow ends with the "no backend routes were found" stop); every honest stop sentence on a fixture; the 3-level, 8-file, 12-step, 20-request, and 30-flow limits with their notes; alias import notes; deterministic order.
4. **Lessons-from-your-project tests:** instance lists for the sample findings (the static sample's image check, the React sample's button check, the full-stack sample's authentication check) and a fixture with several findings: order by severity, at most 5 instances, the "<n> more" line, the secret check showing the kind and never a value; the sorting lesson with up to 5 files and their reasons; concept cards with working `related` links.
5. **Patch tests:** `buildUnifiedDiff` on hand-written pairs (one change, several separate changes, adjacent changes merged within 6 lines, first line, last line, an inserted line at the end without a final newline, CRLF files, an empty file to non-empty, a change with 2,000 changed lines, and the work-limit fallback) is a valid unified diff that applies with the 2B `applyUnifiedDiff` **and** with the independent test-side applier, and reversing it restores the original; the combined diff of a file with several History entries equals the diff from the original to the final text; origin detection; default selection; every exclusion reason; the 512 KB limit; the self-check that rejects a deliberately corrupted diff; secrets in the diff exclude the file; file name sanitising.
6. **Patch with `git apply`:** in the final task a throwaway git repository is created from each sample's loaded files, the app's patch for a recorded edit (an Edit pad style change, a crew fix, and a practice change) is generated, and `git apply --check` and `git apply` succeed and give exactly the current practice copy.
7. **Log and Journal export tests:** the Markdown and JSON layouts for a fixture (the exact keys and order), the summary counts, no diff or snippet or value (sentinels), `redact()` applied and the note, the size cut with its note, file names, and empty states.
8. **Download helper tests (fake `Blob`, `URL`, `document`):** the type `text/plain;charset=utf-8`, the `download` attribute, no navigation, the URL released after 10 seconds, release on unmount, the blocked case with no Log entry, and no network call.
9. **Preference tests:** the level round trips; every bad variant gives Simple with no error; blocked storage works; nothing else is written.
10. **Component tests (server render):** the Journal panel in each state and at each level; the sections open and closed as specified; the picker with `aria-pressed`; flow selector and steps with Open in viewer; lessons with instances; concepts; the Download block; the History export section (file list, checkboxes, origin text, exclusions, preview, apply line, disabled states); the Log export buttons; the Learn more button on a finding; no Apply, Approve, Reject, Pause, Resume, or Step button added; all text escaped; no color other than `#000` and `#fff`; no `transition` or `animation`; no `dangerouslySetInnerHTML`.
11. **Static checks:** no network, `fetch`, AI, or `mockAssistant` import in any 2F file; no new dependency; no `innerHTML`, `eval`, or `new Function`; every new file tagged; every lesson id referenced by the app exists.
12. **Full Phase 2 test (store level, `tests/phase2Flow.test.ts`):** one deterministic test runs the whole pipeline on the full-stack sample and a fixture project: load, analyse, scan (17 checks), start the crew, approve a fix, run a practice step, make an Edit pad style change, undo and redo, build the Journal at all three levels, and build the patch, the log exports, and the Journal export. It asserts the pieces agree: the History, the practice copy, the findings after each change, the exports' contents, no secrets anywhere, the saved 2B record, and the invariants of every earlier spec.
13. **Regression:** the full existing suite passes, with only the tests named in the tasks changed (the 2A Journal placeholder assertions and the 2B History panel button assertions).
14. **Browser run (headless Chromium, built app, downloads captured):** load each sample; open Journal; switch levels and see every section change; open the flows and use Open in viewer; open a lesson and a concept; from a finding on Screen 5 press Learn more and arrive at the lesson; make an Edit pad change and a crew fix, open History, use Export changes, preview the patch, download it (captured and read back), and check that it applies with `git apply`; download the log in both formats and the Journal; confirm a file with a likely secret is excluded; block downloads and see the message; refresh and see the level restored; zero console errors; black and white; no overflow at 375 px; AI Chat, the 2B commands, 2C, 2D, 2E-1, and 2E-2 still work.
15. **Phase 2 regression (all earlier gates re-run):** the 2A, 2B, 2C, 2D, 2E-1, and 2E-2 browser runs and isolation test are repeated on the final build and each earlier gate in `build-phases.md` is re-checked with fresh evidence, with zero console errors in each. The report maps each sub-phase gate to its evidence. The overall Phase 2 exit (state surviving a refresh through session restore) remains the gate of 2G.
16. **Phase 2F gate (build-phases.md):** all earlier gates pass again, zero console errors.

## 7. Open questions for approval

1. **What the Journal contains (R1, R3, R4, R5).** Application overview, flow traces, lessons for the findings PatchBay actually found, and 12 concept cards. It does **not** explain each of your own edits. Approve, or add something?
2. **Reading levels (R2).** Simple is the default. The level is saved as a small preference (the only thing the Journal saves). The writing rules are checked by tests. Approve?
3. **Lessons are fixed, written text (R5.2).** No AI. AI-written explanations come in Phase 3. Approve?
4. **What the patch includes (R7).** Only approved changes that are applied right now, as one combined diff per file, for files that were fully read. Preview Only changes, undone changes, and files with a likely secret or odd path characters are left out, each with its reason. Files with practice-run changes are unchecked by default. Approve?
5. **Patch format (R7.4).** A git-style patch you apply with `git apply`. Approve?
6. **Downloads (R8, R9, R10).** The log as Markdown and JSON, the Journal as Markdown, the patch as a `.patch` file. Nothing is uploaded or saved by PatchBay. Approve?
7. **"Learn more" on findings (R5.7).** From a finding on Screen 4 or 5 it takes you back to Screen 3 and opens the lesson. Approve?
8. **The full Phase 2 test (acceptance items 12 and 15).** A store-level end-to-end test, plus re-running every earlier browser run and the isolation test. The overall Phase 2 exit stays with 2G. Approve?
9. **Limits (R4, R7, R9, R12):** 30 flows, 12 steps per flow, 5 instances per lesson, a 512 KB patch, a 200 KB Journal download, 500 log entries, 3 lines of diff context. Approve as placeholders?
10. **The old placeholder file.** After 2F, `PlaceholderPanel.tsx` is no longer used. Delete it (needs your OK), or keep it?
