# Tasks: 09 Journal and Export (Phase 2, Sub-phase 2F)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2F-JOURNAL` and the F9 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2F** (PatchBay's own screens black-and-white wireframe, no animation, `AI_MODE=mock` only, no AI and no network). **These tasks start only after 2A to 2E-2 are built and you have advanced the active sub-phase to 2F.**

Task ids are **J1 to J11**, so they cannot be confused with T, M, S, B, C, D, E, or P (earlier specs).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F9.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network, `fetch`, AI, `mockAssistant`, `aiAssistant`, or `useAssistant` import in any 2F file. No `innerHTML`, `eval`, or `new Function`. No `dangerouslySetInnerHTML`.
- The Journal and the exports only **read** existing state. They never change the snapshot, the practice copy, or the History. The only writes are the export Log entries (counts only), the saved reading level, and the transient lesson id.
- A secret value, snippet, setting value, or command value must never appear in any Journal text, download, or Log entry. The patch is the only export that carries file lines, and a file with a likely secret in its diff is excluded. Tests use sentinel fixtures to prove it.
- No score, grade, or percentage. Never "secure", "is safe", "no problems", or "all good" anywhere in the Journal, a lesson, or an export.
- The **lesson text is data written by me and reviewed by you**. Any change to a lesson after review needs your approval.
- Do not touch the files in design section 4.3. The files in design section 4.2 may change **only** as described there. `PlaceholderPanel.tsx` is deleted in J10 (approved).
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

The spec on `spec/09-journal-export`, code on `feat/journal-export` from the spec branch, **one commit per task**, a pull request after J11.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| J1 | F9.1 | Limits, the playbook schema and lookups, the writing-rule checker, and the 12 concept cards | none |
| J2 | F9.2 | The 17 check cards and the sorting card in the playbook | J1 |
| J3 | F9.3 | Package facts and the overview | J1 |
| J4 | F9.4 | Flow traces | J1, 2C |
| J5 | F9.5 | The Journal model and the Journal export | J2, J3, J4 |
| J6 | F9.6 | Multi-hunk diff and the patch export | 2B (B1), 2E-2 (P2) |
| J7 | F9.7 | Log export, file names, download helper, and export actions | J5 |
| J8 | F9.8 | The reading-level preference and the Journal store | none |
| J9 | F9.9 | Components: Journal panel, export UI, and Learn more | J5, J6, J7, J8 |
| J10 | F9.10 | Wiring and the full Phase 2 test | J9, 2A to 2E-2 |
| J11 | F9 | Final gate, `git apply` check, browser run, Phase 2 regression, independent review | J1 to J10 |

---

