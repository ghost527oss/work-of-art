# Requirements: 05 Project Understanding (Phase 2, Sub-phase 2C)

Sources: steering `build-phases.md` (Phase 2 text, sub-phase 2C and its gate); the approved Phase 2 blueprint (section 1: skill-book brain, section 2: smart file sorting, section 3: project connection map); specs 01 to 04 (what is built or specified); your answers so far (offline first, no AI tokens, honest about uncertainty, never save secrets).
Active product phase: **Phase 2, Sub-phase 2C**. Black-and-white wireframe only, no animation, `AI_MODE=mock` only, no new runtime dependency, **no AI call and no network call**. **This spec assumes 2A and 2B are built and approved.**

**Approved answers (2C interview):** results go in Project info below the Sandbox; connections are scanned for JavaScript, TypeScript, HTML, CSS, and basic Python; Security stays out of 2C and is shown as "pending scan (2D)", never as 0; Shared comes only from real import proof; the analysis runs as the real `classifying` stage of the Loading screen; corrections are saved for one repository at a time and cleared by a button (and by Reset session in 2G); the limits are 2,000 files, 5,000 connections, 8 seconds, and 500 corrections, and hitting any limit must clearly mark the result as partial.

## 1. Purpose

2C teaches PatchBay to **understand the loaded project without any AI**: what role each file plays, how sure it is and why, and how the files connect to each other. 2D (the scanner and Skeleton Crew) builds on these results.

In simple words: PatchBay reads the files it loaded, puts each one in a box (Frontend, Backend, and so on), writes down the clue that made it choose, and draws the real links between files. If it isn't sure, it says so and asks you. You can fix any label, and PatchBay remembers your fix.

## 2. Scope

### In scope
- **File sorting:** every file in the repository's inventory gets a result: one or more **labels**, a **confidence** (High, Medium, Low), and a list of **reasons** in plain English. Not sure means **Needs Review**.
- **Project clues:** project setup files (such as `package.json`) and file contents (imports and code patterns) are used where the file was loaded. Other files are sorted by path and type only, and say so.
- **User corrections:** you can set the labels for any file. The correction replaces the label, is written to the session log, and is saved in the browser.
- **The connection map:** real links between files: which file imports which, which page loads which script or style, which file calls which API address, which file defines which backend route, and which files read which settings (names only). Each link is **Confirmed**, **Inferred**, or **Broken**.
- **The skill-book (first version):** a built-in table of sorting skills. Every reason shown to the user names the skill that produced it. 2D adds the scanning skills to the same book.
- **A "Project understanding" section** in the Studio's left area (inside Project info), with a summary, a Needs Review list, a file table with a label editor, a connections table, and an honest coverage note.
- **The real `classifying` loading stage:** the analysis runs on the Loading screen after the source files are loaded and before the Studio opens, with its own progress text.
- Tests, a browser check, and `traceability/PLAN.md` entries.

### Out of scope (later sub-phases or phases)
- Finding bugs, security problems, and layout problems, and the four-area scanner (2D). **Security is not a file label** in 2C, because it cuts across files and belongs to the scanner.
- The four-area Skeleton Crew map and Screens 4 and 5 content (2D). They will read 2C's results.
- Sandbox preview, Edit pad (2E). Journal lessons and export (2F). Session restore (2G).
- Any AI suggestion for labels (`ai_suggestion` evidence is not produced).
- Following path aliases (such as `@/`), reading `tsconfig` paths, following Django URL files, and extracting connections from languages other than JavaScript, TypeScript, HTML, CSS, and Python (Go, PHP, Java, and the rest are sorted by path and type only and shown as "connections not scanned for this language").
- Colors, themes, animation (Phase 4). Live AI (Phase 3).

## 3. Glossary

