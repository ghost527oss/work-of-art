# Tasks: 05 Project Understanding (Phase 2, Sub-phase 2C)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2C-UNDERSTAND` and the F5 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2C** (black-and-white wireframe, no animation, `AI_MODE=mock` only, no AI and no network). **These tasks start only after 2A and 2B are built and you have advanced the active sub-phase to 2C.**

Task ids are **C1 to C10**, so they cannot be confused with T (spec 01), M (spec 02), S (spec 03), or B (spec 04).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F5.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network, `fetch`, AI, `mockAssistant`, `aiAssistant`, or `useAssistant` import in any 2C file.
- Do not touch the files listed in design section 4.3. The worked examples in design section 10 are the hand-written truth: if the code disagrees, stop and discuss before changing either.
- Reasons, log entries, and saved records hold paths, label names, specifiers, setting **names**, and fixed phrases only. Never file content lines, values, or secrets. Tests use sentinel strings to prove it.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

Same pattern as 2A and 2B: the spec on `spec/05-project-understanding`, code on `feat/project-understanding` from the spec branch, **one commit per task**, a pull request after C10.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| C1 | F5.1 | Limits and skill-book v1 | none |
| C2 | F5.2 | Source scanner | C1 |
| C3 | F5.3 | File sorting | C1, C2 |
| C4 | F5.4 | Connection map | C2 |
| C5 | F5.5 | Analysis run, view helpers, sample expectations | C3, C4 |
| C6 | F5.6 | Understanding state, actions, store integration | C5 |
| C7 | F5.7 | Saved corrections and controller | C6, 2B (`repoKeyOf`) |
| C8 | F5.8 | Section components | C5 |
| C9 | F5.9 | Wire into Project info, Studio, and App | C7, C8, 2A |
| C10 | F5 | Final gate, browser run, mutation checks, independent review | C1 to C9 |

---