## J1. Limits, the playbook schema and lookups, the writing-rule checker, and the concept cards
- **plan_id:** P2F-JOURNAL  **node_id:** F9.1
- **scope:** `src/config/journalLimits.ts`, `src/skillbook/playbookSchema.ts`, `src/skillbook/playbook.ts` (the 12 concept cards and the file header comment), `src/skillbook/playbookLookup.ts`, `src/skillbook/index.ts` (re-export `PLAYBOOK` and the lookups), `src/journal/lessonRules.ts`, `tests/lessonRules.test.ts`, `tests/playbook.test.ts` (the concept group and the schema and lookup groups)
- **goal:** Build design sections 5 (`Card`, `Playbook`, `Level`), 6.1, 6.3, and the 12 concept cards (ids `concept.page`, `concept.stylesheet`, `concept.script`, `concept.import`, `concept.route`, `concept.api-call`, `concept.env-var`, `concept.request-flow`, `concept.validation`, `concept.secret`, `concept.layout`, `concept.label`) at three levels, following the worked examples in design section 6.2.
- **acceptance:**
  - `lessonRules` counts sentences and words correctly on a hand-checked table (abbreviations, numbers with dots, `?` and `!`, text in quotes, an empty string); `checkLessonText` reports the sentence count, the longest sentence, any jargon word, and any code character at the Simple level.
  - All 12 concept lessons exist with unique ids, a title, and all three levels; every level meets the R2.4 rules (Simple: at most 3 sentences, at most 20 words per sentence, no jargon-list word, no backticks, parentheses, braces, or angle brackets; Practical: at most 6 and 28; Deeper: at most 10 and 35); every `related` id exists; no lesson contains a command, a URL, or any phrase in R6.4.
  - The two worked examples in the design are present word for word.
  - The playbook passes `PlaybookSchema` (strict: unknown fields rejected, version 1, ids unique, summary at most 120 characters, tags and keywords non-empty, `skillId` only on check cards). `cardById`, `cardsForSkill`, `cardsByTag` (case-insensitive), and `searchCards` (all words must match a keyword, tag, or title, ranked by the number of matches, ties by id) return the right cards on a hand-written table, including no match. A fixture `edge_case` card added to a test copy is validated, returned by the lookups, and a deliberately broken card (missing level, duplicate id, unknown related id, over-long summary, unknown field) is rejected. The header comment of `playbook.ts` shows the shape of a card and how to add one. The sort and scan skills are unchanged (their tests pass).
  - `journalLimits.ts` holds the design values and `provisional: true`.
  - The files import nothing from React, stores, the engine, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/lessonRules.test.ts tests/playbook.test.ts tests/skillbook.test.ts tests/scanSkills.test.ts`

## J2. The 17 check cards and the sorting card
- **plan_id:** P2F-JOURNAL  **node_id:** F9.2
- **scope:** `src/skillbook/playbook.ts` (add the 17 check cards and the sorting card), `tests/playbook.test.ts` (the check and sorting groups)
- **goal:** One card per scan skill (ids `lesson.scan.<area>.<name>`, `skillId` set, tags that include its area and a topic) and the sorting card `lesson.sorting.unsure`, each with a one-line summary, keywords, and the three levels, following design section 6.2. The `target-blank` lesson is the worked example word for word.
- **acceptance:**
  - Exactly 17 check lessons, one per skill id in `SKILLBOOK.scan` (a test derives the expected set from the skill-book and fails on a missing or extra lesson), plus the sorting lesson.
  - Every lesson passes the R2.4 rules at every level; every `related` id exists; every lesson explains what the problem is, why it matters, and what to do, at its level; none claims that anything is secure or safe, gives a score, or contains a command, a URL, a code snippet, or any phrase in R6.4 (there is no exception list).
  - The `hardcoded-secret` lesson never includes an example secret. The `layout-overflow` lesson says the finding was measured in the preview.
  - The Simple level of every lesson avoids the jargon list (printed in the failure message on a violation).
  - The report includes the full lesson text for your review (it is data in the files).
- **verify:** `npm run typecheck && npx vitest run tests/playbook.test.ts tests/lessonRules.test.ts`

## J3. Package facts and the overview
- **plan_id:** P2F-JOURNAL  **node_id:** F9.3
- **scope:** `src/journal/packageFacts.ts`, `src/journal/overview.ts`, `tests/packageFacts.test.ts`, `tests/overview.test.ts`
- **goal:** Build design sections 5 (`OverviewFacts`) and 7.
- **acceptance:**
  - **Package facts:** `readPackageFacts` returns the name, the script names, and the dependency names from a valid `package.json`; ignores every script command and version (sentinel test: a command containing a secret fixture never appears in the output); survives bad JSON, a non-object, a huge file (200 KB of text), and missing sections; caps the lists at 50 names.
  - **Overview:** the static sample at the Simple level equals the text in design section 7.1 exactly; hand-written expected text for the three samples at all three levels (written as plain data in the test); a project with no `package.json`; a project with no scan ("PatchBay has not run its checks yet."); a partial analysis (the reasons appear at Practical and Deeper); a failed analysis; an empty-routes project; the closing sentence is always the last.
  - **Honesty:** Inferred facts are worded "probably" only at Practical and Deeper and are absent at Simple; no sentence contains the words in R6.4; no score or percentage; a sentinel setting value, snippet line, and secret never appear; every fact string is passed through `redact()` (a fact containing `ghp_` plus 36 characters appears as `[REDACTED:...]` and `hidden` counts it).
  - **Stress:** every Simple template stays within the Simple limits when filled with 100-character names and counts in the thousands (a test splits long facts into their own sentences or shortens them as the design says).
  - The files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/packageFacts.test.ts tests/overview.test.ts`

