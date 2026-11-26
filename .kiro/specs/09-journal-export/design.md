# Design: 09 Journal and Export (Phase 2, Sub-phase 2F)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2F**. PatchBay's own screens stay wireframe with no animation, `AI_MODE=mock` only, no new dependency, no network. Built on everything before it: 2A (panels), 2B (History, `applyUnifiedDiff`, practice copy, Log), 2C (labels, connections), 2D (findings), 2E-1 (preview mode, viewer, layout findings), and 2E-2 (user edits).

## 1. Decisions already made

| Source | Decision |
|---|---|
| Blueprint section 8 | The Journal combines the skill-book with the real loaded files to give an application overview, step-by-step flows that stop honestly where a file was not loaded, and teaching at three reading levels (Simple, Practical, Deeper), with secret values always hidden. |
| Blueprint section 7 | Three change layers. The third, the exported change, is a download you apply yourself. The activity log can be exported as a clean summary. |
| Your answers | Offline first. Honest about what was read. Patch export lives in 2F. Never save secrets. Three reading levels. |
| 2E-2 | Edit pad changes are History entries tagged with an `editKey`. The export uses that to name their origin. |
| Your 2F answers | All ten approved. The lessons and concept cards are kept in one structured playbook file with tags and keywords and lookup functions, so more cases can be added and Phase 3 can read the matching cards directly. `PlaceholderPanel.tsx` is deleted. |
| Requirements section 7 (earlier wording) | Journal contents, the Simple default and the saved level, fixed lessons, the patch rules, the git format, the three downloads, Learn more, the full Phase 2 test, limits, the unused placeholder file. |