## C1. Limits and skill-book v1
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.1
- **scope:** `src/config/understandingLimits.ts`, `src/skillbook/types.ts`, `src/skillbook/sortSkills.ts`, `src/skillbook/index.ts`, `tests/skillbook.test.ts`
- **goal:** Build design sections 4.1 (limits) and 6 (the 31 sort skills). Export `SKILLBOOK = { version: 1, sort: [...] }` and `skillById(id)`. Each skill has `id`, `title`, `strength`, `label` (an existing `FileClassification`), `family`, `explain`.
- **acceptance:**
  - Ids are unique, match `/^sort\.[a-z-]+\.[a-z-]+$/`, and every `label` is in the existing label set. The table in design section 6 and the data match row for row (the test lists the expected ids, strengths, and labels by hand).
  - Every `explain` is 1 to 2 sentences, at most 220 characters, and contains none of a banned jargon list (`regex`, `AST`, `heuristic`, `token`, `parse`, `boilerplate`, `idempotent`, `namespace`).
  - `skillById` returns the skill for each id and `undefined` otherwise. The skill-book is frozen (mutation throws in strict mode).
  - `understandingLimits.ts` holds the design values and `provisional: true`.
  - The skill-book files import nothing from React, stores, the engine, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/skillbook.test.ts`

## C2. Source scanner
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.2
- **scope:** `src/engine/sourceScan.ts`, `tests/sourceScan.test.ts`
- **goal:** Build design section 7: `scanSource(path, content)`.
- **acceptance:**
  - Each extraction kind from requirements R4.2 on fixtures in `.js`, `.ts`, `.tsx`, `.jsx`, `.mjs`, `.html`, and `.css`: static and re-export imports, `require`, dynamic `import('...')`, `fetch` with and without `method`, `axios` forms, `XMLHttpRequest.open`, template addresses (kept with the `${...}` marker), route calls on `app` and `router` and on an identifier assigned from `express.Router()`, mounts, `process.env.NAME`, `process.env['NAME']`, `import.meta.env.NAME`, and `script`, `img`, and stylesheet `link` tags.
  - **Decoys are ignored:** the same text in `//` and `/* */` comments, inside a string that is not the target, inside an HTML comment, and `axios.get('/x')` is not a route definition.
  - Line numbers are 1-based and correct on a multi-line fixture, including after block comments that span lines.
  - A value after `=` in `process.env.X = 'secret-value'` never appears in any output field (sentinel test).
  - Alias imports (`@/x`, `~/x`, `#x`, `$lib/x`) are reported in `aliasImports`, not in `imports`.
  - Unsupported extensions return `unsupported: true` and nothing else.
  - **Hostile input:** a 200 KB line of one repeated character, 200 KB of repeated `import `, 200 KB of repeated `fetch(`, and 200 KB of unbalanced quotes and `/*` each finish in under 1 second. A seeded fuzz of 500 random strings never throws. Results per file stop at 200.
  - No output field contains a line of the source (every returned string is a specifier, address, name, method, or marker no longer than 250 characters).
  - The file imports nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/sourceScan.test.ts`

## C3. File sorting
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.3
- **scope:** `src/engine/sortFiles.ts`, `tests/sortFiles.test.ts`
- **goal:** Build design section 8: `sortAll(files, scans, manifestFacts, edges?)`, the confidence rule, the suppression rule, the Low-label drop, evidence building, the second pass, and the per-file failure guard. Exports a small `manifestFactsFrom(files)` that reads the root `package.json` dependency names.
- **acceptance:**
  - A table test of the confidence rule over every combination of up to two strong, two moderate, and two weak hits for one label, checked against R1.4.
  - Each skill in the skill-book has at least one positive fixture test that produces its label with its id in the evidence.
  - `.js` and `.ts` files with no other clue get `unknown`, Low, Needs Review. A `.js` file under `server/` gets backend. A `.js` file that uses `document.` gets frontend.
  - The suppression rule: a `tests` file that imports `fs`, and a `configuration` file that imports `node:path`, do not also get `backend`. A strong `frontend` import is not suppressed by a weak folder clue.
  - A Low label is dropped next to a Medium label. A file whose only label is Low stays and is Needs Review.
  - Multi-label: a file with a strong frontend clue and a strong backend clue keeps both with separate reasons.
  - Path-only files never use content skills and end with the "Not read; sorted by its path and type." line. A path-only image is High.
  - Ignored entries (each policy reason) get no labels, `ignored: true`, and are not Needs Review.
  - `sort.ref.loaded-by-html` and `sort.ref.shared` run only in the second pass, only from the given edges, and `shared` is never given by anything else. The `shared` reason lists up to three importers in path order.
  - Same input twice, and with the input arrays reversed, gives deeply equal output. Evidence order is fixed.
  - Every label has at least one evidence record, and no description contains a source line (sentinel test) or more than 120 characters of detail. A specifier containing a secret fixture (`ghp_` plus 36 characters) appears as `[REDACTED:...]`.
  - A throwing scan input for one file marks that file Needs Review with "Could not be analysed." and does not stop the others.
  - The file imports nothing from React, stores, or the network, and decides no label outside the skill-book (checked by a test that every emitted evidence id exists in `SKILLBOOK`).
- **verify:** `npm run typecheck && npx vitest run tests/sortFiles.test.ts`

## C4. Connection map
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.4
- **scope:** `src/engine/connectionMap.ts`, `tests/connectionMap.test.ts`
- **goal:** Build design section 9: `buildConnections(scans, inventoryPaths, treeComplete)` returning edges, externals, and the coverage counts for the map.
- **acceptance:**
  - Target resolution: `./a`, `./a.ts`, `./a/index.ts`, `../b`, a `.js` specifier that resolves to a `.ts` and to a `.tsx` file, a root-relative target, a missing target. Alias imports are counted, not resolved.
  - Certainty for `imports` and `loads`: Confirmed when resolved; Broken when missing and the tree is complete; Inferred with the note when missing and the tree is incomplete.
  - Routes: a root `api/name.ts` gives `/api/name` with no method, `pages/api/a/b.ts` gives `/api/a/b`, `app/api/x/route.ts` gives `/api/x` with its exported methods, a code route on `router`, and a mount through `require('./routes/x')` and through a default `import`. An unmounted router keeps its path and the note "mount path unknown".
  - Calls: a literal call that matches a route is Confirmed (including a concrete value on a `:id` segment); a `${...}` call that matches is Inferred; a call with no match is Broken when the repository has at least one route; the same call is Inferred with the "No backend routes were found" note when the repository has none; a method mismatch is Broken with the note "method differs"; a route with no callers produces no Broken edge; an external `https://` address becomes `calls_external` with the host only.
  - `reads_config` records names only.
  - Externals: scoped and unscoped names, deduplicated and sorted.
  - Bounds: the 200 per file, 5,000 total, and 2,000 scanned-files limits set `partial` and the counts. Edge order is deterministic (the same input reversed gives the same output).
  - No edge holds a source line. The file imports nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/connectionMap.test.ts`

## C5. Analysis run, view helpers, and the sample expectations
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.5
- **scope:** `src/engine/analyzeProject.ts`, `src/engine/understandingView.ts`, `tests/analyzeProject.test.ts`, `tests/understandingView.test.ts`, `tests/analyzeSamples.test.ts`
- **goal:** Build design sections 11.1 and 5 (`applyCorrections`, `summarize`, `filterFiles`, `filterEdges`, `AREA_OF_LABEL`, `HELPER_OF_LABEL`, `labelName`).
- **acceptance:**
  - **Samples:** `analyzeSamples.test.ts` writes out, as plain data, every row of the three tables and every edge in design section 10, builds each sample with `buildSampleSnapshot`, runs `analyzeProject`, and compares exactly (labels, confidence, the skill ids present in the evidence, edge kind, from, line, target, certainty, note, externals, Needs Review list, ignored list). Any difference is reported and **not** fixed by editing the expectations without your approval.
  - **Run:** with a fake `yieldToMain`, a repository of 120 files yields at least 3 times and reports progress `done` and `total`; an aborted run rejects with an abort error and returns nothing; a fake clock past the limit gives a partial result, `partial: true`, and the files not done listed as Needs Review with "Not analysed: time limit."; one file whose scan throws is isolated; the snapshot object is not mutated (deep-freeze test); no network (the global `fetch` is replaced with a function that throws).
  - **Views:** `applyCorrections` replaces labels, sets High and `needsReview: false`, adds the "Set by you." evidence while keeping the earlier reasons under a separate field, ignores a correction for a missing path; `summarize` counts match a hand-written fixture (areas, helper groups, Needs Review, Ignored, and Security 0); `shared` counts in both Frontend and Backend; the filters return the expected rows; `labelName` gives the plain names for all nine selectable labels.
  - The files import nothing from React or stores, and `analyzeProject` imports no network or AI module.
- **verify:** `npm run typecheck && npx vitest run tests/analyzeProject.test.ts tests/understandingView.test.ts tests/analyzeSamples.test.ts`

## C6. Understanding state, actions, and store integration
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.6
- **scope:** `src/store/understandingSlice.ts`, `src/store/understandingActions.ts`, `src/store/useStudioStore.ts` (add `understanding`), `tests/understandingState.test.ts`
- **goal:** Build design section 11.2. `StudioState` gains `understanding`. The actions that already clear `ai` and `work` also clear `understanding`.
- **acceptance:**
  - **Existing tests still pass with no edits** (`store`, `aiState`, `workStore`, `workActions`, and the 2A tests), and `initialState().understanding` equals `idleUnderstanding()`.
  - Every transition: begin, progress, complete, fail, cancel, set, remove, clear, restore. A stale `runId` changes nothing (same object). A complete or progress for another snapshot id changes nothing. A cancel returns `idle` with no result.
  - The log entries `understanding_started`, `understanding_done`, `understanding_failed`, `label_corrected`, `label_reset`, and `labels_cleared` have the expected text and status. They contain paths, counts, and label names only (sentinel tests for a content line and a secret fixture).
  - Setting labels does not touch `status`, `result`, or `runId` and does not start a run. Setting an empty list removes the correction. `unknown` is rejected.
  - The state clears (including corrections in memory) on snapshot replacement, `reset`, and foreground cancel, like `ai` and `work`.
  - The state survives `JSON.parse(JSON.stringify(...))` for `corrections`. The slice file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/understandingState.test.ts tests/store.test.ts tests/aiState.test.ts tests/workStore.test.ts`

