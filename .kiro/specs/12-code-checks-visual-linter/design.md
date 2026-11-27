# Design: 12 Code checks, Visual Linter, and sandbox compatibility (Phase 3, Sub-phase 3B-1)

Implements `requirements.md` in this folder. Active product phase: **Phase 3, Sub-phase 3B-1**. Wireframe only (`#000` and `#fff`, no transition, no animation). `AI_MODE=mock` stays the default. **3B-1 makes no AI request.** One new runtime dependency (`acorn`). All paths are relative to `work-of-art/`.

## 1. Decisions already made

| Source | Decision |
|---|---|
| Vision doc, sections 2 and 7 | `acorn` for JavaScript (module then script, inline `<script>` blocks); HTML and CSS checks with `replaceSync` labelled "Possible invalid CSS"; Visual Linter at three widths labelled "static render (scripts off)" with confidence and "can't measure"; zero-token CSS recipes with automatic undo; Look-only CDN allowlist for styles and fonts; Run-scripts CDN hosts; `localStorage` stand-in; blocked-resources report. |
| Your answers, 2026-11-27 | Build Must and Should. Keep overlap detection with a false-alarm filter. Skip the font-count check, templates 11 to 20, and the nonce bridge. Linter widths stay 375, 768, 1024. Full 3A rigor. 3B is split into 3B-1, 3B-2, 3B-3. |
| Code facts that shaped the design | The preview is an **allowlist re-serializer** (`previewDocument.ts`), so an outside stylesheet must be written back on purpose. Look-only mode already uses `allow-same-origin` with no scripts, and PatchBay measures the page directly (`previewDom.ts`), so **no bridge or nonce is needed**. The Edit pad already maps an element to its start tag (`elementMap.ts`) and records a History change (`applyUserEdit`), so recipes reuse them. Tests run in node (`environment: 'node'`), so browser-only code is kept thin. |

## 2. Phase 3 compliance

| Rule (build-phases.md) | How 3B-1 complies |
|---|---|
| Forbidden in Phase 3: visual redesigns, CSS polishing, unapproved features | PatchBay's own screens stay black-and-white. Recipes change only the imported page's elements, as the Edit pad already does. Every feature here is in the approved 3B-1 scope. |
| Never expose keys; free tier first | No AI call, no key. The only new outbound traffic is the **preview** loading allowed CDN styles and fonts (and scripts in Run-scripts mode), from a fixed list. |
| 4 GB RAM, lean dependencies | One dependency, loaded lazily as its own chunk. One file parsed at a time. Measuring frame removed after each run. |
| Mock-first AI | Untouched. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS WITH APPROVAL | `acorn` 8.x (MIT, no dependencies, about 570 KB unpacked, a few tens of KB when built). It is a parser only: no `eval`, no network. It is approved by you as the 4th runtime dependency. The exact version is read with `npm view` and pinned with a caret in V1. `npm audit` must show 0 vulnerabilities. |
| 2. Memory and bundle | PASS | `import('acorn')` is a separate chunk, fetched on the first scan that has a JavaScript file. The checker code is small. The headless frame used by measuring is the panel's existing frame (no extra frame). |
| 3. Free-tier resilience | PASS | No provider used. CDN hosts are public. If one is down, the preview still measures and says so. |
| 4. Teardown | PASS | The recipe controller has one timer and one store subscription, both cleared in `dispose()` and on every end state. The measuring runner restores the frame width in `finally` (as built). |

## 4. Files