## 2. Phase 2F compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2F) | Journal, three exports, the reading level, and the Phase 2 regression test. No session restore, no AI, no GitHub push. |
| Offline, no AI | Fixed lessons, fixed templates, and facts already held by PatchBay. |
| Browser storage never holds secrets or whole repositories | The only new saved item is the reading level. |
| PatchBay never pushes to GitHub | Exports are local file downloads. |
| No new runtime dependency | None. The diff algorithm and the download helper are hand-written. |
| Gate: all earlier gates pass again, zero console errors | The last task re-runs every earlier gate with fresh evidence. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | A diff library and a zip library were considered and rejected. The diff is a small Myers implementation with a work limit and a safe fallback. A single `.patch` file needs no archive. |
| 2. Memory and bundle | PASS | Lesson text is about 40 KB of data. The Journal model and exports are built on demand and held only by the panel. Patch at most 512 KB, Journal at most 200 KB. Bundle growth is reported against the 2E-2 baseline. |
| 3. Free-tier resilience | PASS | No external service. Large diffs fall back to a single-hunk form. |
| 4. Teardown | PASS | The download helper releases its object URL after 10 seconds and on unmount. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/config/journalLimits.ts` | Limits, provisional: 30 flows, 12 steps per flow, 8 files and 3 levels per request flow, 5 instances per lesson, 10 routes in the overview, 512 KB patch, 200 KB Journal download, 500 log entries, 3 diff context lines, 2,000 preview lines, a diff work limit of 4,000,000 steps. |
| `src/skillbook/playbookSchema.ts` | The strict zod schema for a card and for the playbook, and the types `Card`, `Playbook`, `Level`. |
| `src/skillbook/playbook.ts` | **The one playbook file:** `PLAYBOOK`, a typed constant with a version and the list of cards (12 concepts, 17 checks, the sorting card). Plain data. |
| `src/skillbook/playbookLookup.ts` | `cardById`, `cardsForSkill`, `cardsByTag`, `searchCards`. Pure. Used by the Journal now and by the Phase 3 AI later. |
| `src/skillbook/index.ts` (2C, 2D) | Re-exports `PLAYBOOK` and the lookups. |
| `src/journal/lessonRules.ts` | `countSentences`, `longestSentence`, `JARGON`, `checkLessonText(level, text)`. Pure. Used by tests and by a development check. |
| `src/journal/packageFacts.ts` | `readPackageFacts(files)`: the `package.json` name, script names, and dependency names. Pure. |
| `src/journal/overview.ts` | `buildOverview(facts, level)`: the templates (section 7). Pure. |
| `src/journal/flows.ts` | `buildFlows(edges, files, inventory)`, `describeStep(step, level)`. Pure. |
| `src/journal/journalModel.ts` | `buildJournal(input, level)`: overview, flows, lessons from findings, the sorting lesson, concepts. Pure. |
| `src/export/diffLines.ts` | `diffLines(a, b, workLimit)`: Myers edit script with a safe fallback. Pure. |
| `src/export/unifiedDiff.ts` | `buildUnifiedDiff(path, oldText, newText)`: multi-hunk diff with 3 lines of context. Pure. |
| `src/export/patchExport.ts` | `originsOf(entries)`, `planPatchExport(snapshot, applied, effective)`, `buildPatch(plan, selection, now)`. Pure. |
| `src/export/logExport.ts` | `buildLogMarkdown`, `buildLogJson`. Pure. |
| `src/export/journalExport.ts` | `buildJournalMarkdown`. Pure. |
| `src/export/exportName.ts` | `exportFileName(snapshot, kind, ext, date)`. Pure. |
| `src/export/download.ts` | `downloadText(name, text, deps)` and `createDownloader(deps)`: the small browser helper. |
| `src/store/journalPrefs.ts` | The level record: schema, `loadLevel`, `saveLevel`, and the store with the transient lesson id. |
| `src/store/exportActions.ts` | Whole-state actions that write the export Log entries (counts only). |
| `src/hooks/useJournal.ts` | The journal store hook, the preference persistence, and `openLesson(id)`. |
| `src/components/JournalPanel.tsx`, `LevelPicker.tsx`, `OverviewSection.tsx`, `FlowsSection.tsx`, `LessonsSection.tsx`, `ConceptsSection.tsx`, `JournalDownload.tsx` | The Journal panel and its parts. Props only. |
| `src/components/ExportChanges.tsx`, `LogExportButtons.tsx`, `ExportButton.tsx` | The export UI used in the History and Log panels. Props only. |
| Tests | `lessons`, `lessonRules`, `packageFacts`, `overview`, `flows`, `journalModel`, `diffLines`, `unifiedDiff`, `patchExport`, `logExport`, `journalExport`, `download`, `journalPrefs`, `exportActions`, `phase2Flow` (`*.test.ts`); `journalUi` (`*.test.tsx`). |

### 4.2 Modified
| File | Change |
|---|---|
| `src/components/PlaceholderPanel.tsx` (2A) | **Deleted** in J10 (approved) once nothing imports it. |
| `src/components/HistoryPanel.tsx` (2B) | Renders `ExportChanges` below the list. |
| `src/components/LogPanel.tsx` (2A) | Renders `LogExportButtons`. |
| `src/components/FindingDetail.tsx` (2D) | Adds the **Learn more** button. |
| `src/components/StudioLayout.tsx`, `src/App.tsx` | Render the Journal panel for the Journal button and call `useJournal()`. |
| `src/styles.css` | A black-and-white block for the Journal and the export UI. |
| Tests | Only the 2A tests that look for the Journal placeholder text and the 2B test that lists the History panel's buttons (each named in the tasks). |
| `traceability/PLAN.md` | Adds plan `P2F-JOURNAL` with nodes F9.1 to F9.10. |

### 4.3 Not touched
`api/*`, spec 01 to 03 files, the 2B run machine, History, and storage, the 2C analysis, the 2D scanner and crew, the 2E-1 isolation code and preview, the 2E-2 edit pad, and every existing test except those named above. The Journal and the exports only **read** the existing state.

## 5. Data model

```ts
type Level = 'simple' | 'practical' | 'deeper'
interface Card { id: string; kind: 'concept' | 'check' | 'sorting' | 'edge_case'; title: string
                 summary: string                      // one line, at most 120 characters
                 tags: string[]; keywords: string[]    // for lookups, for example ['backend', 'security']
                 skillId?: string                      // check cards only
                 levels: { simple: string; practical: string; deeper: string }
                 related: string[] }
interface Playbook { version: 1; cards: Card[] }

interface OverviewFacts {            // gathered by journalModel from existing state, no new reads
  name: string; source: 'github' | 'sample'; owner: string; repo: string; ref: string
  mode: 'static' | 'workbench' | 'source'; modeReason: string; entryPath?: string
  extensions: { ext: string; count: number }[]                 // top 5
  areaCounts: { frontend: number; backend: number; api_data: number }
  helperCounts: { assets: number; tests: number; settings: number; docs: number }
  needsReview: number
  packageScripts: string[]; dependencyCount: number; routeFiles: number
  externalHosts: string[]; settingNames: string[]; databases: string[]; routes: string[]   // routes: "PUT /api/profile/:id", at most 10
  read: number; pathOnly: number; ignored: number; partialReasons: string[]; notScanned: Record<string, number>
  findings: { total: number; bySeverity: { high: number; medium: number; low: number }; byArea: Record<string, number>; byFix: Record<string, number>; scanned: boolean }
}

interface FlowStep { path?: string; line?: number; certainty?: 'confirmed' | 'inferred' | 'broken'; kind: string; label: string; stop?: string }
interface Flow { id: string; kind: 'page' | 'request' | 'setting'; title: string; steps: FlowStep[]; notes: string[] }

interface LessonView { lesson: Card; instances: { path: string; firstLine: number; lastLine: number; severity: string; certainty: string; fix: string; extra?: string }[]; more: number }
interface JournalModel { level: Level; overview: { id: string; title: string; sentences: string[] }[]; flows: Flow[]; flowsHidden: number
                         lessons: LessonView[]; concepts: Card[]; hidden: number /* redacted values */; notes: string[] }

