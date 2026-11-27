# Tasks: 12 Code checks, Visual Linter, and sandbox compatibility (Phase 3, Sub-phase 3B-1)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P3B1-CHECKS-LINTER` and the F12 nodes in `traceability/PLAN.md`. Active product phase: **Phase 3, Sub-phase 3B** (this is step 3B-1; PatchBay's own screens stay black-and-white wireframe, no animation, `AI_MODE=mock` stays the default). **These tasks stay unstarted until you say "Go" for a named task. No application code is written by this spec step.**

Task ids are **V1 to V12**, so they cannot be confused with T, M, S, B, C, D, E, P, J, K, or L (earlier specs). 3B-2 will use R and 3B-3 will use A.

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F12.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- **One new dependency only: `acorn`** (V1). No other package.
- 3B-1 makes **no AI request**. No file in `src/engine/checks/` or `src/preview/` imports `src/engine/live/`, calls `fetch`, or reads `process.env` (a static test in V11 proves it).
- No `eval`, `new Function`, `innerHTML`, or `dangerouslySetInnerHTML` in `src/`. All text is rendered as React text.
- No page text, snippet, address, or finding is written to browser storage. No new saved data.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- Do not touch the files in design 4.4. Files in design 4.2 may change only as described there. Existing tests change only as listed in design 4.3, and only numbers and exact strings (never a weakened assertion).
- Earlier function and control names are used through their as-built names. If a name differs from the design, the task adapts the call and the report says so.
- `scripts/traceability/*` do not exist. Approval is recorded in this chat. The checks are the `npm` commands.

## Branch and commits

Spec on `spec/12-code-checks-visual-linter`. Code on `feat/3b-1-checks-linter` from the spec branch, **one commit per task**, a pull request after V12.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| V1 | F12.1 | `acorn`, limits, host lists, 12 skills, 12 lesson cards, `Finding` fields, count updates | Phase 2, 3A |
| V2 | F12.2 | JavaScript syntax check, inline scripts, balance check | V1 |
| V3 | F12.3 | HTML structure check and CSS check | V1 |
| V4 | F12.4 | Wire the code checks into the scan, CSS probe, coverage, samples | V2, V3 |
| V5 | F12.5 | Candidate-and-verify syntax fix | V2, V3, V4 |
| V6 | F12.6 | Look-only sandbox: host matching, CSP, outside styles, blocked list | V1 |
| V7 | F12.7 | Run-scripts sandbox: script order, CDN scripts, storage stand-in | V6 |
| V8 | F12.8 | Colours and the pure Visual Linter, picture-size check, findings | V1 |
| V9 | F12.9 | Browser measurement reader, Full check, store, summary UI | V6, V8 |
| V10 | F12.10 | Recipes with re-measure and automatic undo | V8, V9 |
| V11 | F12.11 | Privacy, static, hostile-input, and exit-gate tests | V1 to V10 |
| V12 | F12 | Final gate: full suite, build, browser run, mutation checks, review, report | V1 to V11 |

---

## V1. Dependency, limits, host lists, skills, lesson cards, `Finding` fields
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.1
- **scope:** `package.json`, `package-lock.json`, `src/config/checkLimits.ts`, `src/config/previewHosts.ts`, `src/config/previewLimits.ts`, `src/skillbook/scanSkills.ts`, `src/skillbook/playbook.ts`, `src/engine/scanFindingTypes.ts`, `tests/checkLimits.test.ts`, `tests/aiStatic.test.ts`, `tests/scanSkills.test.ts`, `tests/lessons.test.ts`, and any existing test that only counts skills, checks, or lessons
- **goal:** Build design sections 3 (dependency), 5, and 6.1, and the limits named in requirements R1, R4, R7, R8, R12.
- **acceptance:**
  - `acorn` is added as a runtime dependency with a caret range. The exact version, license, and size come from `npm view` and are reported. `npm audit` shows 0 vulnerabilities (or each is explained). The runtime dependency test lists exactly `acorn`, `react`, `react-dom`, `zod`.
  - `checkLimits.ts` and the new `previewLimits.ts` values match design 7 and 8.3 and are marked provisional; `layoutMs` is 6,000.
  - `previewHosts.ts` holds exactly the three lists in design 6.1 and is the only file in `src/` that contains those host names (the static test in V11 enforces this later; here a unit test checks the lists).
  - 12 new skills with the ids, severities, certainties, and fix labels in design 5; plain-English `explain`, `why`, and `how`; measured skills have `kind: 'measured'`; unique ids. Exactly one `lesson.<id>` card per new skill, three levels, passing the existing playbook writing rules and the "related ids exist" rule.
  - `Finding` gains optional `confidence` and `measure`; nothing else in the type changes.
  - Every existing test that counts skills, checks, or lessons is updated by number only. The report lists each test file changed and why.
  - **The text of the 12 skills and 12 lesson cards is shown in the report for your review.**