## C7. Saved corrections and controller
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.7
- **scope:** `src/store/correctionsStorage.ts`, `src/hooks/useUnderstanding.ts`, `tests/correctionsStorage.test.ts`, `tests/understandingController.test.ts`
- **goal:** Build design sections 12 and 13.
- **acceptance:**
  - **Storage:** a valid record round-trips; each bad variant (missing, bad JSON, over 64 KB, wrong version, unknown field, an unknown label, more than 500 paths, a path over 250 characters, more than 9 labels) gives no corrections with no throw; a different repository key restores nothing and leaves the stored text untouched until the first save; paths missing from the new snapshot are dropped; blocked, throwing, and full storage never throw; the saved text contains only the allowed fields (sentinel test).
  - **Controller (fake storage, fake `analyze`, fake yield):** a new snapshot starts exactly one run; a replaced snapshot aborts the first run and starts another; a cleared snapshot aborts and starts nothing; `cancel` returns to `idle`; `run` after cancel starts a new run; `setLabels`, `removeCorrection`, and `clearCorrections` update the state, the log, and (when the gate allows) the storage; **no save before restore finishes**; Back to Start keeps the slot and a reload of the same snapshot restores the corrections; loading another repository starts with none and replaces the slot at its first save; `dispose` aborts the run, unsubscribes, and ignores later results.
  - Corrections never start an analysis and never change the result (deep equality of `result` before and after).
  - The files import no `fetch`, AI, or `mockAssistant` module (source-text check). `useUnderstanding.ts` uses `repoKeyOf` from 2B.