interface PatchPlanFile { path: string; origins: ('user' | 'crew' | 'practice')[]; changes: number; hunks: number; added: number; removed: number
                          patch?: string; excluded?: string /* fixed reason */; defaultSelected: boolean }
interface PatchPlan { files: PatchPlanFile[]; previewOnlyCount: number }
```
All plain data. Nothing here is saved except the reading level.

## 6. The playbook (the cards)

### 6.1 Format and rules
`PLAYBOOK.cards` is an array of `Card`. The rules of requirements R2.4 are checked by `lessonRules.ts` in tests, for every lesson and level. Sentences are split on `.`, `!`, `?` followed by a space or the end, ignoring dots inside numbers and inside code spans. The jargon list and the code-character check apply only to the Simple level.

### 6.2 Worked examples (the tone and size every lesson follows)

`lesson.scan.security.target-blank`
- **Simple:** "Some links open a new tab. A page opened that way can sometimes change the page that opened it. A small note on the link stops that."
- **Practical:** "A link with target="_blank" opens a new tab. Without a rel="noopener" note, the new page can reach back and change the page that opened it. That can be used to send your visitors to a fake page. Adding rel="noopener noreferrer" to the link blocks it."
- **Deeper:** "A link with target="_blank" opens a new tab. Older browsers let the new page reach back through a browser object and change the page that opened it, which can be used to send visitors to a fake page. Newer browsers already act as if the link had rel="noopener", but adding it keeps the behaviour the same everywhere. The noreferrer part also keeps your page's address from being passed to the new site. PatchBay can add both words for you because the change is small and easy to check."

`concept.route`
- **Simple:** "A route is an address that a server listens to. When a page asks that address for something, the server answers."
- **Practical:** "A route pairs a web address, such as /api/profile, and a method, such as PUT, with code that answers requests. A script on the page sends the request, and the route's code sends back a reply."
- **Deeper:** "A route pairs a path and a method with a handler. It can be written in code, such as router.put, or come from where the file sits, such as a file inside an api folder. Routers are often mounted under a prefix, so the full address is the prefix plus the route's own path. PatchBay joins a prefix only when it can see the line that mounts the router."

Every lesson ends in plain advice at its level and never claims that anything is safe, secure, or fixed.

### 6.3 One file, easy to expand, ready for Phase 3
- **One file.** All cards live in `src/skillbook/playbook.ts`, in a fixed order (concepts, checks, sorting). A comment at the top of the file shows the shape of a card and how to add one. A TypeScript file is used instead of JSON so no project setting has to change and the compiler checks every card. It is still plain data: no code runs when it loads.
- **Easy to expand.** A new card (for example a subtle backend, security, or design edge case) is one more entry. It gets the kind `edge_case` (reserved), tags, keywords, a summary, the three levels, and related ids. The tests validate every card with the same rules, so adding a card is safe.
- **Ready for Phase 3.** The lookups return cards by id, by skill id, by tag, and by keywords, so the live AI can fetch the matching cards for a finding and use them while it reasons, reading the file directly with no database. 2F builds the lookups and no AI code. The cards are plain text, so they can be placed in a prompt as they are.
- **Authoring and review.** The text is written once, as data. A reviewer (you) reads it when the tasks are done. Changing a card changes only that data, and the tests re-check the rules.

## 7. The overview (`overview.ts`)

`buildOverview(facts, level)` returns the parts below. Each part is a function from the facts to a list of sentences for each level. A part returns an empty list when its facts are empty, and then it is left out. The last sentence of the overview is always "This overview describes only the files PatchBay read." (Simple: "PatchBay describes only the files it read.")

| Part | Simple | Practical adds | Deeper adds |
|---|---|---|---|
| What this project is | kind in plain words and the source | the mode reason | what the mode means for the preview |
| What it is made of | the biggest area and helper counts as words | the five extensions and every area and helper count | files that need review and how corrections change it |
| How it starts | the main page | package script names | the number of route files and where routes come from |
| What it talks to | whether it contacts other services | the host and setting names and the first routes | databases and the Inferred connections (only at Practical and Deeper, worded "probably") |
| What PatchBay read | files read and not read | partial reasons | the file types without connection scanning |
| What PatchBay found | the unique total in words | counts by severity and area | counts by fix label and where the lessons are |

### 7.1 Worked example: the static sample at the Simple level
Facts: mode `static`, entry `index.html`, 4 frontend files, 1 image, 1 document, 5 read, 1 not read, 1 ignored, 1 finding.
> This looks like a small website. It came from PatchBay's Static site sample.
> Most of it is web page, style, and script files: 4 of them. It also has 1 picture file and 1 document file.
> The main page is index.html.
> PatchBay did not see it talking to any other service.
> PatchBay read 5 files. 1 file was not read, and 1 file was left out on purpose.
> PatchBay found 1 thing to look at. The lessons below explain it.
> PatchBay describes only the files it read.

(The Practical and Deeper versions of the same facts are hand-written in the tests.)

## 8. Flow traces (`flows.ts`)

Input: the 2C edges (kind, from, target, targetPath, certainty, line, note), the inventory entries (for "not loaded" reasons), and the file list.
1. **Index:** edges by `from`; route edges by their `targetPath`; calls by `from`.
2. **Page flows** (at most 3 pages): start at an HTML page (the entry page first). Steps: the page; each `loads` edge (stylesheets, scripts, images) in line order; for each loaded script, its `calls_api` and `calls_external` edges. Stops follow R4.4.
3. **Request flows** (at most 20, in order of call path and line): step 1 is the call ("`client/app.js` line 3 sends PUT /api/profile/1."), step 2 is the matched route ("`server/routes/profile.js` line 7 handles PUT /api/profile/:id", with the mount note), then a breadth-first walk of that route file's `imports` edges up to 3 levels and 8 files ("It uses `server/middleware/validate.js`." with the import line). A `calls_external` call ends with the outside-service stop. A Broken call ends with the no-route stop. An Inferred call with the "no backend routes" note ends with that stop. A target file that is not loaded ends with the not-loaded stop and the inventory reason.
4. **Route flows without callers:** a `defines_route` edge with no matching call gives a short flow whose last line is "Nothing in the loaded files calls this route."
5. **Setting flows** (at most 20): for each setting name, the reading files and lines, and the note "The value is never shown."
6. **Order and limits:** page flows, then request flows, then route flows, then setting flows; 30 flows and 12 steps each; the hidden count is reported.
7. **`describeStep(step, level)`** writes one sentence per step. Simple: "<file> asks the server to <verb> something." for requests, "<file> uses <file>." for imports. Practical and Deeper add the address, the certainty word, and the line. Certainty is shown as words at every level.

### 8.1 Worked flow: the full-stack sample (Practical)
> **Request: PUT /api/profile/1**
> 1. `client/app.js`, line 3, sends PUT /api/profile/1. (Confirmed)
> 2. `server/routes/profile.js`, line 7, handles PUT /api/profile/:id. It is mounted at /api/profile by `server/index.js`, line 6. (Confirmed)
> 3. It uses `server/middleware/validate.js`. (line 2, Confirmed)
> 4. It uses `server/services/profileService.js`. (line 3, Confirmed)
> End of the trace: no more loaded files are used.

The React sample's request flow ends: "1. `src/api/auth.ts`, line 2, sends POST /api/sign-in. (Inferred) Stopped: no backend routes were found in this repository; the route may live elsewhere."

## 9. The Journal model (`journalModel.ts`)

`buildJournal(input, level)`:
1. Gather `OverviewFacts` from the state (all fields come from existing results; `readPackageFacts` reads `package.json`).
2. `buildOverview`, `buildFlows`.
3. **Lessons from the project:** group `allFindings(scan, measured)` by skill. For each skill with findings, take its lesson, up to 5 instances (the most severe first, then path and line), and the `more` count. Order the lessons by the highest severity among their findings, then by skill id.
4. **Sorting lesson:** when `needsReview > 0`, attach up to 5 Needs Review files with their first evidence text (2C, already plain English).
5. **Concepts:** all 12 in a fixed order.
6. Pass every fact string through `redact()`; count changes in `hidden`.
7. The result is memoised by the snapshot id, the identities of the 2C result, the corrections, the scan result, the measured findings, the preview facts, and the level.

## 10. The unified diff and the patch

### 10.1 `diffLines(a, b, workLimit)`
Myers' shortest edit script on line arrays after trimming the common prefix and suffix. It keeps, per step, only the diagonals it needs (memory about D squared, with D capped by the work limit). When the work limit is exceeded it returns a single edit covering the whole changed middle (a valid but larger diff). Lines are compared exactly, including their line endings, so a line-ending change shows as a change.

### 10.2 `buildUnifiedDiff(path, oldText, newText)`
Turns the edit script into hunks: each change expands by 3 lines of context, and two hunks whose context overlaps or touches (a gap of 6 lines or fewer) are merged. Writes `@@ -a,b +c,d @@` with the right counts (using the `-0,0` and `+0,0` forms for empty sides), the "\ No newline at end of file" marker where a side lacks a final newline, and the `--- a/<path>` and `+++ b/<path>` headers. Returns `null` for equal texts.

### 10.3 `planPatchExport` and `buildPatch`
1. Group the **applied** History entries by `path`. Derive origins with `originsOf`.
2. For each path: original = the loaded content, final = the effective content. Apply the exclusions in this order: not fully loaded; special characters in the path; no net change; combined diff built with `buildUnifiedDiff`; self-check with `applyUnifiedDiff(original, diff)` equal to `final`; `containsSecret(diff)`.
3. `defaultSelected` is true when no origin is `practice`.
4. `buildPatch(plan, selectedPaths)` concatenates `diff --git a/<p> b/<p>` plus the file diff for the selected, non-excluded files in path order until 512 KB, excluding the rest with the size reason, and returns the text and the counts.
5. `originsOf(entries)`: `editKey` starting with `edit:` is `user`; a diff with an added line containing `PRACTICE:` is `practice`; any other is `crew`.

### 10.4 Worked example
A user edit that adds `style="width: 200px"` to the button on line 13 of the static sample's `index.html`, exported alone, gives:
```
diff --git a/index.html b/index.html
--- a/index.html
+++ b/index.html
@@ -10,7 +10,7 @@
     <main>
       <img src="img/logo.png" />
       <p>Fresh bread every morning.</p>