### 4.1 New
| File | Purpose |
|---|---|
| `src/config/checkLimits.ts` | Every 3B-1 code-check limit (provisional). |
| `src/config/previewHosts.ts` | The only place the CDN host lists appear. |
| `src/engine/checks/acornLoader.ts` | Lazy `import('acorn')`, cached, failure returns `null`. |
| `src/engine/checks/jsSyntax.ts` | Module-then-script parse, error choice, plain messages. |
| `src/engine/checks/inlineScripts.ts` | Finds checkable `<script>` blocks in HTML with line and offset. |
| `src/engine/checks/balance.ts` | Bracket and quote balance for `.jsx`, `.ts`, `.tsx`. |
| `src/engine/checks/htmlStructure.ts` | Tag stack, repeated ids, missing attributes. |
| `src/engine/checks/cssCheck.ts` | Splits CSS into top-level rules, counts braces, asks the probe. |
| `src/engine/checks/cssProbe.ts` | The probe type and a registry (`setCssProbe`, `getCssProbe`). |
| `src/engine/checks/cssProbeBrowser.ts` | The only code that calls `CSSStyleSheet.replaceSync`. |
| `src/engine/checks/syntaxFix.ts` | Candidates and verify for JavaScript and HTML. |
| `src/engine/checks/index.ts` | `runCodeChecks(path, text)`: one entry point for the scan. |
| `src/preview/colors.ts` | Parse a computed colour, contrast ratio, step toward black or white. |
| `src/preview/linter.ts` | Pure evaluation of the measurements into results and "can't measure" counts. |
| `src/preview/linterFindings.ts` | Builds `Finding`s from results (replaces the body of `layoutFindings`, which stays exported). |
| `src/preview/mediaSize.ts` | The source-text check for pictures with no size limit. |
| `src/preview/recipes.ts` | Builds a recipe's declarations and its practice-copy change. |
| `src/preview/hostMatch.ts` | Exact host matching for outside styles and scripts. |
| `src/preview/storageShim.ts` | The fixed storage stand-in source text. |
| `src/preview/blockedReport.ts` | Turns the preview report into plain blocked-resource lines. |
| `src/hooks/useRecipe.ts` | The recipe controller: apply, wait for the three-width check, keep or undo. |
| `src/components/LintSummary.tsx`, `src/components/BlockedList.tsx` | Small display components. |
| Tests | See design 11. Helpers: `tests/helpers/lintFixtures.ts`, `tests/helpers/fakeCssProbe.ts`. |

### 4.2 Modified (listed so nothing is a surprise)
`package.json`, `package-lock.json` (add `acorn`); `src/skillbook/scanSkills.ts` (12 skills), `src/skillbook/playbook.ts` (12 lesson cards); `src/engine/scanProject.ts` (a `code` check area, `runCodeChecks`, coverage counts, `CHECK_COUNT`); `src/engine/scanFix.ts` (dispatch to `syntaxFix` and the diff-safety checks; the "new finding" rule treats a later mistake of the same skill as progress); `src/engine/scanFindingTypes.ts` (optional `confidence` and `measure` fields on `Finding`); `src/engine/scanView.ts` (counts); `src/preview/layoutCheck.ts` (keeps `evaluateOverflow` and `layoutFindings` names, delegates); `src/preview/previewDom.ts` (read the extra values and the outside-style status); `src/preview/previewDocument.ts` (outside style links, script list and order, storage stand-in, blocked list); `src/preview/previewFlags.ts` (CSP built from `previewHosts.ts`); `src/config/previewLimits.ts` (new limits, `layoutMs` 6,000); `src/store/previewSlice.ts`, `src/store/previewActions.ts` (cannot-measure counts, recipe state, blocked list); `src/hooks/usePreview.ts` (three-width full check, fonts wait); `src/components/SandboxPanel.tsx`, `src/components/EditPanel.tsx`, `src/components/FindingDetail.tsx`, `src/components/FindingsTable.tsx` if it prints findings (confidence and labels); `src/edit/styleModel.ts` (three allowed properties, a `display` value rule); `src/main.tsx` (register the browser CSS probe once); `src/styles.css` (wireframe only); `README.md`; `traceability/PLAN.md`.

### 4.3 Existing tests that change on purpose
Only numbers and exact strings change; no assertion is weakened or removed. Each change is listed in the task report.
- `tests/aiStatic.test.ts`: the runtime dependency list becomes `acorn`, `react`, `react-dom`, `zod`.
- `tests/scanSkills.test.ts` (17 becomes 29 skills), `tests/lessons.test.ts`, `tests/journalUi.test.tsx`, `tests/journalExport.test.ts`, `tests/contextEngine.test.ts`, and any test that counts checks or lessons (found by running the suite after V1).
- `tests/previewDocument.test.ts`, `tests/previewHostile.test.ts`, `tests/sandboxUi.test.tsx`: the CSP strings, the "outside stylesheet is blocked" cases (now only for hosts not on the list), and the script order.
- `tests/previewModules.test.ts`, `tests/editController.test.ts`, `tests/phase2Flow.test.ts`: measured-finding shape if the new optional fields show up in exact comparisons.
- `tests/scanSamples.test.ts`, `tests/scanProject.test.ts`: only if a bundled sample really contains a mistake the new checks find (each is named in the report).

### 4.4 Not touched
`src/engine/live/*`, `api/*`, `src/engine/contextEngine.ts`, `src/engine/aiCache.ts`, 3A UI, the session record and restore (`sessionRecord.ts`, `workStorage.ts`), `src/store/workSlice.ts`, `workActions.ts` (used as is through `applyUserEdit` and the existing Undo), the crew files (`crewScript.ts` and others). The crew will use the new `auto` syntax fixes automatically because it already calls `buildFixProposal` for `auto` findings.