- **Label:** the role of a file. The existing set: `frontend`, `backend`, `shared`, `api_data`, `assets`, `configuration`, `tests`, `documentation`, `infrastructure`, and `unknown`. A file can have several.
- **Area:** one of the four repair areas, Frontend, Backend, Security, and APIs & Data. In 2C, `frontend`, `backend`, and `api_data` map to their areas and `shared` maps to Frontend and Backend. **Security gets no files in 2C.**
- **Helper group:** a supporting group shown next to the areas: Images and fonts (`assets`), Tests (`tests`), Settings (`configuration`, `infrastructure`), and Docs (`documentation`).
- **Confidence:** High, Medium, or Low (the existing `high`, `medium`, `low`).
- **Reason (evidence):** one plain-English sentence plus the skill that produced it. Uses the existing evidence record.
- **Needs Review:** the file has no label, or only Low confidence.
- **Skill:** one rule in the skill-book, with an id such as `sort.ext.image`, a title, and a plain-English explanation.
- **Connection (edge):** one link from a file to another file, a route, an address, or a setting name.
- **Certainty:** Confirmed (both ends read directly from the source text), Inferred (found by a pattern or a naming rule), or Broken (one end exists and the other cannot be found).
- **Path only:** a file that was not read (not loaded, or cut short), so it was sorted by its path and type alone.
- **Correction:** the labels you set yourself for a file.
- **Partial:** the result is incomplete because a limit was reached. A partial result always says which limit and how much is missing.

## 4. Functional requirements

### R1. Sorting every file
1. THE SYSTEM SHALL produce one result for every **file** entry in the snapshot inventory (not directories). No file entry SHALL be dropped.
2. EACH result SHALL contain: the path, the labels (zero or more from the existing set), the confidence, the reasons, `needsReview`, whether it was read (`content`) or not (`path_only`), and whether it was `ignored`.
3. A label SHALL be given only when at least one skill produced it. A file with no supported clue SHALL get the label `unknown`, Low confidence, a reason that says no clue was found, and `needsReview` true. **The system SHALL NOT guess.**
4. THE SYSTEM SHALL compute the confidence of each label from the strength of its clues, using one fixed rule: **High** when at least one strong clue exists or at least two moderate clues agree; **Medium** when exactly one moderate clue or at least two weak clues exist; **Low** when exactly one weak clue exists. A **Low label SHALL be dropped** when the file also has a label of Medium or High. THE file's confidence SHALL be the lowest confidence among the labels that remain.
5. WHEN a file has no content (not loaded, truncated, or too large), THE SYSTEM SHALL use only path, type, and reference clues (never content clues), and SHALL add the reason "Not read; sorted by its path and type." A strong path or type clue (for example an image extension) may still give High, because it does not depend on the content.
6. Entries skipped on purpose (dependency folders, generated code, lock files, source maps, minified files, symlinks) SHALL be marked `ignored`, get no labels, and show the reason "Not part of the project's own code: <policy reason>." They SHALL be counted separately and SHALL NOT go to Needs Review.
7. THE SYSTEM SHALL mark `needsReview` true when the labels are empty, are only `unknown`, or the confidence is Low.
8. THE result for the same snapshot SHALL be identical on every run: sorted by path, reasons in a fixed order.

### R2. Clues
1. THE SYSTEM SHALL use these clue families, each as skills in the skill-book (R7): **extension and name** (for example images, markdown, test file names, Dockerfile), **folder** (for example `api/`, `routes/`, `components/`, `public/`, `docs/`, `tests/`), **project setup files** (the dependency names in `package.json`, the presence of `vercel.json` or `vite.config.*`), **imports** (what a loaded JavaScript or TypeScript file imports), **code patterns** (for example use of `document` or `window`; a request handler or route definition; a call to a request function with an address), and **references** (who imports the file).
2. A plain `.js` or `.ts` file with no folder, import, or pattern clue SHALL get no label from its extension alone and SHALL go to Needs Review. (These languages run on both sides, so the extension alone is not evidence.)
3. THE SYSTEM SHALL support multiple labels per file. A file that has clues for both Frontend and Backend, each Medium or better, SHALL carry both labels and one reason per clue.
4. THE label `shared` SHALL be given only by the references clue, which is real import proof: the file is imported (Confirmed edges) by at least one Frontend-labelled file and at least one Backend-labelled file, and has no stronger Frontend or Backend clue of its own. **A folder or file name (such as `shared/` or `common.ts`) SHALL NEVER give `shared`.** The reason SHALL list up to three importing paths.
5. Reasons SHALL NOT contain code lines from the project. They MAY contain the import specifier, route address, environment variable **name**, folder name, or file name that triggered the skill, each cut to 120 characters and passed through `redact()`.
6. THE SYSTEM SHALL NOT read or show the **value** of any setting, key, token, or password.