-      <button id="order" class="btn">Order now</button>
+      <button id="order" class="btn" style="width: 200px">Order now</button>
       <p id="message"></p>
     </main>
     <script src="js/app.js"></script>
```
Two separate edits far apart in one file give one `diff --git` block with two `@@` hunks. This is the text `git apply` receives in the final task's check.

## 11. Log and Journal exports

### 11.1 Log Markdown (`buildLogMarkdown`)
```
# PatchBay session log: <name>
Repository: <source> <owner>/<name> @ <ref>
Exported: <ISO time>

## Summary
- Files read: n. Sorted by path only: n. Left out on purpose: n.
- Findings: n (High a, Medium b, Low c). Scan: done | not run | partial.
- Changes applied: n. Undone: n. Preview-only changes: n.

## Changes
| Time | State | Title | File |
...

## Log
| Time | Action | Status | Message | Files |
...
```
### 11.2 Log JSON (`buildLogJson`)
The shape in requirements R8.3, with keys in that order, two-space indentation, and a trailing newline.

### 11.3 Journal Markdown (`buildJournalMarkdown`)
A title, the identity line, the level, the "Built offline..." sentence, then `## Application overview`, `## How things flow` (each flow as a numbered list with the stop sentence), `## Lessons from your project` (the lesson text, then the instance lines), and `## Notes` (partial reasons and the hidden count). Cut at a section boundary above 200 KB with "Shortened to fit."