- **verify:** `npm run typecheck && npx vitest run tests/correctionsStorage.test.ts tests/understandingController.test.ts`

## C8. Section components
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.8
- **scope:** `src/components/UnderstandingSection.tsx`, `src/components/FileLabelsTable.tsx`, `src/components/LabelEditor.tsx`, `src/components/ConnectionsTable.tsx`, `src/styles.css` (append the 2C block only), `tests/understandingUi.test.tsx`
- **goal:** Build design section 14 as components that take props only.
- **acceptance:**
  - With `react-dom/server` and the hand-written result of the full-stack sample: the section shows the summary with Security 0 and its note, the Needs Review empty state, the files table with the right rows, a **Why?** disclosure with all reasons, the connections table with "Confirmed" written out, and the coverage note with `express`.
  - States: `running` shows "Analysing N of M files." and a Cancel button; `failed` shows the message and Try again; `idle` after cancel shows Run again; partial shows the partial note; no snapshot shows nothing.
  - A corrected row shows the user's labels, High, "Set by you.", and the earlier reasons under "Before your change". **Clear my label corrections** appears only when a correction exists.
  - `LabelEditor` has one checkbox per selectable label with plain names and no `unknown`, Save, Cancel, and Remove my change only when a correction exists. Checked boxes match the current labels.
  - Filters appear with their labels; a markup-looking path or reason (`<img src=x onerror=alert(1)>`) is escaped; each table is inside a scroll box; tables have header cells.
  - Static checks on the new files and the CSS block: no `dangerouslySetInnerHTML`, no color value other than `#000` and `#fff`, no `transition`, no `animation`, no certainty shown only by style. Every new file carries an `@node: F5.8` tag.
  - Browser behavior is **not** claimed here. It is verified in C10.