## J4. Flow traces
- **plan_id:** P2F-JOURNAL  **node_id:** F9.4
- **scope:** `src/journal/flows.ts`, `tests/flows.test.ts`
- **goal:** Build design section 8.
- **acceptance:**
  - The full-stack sample's request flow has exactly the steps in design section 8.1 (files, lines, certainty, mount note); its page flow (`client/index.html` loads `client/app.js`, which calls the API) and setting flow (`PORT` read by `server/index.js` line 7, with "The value is never shown.") are written out by hand; the React sample's request flow ends with the "no backend routes were found" stop; the static sample's page flows list the stylesheet, the script, and the image.
  - Every honest stop sentence in R4.4 is produced on a fixture: a Broken call, an outside service, a file that is not loaded (with the inventory reason), a route 4 levels deep (the 3-level stop), a route with no caller, and a file with alias imports (the note with the count).
  - Limits: more than 20 requests, 20 settings, 3 pages, 12 steps, 8 files, and 30 flows each produce the stated cut and the hidden count; order is page, request, route, setting, and within a kind by path and line; the same input twice and with the inputs reversed gives deeply equal output.
  - `describeStep` writes one sentence per step at each level; the Simple sentences meet the R2.4 limits and contain no code characters other than the file path and address, which are shown in separate fields and not inside the sentence; certainty words are present at every level.
  - Steps that name a file carry the path and line for **Open in viewer**. A cycle in imports does not loop.
  - A hostile fixture (5,000 edges, a 1,000-file import chain) finishes in under 1 second.
  - The file imports nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/flows.test.ts`

## J5. The Journal model and the Journal export
- **plan_id:** P2F-JOURNAL  **node_id:** F9.5
- **scope:** `src/journal/journalModel.ts`, `src/export/journalExport.ts`, `tests/journalModel.test.ts`, `tests/journalExport.test.ts`
- **goal:** Build design sections 9 and 11.3.
- **acceptance:**
  - **Lessons from the project:** for the three samples the lessons and instances are the hand-written ones (the static sample's image-description lesson with `index.html` lines 11 to 11; the React sample's button lesson with `LoginForm.tsx` line 20; the full-stack sample's authentication lesson with `profile.js` line 7); a fixture with several findings is ordered by the highest severity then skill id; at most 5 instances with the "<n> more" count; measured findings appear with their width; the secret check shows the kind in words and never a value (sentinel).
  - **Sorting lesson:** present only when files need review, with at most 5 files and their first 2C reason.
  - **Concepts:** all 12, fixed order.
  - **Level:** the same model at the three levels differs only in text; the structure and counts are identical.
  - **Hidden values:** redaction changes are counted and the note is added.
  - **Memo:** the same inputs return the same model object; any input change returns a new one.
  - **Timing:** the model builds in under 500 ms for 2,000 files and 5,000 connections.
  - **Export:** `buildJournalMarkdown` has the sections of design section 11.3 in order, the level and the "Built offline by PatchBay from the files it read." sentence, no snippet, no diff, no value (sentinels), the "Shortened to fit." cut at a section boundary above 200 KB, and deterministic output (the exact Markdown for the static sample at Simple is written by hand).
  - The files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/journalModel.test.ts tests/journalExport.test.ts`