### 11.4 Names and download
`exportFileName(snapshot, kind, ext, date)` builds `patchbay-<owner>-<repo>-<ref>-<yyyymmdd>[-<kind>].<ext>`, replacing characters outside `a-z 0-9 . _ -` with `-` (lower-cased) and cutting to 100 characters. `downloadText(name, text, deps)` uses `deps.Blob`, `deps.URL`, `deps.document`, and `deps.setTimeout`, returns `true` or `false`, never throws, and never navigates. `createDownloader` also remembers the URLs it created so `dispose()` can release them.

### 11.5 Export Log entries (`exportActions.ts`)
`export_patch`, `export_log`, and `export_journal` entries with counts or the level only, status `info`. They are written only after `downloadText` returned `true`.

## 12. The preference and the Journal store

`journalPrefs.ts`: `LevelRecordSchema` is `{ version: 1, level }` (strict). `loadLevel(storage)` and `saveLevel(storage, level)` never throw. The store (using the 2A `createStore`) holds `{ level, focusLesson?: string }`. `useJournal()` creates it from `loadLevel(browserStorage())`, saves on level change, and exposes `openLesson(id)`, which sets `focusLesson`, sets the layout to Journal open (the 2B `openPanelById` action), and moves to Screen 3 (`shellActions.backToStudio`). The Journal panel clears `focusLesson` after it has opened and scrolled to the lesson.