- **verify:** `npm run typecheck && npx vitest run tests/understandingUi.test.tsx`

## C9. Wire into Project info, Studio, and App
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.9
- **scope:** `src/components/ProjectInfo.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css` (only to fix a class from C8), `tests/understandingUi.test.tsx` (append wiring tests)
- **goal:** Build design section 4.2. `ProjectInfo` renders `UnderstandingSection` between the coverage panel and the inventory. `App` calls `useUnderstanding()` and passes the actions down through `StudioLayout`.
- **acceptance:**
  - **The existing suite passes with no existing test edited**, including the 2A shell tests and the 2B harness tests.
  - With a seeded store and `react-dom/server`: the Studio markup contains the section in the right place (after the coverage heading, before the inventory heading) for a loaded snapshot with a finished result, and for each of the idle, running, and failed states.
  - Screens 4 and 5 and the toolbar are unchanged.
  - `ProjectInfo` and `StudioLayout` import no engine module they did not import before, apart from types.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## C10. Final gate and independent review
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts live outside the repo and are deleted afterwards. `README.md` (a short section on project understanding) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase and its Phase 2C gate.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2B baseline.
  2. Static checks: no new dependency; no network, AI, or `mockAssistant` import in any 2C file; no color other than `#000` and `#fff`; no `transition` or `animation`; every new file tagged; every emitted evidence id exists in the skill-book.
  3. Mutation checks (break, see tests fail, restore): the confidence rule, the Low-label drop, the suppression rule, "extension alone never labels `.js` and `.ts`", the `shared`-only-from-references rule, the Broken versus Inferred rule for a missing backend, the route-mount prefix, the comment and string decoys in the scanner, the secret redaction in reasons, the restore gate, the repository-key check, and the abort handling.
  4. Timing: the hostile-input tests and a synthetic repository of 2,000 files with 200 KB each stay inside the 8 second limit, produce a partial result when slow, and keep the page responsive (the browser run in step 5 includes this).
  5. Browser run (headless Chromium on the built app) of every item in requirements section 6, item 13, including the three samples against the hand-written tables, one small public repository, the label editor, refresh and restore, Cancel then Run again, 375 px, and zero console errors.
  6. Independent behavioral review with `semantic_reviewer`, focused on guessed labels, honesty of the Confirmed, Inferred, and Broken words, saved-data hygiene, and the 2C scope rules. Fix findings only with your approval.
  7. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the fourteen acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2C passes its gate: no guessed labels, and low-confidence files go to Needs Review. Advancing to 2D stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 Sorting every file | C3, C5 |
| R2 Clues | C1, C2, C3 |
| R3 Corrections | C5, C6, C7, C8 |
| R4 Connection map | C2, C4, C5 |
| R5 Analysis run | C5, C7 |
| R6 Project understanding section | C8, C9 |
| R7 Skill-book | C1, C3 |
| R8 Wiring | C6, C7, C9 |
| R9 Saved corrections | C7 |
| R10 Safety, privacy, resources | C1 to C9, C10 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Skill-book | C1 |
| 2. Source scanner | C2 |
| 3. Sorting | C3 |
| 4. Connections | C4 |
| 5. Samples | C5 |
| 6. Analysis run | C5 |
| 7. State and corrections | C5, C6 |
| 8. Storage | C7 |
| 9. Controller | C7 |
| 10. Components | C8, C9 |
| 11. Static checks | C1 to C9, C10 |
| 12. Regression | C6, C9, C10 |
| 13. Browser run | C10 |
| 14. Phase 2C gate | C10 |

## Questions

1. **Requirements questions 1 to 7** at the end of `requirements.md`: where the results are shown, languages for connections, Security not a label, `shared` from imports only, analysis after loading, a separate corrections slot, and the provisional limits.
2. **Branch pattern** for code: same as 2A and 2B. Confirm or change.
3. **Approval of the spec**, and then, once 2A and 2B are built and you advance the active sub-phase to 2C, your explicit "Go" naming **C1**.