## J6. Multi-hunk diff and the patch export
- **plan_id:** P2F-JOURNAL  **node_id:** F9.6
- **scope:** `src/export/diffLines.ts`, `src/export/unifiedDiff.ts`, `src/export/patchExport.ts`, `tests/diffLines.test.ts`, `tests/unifiedDiff.test.ts`, `tests/patchExport.test.ts`
- **goal:** Build design section 10.
- **acceptance:**
  - **`diffLines`:** minimal edit scripts on hand-checked pairs (identical, one line changed, inserted, deleted, swapped, everything changed, empty to non-empty and back); a seeded fuzz of 1,000 random line arrays produces a script that, applied to `a`, gives `b` exactly; the work limit forces the single-edit fallback, which is still correct; 20,000 lines with 2,000 changed finish in under 2 seconds.
  - **`buildUnifiedDiff`:** valid unified diffs for one change, several separate changes (several hunks), changes within 6 lines (merged hunk), the first line, the last line, a line added at the end of a file with no final newline (with the marker), CRLF files, an empty old file, an empty new file, and equal texts (`null`); every diff applies with 2B `applyUnifiedDiff` **and** with the independent test-side applier from spec 02 and gives exactly the new text; `reverseUnifiedDiff` then apply gives exactly the old text; the counts in every `@@` header are correct (checked by an independent counter in the test).
  - **Worked example:** the diff in design section 10.4 is produced exactly, and a second distant edit gives one `diff --git` block with two hunks.
  - **Patch plan:** `originsOf` for `editKey` entries, practice entries, and crew entries; `planPatchExport` for a state with several entries on one file gives one combined diff equal to `buildUnifiedDiff(original, final)`; default selection (files with practice entries unchecked); every exclusion reason with its fixed sentence and in the stated order (partly read, special-character path, no net change, could not be verified using a deliberately corrupted diff, likely secret using a `ghp_` plus 36 characters fixture, size limit); undone entries and Preview Only changes are not included and the Preview Only count is reported; `buildPatch` concatenates selected files in path order with the `diff --git` headers and stops at 512 KB with the size reason on the rest.
  - The loaded snapshot and the History are never mutated (deep-freeze test).
  - The files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/diffLines.test.ts tests/unifiedDiff.test.ts tests/patchExport.test.ts tests/diffApply.test.ts`

## J7. Log export, file names, download helper, and export actions
- **plan_id:** P2F-JOURNAL  **node_id:** F9.7
- **scope:** `src/export/logExport.ts`, `src/export/exportName.ts`, `src/export/download.ts`, `src/store/exportActions.ts`, `tests/logExport.test.ts`, `tests/download.test.ts`, `tests/exportActions.test.ts`
- **goal:** Build design sections 11.1, 11.2, 11.4, and 11.5.
- **acceptance:**
  - **Log export:** the Markdown layout and the JSON keys and order for a fixture (written by hand), the summary counts (files read, path only, ignored, findings by severity, scan state, changes applied and undone, preview-only count), the Changes table (title, path, time, state, no diff), the Log table in order, two-space JSON indentation and a trailing newline; every string passes `redact()` with the hidden-values note; sentinels for a snippet, a diff body, a setting value, and a secret never appear; an empty log gives a valid file with an empty table.
  - **Names:** `exportFileName` lower-cases, replaces characters outside `a-z 0-9 . _ -`, cuts to 100 characters, uses the injected date as `yyyymmdd`, and never produces an empty name or a leading dot.
  - **Download helper (fake `Blob`, `URL`, `document`, `setTimeout`):** the Blob type is `text/plain;charset=utf-8`; the anchor has the `download` attribute and is removed; the URL is revoked after 10 seconds and on `dispose`; no navigation and no `window.open`; a missing `Blob` or a throwing `createObjectURL` returns `false` without throwing; no network call (the global `fetch` throws).
  - **Export actions:** `export_patch`, `export_log`, and `export_journal` entries hold counts or the level only; they are written only when the download returned `true`; a `false` result writes nothing (state unchanged, same object).
  - The files import nothing from React or the network (`download.ts` may use DOM types).
- **verify:** `npm run typecheck && npx vitest run tests/logExport.test.ts tests/download.test.ts tests/exportActions.test.ts`

## J8. The reading-level preference and the Journal store
- **plan_id:** P2F-JOURNAL  **node_id:** F9.8
- **scope:** `src/store/journalPrefs.ts`, `src/hooks/useJournal.ts`, `tests/journalPrefs.test.ts`
- **goal:** Build design section 12.
- **acceptance:**
  - `LevelRecordSchema` accepts each level and rejects: a missing field, an unknown level, an unknown field, a wrong version, and text over 1 KB; `loadLevel` returns `simple` for each bad variant, missing storage, and a throwing `getItem` without throwing; `saveLevel` never throws (blocked and full storage) and writes only `{ version: 1, level }`.
  - The store changes the level through a pure action and saves on change only (no write at start-up, no write for an unchanged level).
  - `openLesson(id)` sets `focusLesson`, opens the Journal panel through `openPanelById`, and moves to Screen 3 through `shellActions.backToStudio` (fake stores); an unknown id still opens the panel and sets no focus; `focusLesson` is never saved.
  - Nothing else is written to browser storage (a recording fake storage sees only the one key).
  - The hook releases its subscription on unmount (counted).
  - The files import nothing from the network.
- **verify:** `npm run typecheck && npx vitest run tests/journalPrefs.test.ts tests/layoutState.test.ts`

## J9. Components
- **plan_id:** P2F-JOURNAL  **node_id:** F9.9
- **scope:** `src/components/JournalPanel.tsx`, `LevelPicker.tsx`, `OverviewSection.tsx`, `FlowsSection.tsx`, `LessonsSection.tsx`, `ConceptsSection.tsx`, `JournalDownload.tsx`, `ExportChanges.tsx`, `LogExportButtons.tsx`, `ExportButton.tsx` (all in `src/components/`), `src/styles.css` (append the 2F block only), `tests/journalUi.test.tsx`
- **goal:** Build design section 13 as components that take props only.
- **acceptance:**
  - With `react-dom/server`: the Journal panel in each state (building, analysis failed, partial, no findings, normal) at each level; the three level buttons with `aria-pressed`; the five collapsible blocks with the open and closed defaults of R1.2; the overview text for the static sample; the flow selector and the numbered steps with certainty words and **Open in viewer** buttons; the lessons with instances and the "<n> more" line; the sorting lesson; the concepts with "Related:" buttons; the Download block.
  - `ExportChanges` for a plan with a mixed file list: checkboxes with the right defaults, origin words, counts, exclusion reasons, the Preview Only line, the preview `details` with the patch in a `pre`, the apply line with the file name, and the disabled button with "Nothing to export." when nothing is checked; `LogExportButtons` enabled and disabled ("The log is empty."); `ExportButton` status text after success and after a blocked download.
  - A finding detail has **Learn more** (added in J10 wiring, tested here with the component).
  - All project text (paths, names, reasons) appears escaped (a markup-looking path is escaped); lesson text appears as given.
  - No Apply, Approve, Reject, Pause, Resume, or Step button; the only new buttons are the level buttons, Open in viewer, Related, the three export buttons and Download, Learn more, and the file checkboxes.
  - Static checks on the new files and the CSS block: no `dangerouslySetInnerHTML`, no `innerHTML`, no color other than `#000` and `#fff`, no `transition`, no `animation`, every new file tagged `@node: F9.9`.
  - Real browser behavior (clicks, downloads) is **not** claimed here. It is verified in J11.