### R3. Corrections
1. THE SYSTEM SHALL let the user set the labels of any file from this set: `frontend`, `backend`, `shared`, `api_data`, `assets`, `configuration`, `tests`, `documentation`, `infrastructure`. Setting an empty set SHALL remove the correction. `unknown` is not selectable.
2. A corrected file SHALL show the user's labels, High confidence, `needsReview` false, and the reason "Set by you." (evidence source `user`). The automatic reasons SHALL stay visible below as "Before your change".
3. THE SYSTEM SHALL write a session-log entry for every set and every removal, with the path and the label names only.
4. A correction SHALL NOT trigger a new analysis. Corrections are applied on top of the analysis result.
5. THE SYSTEM SHALL save corrections (R9) and restore them when the same repository loads again. A saved correction for a path that no longer exists SHALL be dropped silently on restore.
6. THE SYSTEM SHALL provide **Clear my label corrections**, which removes all corrections for the current repository, logs it, and clears the saved record.
7. Corrections SHALL change what the Needs Review list, the summary counts, and (in 2D) the area membership show, but SHALL NOT change the connection map.

### R4. The connection map
1. THE SYSTEM SHALL extract connections only from loaded files of these types: JavaScript and TypeScript (`.js .jsx .mjs .cjs .ts .tsx`), HTML (`.html .htm`), CSS (`.css`), and Python (`.py`, basic forms only, R4.3). Every other loaded code or markup file SHALL be counted per file extension and shown as "connections not scanned for this language" in the coverage note and on each such file's row.
2. THE SYSTEM SHALL extract these kinds:
   - `imports`: static `import ... from '...'`, `import '...'`, `export ... from '...'`, `require('...')`, and `import('...')` with a string literal. A relative specifier SHALL be resolved against the snapshot inventory (the specifier, then with `.ts .tsx .js .jsx .mjs .cjs .json` added, then `/index` with those; a `.js` specifier may resolve to a `.ts` or `.tsx` file).
   - `loads`: in HTML, the `src` of `script` and `img` and the `href` of `link` that is a stylesheet; in CSS, `@import`. Only relative or root-relative targets that resolve in the inventory.
   - `defines_route`: a backend route, from file placement (a root-level `api/<name>.<ext>` gives `/api/<name>`, `pages/api/**`, `app/**/route.<ext>`) or from code (`app.get('/x'`, `router.post('/x'`, and the same for `put`, `patch`, `delete`). WHEN a file contains `<name>.use('<prefix>', <identifier>)` and `<identifier>` is bound in the same file by `require('<relative>')` or a default `import ... from '<relative>'` that resolves to an inventory file, THE routes defined in that file SHALL get `<prefix>` in front of their path, and the edge SHALL point to the mounting line. A file whose routes are never mounted this way keeps its own paths and the note "mount path unknown".
   - `calls_api`: a call to `fetch`, `axios`, `axios.<method>`, `ky`, or `XMLHttpRequest.open` whose first address argument is a string literal or a template literal that starts with a string.
   - `calls_external`: the same calls when the address starts with `http://` or `https://` (only the host name is kept).
   - `reads_config`: `process.env.NAME`, `process.env['NAME']`, and `import.meta.env.NAME` (the name only).
