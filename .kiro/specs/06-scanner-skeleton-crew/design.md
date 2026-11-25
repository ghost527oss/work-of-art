# Design: 06 Scanner and Skeleton Crew (Phase 2, Sub-phase 2D)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2D**. Wireframe only, no animation, `AI_MODE=mock` only, no new dependency, no network, no AI. Built on 2A (screens), 2B (run machine, proposals, History, `applyUnifiedDiff`), and 2C (labels, connections, skill-book).

## 1. Decisions already made

| Source | Decision |
|---|---|
| Blueprint section 6 | Four areas, every finding needs proof (file, lines, snippet, explanation, why it matters), honest fix labels, no fake scores, live narration with Approve and Undo, scan offline first. |
| Phase 2 text, 2D gate | Every finding shows file, lines, snippet, and reason. No invented scores. |
| 2B | One run machine and one proposal slot with Approve, Reject, Undo, Redo, Stop, and Edit auto-pause. The crew reuses them. |
| 2C | Labels (with your corrections) decide which checks run. Connections feed the route-mismatch check, the links table, and the request trace. Security was left for 2D. |
| 2A | Screens 4 and 5 are empty pages with no toolbar. 2D fills them. |
| Requirements section 7 (pending your answers) | 16 checks. One automatic fix. `start crew`. Workers take turns. A command box on Screens 4 and 5. Scan when Screen 4 opens. Findings can be in several areas. Crew run is not saved. Provisional limits. |

