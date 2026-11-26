# Tasks: 05 Project Understanding (Phase 2, Sub-phase 2C)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2C-UNDERSTAND` and the F5 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2C** (black-and-white wireframe, no animation, `AI_MODE=mock` only, no AI and no network). **These tasks start only after 2A and 2B are built and you have advanced the active sub-phase to 2C.**

Task ids are **C1 to C12**, so they cannot be confused with T (spec 01), M (spec 02), S (spec 03), or B (spec 04).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F5.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network, `fetch`, AI, `mockAssistant`, `aiAssistant`, or `useAssistant` import in any 2C file.
- Do not touch the files listed in design section 4.3. The only existing tests that may change are the two in `tests/store.test.ts` named in C8.
- The worked examples in design section 10 are the hand-written truth: if the code disagrees, stop and discuss before changing either.
- Reasons, log entries, and saved records hold paths, label names, specifiers, setting **names**, and fixed phrases only. Never file content lines, values, or secrets. Tests use sentinel strings to prove it.
- Hitting any limit must produce a plain-words partial reason. A limit must never silently drop data.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

Same pattern as 2A and 2B: the spec on `spec/05-project-understanding`, code on `feat/project-understanding` from the spec branch, **one commit per task**, a pull request after C12.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| C1 | F5.1 | Limits and skill-book v1 | none |
| C2 | F5.2 | Source scanner: JavaScript, TypeScript, HTML, CSS | C1 |
| C3 | F5.3 | Source scanner: basic Python | C1, C2 |
| C4 | F5.4 | File sorting | C1, C2, C3 |
| C5 | F5.5 | Connection map | C2, C3 |
| C6 | F5.6 | Analysis run, view helpers, sample expectations | C4, C5 |
| C7 | F5.7 | Understanding state and actions, store slice | C6 |
| C8 | F5.8 | The `classifying` stage in the loading run | C6, C7 |
| C9 | F5.9 | Saved corrections and controller | C7, 2B (`repoKeyOf`) |
| C10 | F5.10 | Section components | C6 |
| C11 | F5.11 | Wire into Project info, Studio, App, and default services | C8, C9, C10, 2A |
| C12 | F5 | Final gate, browser run, mutation checks, independent review | C1 to C11 |

---