- **verify:** `npm run typecheck && npx vitest run tests/journalUi.test.tsx`

## J10. Wiring and the full Phase 2 test
- **plan_id:** P2F-JOURNAL  **node_id:** F9.10
- **scope:** `src/components/StudioLayout.tsx`, `src/components/HistoryPanel.tsx`, `src/components/LogPanel.tsx`, `src/components/FindingDetail.tsx`, `src/App.tsx`, `src/components/PlaceholderPanel.tsx` (**delete**, approved, only after a search shows nothing imports it), `src/styles.css` (only to fix a class from J9), `tests/journalUi.test.tsx` (append wiring tests), `tests/phase2Flow.test.ts`, and **the existing tests only where named here:** the 2A tests that assert the Journal placeholder text (`tests/studioShell.test.tsx` and `tests/studioLayout.test.tsx`, only those assertions) and the 2B test that lists the History panel's buttons (`tests/harnessUi.test.tsx`, only that assertion)
- **goal:** Render the Journal panel for the Journal toolbar button, add `ExportChanges` to the History panel and `LogExportButtons` to the Log panel, add **Learn more** to the finding detail, call `useJournal()` in `App`, and write the full Phase 2 test of design section 14.
- **acceptance:**
  - **The existing suite passes with no edit** except the named assertions, and the report shows the diff of each.
  - With a seeded store and `react-dom/server`: the Journal button opens a Journal panel (no placeholder text); the History panel shows the Export changes section only when History has entries; the Log panel shows the two download buttons; Screens 4 and 5 show **Learn more** on a finding detail; `PlaceholderPanel.tsx` is deleted, no file imports it, and typecheck and build pass.
  - **Learn more:** with fake stores, pressing it sets the focus lesson, opens the Journal panel, and moves to Screen 3; for a measured finding it opens the layout-overflow lesson.
  - **`tests/phase2Flow.test.ts`** runs the pipeline in design section 14 and asserts everything listed there, including the three exports built from the same final state, no sentinel secret or snippet or setting value in any Journal or Log export, the patch's file self-check, the saved 2B record round trip, and the invariants of each earlier spec (it reuses the invariant checkers from the 2B, 2D, and 2E-2 tests).
  - `StudioLayout` and the panels import no engine module they did not need before, apart from types and the new components.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## J11. Final gate, `git apply` check, browser run, Phase 2 regression, and independent review