- **verify:** `npm install && npm run typecheck && npx vitest run tests/checkLimits.test.ts tests/aiStatic.test.ts tests/scanSkills.test.ts tests/lessons.test.ts && npx vitest run`

## V2. JavaScript syntax check, inline scripts, balance check
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.2
- **scope:** `src/engine/checks/acornLoader.ts`, `src/engine/checks/jsSyntax.ts`, `src/engine/checks/inlineScripts.ts`, `src/engine/checks/balance.ts`, `tests/acornLoader.test.ts`, `tests/jsSyntax.test.ts`, `tests/inlineScripts.test.ts`, `tests/balance.test.ts`, `tests/helpers/lintFixtures.ts`
- **goal:** Build requirements R1 and R2 and design 7.2 and 7.3.
- **acceptance:**
  - Valid fixtures give no finding; invalid fixtures give the exact line and column. Cases: `.mjs` module only, `.cjs` script only with top-level `return`, `.js` module-then-script, an error-choice tie, a hash-bang line, top-level `await`, and a template-literal and regex-heavy valid file.
  - Inline scripts: the line offset is right for several blocks in one file; `src` scripts, `application/json`, `importmap`, `text/babel`, `text/template`, `text/x-*`, and `speculationrules` blocks are skipped; a block with `{{`, `{%`, `<%`, or `<?` is skipped and counted; at most 20 blocks per file.
  - Messages come from the fixed table; a quoted name is copied only when it matches the safe identifier rule and has no secret; a name that looks like a secret is replaced by "a name".
  - A file over the size limit and `*.min.js` are not parsed and counted; a loader failure (fake `null`) yields "could not check" and never an empty "no problems" result.
  - **Balance:** true positives for a missing and an extra bracket in `.ts`, `.tsx`, `.jsx`; an unclosed quote in `.ts`; **no finding** for apostrophes in JSX text, brackets inside strings, comments, template text, and a regex such as `/[(]/`; the text says "may not match", never "valid"; at most 3 findings per file.
  - No `eval`, `new Function`, network call, or file write in these modules (checked in V11).
- **verify:** `npm run typecheck && npx vitest run tests/acornLoader.test.ts tests/jsSyntax.test.ts tests/inlineScripts.test.ts tests/balance.test.ts`

## V3. HTML structure check and CSS check
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.3
- **scope:** `src/engine/checks/htmlStructure.ts`, `src/engine/checks/cssCheck.ts`, `src/engine/checks/cssProbe.ts`, `tests/htmlStructure.test.ts`, `tests/cssCheck.test.ts`, `tests/helpers/fakeCssProbe.ts`
- **goal:** Build requirements R3 and R4 and design 7.4 and 7.5 (the probe interface and registry here; the browser probe in V4).
- **acceptance:**
  - **HTML:** an unclosed `div`, a stray `</span>`, a `span` closed late by `</div>` (reported at the `span` start line), nested cases, void tags, optional closers (`p`, `li`, `td`, `tr`, `option`, `dt`, `dd`, `thead`, `tbody`, `tfoot`) never reported, raw-text elements (`script`, `style`, `textarea`, `title`) not parsed as tags, a repeated `id` (exact, case-sensitive), `img` without `src`, `link rel=stylesheet` without `href`, files with template syntax skipped, at most 10 findings per file.
  - **CSS:** `splitCssRules` handles comments, quote strings, nested at-rules, `@media`, `@font-face`, `@keyframes`, `@import` (ignored), a missing `}` and an extra `}` (reported with the line); the fake probe returning `false` gives one "Possible invalid CSS" finding at the rule's first line with the selector cut to 40 characters and redacted; at most 500 rules probed and 20 findings per file; with no probe the possible-invalid check is "not checked" and the brace check still runs.
  - `.css` files and `<style>` blocks inside HTML are both covered, with the right line offsets.
- **verify:** `npm run typecheck && npx vitest run tests/htmlStructure.test.ts tests/cssCheck.test.ts`