## 5. The twelve new skills (data)

Added to `SCAN_SKILLS`. `primary: 'frontend'` and `also: ['backend']` for the code skills, because a `.js` file can be either side; the area filter lists them under both. Measured skills have `kind: 'measured'`. The `explain`, `why`, and `how` text is plain English, written in V1 and reviewed by you in the report. Each gets one lesson card `lesson.<id>` (kind `check`, three levels, the existing writing rules: Simple at most 3 sentences of at most 20 words, no jargon, no code characters).

| Id | Title | Severity | Certainty | Fix label |
|---|---|---|---|---|
| `scan.code.js-syntax` | JavaScript the browser cannot read | high | found | auto (becomes guided when no single candidate works) |
| `scan.code.balance` | Brackets or quotes that may not match | medium | possible | guided |
| `scan.code.html-structure` | Page tags that do not close properly | medium | found | auto (same downgrade) |
| `scan.code.html-id-duplicate` | The same id used twice | medium | found | guided |
| `scan.code.html-attr-missing` | A tag is missing something it needs | low | found | guided |
| `scan.code.css-possible-invalid` | Possible invalid CSS | low | possible | guided |
| `scan.code.css-braces` | CSS braces that do not match | medium | found | guided |
| `scan.frontend.layout-overlap` | Boxes that overlap | low | possible | guided |
| `scan.frontend.tap-target` | Button or link too small to tap | medium | found | guided |
| `scan.frontend.text-small` | Text too small to read on a phone | low | found | guided |
| `scan.frontend.contrast` | Text that is hard to read against its background | medium | found | guided |
| `scan.frontend.media-unsized` | Picture with no size limit | low | possible | guided |