## 13. User interface

- **`JournalPanel`:** the title line, `LevelPicker` (three buttons, `aria-pressed`), then the five collapsible blocks (`details`). Each block shows its own empty state.
- **Overview:** one heading and short paragraphs per part, with the closing sentence.
- **Flows:** a `select` grouped by kind, the chosen flow's numbered steps (file and line in `code`, sentence, certainty in words, **Open in viewer**), the stop sentence, and the notes.
- **Lessons:** one `details` per lesson: title, level text, "In your project" list with **Open in viewer** per line, and the "more" line. The sorting lesson lists the files and reasons.
- **Concepts:** one `details` per card with its text and "Related:" buttons that open the other card.
- **Download:** **Download journal (.md)** and its status line.
- **History panel, Export changes:** the file table (checkbox, path, origins in words, changes, hunks, +/- lines, or the exclusion reason), "n Preview Only changes are not exported.", a **Preview patch** `details`, the apply line, and **Download .patch**.
- **Log panel:** **Download log (.md)** and **Download log (.json)** with status lines.
- **Finding detail:** a **Learn more** button.
- All text is React text. No color, icon, transition, or animation. Buttons are at least 44 px tall.

## 14. The full Phase 2 test (`tests/phase2Flow.test.ts`)

A deterministic store-level test with fakes for timers, storage, and downloads. It runs the pipeline on the full-stack sample and on a fixture project that has one finding of each kind: load, analyse (2C), scan (2D, 17 checks with a measured finding injected as 2E-1 would), start the crew, approve the automatic fix, run and approve a practice step, make an Edit pad style change through `applyUserEdit`, undo and redo, then build the Journal at all three levels and the patch, log, and Journal exports. It asserts that the History, the practice copy, the findings after every change, and the exports agree; that no secret fixture, snippet, or setting value appears anywhere in the Journal or the Log exports; that the saved 2B record round-trips; and that the invariants of each earlier spec still hold (at most one proposal, 50 History entries, stale actions ignored, and so on).