## V4. Wire the code checks into the scan; browser CSS probe; coverage; samples
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.4
- **scope:** `src/engine/checks/index.ts`, `src/engine/checks/cssProbeBrowser.ts`, `src/engine/scanProject.ts`, `src/engine/scanView.ts`, `src/main.tsx`, `tests/codeChecksScan.test.ts`, `tests/scanProject.test.ts`, `tests/scanSamples.test.ts`, `tests/scanController.test.ts`, `tests/screen5Scan.test.ts`
- **goal:** Build design 7.1 and requirements R5 and R15 (samples).
- **acceptance:**
  - `runCodeChecks(path, text)` returns `RawFinding[]` for the right extensions only. `scanOneFile` runs it for every non-ignored file by extension, **whatever its label** (a `.js` file labelled `unknown` still gets the syntax check).
  - `scanProject` awaits the `acorn` loader once before the file loop; `scanFile` and `rescanPaths` use the held module and probe synchronously; if the loader failed, each affected check appears in `coverage.couldNotCheck` and `notChecked`, never as "fine".
  - Findings from the new checks carry the right skill, area (frontend, with backend as the other area), lines, redacted snippet, and `extra` text; ids are stable and unique; per-check and total caps still apply.
  - `cssProbeBrowser.ts` is the only file that references `CSSStyleSheet`; it feature-detects, wraps everything in `try`, and is registered once in `main.tsx`. Node tests use the fake.
  - **Samples:** the three bundled samples produce no finding from the new checks unless the sample really has that mistake. Each real one is listed in the report, with the line. No false positive is "fixed" by weakening a check.
  - Existing scan tests change only where a count includes the new checks (design 4.3).
- **verify:** `npm run typecheck && npx vitest run tests/codeChecksScan.test.ts tests/scanProject.test.ts tests/scanSamples.test.ts tests/scanController.test.ts tests/screen5Scan.test.ts && npx vitest run`

## V5. Candidate-and-verify syntax fix
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.5
- **scope:** `src/engine/checks/syntaxFix.ts`, `src/engine/scanFix.ts`, `tests/syntaxFix.test.ts`, `tests/scanFix.test.ts`, `tests/syntaxFixFlow.test.ts`
- **goal:** Build requirements R6 and design 7.6.
- **acceptance:**
  - Exactly one passing candidate gives a fix; none or several give `{ ok: false }` and the finding becomes `guided` with the plain note.
  - Realistic cases fixed: `if (x > 1 {` (adds `)`), a missing `,` between two object entries, a missing `]` before `;`, a nested HTML `span` closed late. Cases **not** fixed: a missing `}` at the end of the file, an unclosed string whose end is unclear, a mistake with two valid repairs.
  - A candidate in an inline `<script>` maps back to the right file offset.
  - The diff is one small change, at most 2,000 characters, applies with `applyUnifiedDiff`, and reverses exactly (a seeded random test of at least 200 mistakes proves: no accepted fix ever fails its own recheck, and the fix never changes more than 8 characters).
  - A line that contains a likely secret is refused. A later mistake of the same `scan.code.*` skill is not counted as a new finding; any other new finding still refuses the fix.
  - The fix runs through the **existing** `buildFixProposal` and Approve path; the test `syntaxFixFlow` shows a fix queued by the crew, approved, re-scanned (the first mistake is gone), and undone to the exact original text.
  - The existing target-blank fix behaves exactly as before (its tests pass unchanged).
- **verify:** `npm run typecheck && npx vitest run tests/syntaxFix.test.ts tests/scanFix.test.ts tests/syntaxFixFlow.test.ts tests/workActions.test.ts`