3. FOR Python, THE SYSTEM SHALL extract these basic forms and no others:
   - `imports`: `import a.b`, `import a.b as c`, `from a.b import c`, and relative forms `from . import x`, `from .x import y`, `from ..x import y`. A dotted module is resolved against the inventory from the repository root and from `src/` (`a/b.py` or `a/b/__init__.py`; for `from a import b`, `a/b.py` is tried before `a.py` and `a/__init__.py`). Relative forms resolve from the importing file's folder. A relative import that does not resolve is Broken (tree complete) or Inferred (tree incomplete), like JavaScript. An absolute import that does not resolve is **not** an edge: its top-level name is added to the external list with the note "external package or standard library".
   - `defines_route`: decorators `@X.route('/p', methods=[...])`, `@X.get|post|put|patch|delete('/p')`, where `X` is bound in the same file by `Flask(...)`, `Blueprint(...)`, `FastAPI(...)`, or `APIRouter(...)`. A `url_prefix=` or `prefix=` string in the `Blueprint(...)` or `APIRouter(...)` call, and a `url_prefix=` or `prefix=` string in `app.register_blueprint(X, ...)` or `app.include_router(X, ...)` where `X` is bound in the same file or imported from a file that resolves, SHALL be put in front of the route path (mount rule as R4.2). A route without `methods` accepts any method.
   - `calls_api` and `calls_external`: `requests.get|post|put|patch|delete(...)`, `httpx.get|post|put|patch|delete(...)`, `requests.request('METHOD', ...)`, and `urllib.request.urlopen(...)`, with a string literal or an f-string address (the `{...}` parts count as the unknown marker).
   - `reads_config`: `os.environ['NAME']`, `os.environ.get('NAME')`, and `os.getenv('NAME')` (the name only).
   - Comments (`#`) and the bodies of triple-quoted strings SHALL be ignored. Django URL files and decorators from other frameworks are not read, and the coverage note says "Django URL files are not followed".
4. EACH edge SHALL have: a kind, the source path, a target (a path, a route, an address, or a setting name), a certainty, a line number in the source file, and an optional short note. THE SYSTEM SHALL NOT store or show a snippet of the source line in the edge record. (The panel may show the line number only.)
5. THE certainty rules SHALL be:
   - `imports` and `loads`: **Confirmed** when the target resolves to an inventory file; **Broken** when a relative target does not resolve and the tree is complete; **Inferred** with the note "the tree is incomplete, so the file may exist" when the target does not resolve and the tree is incomplete.
   - `calls_api`: the address is compared with every route using normal routing rules, where a `:name` or `[name]` segment in the route matches any single segment of the address, and the query string and a trailing slash are ignored. **Confirmed** when the address is a plain literal and a route matches. **Inferred** when the address contains a `${...}` part (the value is unknown) and a route matches with that part treated as one segment, or when the route's path needed an unresolved mount ("mount path unknown"). **Broken** when the repository has at least one `defines_route` edge, every backend-labelled file was loaded, and no route matches. **Inferred** with the note "No backend routes were found in this repository; the route may live elsewhere." when the repository has no `defines_route` edge at all (a frontend-only repository is not broken). A known call method that differs from the known method of the only matching route SHALL be **Broken** with the note "method differs". A route file-placement route (no method) matches any method.
   - `defines_route`, `reads_config`, `calls_external`: **Confirmed** (the text is read directly). A route that no loaded file calls is NOT Broken.
6. Imports of packages (not starting with `.` or `/`) SHALL be listed as external dependencies by name, counted, and shown in the coverage note. They are not edges to files.
7. Imports that start with an alias (`@/`, `~/`, `#`, `$lib`) SHALL NOT be followed and SHALL be counted as "alias imports not followed".
8. THE SYSTEM SHALL separate proven from guessed visually **with words, not color**: the certainty column reads "Confirmed", "Inferred", or "Broken".
9. THE extractor SHALL ignore text inside comments and SHALL ignore import-like text inside string literals and template literals that are not themselves the target.
10. THE map SHALL be bounded: at most 2,000 files scanned, 200 edges per file, 5,000 edges in total. WHEN any bound is hit, THE SYSTEM SHALL keep what it has, mark the result **partial**, and record a **partial reason** that names the limit and the amount missing (R5.4).
11. THE edge order SHALL be deterministic (by source path, line, kind, target).