## 15. Failure handling

| Failure | Handling |
|---|---|
| Analysis failed or running | The Journal says so, with the 2C Try again. |
| `package.json` bad | Script and dependency names left out. |
| A lesson id is missing (a bug) | The Journal skips it and the static check fails the build of the test suite. |
| Combined diff fails the self-check | The file is excluded with "The patch could not be verified." |
| The work limit of the diff is exceeded | A single-hunk diff is used (still verified). |
| The patch reaches 512 KB | Later files are excluded with the size reason. |
| Download blocked | "Your browser did not allow the download." No Log entry. |
| Storage blocked | The level is kept in memory. |
| Redaction changes a string | The Journal and exports add the "values were hidden" note. |

## 16. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Playbook | `tests/playbook.test.ts`, `tests/lessonRules.test.ts` (J1, J2) |
| 2. Overview | `tests/packageFacts.test.ts`, `tests/overview.test.ts` (J3) |
| 3. Flows | `tests/flows.test.ts` (J4) |
| 4. Lessons from your project | `tests/journalModel.test.ts` (J5) |
| 5. Patch | `tests/diffLines.test.ts`, `tests/unifiedDiff.test.ts`, `tests/patchExport.test.ts` (J6) |
| 6. `git apply` | J11 |
| 7. Log and Journal export | `tests/logExport.test.ts`, `tests/journalExport.test.ts` (J5, J7) |
| 8. Download helper | `tests/download.test.ts` (J7) |
| 9. Preference | `tests/journalPrefs.test.ts` (J8) |
| 10. Components | `tests/journalUi.test.tsx` (J9, J10) |
| 11. Static checks | J1 to J10, J11 |
| 12. Full Phase 2 test | `tests/phase2Flow.test.ts` (J10) |
| 13. Regression | J8, J10, J11 |
| 14. Browser run | J11 |
| 15. Phase 2 regression | J11 |
| 16. Phase 2F gate | J11 |

## 17. Risks and known limits

- **The lessons are fixed text.** They teach general ideas and cannot answer a question about your code. AI explanations wait for Phase 3.
- **Flows follow only what the 2C connections found.** They stop honestly at unread files, outside services, and shortcuts.
- **A patch built from a changed file can fail to apply to your project** if your project moved on from the loaded version. The patch is made against the files as PatchBay loaded them, and the apply line says so.
- **Origin detection is derived.** A crew fix and an unrecorded change look the same. Files with practice-run changes are the only ones unchecked by default.
- **The diff is hand-written.** It is checked against two independent appliers, `git apply` in the final task, and a self-check on every export.
- **Large exports are cut with notes.** The notes say what was left out.
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 18. PLAN.md nodes

Plan `P2F-JOURNAL`, feature `F9 — Journal and Export`, with nodes F9.1 (limits, lesson rules, concept lessons), F9.2 (check and sorting lessons), F9.3 (overview), F9.4 (flows), F9.5 (Journal model and Journal export), F9.6 (diff and patch export), F9.7 (log export, names, download helper, export actions), F9.8 (preference and Journal store), F9.9 (components), F9.10 (wiring and the full Phase 2 test), and the gate F9. Full text is in `traceability/PLAN.md`.