- **plan_id:** P2F-JOURNAL  **node_id:** F9
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts, temporary git repositories, and downloaded files live outside the repo and are deleted afterwards. `README.md` (a short section on the Journal and the exports) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase, then prove Phase 2 as a whole so far.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2E-2 baseline.
  2. Static checks: no new dependency; no network, AI, or `mockAssistant` import in any 2F file; none of `innerHTML`, `eval`, `new Function`, or `dangerouslySetInnerHTML`; every lesson id referenced by the app exists; the 2E-1 isolation files are unchanged; every new file tagged; the diff of existing tests shows only the named assertions.
  3. Mutation checks (break, see tests fail, restore): the lesson writing rules, the jargon list, the Simple template limits, the `package.json` command filter, the redaction of facts, the Inferred wording rule, each flow stop sentence, the flow limits, the diff header counts, the context size, the hunk merge distance, the CRLF and no-final-newline handling, the patch self-check, each exclusion reason and its order, the practice-origin default, the secret exclusion, the 512 KB cut, the download type and URL release, the no-Log-entry-on-failure rule, and the preference schema.
  4. **`git apply` check:** for each of the three samples, create a throwaway git repository from the sample's loaded files, generate the app's patch for an Edit pad style change, a crew fix, and a practice change (one file each, plus a two-edit file), then run `git apply --check` and `git apply` and compare the result byte for byte with the app's practice copy. Run `patch -p1 --dry-run` as a second check.
  5. Browser run (headless Chromium, built app, downloads captured and read back) of every item in requirements section 6, item 14.
  6. **Phase 2 regression (acceptance item 15):** repeat the 2A, 2B, 2C, 2D, 2E-1 (including the isolation test with the adversarial page), and 2E-2 browser runs on the final build, re-check each earlier gate in `build-phases.md` with fresh output, record zero console errors in each run, and give a table mapping every sub-phase gate to its evidence. State plainly that the Phase 2 exit gate (state survives a refresh through session restore) belongs to 2G and is **not** claimed here.
  7. Independent behavioral review with `semantic_reviewer`, focused on anything that could leak a secret or a value into the Journal or an export, honesty of the lessons, the patch correctness and its exclusions, and the 2F scope rules. Fix findings only with your approval.
  8. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the sixteen acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2F passes its gate: all earlier gates pass again and there are zero console errors. Advancing to 2G stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 The Journal panel | J5, J9, J10 |
| R2 Reading levels | J1, J2, J3, J8, J9 |
| R3 Application overview | J3, J5 |
| R4 Flow traces | J4, J9 |
| R5 Lessons and concept cards | J1, J2, J5, J9, J10 |
| R6 Honesty and secrets | J1 to J5, J7, J10 |
| R7 Patch export | J6, J7, J9, J10, J11 |
| R8 Log export | J7, J9 |
| R9 Journal export | J5, J9 |
| R10 Download helper and export rules | J7, J9 |
| R11 State, preference, and wiring | J8, J10 |
| R12 Safety, privacy, and resources | J1 to J10, J11 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Lesson data | J1, J2 |
| 2. Overview | J3 |
| 3. Flows | J4 |
| 4. Lessons from your project | J5 |
| 5. Patch | J6 |
| 6. `git apply` | J11 |
| 7. Log and Journal export | J5, J7 |
| 8. Download helper | J7 |
| 9. Preference | J8 |
| 10. Components | J9, J10 |
| 11. Static checks | J1 to J10, J11 |
| 12. Full Phase 2 test | J10 |
| 13. Regression | J8, J10, J11 |
| 14. Browser run | J11 |
| 15. Phase 2 regression | J11 |
| 16. Phase 2F gate | J11 |

## Questions

1. **Requirements questions 1 to 10** at the end of `requirements.md` (also written out in the chat message).
2. **Branch pattern** for code: same as before. Confirm or change.
3. **Approval of the spec**, and then, once 2A to 2E-2 are built and you advance the active sub-phase to 2F, your explicit "Go" naming **J1**.