### R5. The analysis run (the `classifying` stage)
1. THE analysis SHALL run as the real **`classifying` stage** of the loading run. It starts after the source files are loaded (the `loading_sources` stage is done) and before the Studio opens. The stage SHALL replace the "not available yet" placeholder from spec 01 and SHALL be listed on the Loading screen **after** "Load source files", because sorting needs the loaded content.
2. WHILE it runs, THE Loading screen SHALL show the stage "Classify files" as in progress with "(N of M files)". WHEN it finishes, the stage SHALL show done, and the Studio opens with the result already in place. A scoped folder reload SHALL run the same stage in the background, and the Studio SHALL keep showing the old data until the new result is ready.
3. THE run SHALL work in batches of 40 files and hand control back to the browser between batches, so the page stays responsive. It SHALL be stopped by the same Cancel button, the same abort handle, and the same unmount cleanup as the rest of the loading run. A stopped run SHALL leave no result.
4. THE run SHALL have these limits, all provisional: 2,000 files scanned for connections, 200 connections per file, 5,000 connections in total, and 8 seconds. **WHEN any limit is reached, THE SYSTEM SHALL keep the results so far, mark the whole result Partial, and give a partial reason in plain words** such as "File scan limit (2,000) reached: 37 files were not scanned for connections.", "Connection limit (5,000) reached: later connections are missing.", "Limit of 200 connections per file reached in 3 files.", or "Time limit (8 seconds) reached: 120 files were not analysed." Files not analysed because of the time limit SHALL be listed as Needs Review with the reason "Not analysed: time limit."
5. A failure inside one file (a pattern that throws) SHALL be caught, SHALL mark that file Needs Review with the reason "Could not be analysed.", and SHALL NOT stop the run.
6. IF the whole analysis fails, THE loading run SHALL NOT fail. The stage SHALL show failed, the Studio SHALL open, and the Project understanding section SHALL show the failure message and **Try again**.
7. THE run SHALL make no network call and no AI request, and SHALL NOT change the snapshot.
8. THE result SHALL NOT be saved. Only corrections are saved. The corrections for the repository (R9.4) SHALL be loaded in the same step, so the Studio opens with them applied.
9. ONCE in the Studio, THE user MAY **Cancel** a running re-analysis or press **Run again** or **Try again**. A re-analysis runs the same analysis on the loaded snapshot without the Loading screen.

### R6. The Project understanding section
1. THE section SHALL appear inside Project info whenever a snapshot is loaded. In the left area the order from the top SHALL be: the Sandbox, then Project info with the repository header and coverage panel, then Project understanding, then the inventory. It SHALL always sit **below the Sandbox** and SHALL NOT push the Sandbox out of view.
2. IT SHALL show, in plain words:
   - the run state and progress;
   - a **summary** table: counts of files per label, per area (Frontend, Backend, APIs & Data) and per helper group (Images and fonts, Tests, Settings, Docs), plus Needs Review and Ignored. The **Security** row SHALL read "pending scan (2D)" and SHALL NEVER show a number, so it cannot look like zero problems were found;
   - the **Needs Review** list (path, what was found, and a button **Set labels**);
   - the **Files** table with filters (area or helper group, confidence, "Needs Review only", text filter on the path), showing at most 200 rows with Show more, and per row the path, labels, confidence, and the first reason, with **Why?** to show all reasons and **Set labels** to open the label editor;
   - the **Connections** table with filters (kind, certainty, text filter), at most 200 rows with Show more, showing kind, from, to, certainty, line, and note;
   - the **coverage note**: how many files were read and how many sorted by path only; how many were ignored; the file types "connections not scanned for this language" (extension and count); a line "Django URL files are not followed" when Python was scanned; the number of alias imports not followed; the list of external package names (first 20); and, when the result is Partial, the full list of partial reasons (R5.4). WHEN partial, a line "Partial result: <reasons>" SHALL also appear at the top of the section.
3. THE label editor SHALL be a small form with one checkbox per selectable label (plain names, such as "Frontend", "Backend", "Shared", "APIs & Data", "Images and fonts", "Settings", "Tests", "Docs", "Infrastructure"), **Save** and **Cancel**, and **Remove my change** when a correction exists. It SHALL work by keyboard and touch.
4. THE section SHALL use headings, tables with header cells, labelled controls, and text only: no color, no icon, no animation.
5. WHEN the analysis is `running`, THE section SHALL show the progress text and a **Cancel** button that stops the run (the result stays empty, the state returns to `idle`, and a **Run again** button appears). WHEN `failed`, it SHALL show the message and **Try again**.
6. WHEN no snapshot is loaded, THE section SHALL not appear.
7. EMPTY states: "No files need review." and "No connections were found." SHALL appear when true.
8. THE section SHALL be readable at 375 px: tables scroll inside their own box, with no horizontal page scrolling.
9. TO keep the left area neat, THE section SHALL show its heading, state, partial line, and the summary table always, and SHALL put **Needs Review**, **Files**, **Connections**, and the **coverage note** in their own collapsible blocks. Needs Review SHALL be open when it has entries and closed otherwise. Files, Connections, and the coverage note SHALL be closed by default. Each open table SHALL be at most 24 rem tall and scroll inside itself.