## V6. Look-only sandbox: host matching, CSP, outside styles, blocked list
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.6
- **scope:** `src/preview/hostMatch.ts`, `src/preview/blockedReport.ts`, `src/preview/previewFlags.ts`, `src/preview/previewDocument.ts`, `src/components/BlockedList.tsx`, `tests/hostMatch.test.ts`, `tests/previewHosts.test.ts`, `tests/blockedReport.test.ts`, `tests/previewDocument.test.ts`, `tests/previewHostile.test.ts`, `tests/sandboxUi.test.tsx`
- **goal:** Build requirements R11 and R13 and design 6.2, 6.3, 6.4 (styles part), and 6.6.
- **acceptance:**
  - **Host matching** accepts only exact `https:` hosts on the lists. Rejected (each a test): `http:`, `//cdn.jsdelivr.net/x.css`, `https://cdn.jsdelivr.net.evil.com/x.css`, `https://evilcdn.jsdelivr.net/x.css`, `https://user@cdn.jsdelivr.net/x.css`, `https://cdn.jsdelivr.net:8443/x.css`, uppercase and trailing-dot hosts that do not normalise to a list entry, a backslash, a space, a quote, `<`, an encoded newline, `javascript:`, `data:`, over 300 characters, and odd path characters.
  - **CSP strings** are built from `previewHosts.ts`. Only `font-src` and `style-src` change in Look-only mode; `img-src` is exactly `data:`; every other directive equals today's; `script-src` is absent in Look-only mode.
  - The re-serializer writes an allowed outside stylesheet as `<link rel="stylesheet" href="...">` with only those two attributes, in page order between the page's own styles, at most 10; everything else is blocked with a reason. `@import` and non-data `url()` in the page's own CSS are still removed.
  - The blocked list has the fixed reasons, at most 200 built and 20 shown; addresses cut to 80 characters; no page text. `blockedExternal` still works for old tests.
  - The Look-only note (which hosts may be contacted) is shown in the Sandbox panel. Sandbox flags and `referrerPolicy` are unchanged (a test asserts this).
  - 2E-1 tests change only as design 4.3 lists, by string or case; each change is reported.
- **verify:** `npm run typecheck && npx vitest run tests/hostMatch.test.ts tests/previewHosts.test.ts tests/blockedReport.test.ts tests/previewDocument.test.ts tests/previewHostile.test.ts tests/sandboxUi.test.tsx`

## V7. Run-scripts sandbox: script order, CDN scripts, storage stand-in
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.7
- **scope:** `src/preview/previewDocument.ts`, `src/preview/previewFlags.ts`, `src/preview/storageShim.ts`, `tests/storageShim.test.ts`, `tests/scriptOrder.test.ts`, `tests/previewDocument.test.ts`, `tests/previewHostile.test.ts`, `tests/previewHosts.test.ts`
- **goal:** Build requirements R12 and design 6.3 (scripts policy), 6.4 (scripts part), and 6.5.
- **acceptance:**
  - In Run-scripts mode `script-src` adds exactly the script hosts; style and font hosts also apply; the frame is `allow-scripts` with no `allow-same-origin` (a test for every build path); `connect-src 'none'`.
  - Order in the written page: inspector, storage stand-in, page content, then project scripts in their original order, with allowed CDN scripts written as `<script src>` in place. A fixture whose script calls `document.getElementById` at load order is shown to find its element.
  - Look-only builds still remove every script and event handler (tests unchanged).
  - A `type="module"` script with `import` or `export` is not written and is listed as blocked.
  - **Storage stand-in:** run in a node `vm` context with a fake window: set, get, remove, clear, key, length; strings only; the 200-key and 100 KB limits; both `localStorage` and `sessionStorage`; a failing `defineProperty` does not stop later scripts. The text is a fixed constant with no interpolation (a test proves it).
  - No outside script is ever written in Look-only mode.
- **verify:** `npm run typecheck && npx vitest run tests/storageShim.test.ts tests/scriptOrder.test.ts tests/previewDocument.test.ts tests/previewHostile.test.ts tests/previewHosts.test.ts`