## C1. Limits and skill-book v1
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.1
- **scope:** `src/config/understandingLimits.ts`, `src/skillbook/types.ts`, `src/skillbook/sortSkills.ts`, `src/skillbook/index.ts`, `tests/skillbook.test.ts`
- **goal:** Build design sections 4.1 (limits) and 6 (the 31 sort skills, including the Python names). Export `SKILLBOOK = { version: 1, sort: [...] }` and `skillById(id)`. Each skill has `id`, `title`, `strength`, `label` (an existing `FileClassification`), `family`, `explain`.
- **acceptance:**
  - Ids are unique, match `/^sort\.[a-z-]+\.[a-z-]+$/`, and every `label` is in the existing label set. The table in design section 6 and the data match row for row (the test lists the expected ids, strengths, and labels by hand).
  - Every `explain` is 1 to 2 sentences, at most 220 characters, and contains none of a banned jargon list (`regex`, `AST`, `heuristic`, `token`, `parse`, `boilerplate`, `idempotent`, `namespace`).
  - `skillById` returns the skill for each id and `undefined` otherwise. The skill-book is frozen (mutation throws in strict mode).
  - `understandingLimits.ts` holds the design values (2,000 files, 200 per file, 5,000 edges, 20,000 results, 40 per batch, 8,000 ms, 500 corrections, 64 KB) and `provisional: true`.
  - The skill-book files import nothing from React, stores, the engine, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/skillbook.test.ts`

## C2. Source scanner: JavaScript, TypeScript, HTML, CSS
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.2
- **scope:** `src/engine/sourceScan.ts`, `tests/sourceScan.test.ts`
- **goal:** Build design section 7.1: `scanSource(path, content)`, which dispatches by extension (`.py` is dispatched to `scanPython`, a stub that returns `unsupported: true` until C3), and holds the JavaScript, TypeScript, HTML, and CSS scanners.
- **acceptance:**
  - Each extraction kind from requirements R4.2 on fixtures in `.js`, `.ts`, `.tsx`, `.jsx`, `.mjs`, `.html`, and `.css`: static and re-export imports, `require`, dynamic `import('...')`, `fetch` with and without `method`, `axios` forms, `XMLHttpRequest.open`, template addresses (kept with the `${...}` marker), route calls on `app` and `router` and on an identifier assigned from `express.Router()`, mounts, `process.env.NAME`, `process.env['NAME']`, `import.meta.env.NAME`, and `script`, `img`, and stylesheet `link` tags.
  - **Decoys are ignored:** the same text in `//` and `/* */` comments, inside a string that is not the target, inside an HTML comment, and `axios.get('/x')` is not a route definition.
  - Line numbers are 1-based and correct on a multi-line fixture, including after block comments that span lines.
  - A value after `=` in `process.env.X = 'secret-value'` never appears in any output field (sentinel test).
  - Alias imports (`@/x`, `~/x`, `#x`, `$lib/x`) are reported in `aliasImports`, not in `imports`.
  - A file type that is not scanned (for example `.go`, `.php`, `.java`) returns `unsupported: true` and nothing else.
  - **Hostile input:** a 200 KB line of one repeated character, 200 KB of repeated `import `, 200 KB of repeated `fetch(`, and 200 KB of unbalanced quotes and `/*` each finish in under 1 second. A seeded fuzz of 500 random strings never throws. Results per file stop at 200 and report that the per-file limit was reached.
  - No output field contains a line of the source (every returned string is a specifier, address, name, method, or marker no longer than 250 characters).
  - The file imports nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/sourceScan.test.ts`

## C3. Source scanner: basic Python
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.3
- **scope:** `src/engine/sourceScanPy.ts`, `src/engine/sourceScan.ts` (replace the `.py` stub with the real call), `tests/sourceScanPy.test.ts`
- **goal:** Build design section 7.2: `scanPython(path, content)` returning the same output shape as `scanSource`.
- **acceptance:**
  - Imports: `import a.b`, `import a.b as c`, `from a.b import c, d`, `from . import x`, `from .x import y`, `from ..x import y`, with the dotted module, imported names, and number of leading dots. An `import` line inside a `#` comment, inside a triple-quoted string, or in the middle of a line is ignored.
  - Bindings and routes: `@app.route('/p', methods=['GET','POST'])` gives one route per method, `@app.route('/p')` gives one route with no method, `@bp.get('/p')`, `@router.post('/p')`, and a decorator on an identifier that is **not** bound to `Flask`, `Blueprint`, `FastAPI`, or `APIRouter` is not a route.
  - Prefixes: `Blueprint('n', __name__, url_prefix='/p')`, `APIRouter(prefix='/p')`, `app.register_blueprint(bp, url_prefix='/q')`, and `app.include_router(router, prefix='/q')`, with the target bound in the same file or imported.
  - Calls: `requests.get|post|put|patch|delete('...')`, `httpx.get('...')`, `requests.request('PUT', '...')`, `urllib.request.urlopen('...')`, a literal address, an f-string address with `{...}` kept as the unknown marker, and an external `https://` address.
  - Config reads: `os.environ['NAME']`, `os.environ.get('NAME')`, `os.getenv('NAME')`, names only; a value after `=` never appears (sentinel test).
  - A `urls.py` containing `path(` sets `djangoUrlFilesSeen`; its routes are not extracted.
  - **Hostile input** and fuzz as in C2 finish in under 1 second and never throw. No output field contains a source line.
  - The files import nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/sourceScanPy.test.ts tests/sourceScan.test.ts`

## C4. File sorting
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.4
- **scope:** `src/engine/sortFiles.ts`, `tests/sortFiles.test.ts`
- **goal:** Build design section 8: `sortAll(files, scans, manifestFacts, edges?)`, the confidence rule, the suppression rule, the Low-label drop, evidence building, the second pass, and the per-file failure guard. Exports `manifestFactsFrom(files)`, which reads the root `package.json` and `requirements.txt` dependency names.
- **acceptance:**
  - A table test of the confidence rule over every combination of up to two strong, two moderate, and two weak hits for one label, checked against R1.4.
  - Each skill in the skill-book has at least one positive fixture test that produces its label with its id in the evidence, including the Python names (`flask`, `fastapi`, `sqlalchemy`, `requests`), `test_*.py`, `conftest.py`, and `requirements.txt`.
  - `.js` and `.ts` files with no other clue get `unknown`, Low, Needs Review. A `.js` file under `server/` gets backend. A `.js` file that uses `document.` gets frontend. A `.py` file gets backend from `sort.ext.server-lang` only as a moderate clue.
  - The suppression rule: a `tests` file that imports `fs`, and a `configuration` file that imports `node:path`, do not also get `backend`. A strong `frontend` import is not suppressed by a weak folder clue.
  - A Low label is dropped next to a Medium label. A file whose only label is Low stays and is Needs Review.
  - Multi-label: a file with a strong frontend clue and a strong backend clue keeps both with separate reasons.
  - Path-only files never use content skills and end with the "Not read; sorted by its path and type." line. A path-only image is High.
  - Ignored entries (each policy reason) get no labels, `ignored: true`, and are not Needs Review.
  - **Shared:** `sort.ref.loaded-by-html` and `sort.ref.shared` run only in the second pass, only from the given Confirmed edges. `shared` is never given by anything else: a folder named `shared/`, a file named `common.ts`, `utils.ts`, or `shared.py` each get no `shared` label. The reason lists up to three importers in path order.
  - Same input twice, and with the input arrays reversed, gives deeply equal output. Evidence order is fixed.
  - Every label has at least one evidence record, and no description contains a source line (sentinel test) or more than 120 characters of detail. A specifier containing a secret fixture (`ghp_` plus 36 characters) appears as `[REDACTED:...]`.
  - A throwing scan input for one file marks that file Needs Review with "Could not be analysed." and does not stop the others.
  - The file imports nothing from React, stores, or the network, and decides no label outside the skill-book (a test checks that every emitted evidence id exists in `SKILLBOOK`).
- **verify:** `npm run typecheck && npx vitest run tests/sortFiles.test.ts`

## C5. Connection map
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.5
- **scope:** `src/engine/connectionMap.ts`, `tests/connectionMap.test.ts`
- **goal:** Build design section 9: `buildConnections(scans, inventoryPaths, treeComplete, limits)` returning edges, externals, the not-scanned counts, the alias count, and the partial reasons for the map.
- **acceptance:**
  - Target resolution for JavaScript: `./a`, `./a.ts`, `./a/index.ts`, `../b`, a `.js` specifier that resolves to a `.ts` and to a `.tsx` file, a root-relative target, a missing target. Alias imports are counted, not resolved.
  - Python resolution: `import a.b.c` and `from a.b import c` from the root and from `src/`, the submodule-first rule, relative forms with one and two dots, an unresolved relative import (Broken with a complete tree, Inferred with the note when incomplete), and an unresolved absolute import (an external name with the note "external package or standard library", no edge).
  - Certainty for `imports` and `loads`: Confirmed when resolved; Broken when missing and the tree is complete; Inferred with the note when missing and the tree is incomplete.
  - Routes: a root `api/name.ts` gives `/api/name` with no method, `pages/api/a/b.ts` gives `/api/a/b`, `app/api/x/route.ts` gives `/api/x` with its exported methods, a code route on `router`, a mount through `require('./routes/x')` and through a default `import`, a Flask `Blueprint` with `url_prefix` registered with another prefix, and a FastAPI `include_router` prefix. An unmounted router keeps its path and the note "mount path unknown".
  - Calls: a literal call that matches a route is Confirmed (including a concrete value on a `:id` segment); a `${...}` or f-string call that matches is Inferred; a call with no match is Broken when the repository has at least one route; the same call is Inferred with the "No backend routes were found" note when the repository has none; a method mismatch is Broken with the note "method differs"; a route with no callers produces no Broken edge; an external `https://` address becomes `calls_external` with the host only; a Python `requests` call matches a Python or JavaScript route.
  - `reads_config` records names only. Externals: scoped and unscoped names, deduplicated and sorted.
  - **Limits:** with small injected limits, the 2,000-file, 200-per-file, and 5,000-total bounds each keep what was found, set `partial`, and add their own plain-words partial reason with the amount missing, in the fixed order of design section 11.1. Edge order is deterministic (the same input reversed gives the same output).
  - Files of unsupported types are counted per extension in `notScanned`. No edge holds a source line. The file imports nothing from React, stores, or the network.