## 2. Phase 2D compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2D) | Scanner, findings, crew run, Screens 4 and 5, command box. No sandbox, no editor, no Journal, no restore. |
| Offline skill-book scanner, no AI | Pure functions over the loaded files. No network, no AI import. |
| Browser storage never holds secrets or whole repositories | Nothing new is saved. History (2B) saves small diffs, guarded by a secret check. |
| Safe action list, chat-driven control | `start crew` and the existing 2B words. Buttons only for Stop, Approve, Reject (2B) plus scan Cancel and Scan again. |
| Black-and-white wireframe, no animation | The map is boxes and a table. The drawn web waits for Phase 4. |
| No new runtime dependency | None. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | No package. About 16 small check functions and a snippet builder. |
| 2. Memory and bundle | PASS | At most 500 findings with 12-line snippets (under 1.5 MB), no copy of file content. Bundle growth is reported against the 2C baseline. |
| 3. Free-tier resilience | PASS | No external service. Batches, an 8 second limit, and cancel keep a large repository from freezing a 4 GB laptop. |
| 4. Teardown | PASS | One `AbortController` per scan and one store subscription, released on unmount and snapshot change. The crew uses the 2B timer. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/config/scanLimits.ts` | Limits, provisional: 2,000 files, 8,000 ms, 500 findings, 50 per check, 40 per batch, 12 snippet lines, 200 characters per snippet line, 12 findings per area in the crew, 150 crew steps, crew tick 1,000 ms. |
| `src/skillbook/scanSkills.ts` | The 16 scan skills as data (section 6). |
| `src/engine/scanText.ts` | Shared helpers: line index, masked text, `lineOf(offset)`, `snippetFor(lines, first, last)` (redacted, bounded), `makeFindingId`. Pure. |
| `src/engine/scanFrontend.ts`, `scanBackend.ts`, `scanSecurity.ts`, `scanApi.ts` | The check functions by area. Each is `(file, ctx) => RawFinding[]`. Pure. |
| `src/engine/scanFix.ts` | `buildTargetBlankFix(content, finding)` and `buildFixProposal(finding, content)` with the safety conditions (section 8). Pure. |
| `src/engine/scanProject.ts` | `scanProject(snapshot, understanding, effective, options)` (batched async), `rescanPaths(result, ...)` (sync, incremental), `scanFile(...)`. |
| `src/engine/scanView.ts` | Pure view helpers: `countsBy`, `areaCounts`, `filterFindings`, `linksBetweenAreas`, `workerSlots`, `whatWasChecked`. |
| `src/engine/crewScript.ts` | `buildCrewScript(findings)` and `narrate(step, finding)`. Pure. |
| `src/store/scanSlice.ts`, `scanActions.ts` | Types, pure transitions, and whole-state actions with Log entries for the `scan` state. |
| `src/hooks/useScan.ts` | `createScanController(...)` (ensure, run, cancel) and `useScan()`. |
| `src/components/AreaMap.tsx`, `WorkerSlots.tsx`, `ScanSummary.tsx`, `WhatWasChecked.tsx` | Screen 4 parts. Props only. |
| `src/components/FindingsTable.tsx`, `FindingDetail.tsx`, `CrewNarration.tsx`, `RequestTrace.tsx`, `ChangesMade.tsx` | Screen 5 parts. Props only. |
| `src/components/CommandBar.tsx` | The one-line command box for Screens 4 and 5. Props only. |
| Tests | `scanSkills`, `scanChecks` (one group per check), `scanSecrets`, `scanFix`, `scanProject`, `scanSamples`, `scanView`, `crewScript`, `crewRun`, `crewStorage`, `scanController` (`*.test.ts`); `crewUi` (`*.test.tsx`). |

### 4.2 Modified
| File | Change |
|---|---|
| `src/skillbook/types.ts`, `index.ts` (2C) | Adds the `ScanSkill` type and `SKILLBOOK.scan`. The 31 sort skills are unchanged. |
| `src/engine/sourceScan.ts` (2C) | Exports `maskComments(path, text)` (the masking already used inside the scanner). No behavior change. |
| `src/engine/understandingView.ts` (2C) | `summarize(result, corrections, scan?)` gains an optional third argument. Without it, Security stays "pending scan (2D)". With a finished scan it returns the finding count and the partial flag. |
| `src/components/UnderstandingSection.tsx` (2C) | Shows the Security row text from the summary (still "pending scan (2D)" until a scan is done). |
| `src/engine/commands.ts` (2B) | `start` takes one optional word, `practice` or `crew`. |
| `src/store/workSlice.ts` (2B) | `Run` gains `kind`. `RunStep` gains kinds `area` and `finding` and fields `area` and `findingId`. `Proposal` gains `source` and `findingId`. The step limit depends on the kind. |
| `src/store/workActions.ts` (2B) | `runCommand` handles `start crew`. `tickRun` runs crew steps (narration, proposal from a finding, verify by re-check). `approve`, `undo`, and `redo` refresh the affected findings in the same update. |
| `src/store/workStorage.ts` (2B) | A crew run and a crew proposal are saved as `null`. The record builder checks history diffs with `containsSecret` and skips saving history with a Log line when one matches. History diffs with context lines are allowed (still at most 2,000 characters). |
| `src/hooks/useHarness.ts` (2B) | The tick delay depends on the run kind (1,200 ms practice, 1,000 ms crew). |
| `src/components/StopBar.tsx`, `ProposalCard.tsx` (2B) | "Skeleton Crew run" wording for crew runs and a crew-specific safety line on the card. |
| `src/store/useStudioStore.ts` | `StudioState` gains `scan`. The actions that clear `ai`, `work`, and `understanding` also clear `scan`. |
| `src/components/SkeletonCrewScreen.tsx`, `DomainScreen.tsx` (2A) | Replaced by the real Screens 4 and 5. |
| `src/components/StudioLayout.tsx`, `src/App.tsx` | New props and `useScan()`. |
| `src/styles.css` | A black-and-white block. |
| `traceability/PLAN.md` | Adds plan `P2D-CREW` with nodes F6.1 to F6.12. |

### 4.3 Not touched
`api/*`, all spec 01 and 02 engine files, `src/types/contracts.ts`, the 2C scanner, sorting, and connection map logic (read, not changed), `AIAssistantPanel.tsx`, `UnderstandingSection` logic except the Security row text, and every existing test except the narrowly named exceptions in the tasks (the 2B tests that assert `start` takes no argument).

## 5. Data model

```ts
type AreaId = 'frontend' | 'backend' | 'security' | 'api_data'         // from 2A AREAS
type Severity = 'high' | 'medium' | 'low'
type FixLabel = 'auto' | 'guided' | 'explanation'
type Certainty = 'found' | 'possible'

interface ScanSkill {
  id: string; title: string; primary: AreaId; also: AreaId[]
  severity: Severity; certainty: Certainty; fix: FixLabel
  explain: string; why: string; how: string[]
}

interface Finding {
  id: string; skillId: string
  primary: AreaId; areas: AreaId[]                 // primary first, then the others, no duplicates
  severity: Severity; certainty: Certainty; fix: FixLabel   // fix may be downgraded from 'auto' to 'guided' at run time
  fixNote?: string                                  // "A safe automatic fix could not be built here."
  path: string; firstLine: number; lastLine: number
  snippet: string[]                                 // redacted, at most 12 lines, never saved or logged
  extra?: string                                    // short fact such as the kind of secret ("a GitHub token") or the address
}

interface ScanResult {
  findings: Finding[]                               // sorted: severity, path, line, skill id
  coverage: {
    filesScanned: number; filesNotRead: number
    notChecked: Record<string, number>              // extension -> count of loaded files with no checks
    couldNotCheck: { path: string; skillId: string }[]
  }
  ruleCounts: Record<string, number>                // findings listed per skill
  partial: boolean; partialReasons: string[]
  labelsKey: string                                 // hash of the corrections used (for "out of date")
}

interface ScanState {
  status: 'idle' | 'running' | 'done' | 'failed'
  runId: number; snapshotId?: string
  progress?: { done: number; total: number }
  result?: ScanResult; error?: string
}
```

2B changes:
```ts
interface Run   { id; kind: 'practice' | 'crew'; status; autoAdvance; position; steps }
interface RunStep { kind: 'info'|'plan'|'propose'|'verify'|'finish'|'area'|'finding'; title; skill?; path?; area?: AreaId; findingId?: string }
interface Proposal { id; path; title; diff; source: 'practice' | 'crew'; findingId?: string }
```
Plain data. `stale` (out of date) is derived: `result.labelsKey !== hashOf(understanding.corrections)`.

## 6. The scan skills (`scanSkills.ts`) and exactly what each check looks for

All checks work on the **masked text** (comments blanked, line breaks kept, from 2C `maskComments`), and report the line range of the matched element. Patterns are anchored and length-bounded (at most 500 characters between the start and the end of a tag or call). "Applies to" is the file extension set; the engine also applies the label rule of R3.3.

| Id | Applies to | Pattern (plain description) | Notes |
|---|---|---|---|
| `scan.frontend.img-alt` | `.html .htm .jsx .tsx .vue` | `<img ...>` (up to 500 characters, may span lines) with no `alt` attribute and no `{...spread}` | Line range is the tag. |
| `scan.frontend.button-name` | same | `<button ...></button>` with only white space between, or a self-closing `<button ... />`, and no `aria-label`, `aria-labelledby`, `title`, or `{...spread}` in the tag | |
| `scan.frontend.listener-cleanup` | `.js .jsx .ts .tsx` | The file imports `react` (from the 2C scan), contains `window.addEventListener(` or `document.addEventListener(`, and contains no `removeEventListener(` | At the first `addEventListener` line. Possible. |
| `scan.backend.input-validation` | `.js .jsx .ts .tsx .mjs .cjs .py` | JavaScript: `req.body`, `req.query`, or `req.params`. Python: `request.json`, `request.args`, `request.form`, `request.get_json(`. The file contains none of: `zod`, `joi`, `yup`, `ajv`, `validate`, `validator`, `validation`, `schema`, `safeParse`, `typeof`, `isinstance`, `pydantic`, `marshmallow` | At the first request-data line. Possible. |
| `scan.backend.error-leak` | `.js .ts .mjs .cjs` | `res.send(`, `res.json(`, `res.end(`, or `res.write(` followed within 200 characters by `err.stack`, `err.message`, `error.stack`, `error.message`, `e.stack`, or `e.message` | |
| `scan.backend.sql-concat` | `.js .ts .mjs .cjs .py` | A call `.query(`, `.execute(`, `.executemany(`, `.raw(`, or `.run(` whose first argument is a string or template that contains `SELECT`, `INSERT`, `UPDATE`, `DELETE`, or `WHERE` (any case) and is built with `+`, a `${...}`, `%`, `.format(`, or an f-string prefix | Explanation names the building method. |
| `scan.backend.no-auth-limit` | the whole repository | At least one `defines_route` edge from 2C with a known write method (POST, PUT, PATCH, DELETE), and no loaded `.js .ts .mjs .cjs .py` file whose masked text contains a word starting with `auth`, `passport`, `jwt`, `jsonwebtoken`, `session`, `login`, `bearer`, `ratelimit`, `rate-limit`, `rate_limit`, `limiter`, `throttle`, `helmet`, or `csrf` (any case) | One finding at the first write route (edge order). Possible. |
| `scan.api.route-mismatch` | the 2C connections | Each `calls_api` edge whose certainty is Broken | Path and line from the edge. The note from the edge ("method differs") goes in `extra`. |
| `scan.security.hardcoded-secret` | code and config types (`.js .jsx .ts .tsx .mjs .cjs .py .html .htm .css .json .yml .yaml .toml .ini .sh` and names starting `.env`) | `redact(line)` reports a match for one line, or a line matches `-----BEGIN ... PRIVATE KEY-----` | `extra` names the kind in plain words ("a GitHub token"). The value is never stored: the snippet is the redacted text. |
| `scan.security.dangerous-html` | `.js .jsx .ts .tsx .html .htm .vue` | `dangerouslySetInnerHTML`, `.innerHTML =` (not `==`), `insertAdjacentHTML(`, `document.write(`, `document.writeln(`, or `v-html` | |
| `scan.security.eval` | `.js .jsx .ts .tsx .mjs .cjs .html .htm .py` | `eval(`, `new Function(`; Python `eval(` or `exec(` | |
| `scan.security.target-blank` | `.html .htm .jsx .tsx .vue` | `<a ...>` (up to 500 characters) with `target="_blank"` (or `'_blank'`) whose `rel` is missing or has no `noopener` | The Auto-supported check. |
| `scan.security.cors-wildcard` | `.js .ts .mjs .cjs .py` | `Access-Control-Allow-Origin` set to `'*'`, `origin: '*'`, `cors()` with no arguments, Python `CORS(app)` with no options, or `allow_origins=['*']` | |
| `scan.security.env-file` | the inventory paths | A path whose base name is `.env` or starts with `.env.` and does not end with `.example`, `.sample`, `.template`, or `.dist` | Works for files that were not read. No snippet. |
| `scan.api.fetch-no-ok-check` | `.js .jsx .ts .tsx .mjs .cjs` | `fetch(` and `.json()` or `.text()` in the same file, and no `.ok` and no `.status` anywhere in the file | At the first `fetch(`. Possible. |
| `scan.api.insecure-url` | `.js .jsx .ts .tsx .mjs .cjs .py` | A request call (`fetch`, `axios`, `axios.<m>`, `ky`, `requests.<m>`, `httpx.<m>`, `urlopen`) whose first argument is a string starting `http://` and the host is not `localhost`, `127.0.0.1`, `0.0.0.0`, or `[::1]` | `extra` is the host only. |

Plain-English `explain`, `why`, and `how` text for each is written in the skill data. Example, `scan.security.target-blank`: explain "This link opens a new tab but does not say that the new page must not control this one."; why "A page opened this way can change the page that opened it, which can be used to send your visitors to a fake site."; how ["Add rel=\"noopener noreferrer\" to the link."].

## 7. The scan engine (`scanProject.ts`)

1. **Inputs:** the snapshot, the 2C result (labels, edges), the corrections, and an `effective(path)` function that returns the practice copy (2B `practiceContent`) or the loaded content. Options: `signal`, `yieldToMain`, `now`, `onProgress`, `limits`.
2. **Applicability:** `checksFor(file)`: the file's effective labels pick the area checks (R3.3). Every loaded file of a code or config type gets the Security checks. A file is scanned when at least one check applies. Files with no applicable check, and loaded files of other types, are counted in `coverage.notChecked` by extension. Files that were not read are counted in `filesNotRead` (and only `env-file` can fire for them).
3. **Batches:** files in path order, 40 per batch. After each batch: `onProgress`, `await yieldToMain()`, abort check, time check.
4. **Per file:** run each applicable check inside its own `try`. A throw adds `{ path, skillId }` to `couldNotCheck` and continues.
5. **Repository-level checks** (`no-auth-limit`, `route-mismatch`, `env-file`) run after the batches from the 2C edges and the inventory.
6. **Findings:** each raw finding becomes a `Finding` with the skill's fixed data, a snippet from `snippetFor`, and an id from `makeFindingId`. Per-skill (50) and total (500) caps add partial reasons: "Limit of 50 findings for <title> reached: <n> more were not listed." and "Finding limit (500) reached: later findings are missing." The file and time limits add their reasons in the order files, time, findings per check, total findings.
7. **Sort:** severity (High, Medium, Low), path, first line, skill id.
8. **Incremental `rescanPaths(result, paths, ...)`:** re-runs the per-file checks for the given paths on their effective content and replaces those paths' findings, keeping the others. It also re-runs the repository-level checks (cheap) and recomputes counts and `ruleCounts`. It does not change `partial` or `labelsKey`. It is synchronous because it handles few files.
9. **Snippet:** `snippetFor(lines, first, last)` takes lines `first-2` to `last+2`, at most 12 lines (if the span is longer than 8 lines, it keeps the first 8 plus context), each `redact(line).text` cut to 200 characters with "...". It is built at scan time from the effective content and held only in the finding.
10. **Finding id:** `skillId|path|h|k`, where `h` is the 8-digit hash (2B `hashText`) of the trimmed first line text and `k` is the 1-based count of earlier findings of the same skill in that file with the same `h`.
11. **No side effects:** the snapshot, the 2C result, and the work state are read only.

## 8. The one automatic fix (`scanFix.ts`)

`buildTargetBlankFix(content, finding)`:
1. Find the `<a ...>` tag from the finding's first line to its last line.
2. If the tag has a quoted `rel="..."` on one line and the value has no `noopener`, append ` noopener noreferrer` to the value (keeping existing words). If the tag has no `rel`, insert ` rel="noopener noreferrer"` right after the `target` attribute. If `rel` is dynamic (`rel={...}`) or on a different line from `target`, return `null` (the finding stays Guided).
3. Build a unified diff of the changed lines with up to 3 lines of context, keeping the file's line ending, using the `buildInsertDiff` style header (`--- a/<path>`, `+++ b/<path>`).

`buildFixProposal(finding, content, scanFileFn)` returns `{ ok: true, diff, title }` only when all of the following hold (R7.2):
1. `buildTargetBlankFix` returned a diff of at most 2,000 characters.
2. `applyUnifiedDiff(content, diff)` succeeds (2B).
3. Re-running all checks that apply to the new text gives no finding with the same skill at the same place and no finding that was not there before (compared by finding ids and skill).
4. `containsSecret(diff)` is false.
Otherwise `{ ok: false, reason }` and the finding is shown as Guided with the note "A safe automatic fix could not be built here."

## 9. The crew run

### 9.1 The script (`crewScript.ts`)
```
steps = [ info "Skeleton Crew starts: <N> checks over <M> files." ]
for area in [frontend, backend, security, api_data]:
  steps += area { title: "<Area> crew", area }
  for finding in findings where primary == area, sorted, first 12:
     steps += finding { findingId }
     if finding.fix == 'auto': steps += propose { findingId, path }, verify { findingId, path }
  if more than 12: the area step title says "<n> more findings are listed on the area screen but not narrated."
steps += finish
cap total at 150 (extra findings are dropped from the end with the same note on the finish step)
```
A script with no findings is the intro, four area steps, and finish ("No findings to go through.").

### 9.2 Running steps (inside `tickRun` and `step`, pure)
- `info`, `area`, `finish`: write one Log entry (`crew_info` or `crew_<area>`).
- `finding`: write one Log entry `crew_<area>` with the three sentences (R6.4), built by `narrate(step, finding)` from fixed skill text and the path and lines (never code). When the finding is no longer present (fixed earlier), write "This finding is already gone."
- `propose`: look up the finding, build the fix with `buildFixProposal` on the effective content. On success create the proposal (`source: 'crew'`) and move to `awaiting_decision` (2B). On failure write "A safe automatic fix could not be built here." and continue with the run (the following `verify` step says nothing to verify).
- `verify`: re-run the checks for the path on the effective content (`scanFile`): "verified" when the finding is gone and nothing new appeared, "nothing to verify" when no change was made, "failed" otherwise.
- All of the 2B rules (guards, `autoAdvance`, Edit auto-pause, stop, undo and redo limits) apply to both kinds. The invariants test runs for both.

### 9.3 Commands and saving
- `parseCommand`: `start` takes `practice` or `crew`; the refusal text for another word is "Use: start, start practice, or start crew."
- `runCommand('start', 'crew')` checks the refusals (R6.2), builds the script from `state.scan.result`, and starts a run with `kind: 'crew'`.
- `buildRecord` saves `run` and `proposal` as `null` when `run.kind === 'crew'` or `proposal.source === 'crew'`, and runs `containsSecret` over every history diff before saving.
- After a refresh the applied crew fixes come back through History (2B restore) and the scan runs again, so the fixed findings do not return.

## 10. Worked examples (expected scan results for the three samples)

Hand-written truth for the tests. Lines are 1-based.

| Sample | Files scanned | Findings |
|---|---|---|
| Static site | 4 (`index.html`, `about.html`, `css/styles.css`, `js/app.js`) | 1: `scan.frontend.img-alt`, `index.html` line 11, Frontend, Medium, Found, Guided. Snippet lines 9 to 13. |
| React frontend | 8 (`package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/components/LoginForm.tsx`, `src/api/auth.ts`, `src/styles.css`) | 1: `scan.frontend.button-name`, `src/components/LoginForm.tsx` line 20, Frontend, Medium, Found, Guided. Snippet lines 18 to 22. |
| Full-stack API | 8 (`.env.example`, `package.json`, `server/index.js`, `server/routes/profile.js`, `server/middleware/validate.js`, `server/services/profileService.js`, `client/index.html`, `client/app.js`) | 1: `scan.backend.no-auth-limit`, `server/routes/profile.js` line 7, Backend (also Security), Medium, Possible, Explanation only. |

Counts: static: Medium 1, Frontend 1, unique 1. React: Medium 1, Frontend 1, unique 1. Full-stack: Medium 1, Backend 1, Security 1, unique 1 (one finding counted in two areas). No sample has a partial result. In the full-stack sample the client call matches its route, so there is no `route-mismatch`. In the React sample the call to `/api/sign-in` is Inferred (no backend in the repository), so it is not a finding.

The crew script for the full-stack sample is: intro, Frontend crew, Backend crew, the `no-auth-limit` finding step, Security crew, APIs & Data crew, finish (7 steps, no proposal). The auto-fix example is a fixture file `<a href="https://x.test" target="_blank">x</a>` (one finding, Auto-supported, one proposal, verified after Approve).

Fixture files for the other checks (secrets, SQL concatenation, `eval`, CORS, `.env`, `http://`, mismatch) live in the tests as plain strings.

## 11. State, actions, and controller

- **`scanSlice.ts`:** pure transitions `sBegin(runId, snapshotId)`, `sProgress`, `sComplete(runId, result)`, `sFail`, `sCancel`, `sRefresh(paths, result)` (replace the result after an incremental re-check), `sClear`. Stale run ids are ignored. `sRefresh` is a no-op unless `status` is `done`.
- **`scanActions.ts`:** wraps them with `withLog`: `scan_started`, `scan_done` ("<n> findings from <k> checks over <m> files. Partial result." when partial), `scan_failed`, `scan_cancelled`. Entries hold counts and titles only.
- **`useStudioStore.ts`:** `scan` cleared with `ai`, `work`, and `understanding`.
- **`useScan.ts`:** `createScanController(studio, services)` with `ensure()` (start a scan when the 2C analysis is `done`, no scan exists or it belongs to another snapshot, and none is running), `run()` (scan again), `cancel()`. A subscriber aborts when the snapshot changes or is cleared. `dispose()` aborts and unsubscribes. `useScan()` is `useMemo` plus an effect, like the other controllers. `SkeletonCrewScreen` calls `ensure()` in an effect when it mounts.
- **Re-check after changes** is inside the 2B actions (`approve`, `undo`, `redo`): after the pure change, `rescanPaths` runs on the changed path and the whole-state action writes the new `scan.result` in the same update. There is no separate listener, so there is no gap in which the work state and the findings disagree.

## 12. User interface

### 12.1 Screen 4 (`SkeletonCrewScreen`)
Left: the Sandbox placeholder. Right, top to bottom:
1. Stop bar (2B) and the heading "Skeleton Crew", then **Back to Studio**.
2. `CommandBar`.
3. Scan state line: "Scanning N of M files." with **Cancel**; "Scan is up to date: <n> findings from 16 checks over <m> files."; "Scan was cancelled." with **Scan again**; failure message with **Scan again**; "Out of date: labels changed." with **Scan again**; "Project understanding is not ready, so the scan cannot start." with **Try again**. A "Partial result: <reasons>" line when partial.
4. **Map** (`AreaMap`): four bordered boxes in a 2-by-2 grid: area name, file count (Security: "all code files"), "High n, Medium n, Low n" or "No findings from the checks that ran.", and **Open**. Under it the **Links between areas** table, and the helper-group line.
5. **Worker slots** (`WorkerSlots`): four boxes "Frontend crew", "Backend crew", "Security crew", "APIs & Data crew", each with its status text, and the sentence "Workers take turns in this version."
6. **Crew narration** (last 5 lines) and the **proposal card** when one is pending (2B `ProposalCard`).
7. **What was and was not checked** (`WhatWasChecked`, a closed `details`): files scanned and not read, the 16 checks by title with their area and fix label, file types with no checks, and the three "not checked" lines (layout overflow in 2E, data shapes, imported code is never run).

### 12.2 Screen 5 (`DomainScreen`)
Left: the Sandbox placeholder. Right: Stop bar, area heading, **Back to Skeleton Crew**, **Back to Studio**, `CommandBar`, the area's counts and partial line, then `FindingsTable` (200 rows, **Show more**, a **Details** button per row, "also in ..." for other areas), `FindingDetail` for the selected row, `CrewNarration` (last 30 lines for this area), the pending proposal card when it belongs to this area, `ChangesMade` (applied entries for this area's findings, plus "Type undo to reverse the latest change."), and for APIs & Data the `RequestTrace` (2C edges of kinds `calls_api`, `calls_external`, and `defines_route`).

### 12.3 `CommandBar`
A labelled text input and a **Run** button. Submit calls `harness.submitText`. A reply that is not a command: "Only commands work here. Use AI Chat on the Studio screen to ask questions." Shows the last 3 replies in an `aria-live` list and the hint line from R10.1. `open <panel>` also sets the screen back to Screen 3 (through `shellActions.backToStudio`).

### 12.4 Small changes elsewhere
`StopBar`: "Skeleton Crew run: <state>, step N of M". `ProposalCard`: for `source: 'crew'` the practice line is replaced by "Skeleton Crew fix: it changes only the in-memory practice copy, never your repository." The 2C Security row shows "<n> findings" after a finished scan.

All text is React text. No color, icon, transition, or animation. Tables have header cells and scroll inside boxes.

## 13. What is saved

| Part | Saved? |
|---|---|
| Scan result and findings | No (recomputed, offline, deterministic). |
| Crew run, crew proposal, narration | The run and proposal: no. Narration is in the Log, which 2B saves (paths, titles, and fixed sentences only). |
| Applied crew fixes | Yes, as History entries (2B), with the secret check. |
| Snippets | Never. |

## 14. Failure handling

| Failure | Handling |
|---|---|
| A check throws on a file | Listed under "Could not be checked". The scan continues. |
| The whole scan throws | State `failed` with a short message and Scan again. |
| Abort (Cancel, snapshot change, unmount) | The scan stops, no result is kept, `idle`. |
| Any limit reached | Partial result with one plain-words reason per limit. |
| 2C analysis missing or failed | The scan does not start. Screen 4 says why and offers Try again for the analysis. |
| Auto fix fails a safety condition | The finding is shown as Guided with the note. No proposal. |
| A proposal diff no longer applies at approval | 2B: Log "failed", proposal stays waiting. |
| `start crew` refused | One reply with the reason. State unchanged. |
| A secret in a history diff | History is not saved, the Log says so. The in-memory change still works. |
| Findings change after approval or undo | `rescanPaths` in the same update. |

## 15. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Skill-book | `tests/scanSkills.test.ts` (D1) |
| 2. Checks | `tests/scanChecks.test.ts` (D2, D3, D4) |
| 3. Secrets | `tests/scanSecrets.test.ts` (D3) |
| 4. Auto fix | `tests/scanFix.test.ts` (D3) |
| 5. Scan run | `tests/scanProject.test.ts` (D5) |
| 6. Samples | `tests/scanSamples.test.ts` (D5) |
| 7. Counts and views | `tests/scanView.test.ts` (D5) |
| 8. Crew script | `tests/crewScript.test.ts` (D7) |
| 9. Run machine | `tests/crewRun.test.ts` (D7, D8) |
| 10. Storage | `tests/crewStorage.test.ts` (D8) |
| 11. Controller | `tests/scanController.test.ts` (D9) |
| 12. Components | `tests/crewUi.test.tsx` (D10, D11) |
| 13. Static checks | D1 to D11, D12 |
| 14. Regression | D6, D8, D11, D12 |
| 15. Browser run | D12 |
| 16. Phase 2D gate | D12 |

## 16. Risks and known limits

- **Pattern checks are not program analysis.** They can miss problems and can report code that is handled elsewhere. That is why checks say Found or Possible, and Possible checks say what was not seen. A clean scan never says "secure".
- **Only 16 checks.** The list on Screen 4 shows exactly what exists, and what does not. More checks are added to the skill-book later without changing the engine.
- **One automatic fix.** The Auto-supported label is rare on purpose. It is earned by tests, not by guesswork.
- **Workers take turns.** The crew is one sequential run. Four boxes show where it is.
- **Test fixtures that look like secrets** will be flagged if a repository contains them. The finding says what it saw and the snippet is redacted.
- **Line numbers refer to the effective content.** After an approved change, lines in that file can shift, and findings are re-checked in the same update.
- **Crew narration lives in the Log,** which keeps 500 entries in memory and 200 saved. A long crew run can push older entries out.
- **2B and 2C code is modified.** The modifications are listed, kept small, and covered by the existing suites, which must pass unedited except the named `start` argument tests.
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 17. PLAN.md nodes

Plan `P2D-CREW`, feature `F6 — Scanner and Skeleton Crew`, with nodes F6.1 (limits and scan skills), F6.2 (scan helpers, Frontend and APIs & Data checks), F6.3 (Security checks and the automatic fix), F6.4 (Backend checks), F6.5 (scan engine, view helpers, samples), F6.6 (scan state, actions, store), F6.7 (crew script and run changes), F6.8 (commands, storage, harness changes), F6.9 (scan controller), F6.10 (components), F6.11 (wiring Screens 4 and 5), and the gate F6. Full text is in `traceability/PLAN.md`.