## V8. Colours, the pure Visual Linter, picture-size check, findings
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.8
- **scope:** `src/preview/colors.ts`, `src/preview/linter.ts`, `src/preview/linterFindings.ts`, `src/preview/mediaSize.ts`, `src/preview/layoutCheck.ts`, `tests/colors.test.ts`, `tests/linter.test.ts`, `tests/linterOverlap.test.ts`, `tests/linterFindings.test.ts`, `tests/mediaSize.test.ts`, `tests/previewModules.test.ts`
- **goal:** Build requirements R7 (evaluation), R8, R9 and design 8.2 (the `Measurement` shape), 8.3, 8.4.
- **acceptance:**
  - **Colours:** parses `rgb()` and `rgba()` computed strings; anything else is "unparsed"; WCAG contrast matches known pairs (black on white 21:1, a published mid-grey pair); `stepToward` reaches the threshold or returns `null`; large-text rule (24 px, or 18.66 px bold).
  - **Each check** is tested with plain-data measurements at 375, 768, and 1024 px: overflow (existing results unchanged), tap target (44 px; skipped: hidden, disabled, inline link in text; `roleButton` is medium), small text (12 px; widths up to 768 only), contrast (solid pass and fail, large text, see-through blend is medium, gradient or picture or unparsed is counted as can't measure and never reported), picture size (source rules, the placeholder count).
  - **Overlap:** reported only for in-flow visible siblings that pass the area rules; **not** reported for hidden, `fixed`, `sticky`, or `absolute` elements or their children, parent and descendant, inline boxes; confidence `medium` or `low`, never `high`; transform and negative margin give `low`; the 60-children and 20,000-pair limits give a partial note.
  - Findings: one per element and kind with every width listed; `confidence` and `measure` set; `extra` holds fixed words and numbers only (a sentinel in the page text never appears); caps 25 per kind and 100 in all; `layoutFindings` keeps its name and old output shape for overflow.
- **verify:** `npm run typecheck && npx vitest run tests/colors.test.ts tests/linter.test.ts tests/linterOverlap.test.ts tests/linterFindings.test.ts tests/mediaSize.test.ts tests/previewModules.test.ts`

## V9. Browser measurement reader, Full check, store, summary UI
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.9
- **scope:** `src/preview/previewDom.ts`, `src/hooks/usePreview.ts`, `src/store/previewSlice.ts`, `src/store/previewActions.ts`, `src/components/LintSummary.tsx`, `src/components/SandboxPanel.tsx`, `src/components/EditPanel.tsx`, `src/components/FindingDetail.tsx`, `src/components/FindingsTable.tsx`, `src/styles.css`, `tests/previewController.test.ts`, `tests/lintSummaryUi.test.tsx`, `tests/sandboxUi.test.tsx`
- **goal:** Build requirements R7.1, R7.2, R7.5, R9.3, R9.4 and design 8.1, 8.2 (reader), 8.5, 10.
- **acceptance:**
  - `gatherMeasurements` reads the extended values (design 8.2) with the frame's own prototypes and returns plain data; it stays thin (no thresholds) and caps at `maxElements`.
  - `checkLayout(runner, [375, 768, 1024])` is the **Full check**; the existing single-width auto check still works; the runner waits for fonts (at most 1,500 ms) and restores the frame width in `finally`; timeout (6 s) and "page changed" stop messages still work (existing tests pass).
  - The store keeps `layout.cantMeasure` and findings with `confidence` and `measure`; they are dropped when content changes; nothing is saved.
  - The Sandbox panel shows the Full check button, the "static render (scripts off)" line, `LintSummary` (per-check counts and "Could not measure: N (reason)"), the blocked list, and the Look-only host note. Finding detail and the Edit panel show confidence. All buttons at least 44 px. Server-render tests cover each state (idle, running, done, stopped, partial, can't measure).
  - Wireframe only. No `innerHTML`.
- **verify:** `npm run typecheck && npx vitest run tests/previewController.test.ts tests/lintSummaryUi.test.tsx tests/sandboxUi.test.tsx tests/editController.test.ts && npm run build`

## V10. Recipes with re-measure and automatic undo
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.10
- **scope:** `src/preview/recipes.ts`, `src/edit/styleModel.ts`, `src/hooks/useRecipe.ts`, `src/store/previewSlice.ts`, `src/store/previewActions.ts`, `src/components/EditPanel.tsx`, `src/components/SandboxPanel.tsx`, `tests/recipes.test.ts`, `tests/recipeController.test.ts`, `tests/styleModel.test.ts`, `tests/editPad.test.ts`
- **goal:** Build requirements R10 and design 9.
- **acceptance:**
  - Each recipe produces exactly the declarations in design 9.1, validated by `isSafeDeclaration`; `display` accepts only `inline-block`; the three new properties are in `PROP_ORDER`; existing Edit pad tests pass unchanged apart from appended cases.
  - `recipeFor` refuses with the existing plain reason when the element is not mapped, the page is not plain `.html`, the style attribute is complex, the content changed, the change would exceed 2,000 characters, the nearby lines contain a likely secret, or History is full. Overlap findings have no recipe.
  - **Controller** (fake clock, fake store services): kept when the target is gone at every width and no new problem appeared; **undone** on a regression, a new problem of another kind, a stopped check, a 10-second timeout, and a changed content key; **not undone** (with a plain message) when the latest History entry is not the recipe's; a second start while `applying` or `measuring` is ignored; `dispose()` clears the timer and subscription; the Log gets only `recipe_applied`, `recipe_kept`, `recipe_undone` with numbers.
  - After undo, the practice copy hash equals the one before the recipe.
  - Edit panel shows "Recipe fix" per measured finding, disabled with the reason when impossible, plus a `role="status"` result line. Buttons at least 44 px.
  - Nothing is applied until the button is pressed. No AI call.
- **verify:** `npm run typecheck && npx vitest run tests/recipes.test.ts tests/recipeController.test.ts tests/styleModel.test.ts tests/editPad.test.ts tests/workState.test.ts`

## V11. Privacy, static, hostile-input, and exit-gate tests
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12.11
- **scope:** `tests/checksPrivacy.test.ts`, `tests/checksStatic.test.ts`, `tests/checksHostile.test.ts`, `tests/phase3b1Gate.test.ts`, `tests/helpers/lintHarness.ts`
- **goal:** Build design 11 (R14 and R15 proofs) and design 12 (the static half).
- **acceptance:**
  - **Privacy (sentinels):** a secret sentinel in a JavaScript file, an HTML page, a CSS file, a page text, an outside address, and an identifier never appears in the Log, browser storage, an error message, a finding's `extra`, or a blocked-list line.
  - **Static:** no `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `fetch`, `XMLHttpRequest`, `process.env`, or `src/engine/live` import in `src/engine/checks/` and `src/preview/`; the host names appear only in `src/config/previewHosts.ts`; `CSSStyleSheet` only in `cssProbeBrowser.ts`; no colour other than `#000` and `#fff` and no `transition` or `animation` in new CSS; runtime dependencies exactly `acorn`, `react`, `react-dom`, `zod`; `acorn` is imported only through `acornLoader.ts` with a dynamic `import()`.
  - **Hostile inputs:** a repository file with a 1 MB line, 100,000 nested tags, 10,000 `{`, a `</style>` inside CSS, a `</script>` inside a string, a `<script src>` to an outside host, a lookalike CDN host, and a 5,000-element page: each finishes within the limits, with a partial note and no thrown error.
  - **Exit gate (store level, no browser):** (a) a page with a syntax mistake is found and offered a single-candidate fix, approved, re-scanned, and undone; (b) a page with a too-small button is measured, the recipe is applied and kept; (c) a recipe forced to regress is undone and the practice copy matches the original; (d) Look-only and Run-scripts documents have the exact CSP and sandbox flags.
- **verify:** `npm run typecheck && npx vitest run tests/checksPrivacy.test.ts tests/checksStatic.test.ts tests/checksHostile.test.ts tests/phase3b1Gate.test.ts`

## V12. Final gate: full suite, build, browser run, mutation checks, review, report
- **plan_id:** P3B1-CHECKS-LINTER  **node_id:** F12
- **scope:** `README.md`, `traceability/PLAN.md` ("F12 as built (3B-1)" notes), `PHASE_3B1_REPORT.md`; throw-away browser-run tools outside the repository in `/projects/sandbox/p3b1-run/`
- **goal:** Build requirements section 6 (items 11 to 14) and design 11 (browser run) and 12 (mutation checks).
- **acceptance:**
  - `npm run typecheck && npx vitest run && npm run build` all exit 0. The report shows test file and test counts and the build size against the 3A baseline (113 files, 2,105 tests, `index-CyYt-s28.js` 708.33 kB, 219.59 kB gzip), the separate `acorn` chunk size, and `npm audit`.
  - **Browser run** as in design 11, each check reported pass or fail, zero unexpected console errors, the CSS probe request count is zero.
  - **Mutation checks:** every item in design 12 is tried; each must make a test fail. The report lists each and the test that caught it. Any survivor gets a new test before the gate passes.
  - **Independent review** of the whole diff by a separate reviewer; findings fixed with tests. If the custom `verification-agent` can't run, the report says **Unverified** for that step.
  - README explains `acorn`, the CDN lists, Look-only and Run-scripts behaviour, and the checks' limits in plain words.
  - `PHASE_3B1_REPORT.md` (like `PHASE_3A_REPORT.md`): what was built in plain words, evidence table, deviations from this spec, known limits, **Unverified** items, and a short list of decisions for you. I do not change `Current Active Phase` and do not start 3B-2 or 3B-3.
- **verify:** `npm run typecheck && npx vitest run && npm run build && npm audit`