- **verify:** `npm run typecheck && npx vitest run tests/connectionMap.test.ts`

## C6. Analysis run, view helpers, and the sample expectations
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.6
- **scope:** `src/engine/analyzeProject.ts`, `src/engine/understandingView.ts`, `tests/analyzeProject.test.ts`, `tests/understandingView.test.ts`, `tests/analyzeSamples.test.ts`
- **goal:** Build design sections 11.1 and 5 (`applyCorrections`, `summarize`, `filterFiles`, `filterEdges`, `AREA_OF_LABEL`, `HELPER_OF_LABEL`, `labelName`).
- **acceptance:**
  - **Samples:** `analyzeSamples.test.ts` writes out, as plain data, every row of the three tables and every edge in design section 10, builds each sample with `buildSampleSnapshot`, runs `analyzeProject`, and compares exactly (labels, confidence, the skill ids present in the evidence, edge kind, from, line, target, certainty, note, externals, Needs Review list, ignored list, `partial: false`, empty `partialReasons`). Any difference is reported and **not** fixed by editing the expectations without your approval.
  - **Run:** with a fake `yieldToMain`, a repository of 120 files yields at least 3 times and reports progress `done` and `total` through `onProgress`; an aborted run rejects with an abort error and returns nothing; a fake clock past the limit gives a partial result with the time reason and the files not done listed as Needs Review with "Not analysed: time limit."; each other limit (files, per file, connections, results) gives its own plain-words reason in the fixed order; one file whose scan throws is isolated; the snapshot object is not mutated (deep-freeze test); no network (the global `fetch` is replaced with a function that throws).
  - **Views:** `applyCorrections` replaces labels, sets High and `needsReview: false`, adds the "Set by you." evidence while keeping the earlier reasons under a separate field, ignores a correction for a missing path; `summarize` counts match a hand-written fixture (areas, helper groups, Needs Review, Ignored) and returns `'pending'` for Security in every case (never a number); `shared` counts in both Frontend and Backend; the filters return the expected rows; `labelName` gives the plain names for all nine selectable labels.
  - The files import nothing from React or stores, and `analyzeProject` imports no network or AI module.