### R7. The skill-book (version 1)
1. THE SYSTEM SHALL hold the skill-book as typed data in the app: a version number and a list of **sort skills**, each with an id, a title, a strength (`strong`, `moderate`, `weak`), the label it supports, a plain-English explanation (one or two sentences, no jargon), and the clue family.
2. THE ids SHALL be unique and stable (for example `sort.ext.image`), and every reason shown to the user SHALL include the skill id and the explanation.
3. THE skill-book SHALL be designed so 2D can add scanning skills to the same book without changing the sorting code.
4. THE sorting code SHALL contain no label decision outside the skill-book: every label comes from a skill.
5. THE skill-book SHALL be data and code in the bundle. It SHALL NOT be fetched.

### R8. Wiring into the existing app
1. THE understanding state SHALL live in the studio store next to the AI and work state, changed only by pure whole-state actions, so one correction is one atomic update of the corrections and the log.
2. THE loading run SHALL deliver the snapshot, the analysis result, and the restored corrections to the store in **one** completion step, so the Studio never opens with a snapshot and a missing or stale result. WHEN the snapshot is replaced or cleared later, THE understanding state SHALL be cleared in memory together with it.
3. THE spec 01 loading behavior SHALL change in exactly these ways, and in no others: the `classifying` stage is real (no longer "not available yet") and is listed after "Load source files"; its status changes come from the client (the server pipeline and the `/api/repo` events are unchanged); `preparing_preview` stays "not available yet"; the loading screen shows the classify progress text. THE two existing tests in `tests/store.test.ts` that assert `classifying` is "not available" SHALL be updated to the new behavior (and only those). All other existing tests SHALL pass unedited.
4. THE ingestion services SHALL gain an **optional** `analyze` service. WHEN it is missing (as in existing tests), THE classifying stage SHALL be skipped and loading SHALL behave as before.
5. THE `reset` command of 2B stays unchanged. Corrections are cleared by **Clear my label corrections** now and by Reset session in 2G.

### R9. Saved corrections
1. THE SYSTEM SHALL save corrections under the key `patchbay.corrections.v1`, in one slot: `{ version, repoKey, savedAt, corrections }`, where `corrections` maps a path to its list of labels. The repository key is the same as in 2B.
2. THE record SHALL be strict, with at most 500 corrections, paths of at most 250 characters, and at most 9 labels per path. It SHALL contain nothing else: no reasons, no file contents, no connections.
3. THE SYSTEM SHALL save after every change the user makes to the corrections. Loading a snapshot, with or without restored corrections, SHALL NOT itself write the slot.
4. WHEN a snapshot finishes loading, THE SYSTEM SHALL restore the record only if its repository key equals the loaded repository's key, dropping paths that are not in the new inventory. A different key restores nothing and leaves the slot until the user's first change after that load, which replaces it.
5. THE **500 corrections** limit: WHEN 500 corrections exist, THE SYSTEM SHALL refuse a new one with "Correction limit reached (500). Remove one to add another." It SHALL never drop a correction silently.
6. WHEN the record is missing, unreadable, over 64 KB, from another version, or has unknown fields, THE SYSTEM SHALL start with no corrections and no error. WHEN storage is blocked or full, THE SYSTEM SHALL keep corrections in memory without an error message.
7. **Back to Start** SHALL clear corrections in memory and keep the slot.
8. **Reset session** (sub-phase 2G) SHALL clear the slot together with the other saved parts.