Measured findings stay `guided` in `Finding.fix` (so the crew treats them exactly like today's overflow finding). A recipe is a separate button in the Edit panel (design 9).

`CHECK_COUNT` becomes 29. `Finding` gains two optional fields, never saved: `confidence?: 'high' | 'medium' | 'low'` and `measure?: { kind: string; value: number; limit: number }`.

## 6. Sandbox changes

### 6.1 Host lists (`src/config/previewHosts.ts`, the only place they appear)
- `STYLE_HOSTS`: `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com`.
- `FONT_HOSTS`: `fonts.gstatic.com`, `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`.
- `SCRIPT_HOSTS` (Run-scripts only): `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, `code.jquery.com`, `cdn.tailwindcss.com`.

### 6.2 Exact matching (`hostMatch.ts`)
`matchOutsideUrl(raw, hosts)` returns the normalised address or `null`. It accepts only when **all** hold: the text has no control character, space, backslash, quote, `<`, or `>`; it is at most 300 characters; `new URL(raw)` succeeds; the protocol is exactly `https:`; there is no user name, password, or port; the lower-cased `hostname` **equals** one list entry (never `endsWith` or `includes`); the path and query use only `A-Z a-z 0-9 . _ ~ ! $ & ( ) * + , ; = : @ / % ? -`. The result is `url.href`. Protocol-relative (`//host`), `http:`, `javascript:`, `data:`, and relative addresses are never outside matches (relative addresses keep the existing local-file path).

### 6.3 CSP (`previewFlags.ts`)
Both policies are built from the lists:

```
Look:    default-src 'none'; img-src data:; font-src data: <FONT_HOSTS>; media-src data:;
         style-src 'unsafe-inline' <STYLE_HOSTS>; connect-src 'none'; frame-src 'none'; object-src 'none';
         worker-src 'none'; form-action 'none'; base-uri 'none'
Scripts: the same, plus  script-src 'unsafe-inline' <SCRIPT_HOSTS>
```
(`<HOSTS>` is each host written with `https://`.) The two sandbox flag choices stay exactly: `allow-same-origin` (Look-only, no script can run) and `allow-scripts` (Run-scripts, opaque origin). A test builds the policy and fails if any directive other than `font-src`, `style-src`, and `script-src` differs from today's, if `img-src` is not exactly `data:`, or if `script-src` appears in Look-only.

**Why this is safe enough, in plain words.** In Look-only mode nothing can run code, so a style from a CDN can't read PatchBay's data. CSS can't send data out, because images and connections are blocked. In Run-scripts mode the frame has no access to PatchBay (opaque origin) and no way to send data out (`connect-src 'none'`, `img-src data:`), even though hosts like `unpkg` and `jsdelivr` can serve anyone's files. The safety comes from the sealed frame, not from trusting the hosts.

### 6.4 Re-serializer (`previewDocument.ts`)
- A `<link rel="stylesheet">` with an allowed outside address is written as `<link rel="stylesheet" href="...">` (attributes `rel` and `href` only, at most 10, in page order **between** the page's own `<style>` blocks, so the cascade order is kept). Everything else is blocked as today and added to the blocked list with a reason.
- Scripts are collected as an ordered list of `{ src }` or `{ body }`. A Look-only build still removes all scripts. A Run-scripts build writes: the inspector (as built), then the storage stand-in, then the page content, then the project scripts in page order. A `type="module"` script whose text contains a line starting with `import` or `export` is not written and is listed as blocked ("module scripts are not supported in the preview").
- `escapeAttr` is still applied to every written value.

### 6.5 Storage stand-in (`storageShim.ts`)
A fixed text constant (no interpolation). It defines an in-memory object with `getItem`, `setItem`, `removeItem`, `clear`, `key`, `length`, string values only, at most 200 keys and 100 KB, and installs it for both `localStorage` and `sessionStorage` with `Object.defineProperty` inside a `try`. It does not touch cookies, `indexedDB`, or `caches` (listed in the limits). It is tested by running the text in a node `vm` context with a fake window.

### 6.6 Blocked list (`blockedReport.ts`)
`PreviewReport` gains `blocked: Array<{ what: string; reason: BlockedReason }>`, capped at 200 entries when built and 20 shown. `BlockedReason` is a fixed set: `not_on_list`, `not_https`, `scripts_off`, `module_script`, `too_many_outside`, `image_not_loaded`, `event_handler`, `removed_tag`, `too_long`. The panel text for each reason is a fixed plain sentence. `blockedExternal` stays (existing tests read it).

## 7. Code checks and the syntax fix

### 7.1 Where they run
`runCodeChecks(path, text)` (in `checks/index.ts`) is called by `scanOneFile` for every non-ignored file whose extension fits, **regardless of the file's label** (a syntax error is a syntax error). In `scanProject.ts` the new area `code` is always applicable by extension. The function is `async` only for the `acorn` import and the CSS probe; `scanProject` is already async. `scanFile` and `rescanPaths` (used by fix rechecks and the crew) need the same results synchronously, so the loaded `acorn` module and the probe are held in module variables after first use, and a check that needs them and doesn't have them reports "could not check". `scanProject` awaits the loader once before the file loop.

### 7.2 JavaScript
`parseWith(acorn, code, mode)` calls `acorn.parse(code, { ecmaVersion: 'latest', sourceType: mode, allowHashBang: true, allowReturnOutsideFunction: mode === 'script', locations: true })`. On failure the `SyntaxError` has `pos`, `loc.line`, `loc.column`, and `raisedAt`. Error choice follows R1.2. Inline scripts: `inlineScripts.ts` tokenizes with the existing `tokenizeHtml`, takes the raw text token after a qualifying `<script>` start tag, and returns `{ code, startOffset, startLine, startCol, module }`. A reported line is `startLine + loc.line - 1` (the column is shifted only on the first line).

Plain messages (`explainAcornError`): a fixed table keyed on the start of acorn's message (for example `Unexpected token` → "A symbol was found where JavaScript did not expect one."; `Unterminated string constant` → "A quote was opened and not closed on this line."; `Unterminated template` → "A backtick text was opened and not closed."; `Identifier '…' has already been declared` → "A name is declared twice."; `Unexpected character` → "A character JavaScript can't read."; `The keyword '…' is reserved` → "A reserved word is used as a name."; `'return' outside of function`; `Missing catch or finally after try`; `Unexpected reserved word`; default "JavaScript could not read this part."). Quoted names are copied only when they match the safe identifier rule.

### 7.3 Balance
`balance.ts` is a single lexical pass with states: code, line comment, block comment, single and double quotes (line-bounded), template text (with a `${` stack), and a regex guess (a `/` after `( , = : [ ! & | ? { } ; return` starts a regex until an unescaped `/` or the end of the line). It keeps a stack of `([{`. Findings: a closing bracket that does not match the top, brackets still open at the end, and (for `.ts` only) a quote that does not close on its line. For `.jsx` and `.tsx` the pass runs twice (quotes tracked, quotes ignored) and reports only when both runs disagree with a balanced file; the reported line comes from the quotes-ignored run. At most 3 findings per file. The text says "may not match".

### 7.4 HTML structure
Uses `tokenizeHtml` start and end tokens. A stack of open elements; `VOID` and the optional-close set never raise "unclosed". Rules: an end tag with no open match is a stray close; an end tag that matches a deeper entry closes everything above it, and each popped non-optional element is reported as "closed late" at its **start tag line**; elements left open at the end are reported at their start tag. Repeated `id`: plain values only (no `{{`, no `<%`), compared exactly. Missing attributes: `img` without `src`; `link` with a `stylesheet` rel and no `href`. The check is skipped for files with template syntax. Raw-text content (`script`, `style`, `textarea`, `title`) comes from the tokenizer as text and is not parsed as tags.

### 7.5 CSS
`splitCssRules(text)` walks the text once (aware of comments and quote strings) and returns top-level items `{ kind: 'rule' | 'block-at' | 'line-at', text, startLine }` plus `braceProblems: Array<{ line, kind: 'extra_close' | 'unclosed_open' }>`. `@import`, `@charset`, `@namespace` line items are skipped. For each `rule` and `block-at` item (at most 500), `probe(text)` returns `true` when the browser kept at least one rule. A `false` becomes one "Possible invalid CSS" finding at the item's first line, listing the first 40 characters of the selector (redacted) in `extra`. Brace problems become `scan.code.css-braces` findings. In the browser the probe is: `const s = new CSSStyleSheet(); s.replaceSync(text); return s.cssRules.length > 0`, inside a `try`. A constructed sheet is never attached to any document, so it fetches nothing; the browser run counts requests to prove it. In node the registry holds a fake from `tests/helpers/fakeCssProbe.ts`.

### 7.6 The fix: candidates and verify (`syntaxFix.ts`)
`buildSyntaxFix(finding, content, recheck)` is called from `buildFixProposal` for the two eligible skills. It:
1. Reads the error spot again (re-parse), refusing when the position is at or after the last non-blank character of the file or script block (R6.3).
2. Builds the candidate list. **JavaScript:** for the error position `p` (before the unexpected token, skipping blanks backward), insert one of `)`, `]`, `}`, `,`, `;`, `:`; for "Unterminated string constant", the opening quote at the end of the line, or just before a trailing `;`, `,`, `)`. **HTML:** for a "closed late" element, `</tag>` immediately before the closing tag that closed its parent (a single candidate by construction). At most 12 candidates, each at most 8 characters.
3. Applies each to a temporary copy of the file (an inline script's change is mapped back to a file offset) and runs the **same check** on that copy. A candidate passes when the reported error at that spot disappears and no earlier mistake appears.
4. Accepts only when **exactly one** candidate passes. Builds the diff with `buildLineDiff`, checks 2,000 characters, `containsSecret`, `applyUnifiedDiff` round trip, and the recheck rule from `buildFixProposal` with one change: for a `scan.code.*` skill, a finding of the **same skill later in the file** is not a "new finding" (the parser reports one mistake at a time).
5. Otherwise returns `{ ok: false, reason }`, and `applyFixLabels` sets the finding to `guided` with the plain note "A safe automatic fix could not be found here."

**What this will and won't do (honest).** A missing `)` in `if (x > 1 {`, a missing `,` between two object entries, a missing `]` before `;`, and a nested HTML tag closed too late are the realistic automatic fixes. A missing `}` at the end of a file, an unclosed string whose end is unclear, a mistake whose cause is far from the error spot, and most CSS problems are `guided` (AI work in 3B-3). A fix that makes the file parse proves the syntax is valid. It does not prove the code now does what you meant, so the change still goes through Approve.

## 8. Visual Linter

### 8.1 Data flow
```
SandboxPanel runner (existing) --setWidth(w)--> iframe
   gatherMeasurements(doc, win)  [browser only, reads values, returns plain data]
        -> Measurement[] (extended) + docScrollWidth + outsideStyles status
   linter.evaluate(measurements, entries, width, docScrollWidth)  [pure]
        -> LintResult[] + cantMeasure counts
   mediaSize.check(entries, effective)  [pure, source text]
   linterFindings.build(results, entries, effective)  [pure] -> Finding[] (with confidence, measure)
   previewController.checkLayout(...)  -> store.preview.layout { findings, cantMeasure, widths, partialReasons }
```
`checkLayout(runner, [375, 768, 1024])` is the **Full check**. The existing single-width auto check on open stays and uses the same code with one width. The runner waits for `document.fonts.ready` (at most 1,500 ms) and for the outside-style links after every width change, so a late font does not change a number.

### 8.2 The extended `Measurement`
Plain data read by `gatherMeasurements` (all values come from `getBoundingClientRect`, `getComputedStyle`, and the DOM; none from the page's own scripts, which don't run in Look-only mode):
`id`, `parentKey`, `left`, `top`, `width`, `height`, `display`, `position`, `visibility`, `opacity` (the element's own), `see-through` (any ancestor opacity below 1), `hasTransform`, `hasNegativeMargin`, `overlay` (self or an ancestor is `fixed`, `sticky`, or `absolute`), `disabled`, `roleButton`, `inlineInText` (a link that is `display: inline` whose parent has other text), `fontSize`, `bold`, `color` (computed string), and `bg` (`{ color }`, or `{ unknown: reason }`). The background is found by walking up from the element (at most 30 levels) to the first non-transparent `background-color`; if any step on the way has a `background-image`, a gradient, or a see-through background colour, the result is `unknown` (`'picture'`, `'see_through'`, or `'unparsed'`). Existing fields (client and scroll sizes, overflow, `hasText`) are kept. The reader keeps the existing protection against page markup that shadows DOM methods (it calls the frame's own prototypes).

### 8.3 Evaluation rules (`linter.ts`, pure)
Constants in `previewLimits.ts`: `tapMinPx 44`, `smallTextPx 12`, `contrastNormal 4.5`, `contrastLarge 3`, `overlapMinArea 16`, `overlapMinShare 0.15`, `maxChildrenPerParent 60`, `maxPairs 20000`, `mobileMaxWidth 768`, `maxPerKind 25`.

- **Overflow:** unchanged (existing `evaluateOverflow`), confidence `high`.
- **Tap target:** at widths up to 768; element is `a` (with `href`), `button`, `input` (not `hidden`), `select`, `textarea`, `summary`, or `roleButton`; visible; not `disabled`; not `inlineInText`; `width < 44` or `height < 44`. Value is the smaller side. Confidence `high`, or `medium` for `roleButton`.
- **Small text:** at widths up to 768; `hasText`; visible; `fontSize < 12`. Confidence `high`, `medium` for `small`, `sub`, `sup`.
- **Contrast:** `hasText`, visible, not `disabled`. If `bg.unknown`, or the colour can't be parsed, count in `cantMeasure` with the reason and stop. Otherwise ratio = WCAG relative-luminance contrast of the parsed `color` over the solid `bg`; threshold 3 when large (`fontSize >= 24`, or `>= 18.66` and bold), else 4.5. A see-through foreground colour (alpha below 1) is blended over the background first and the confidence is `medium`; otherwise `high`.
- **Overlap (R8):** group by `parentKey`; skip groups over 60 children (a partial note); compare only pairs that pass the filter; intersection area and share rules; confidence from R8.4; stop at 20,000 pairs (a partial note).
- **Picture with no size limit (`mediaSize.ts`):** from source text, not the browser. For each annotated `img`, `video`, `canvas`, `picture`: constrained when its start tag has both `width` and `height` attributes, or an inline style with `width` or `max-width`, or any loaded stylesheet or `<style>` block has a rule whose selector text contains the tag name, `.class`, or `#id` of the element and whose block contains `width` or `max-width`. Otherwise report, confidence `low`, certainty `possible`. A picture shown as a placeholder is counted in `cantMeasure` under `'picture_size_unknown'` once per page, because its real size is unknown.

### 8.4 Findings
One finding per element and kind (existing rule), listing every width where it happened. Id from `makeFindingId`. `extra` holds fixed words and numbers only, for example `Tap target is 32 px high and 120 px wide (needs 44 px), measured at 375, 768 px wide previews (static render, scripts off)`. `confidence` and `measure` are set. Caps: 25 per kind, 100 in all, with a note. Findings are held in the store only and are dropped when the content changes (existing rule).

### 8.5 "Can't measure" and honesty
`layout.cantMeasure` is a count per reason. The panel prints it. A check that did not finish (timeout, content changed) produces no "no problems" line, only the stop message (existing behaviour, kept).

## 9. Recipes (`recipes.ts`, `useRecipe.ts`)

### 9.1 Declarations (validated by `isSafeDeclaration`)
| Finding | Declarations |
|---|---|
| overflow, text wider | `overflow-wrap: anywhere` |
| overflow, text cut at the bottom | `height: auto` |
| overflow, page wider | `max-width: 100%` |
| tap target | `min-height: 44px`, `min-width: 44px`, and `display: inline-block` when the element's display was `inline` |
| small text | `font-size: 14px` |
| contrast | `color: #rrggbb` from `colors.stepToward(fg, bg, threshold)` |
| picture size | `max-width: 100%`, `height: auto` |

`styleModel.ts` gets three new allowed properties (`min-height`, `min-width`, `display`) in `PROP_ORDER`, and `isSafeDeclaration` accepts `display` only with the value `inline-block`. `stepToward` mixes the text colour toward black or white (whichever gives the higher contrast on that background) in 5% steps and returns the first value that reaches the threshold, or `null` (then no recipe is offered).

### 9.2 Offer rule
`recipeFor(finding, entry, content, tableHash)` returns `{ ok: true, edit }` only when `mapElement(...)` is ok (plain `.html`, start tag found, style attribute simple) and the declarations are safe. `edit` is a `UserEdit` (`path`, `baseHash`, `newContent` from `rewriteStartTag`, `editKey`, fixed `title` such as "Recipe: make this tap target 44 px"). Otherwise `{ ok: false, reason }` with the existing plain reason text, shown next to the finding.

### 9.3 The keep-or-undo run (`useRecipe.ts`)
State in `preview.recipe`: `{ status: 'idle' | 'applying' | 'measuring' | 'kept' | 'undone' | 'refused', message, targetKey }` (not saved). Steps:
1. **Guard:** status idle, Look-only static preview, the latest full check is `done` for the current content key, the finding is in it.
2. **Before set:** every finding of the latest check as the key `skillId|path|firstLine|kind`.
3. **Apply:** `applyUserEdit(...)`. A refusal sets `refused` with its reason. Log `recipe_applied` (path count and numbers only).
4. **Measure:** the panel's existing "content changed" effect starts a Full check on the rebuilt preview. A 10-second timer guards the wait.
5. **Decide** when the check ends: keep only if `done`, the target key is absent, and every key in the after set was in the before set. Otherwise undo. A stopped check, a timeout, or a changed content key also undoes.
6. **Undo:** only if the latest History entry is the recipe's (by id); uses the existing Undo state change. If not, nothing is undone and the message says so.
7. Log `recipe_kept` or `recipe_undone`; the panel shows the result in a `role="status"` line. Timer and subscription are cleared on every end state and in `dispose()`.

Rapid clicks: the buttons are disabled while status is `applying` or `measuring`, and the controller ignores a second start.

## 10. UI (wireframe)

- **Sandbox panel:** a "Full check (375, 768, 1024 px)" button next to the existing width controls; the line "Static render (scripts off): pages built by JavaScript are not measured."; the `LintSummary` (count per check, and "Could not measure: N (reason: …)"); the `BlockedList`; the Look-only note "Styles and fonts may load from: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, fonts.googleapis.com, fonts.gstatic.com".
- **Edit panel finding list:** each measured finding shows its kind, number, widths, and "Confidence: high|medium|low". Next to "Try a fix" (existing) a "Recipe fix" button, disabled with the plain reason when no recipe is possible, and the recipe status line.
- **Finding detail (Screen 5, Journal):** confidence line and, for measured findings, the "static render" label.
- All buttons at least 44 px. Black-and-white only.

## 11. Verification mapping

| Requirement | Tests (all in `tests/`) |
|---|---|
| R1 | `jsSyntax.test.ts`, `inlineScripts.test.ts`, `acornLoader.test.ts` |
| R2 | `balance.test.ts` (false-alarm fixtures: apostrophes in JSX text, regex with brackets, template strings, comments) |
| R3 | `htmlStructure.test.ts` (optional closers, void tags, nesting, repeated ids, raw-text elements, template skip) |
| R4 | `cssCheck.test.ts` (with `fakeCssProbe`), browser run for the real probe |
| R5 | `scanSkills.test.ts`, `lessons.test.ts` (updated), `codeChecksScan.test.ts` (end to end through `scanProject`, labels ignored, coverage counts) |
| R6 | `syntaxFix.test.ts` (one, none, several candidates; EOF refusal; secret line; reverse exactly; seeded random mistakes, at least 200 cases, never an accepted fix that fails the recheck) |
| R7, R9 | `linter.test.ts`, `linterFindings.test.ts`, `colors.test.ts`, `mediaSize.test.ts` (each check at three widths, skipped cases, confidence, can't measure, caps) |
| R8 | `linterOverlap.test.ts` (hidden, overlay, parent and child, transform, negative margin, limits) |
| R10 | `recipes.test.ts`, `recipeController.test.ts` (kept, regression undo, timeout undo, changed page, wrong latest entry, rapid clicks, dispose) |
| R11, R12 | `hostMatch.test.ts` (hostile list), `previewHosts.test.ts` (CSP strings), `previewDocument.test.ts` (updated), `previewHostile.test.ts` (updated), `storageShim.test.ts` (in a `vm` context), `scriptOrder.test.ts` |
| R13 | `blockedReport.test.ts` |
| R14 | `checksPrivacy.test.ts` (sentinels), `checksStatic.test.ts` |
| Exit gate | `phase3b1Gate.test.ts` (store level) and the browser run |

Browser run (task V12), headless Chromium on the built app with a small throw-away server outside the repository (as in 3A) that stands in for the allowed CDN hosts through a **test-harness-only** address override (production code has no override). It covers: the CSS probe makes zero requests; a Look-only page with a stand-in style and font; each new finding kind on a fixture page at three widths; overlay, hidden, and parent-child cases not flagged; each recipe kept; one recipe forced to regress and undone; Run-scripts with a stand-in CDN script, a page using `localStorage`, scripts after content; 375 px with no sideways scroll; zero unexpected console errors.

## 12. Mutation checks (V12), each must be killed by a test
Remove the module-to-script fallback; skip the template-syntax guard; allow an end-of-file fix; accept two passing candidates; skip the candidate re-check; treat a later mistake of the same skill as damage; accept a fix on a line with a secret; compare ids case-insensitively; match hosts with `endsWith`; accept `http:`, a user name, or a port; allow `img-src` hosts; put `script-src` in Look-only; add `allow-same-origin` with scripts; write project scripts before content; skip the storage stand-in; do not skip `fixed` or `absolute` overlays; do not skip hidden elements; compare parent and child; overlap confidence `high`; contrast threshold 3 for normal text; ignore a see-through ancestor; count "can't measure" as a pass; keep a recipe without re-measuring; keep when a new problem appeared; keep on timeout; undo the wrong History entry; apply the CSS probe to the document; call any network function from the checks.

## 13. Failure handling

| Failure | Result |
|---|---|
| `acorn` chunk fails to load | "Could not check JavaScript" in coverage; scan continues; no "valid" claim. |
| File too large, minified, or template syntax | Counted as not checked with the reason. |
| Browser has no `replaceSync` | CSS probe check reported as not checked; brace check still runs. |
| An outside style or font host is unreachable | The page still measures; the result says an outside style could not be loaded. |
| A CDN script fails in Run-scripts mode | The page's `load` still fires; the console line shows the error as today. |
| Measurement times out (6 s), or content changes | Stop message; no findings; any pending recipe is undone. |
| Recipe: element not mappable | Button disabled with the plain reason. |
| Recipe: History full (50) | Existing "History is full" refusal. |
| Recipe: the latest History entry is not the recipe's | Nothing is undone; the panel says why. |
| Syntax fix: none or several candidates | Finding stays `guided` with the note. |

## 14. Risks and known limits

1. **Automatic syntax fixes are narrow** (7.6). Most mistakes need AI help in 3B-3.
2. **Heuristic checks give false alarms.** Balance on JSX and TS (regex guess), overlap, and the picture-size source check are the likely ones. They are labelled `possible` or `low`. The three bundled samples are the false-alarm canary (R15).
3. **Contrast is measured only on solid backgrounds.** Gradients, pictures, and see-through layers are "can't measure".
4. **Look-only means scripts off.** Menus, tabs, and React views built by JavaScript aren't measured. The label says so.
5. **Placeholders hide real picture sizes** (PatchBay doesn't fetch binaries).
6. **Recipes work only for plain `.html` elements** with a simple style attribute. They add inline styles, which can look different from a stylesheet fix; the re-measure keeps them honest, but taste is not judged.
7. **Look-only now contacts CDN hosts.** The user's IP reaches those hosts (no referrer). The panel says so.
8. **`unpkg` and `jsdelivr` serve anyone's files.** Safe because of the sealed frame; PatchBay loads only public repositories.
9. **Scripts-after-content changes Run-scripts behaviour.** Pages that relied on scripts running first (rare) may differ.
10. **Cookies, `indexedDB`, and service workers are not shimmed.** A page that needs them can still fail in Run-scripts mode; the console line shows it.
11. **Real-browser behaviour is Unverified until the V12 browser run.** Node tests prove the logic, not the browser's numbers.
12. **Sample or fixture drift:** new checks may find real mistakes in the bundled samples; each is reported, not hidden.

## 15. PLAN.md nodes

Added to `traceability/PLAN.md` as `plan_id: P3B1-CHECKS-LINTER`, nodes F12.1 to F12.11 and the F12 gate (one per task V1 to V12; V12 is the gate). The old `P3B-LIVE-JOURNAL-CREW` F12 section is replaced.