- **verify:** `npm run typecheck && npx vitest run tests/analyzeProject.test.ts tests/understandingView.test.ts tests/analyzeSamples.test.ts`

## C7. Understanding state and actions
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.7
- **scope:** `src/store/understandingSlice.ts`, `src/store/understandingActions.ts`, `src/store/useStudioStore.ts` (add `understanding` only), `tests/understandingState.test.ts`
- **goal:** Build design section 11.3. `StudioState` gains `understanding`. The actions that already clear `ai` and `work` also clear `understanding`. (The classify-stage actions and the `completeIngestion` argument come in C8.)
- **acceptance:**
  - **Existing tests still pass with no edits** (`store`, `aiState`, `workStore`, `workActions`, and the 2A tests), and `initialState().understanding` equals `idleUnderstanding()`.
  - Every transition: begin, progress, complete, fail, cancel, set, remove, clear. A stale `runId` changes nothing (same object). A complete or progress for another snapshot id changes nothing. A cancel returns `idle` with no result.
  - The log entries `understanding_started`, `understanding_done` (with the "Partial result." suffix when partial), `understanding_failed`, `label_corrected`, `label_reset`, and `labels_cleared` have the expected text and status. They contain paths, counts, and label names only (sentinel tests for a content line and a secret fixture).
  - Setting labels does not touch `status`, `result`, or `runId` and does not start a run. Setting an empty list removes the correction. `unknown` is rejected. **The 501st new correction is refused** with "Correction limit reached (500). Remove one to add another." and nothing is dropped; changing an existing correction at the limit still works.
  - The state clears (including corrections in memory) on snapshot replacement, `reset`, and foreground cancel, like `ai` and `work`.
  - The state survives `JSON.parse(JSON.stringify(...))` for `corrections`. The slice file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/understandingState.test.ts tests/store.test.ts tests/aiState.test.ts tests/workStore.test.ts`

## C8. The `classifying` stage in the loading run
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.8
- **scope:** `src/types/contracts.ts` (the `NOT_YET_AVAILABLE_STAGES` constant only), `src/store/useStudioStore.ts` (stage, progress, and completion changes only), `src/hooks/useIngestion.ts`, `src/components/LoadingScene.tsx`, `tests/store.test.ts` (exactly two tests), `tests/classifyStage.test.ts`
- **goal:** Build design sections 11.2 and 4.2. `NOT_YET_AVAILABLE_STAGES` becomes `['preparing_preview']`. `useStudioStore.ts` makes `classifying` `pending` in `freshStages()`, adds `classifyProgress` to `IngestionState`, adds `beginClassifying`, `classifyProgressed`, and `finishClassifying`, and gives `completeIngestion` the optional understanding argument. `useIngestion.ts` runs the stage with the same `AbortController`, loads corrections through the optional `loadCorrections` service, calls the optional `analyze` service, and completes in one update. `LoadingScene.tsx` lists "Classify files" after "Load source files" and shows "(N of M files)".
- **The two tests that change** (and nothing else in existing tests): (1) "marks classifying and preparing_preview as not available and the rest pending" now expects `classifying: 'pending'` and `preparing_preview: 'not_available'`; (2) "never changes the two stages that do not exist yet" now covers `preparing_preview` only. The report shows both diffs.
- **acceptance:**
  - **All other existing tests pass with no edit**, including `tests/useIngestion.test.ts` (whose fake services have no `analyze`, so the stage is `skipped` and behavior is as before).
  - With fake services: a successful run goes `loading_sources` done, then `classifying` active with progress `done` and `total`, then `classifying` done, then Studio, with the snapshot, the result, and the restored corrections in the **same** store update (no state exists with a snapshot and a missing result).
  - A failing `analyze` (not an abort) sets `classifying` to `failed`, still completes loading, stores `understanding.status = 'failed'` with the message, and writes the `understanding_failed` log entry.
  - Cancel during classify, and `dispose` during classify, abort the analysis, leave no snapshot and no result, and return the experience to Start (or keep Studio for a background run).
  - A stale `runId` changes nothing for each new action (same object). `finishClassifying` never fails the ingestion run.
  - A background (scoped) run keeps the old snapshot and result visible until the new completion.
  - A missing `analyze` or `loadCorrections` service is skipped without error. `loadCorrections` throwing is treated as "none".
  - The Loading screen markup (server render) lists the stages in the order Resolve branch, Fetch file tree, Load source files, Classify files, Prepare preview, shows "Classify files" as in progress with "(N of M files)" when `classifyProgress` is set, and still shows Prepare preview as "not available yet".
  - The server pipeline files and `/api/repo` are unchanged (checked by `git diff --stat` in the report).
- **verify:** `npm run typecheck && npx vitest run tests/classifyStage.test.ts tests/store.test.ts tests/useIngestion.test.ts tests/understandingState.test.ts && npm run build`

## C9. Saved corrections and controller
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.9
- **scope:** `src/store/correctionsStorage.ts`, `src/hooks/useUnderstanding.ts`, `tests/correctionsStorage.test.ts`, `tests/understandingController.test.ts`
- **goal:** Build design sections 12 and 13.
- **acceptance:**
  - **Storage:** a valid record round-trips; each bad variant (missing, bad JSON, over 64 KB, wrong version, unknown field, an unknown label, more than 500 paths, a path over 250 characters, more than 9 labels) gives no corrections with no throw; a different repository key restores nothing and leaves the stored text untouched until the user's first change; paths missing from the new snapshot are dropped; blocked, throwing, and full storage never throw; the saved text contains only the allowed fields (sentinel test).
  - **Controller (fake storage, fake `analyze`, fake yield):** `run` re-analyses the loaded snapshot once and reports progress; `cancel` returns to `idle`; `run` after cancel starts again; a second `run` while running is ignored; replacing or clearing the snapshot aborts a running re-analysis; `setLabels`, `removeCorrection`, and `clearCorrections` update the state, the log, and the storage; `setLabels` returns the limit message for the 501st correction; **loading a snapshot (even with restored corrections) never writes the slot**; Back to Start keeps the slot and a reload of the same snapshot restores the corrections; loading another repository starts with none and replaces the slot only at the user's first change; `dispose` aborts the run, unsubscribes, and ignores later results.
  - Corrections never start an analysis and never change the result (deep equality of `result` before and after).
  - The files import no `fetch`, AI, or `mockAssistant` module (source-text check). `useUnderstanding.ts` uses `repoKeyOf` from 2B.
- **verify:** `npm run typecheck && npx vitest run tests/correctionsStorage.test.ts tests/understandingController.test.ts`

## C10. Section components
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.10
- **scope:** `src/components/UnderstandingSection.tsx`, `src/components/FileLabelsTable.tsx`, `src/components/LabelEditor.tsx`, `src/components/ConnectionsTable.tsx`, `src/styles.css` (append the 2C block only), `tests/understandingUi.test.tsx`
- **goal:** Build design section 14 as components that take props only.
- **acceptance:**
  - With `react-dom/server` and the hand-written result of the full-stack sample: the section shows the heading, the state line, the summary table, a Needs Review block (open only when it has entries), and closed blocks for Files, Connections, and "What was and was not scanned" (each a `details` element without the `open` attribute), with the Files rows, the "Confirmed" word, and `express` present in their markup.
  - **The summary's Security row reads "pending scan (2D)"** and no number appears in that row. No markup anywhere in the section contains "Security: 0".
  - States: `running` shows "Analysing N of M files." and a Cancel button; `failed` shows the message and Try again; `idle` after cancel shows Run again; a partial result shows the "Partial result: ..." line with every reason and lists them in the scanned block; no snapshot shows nothing.
  - A row for a `.go` file shows "connections not scanned for this language"; the scanned block lists extensions and counts and the Django line when it applies.
  - A corrected row shows the user's labels, High, "Set by you.", and the earlier reasons under "Before your change". **Clear my label corrections** appears only when a correction exists. A refused 501st correction shows its message.
  - `LabelEditor` has one checkbox per selectable label with plain names and no `unknown`, Save, Cancel, and Remove my change only when a correction exists. Checked boxes match the current labels.
  - Each table sits in a box with a maximum height and its own scroll; tables have header cells; a markup-looking path or reason (`<img src=x onerror=alert(1)>`) is escaped.
  - Static checks on the new files and the CSS block: no `dangerouslySetInnerHTML`, no color value other than `#000` and `#fff`, no `transition`, no `animation`, no certainty shown only by style. Every new file carries an `@node: F5.10` tag.
  - Browser behavior is **not** claimed here. It is verified in C12.