### R10. Safety, privacy, and resources
1. THE SYSTEM SHALL make no network call and no AI request in any 2C code.
2. THE SYSTEM SHALL render all text, including paths, reasons, and notes, as React text.
3. THE SYSTEM SHALL add no runtime dependency beyond `react`, `react-dom`, and `zod`.
4. THE SYSTEM SHALL keep the analysis within memory limits: file content is read from the snapshot and is not copied into the result; reasons are short; at most 20,000 file results (more is Partial) and 5,000 edges.
5. THE SYSTEM SHALL release the run's abort handle, its timers, and the store subscription on unmount.
6. THE analysis SHALL use no regular expression that can run for a long time on bad input (checked by a timing test on a 200 KB line of repeated characters).

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| No snapshot loaded | The section does not appear. |
| Snapshot has no file entries | "No files." and an empty summary. |
| Classify stage running (loading) | The stage shows "in progress (N of M files)". Cancel stops the whole loading run. |
| Re-analysis running (Studio) | Progress text and Cancel. The old result stays until the new one is ready. |
| Analysis fails | Loading still finishes. The stage shows failed. The section shows the message and Try again. The rest of Project info works. |
| Any limit reached (time, files, connections, per-file, results) | Partial result with a plain-words reason for each limit reached, shown at the top of the section and in the coverage note. Files not analysed because of time are Needs Review. |
| 500 corrections reached | The new correction is refused with a message. None is dropped. |
| Security area | "pending scan (2D)", never a number. |
| File type not scanned (Go, PHP, Java, and others) | Sorted by type and folder. Row and coverage note say "connections not scanned for this language". |
| A file cannot be analysed | That file only: Needs Review, "Could not be analysed." |
| No clue for a file | `unknown`, Low, Needs Review, reason says no clue was found. |
| Not read (path only) | Only path, type, and reference clues; the "Not read" reason is shown. |
| No connections | "No connections were found." |
| Relative import to a missing file, tree complete | Edge Broken. |
| Relative import to a missing file, tree incomplete | Edge Inferred with the note. |
| Saved corrections bad, old, or for another repository | None restored, no message. |
| Storage blocked or full | Corrections kept for this visit only. |
| Cancel on the Loading screen during classify | The whole loading run stops, as for any other stage. |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Skill-book tests:** unique stable ids; every skill has a title, strength, label, explanation, and clue family; the explanations contain none of a list of banned jargon words; the version is set.
2. **Source scanner tests:** each extraction kind from R4.2 on fixtures, including TypeScript, JSX, and HTML; commented-out and quoted decoys are ignored; line numbers are right; a 200 KB line of repeated characters and 200 KB of repeated `import` finish in under 1 second; a seeded fuzz of random text never throws. Python fixtures cover the forms in R4.3 (imports, relative imports, Flask and FastAPI decorators, blueprint and router prefixes, `requests` and `httpx` calls, f-string addresses, `os.environ` and `os.getenv` names), with decoys in `#` comments and triple-quoted strings.
3. **Sorting tests:** the rule of R1.4 in a table of strength combinations; every row of R1 and R2 on fixtures; `.js` and `.ts` alone go to Needs Review; path-only files use no content clue and carry the "Not read" reason; a Low label is dropped next to a Medium or High one; ignored entries; `shared` only from the references clue; multi-label files; the same snapshot twice gives identical output, and with the input order reversed; no result has a label without a reason; no reason contains a code line. A folder named `shared/` and a file named `common.ts` never give `shared`. Python import skills (`flask`, `fastapi`, `django`, `sqlalchemy`, `requests`) and `test_*.py` and `requirements.txt` are covered.
4. **Connection tests:** each kind and each certainty rule of R4.5 on fixtures, including a broken import with a complete and an incomplete tree, a literal API call that matches a file-based route, a template call that matches only by wildcard, a call with no route, a method mismatch, an external call, an environment name (never its value), alias imports not followed, bounds and the partial flag, and deterministic order. Python relative and absolute imports (an unresolved absolute import becomes an external name, not Broken), a Flask blueprint mounted with a prefix, and a `requests` call that matches it.
5. **Sample tests:** the three bundled samples (static site, React frontend, full-stack API) give exactly the labels, confidences, areas, and edges listed in the worked examples in `design.md` section 10, written out by hand in the test as plain data (not produced by the code under test).
6. **Analysis run tests:** batches yield between each other (fake yield counter), progress is reported, abort leaves no result, the time limit gives a partial result with the not-analysed files listed, a throwing file is isolated. The classify stage runs inside the loading run: progress events reach the store, Cancel aborts it, a failing analysis does not fail loading, a missing `analyze` service skips the stage and loading behaves as before, and each limit (2,000 files, 200 per file, 5,000 total, 8 seconds, 20,000 results) produces its own plain-words partial reason.
7. **State and corrections tests:** the pure actions; set, remove, and clear; a correction replaces labels and shows the earlier reasons; the log entries hold only the path and label names; stale run ids are ignored; the state clears on snapshot change; corrections do not change the connection map or trigger a run.
8. **Storage tests:** valid round trip; each bad variant gives no corrections without a throw; a different repository key restores nothing; a missing path is dropped; the 500-correction bound; blocked and full storage; the restore gate; the record holds nothing but the allowed fields.
9. **Controller tests (fake yield and storage):** a new snapshot starts one run; a replaced snapshot aborts and restarts; unmount aborts and unsubscribes; Back to Start keeps the slot; no save before restore. The loading flow delivers snapshot, result, and corrections in one store update; the saved slot is not written by loading.
10. **Component tests (server render):** the section shows summary, Needs Review, files, connections, and the coverage note for a fixture result; filters and the empty states; the label editor markup; `running` and `failed` states; certainty shown as words; no color value, no `dangerouslySetInnerHTML`, no animation. The Loading screen lists the classify stage after "Load source files" with its progress text. The summary shows the Security row as "pending scan (2D)" and never a number. Partial results show the "Partial result" line. Files, Connections, and the coverage note are collapsed by default.
11. **Static checks:** no network, `fetch`, AI, or `mockAssistant` import in any 2C file; no new dependency; every new file tagged; no label decided outside the skill-book.
12. **Regression:** the full existing suite passes, with only the two `tests/store.test.ts` tests named in R8.3 changed (and each change shown in the report). Everything else, including the spec 01 ingestion tests, specs 02 to 04, passes unedited.
13. **Browser run (headless Chromium, built app):** load each of the three samples and one small public repository; see the Loading screen show "Classify files" in progress and done after "Load source files", and the Studio open with the summary matching the hand-written expectations; check that Project understanding sits below the Sandbox and its tables are collapsed by default; load a Python fixture repository and see its imports and routes; see a Go or PHP file marked "connections not scanned for this language"; see the Security row read "pending scan (2D)"; force a limit with a small test limit and see the Partial line with its reason; Cancel on the Loading screen during classify; open Why? on a row; set labels on a file, see the count change and the log entry, refresh, load the same sample, and see the correction restored; Clear my label corrections; a Needs Review file appears for a plain `.js` fixture; the connection table shows Confirmed, Inferred, and Broken rows (use a fixture repository or a sample edited in the test); Cancel then Run again; zero console errors; black and white; no overflow at 375 px; AI Chat and the 2B commands still work.
14. **Phase 2C gate (build-phases.md):** no guessed labels; low-confidence files go to Needs Review.