- **verify:** `npm run typecheck && npx vitest run tests/understandingUi.test.tsx`

## C11. Wire into Project info, Studio, App, and the default services
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5.11
- **scope:** `src/components/ProjectInfo.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/hooks/useIngestion.ts` (default services only), `src/styles.css` (only to fix a class from C10), `tests/understandingUi.test.tsx` (append wiring tests)
- **goal:** Build design section 4.2. `ProjectInfo` renders `UnderstandingSection` between the coverage panel and the inventory. `App` calls `useUnderstanding()` and passes the actions down through `StudioLayout`. The default ingestion services get `analyze` (the real `analyzeProject` with the real yield) and `loadCorrections` (the real storage).
- **acceptance:**
  - **The existing suite passes with no existing test edited** apart from the two changed in C8, including the 2A shell tests and the 2B harness tests.
  - With a seeded store and `react-dom/server`: the Studio markup contains the section after the Sandbox placeholder and the coverage heading and before the inventory heading, for a loaded snapshot with a finished result, and for the idle, running, and failed states.
  - Screens 4 and 5 and the toolbar are unchanged.
  - The default ingestion services call `analyze` and `loadCorrections` exactly once per successful run (fake-based test of the default wiring factory).
  - `ProjectInfo` and `StudioLayout` import no engine module they did not import before, apart from types.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## C12. Final gate and independent review
- **plan_id:** P2C-UNDERSTAND  **node_id:** F5
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts live outside the repo and are deleted afterwards. `README.md` (a short section on project understanding) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase and its Phase 2C gate.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2B baseline.
  2. Static checks: no new dependency; no network, AI, or `mockAssistant` import in any 2C file; no color other than `#000` and `#fff`; no `transition` or `animation`; every new file tagged; every emitted evidence id exists in the skill-book; the diff of existing tests shows only the two named tests.
  3. Mutation checks (break, see tests fail, restore): the confidence rule, the Low-label drop, the suppression rule, "extension alone never labels `.js` and `.ts`", the `shared`-only-from-references rule (including a `shared/` folder decoy), the Broken versus Inferred rule for a missing backend, the route-mount prefix (JavaScript and Python), the comment and string decoys in both scanners, the secret redaction in reasons, each partial reason, the 500-correction refusal, the "loading never writes the slot" rule, the repository-key check, the one-update completion, and the abort handling in the classify stage.
  4. Timing: the hostile-input tests, and a synthetic repository of 2,000 files with 200 KB each, stay inside the 8 second limit, produce a Partial result with a reason when slow, and keep the page responsive.
  5. Browser run (headless Chromium on the built app) of every item in requirements section 6, item 13: the three samples against the hand-written tables; a Python fixture repository; a Go or PHP file marked "connections not scanned for this language"; the Loading screen with "Classify files" after "Load source files"; Cancel during classify; the section below the Sandbox with its blocks collapsed by default; Security reading "pending scan (2D)"; a forced small limit showing the Partial line with its reason; the label editor; refresh, load the same sample, and see the correction restored; Clear my label corrections; Cancel then Run again; one small public repository; 375 px; zero console errors; AI Chat and the 2B commands still work.
  6. Independent behavioral review with `semantic_reviewer`, focused on guessed labels, honesty of the Confirmed, Inferred, and Broken words, the partial reasons, saved-data hygiene, the loading-flow change, and the 2C scope rules. Fix findings only with your approval.
  7. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the fourteen acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2C passes its gate: no guessed labels, and low-confidence files go to Needs Review. Advancing to 2D stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 Sorting every file | C4, C6 |