## 7. Decisions and open questions

**Approved by the user (2C interview):**
1. Results go in Project info, below the Sandbox, and the toolbar stays at six buttons (R6.1, R6.9).
2. Connections for JavaScript, TypeScript, HTML, CSS, and basic Python. Other languages are marked "connections not scanned for this language" (R4.1, R4.3).
3. Security is not a 2C label. It is shown as "pending scan (2D)", never as 0 (R6.2).
4. `shared` only from real import proof, never from a folder or file name (R2.4).
5. The analysis is the real `classifying` stage on the Loading screen (R5.1).
6. Corrections are saved for one repository at a time, with a Clear button, and cleared together by Reset session in 2G (R9).
7. Limits of 2,000 files, 5,000 connections, 8 seconds, and 500 corrections, with every limit reached clearly marked as partial (R5.4, R9.5).

**New questions caused by those answers (please answer):**
A. **Stage order (R5.1).** Sorting needs the loaded file contents, so "Classify files" moves to **after** "Load source files" on the Loading screen. Approve?
B. **Two existing tests change (R8.3).** The two tests in `tests/store.test.ts` that say `classifying` is "not available yet" must be updated. Nothing else existing changes. Approve?
C. **Slower loading for big repositories (R5.4).** Loading now waits for the analysis, up to 8 seconds extra, and then shows a Partial result if the limit is hit. Approve?
D. **Analysis failure does not block loading (R5.6).** The Studio still opens and the section offers Try again. Approve?
E. **Python is basic (R4.3).** Django URL files, decorators from other frameworks, and dynamic imports are not followed, and the note says so. Approve?