| R2 Clues | C1, C2, C3, C4 |
| R3 Corrections | C6, C7, C9, C10 |
| R4 Connection map | C2, C3, C5, C6 |
| R5 Analysis run (the `classifying` stage) | C6, C8, C9, C11 |
| R6 Project understanding section | C10, C11 |
| R7 Skill-book | C1, C4 |
| R8 Wiring | C7, C8, C11 |
| R9 Saved corrections | C7, C9 |
| R10 Safety, privacy, resources | C1 to C11, C12 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Skill-book | C1 |
| 2. Source scanner | C2, C3 |
| 3. Sorting | C4 |
| 4. Connections | C5 |
| 5. Samples | C6 |
| 6. Analysis run and classify stage | C6, C8 |
| 7. State and corrections | C6, C7 |
| 8. Storage | C9 |
| 9. Controller | C8, C9 |
| 10. Components | C10, C11 |
| 11. Static checks | C1 to C11, C12 |
| 12. Regression | C7, C8, C11, C12 |
| 13. Browser run | C12 |
| 14. Phase 2C gate | C12 |

## Questions

1. **Requirements questions A to E** at the end of `requirements.md`: the stage order on the Loading screen, the two changed store tests, slower loading for big repositories, analysis failure not blocking loading, and the basic scope of Python.
2. **Branch pattern** for code: same as 2A and 2B. Confirm or change.
3. **Approval of the spec**, and then, once 2A and 2B are built and you advance the active sub-phase to 2C, your explicit "Go" naming **C1**.

---

## Build report (sub-phase 2C, as built)

Copied from `PHASE_2_REPORT.md` at the repository root, which also has the summary table and the Phase 2 exit evidence. Numbers are real command output; **Unverified** items say why.


**What was built.** An offline analysis runs as the "Classify files" loading stage.
- Every file gets labels, a confidence, and plain reasons.
- Files with no clue go to **Needs Review** instead of being guessed.
- A connection map lists imports, page loads, routes, API calls, outside calls, and setting reads. Each is marked Confirmed, Inferred, or Broken.
- You can correct labels. Corrections are saved per repository (`patchbay.corrections.v1`, paths and label names only).

**Files.** Created:
- `src/skillbook/{types,sortSkills,index}.ts`
- `src/config/understandingLimits.ts`
- `src/engine/{sourceScan,sourceScanPy,scanTypes,sortFiles,connectionMap,analyzeProject,understandTypes,understandingView}.ts`
- `src/store/{understandingSlice,understandingActions,correctionsStorage}.ts`
- `src/hooks/useUnderstanding.ts`
- 4 components, 12 test files

Changed: `useIngestion.ts`, `LoadingScene.tsx`, `ProjectInfo.tsx`, `StudioLayout.tsx`, `App.tsx`, and two named tests in `tests/store.test.ts`.

**Results.**
- 48 files, 1,303 tests. Build 477.73 kB (145.51 kB gzip).
- 9 mutations killed, 1 equivalent.
- Browser run 24 of 24.
- 11 of 12 review findings fixed. The 12th (area counts include Low labels) follows the spec text.

**Unverified.** A real GitHub repository load. The browser runs use fixtures and samples.
