# Design: 12 Code checks, Visual Linter, and sandbox compatibility (Phase 3, Sub-phase 3B-1)

Implements `requirements.md` in this folder. Active product phase: **Phase 3, Sub-phase 3B-1**. Wireframe only (`#000` and `#fff`, no transition, no animation). `AI_MODE=mock` stays the default. **3B-1 makes no AI request.** One new runtime dependency (`acorn`). All paths are relative to `work-of-art/`.

## 1. Decisions already made

| Source | Decision |
|---|---|
| Vision doc, sections 2 and 7 | `acorn` for JavaScript (module then script, inline `<script>` blocks); HTML and CSS checks with `replaceSync` labelled "Possible invalid CSS"; Visual Linter at three widths labelled "static render (scripts off)" with confidence and "can't measure"; zero-token CSS recipes with automatic undo; Look-only CDN allowlist for styles and fonts; Run-scripts CDN hosts; `localStorage` stand-in; blocked-resources report. |
| Your answers, 2026-11-27 | Build Must and Should. Keep overlap detection with a false-alarm filter. Skip the font-count check, templates 11 to 20, and the nonce bridge. Linter widths stay 375, 768, 1024. Full 3A rigor. 3B is split into 3B-1, 3B-2, 3B-3. |
| Images (Option C), 2026-11-27 | Small local images (`.png .jpg .jpeg .webp .gif .ico`, 150 KB each, 1 MB total, 30 images, referenced ones only) and outside `https:` images are shown in the Sandbox. Bytes are stored apart from text files and never reach an AI. The Visual Linter measures real picture sizes. |
| Code facts that shaped the design | The preview is an **allowlist re-serializer** (`previewDocument.ts`), so an outside stylesheet must be written back on purpose. Look-only mode already uses `allow-same-origin` with no scripts, and PatchBay measures the page directly (`previewDom.ts`), so **no bridge or nonce is needed**. The Edit pad already maps an element to its start tag (`elementMap.ts`) and records a History change (`applyUserEdit`), so recipes reuse them. Tests run in node (`environment: 'node'`), so browser-only code is kept thin. |

## 2. Phase 3 compliance

| Rule (build-phases.md) | How 3B-1 complies |
|---|---|
| Forbidden in Phase 3: visual redesigns, CSS polishing, unapproved features | PatchBay's own screens stay black-and-white. Recipes change only the imported page's elements, as the Edit pad already does. Every feature here is in the approved 3B-1 scope. |
| Never expose keys; free tier first | No AI call, no key. The only new outbound traffic is the **preview** loading allowed CDN styles and fonts (and scripts in Run-scripts mode) from a fixed list, and outside `https:` pictures (design 6.7), and the loader downloading small referenced images from the GitHub raw host as it already does for text. |
| 4 GB RAM, lean dependencies | One dependency, loaded lazily as its own chunk. One file parsed at a time. Measuring frame removed after each run. |
| Mock-first AI | Untouched. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS WITH APPROVAL | `acorn` 8.x (MIT, no dependencies, about 570 KB unpacked, a few tens of KB when built). It is a parser only: no `eval`, no network. It is approved by you as the 4th runtime dependency. The exact version is read with `npm view` and pinned with a caret in V1. `npm audit` must show 0 vulnerabilities. |
| 2. Memory and bundle | PASS | Images add at most about 1.4 MB of stored text in the snapshot and at most 2 MB inside one preview document; the loader holds at most 5 images in flight. `import('acorn')` is a separate chunk, fetched on the first scan that has a JavaScript file. The checker code is small. The headless frame used by measuring is the panel's existing frame (no extra frame). |
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
| `src/engine/imageSniff.ts` | Checks the first bytes of a file against PNG, JPEG, GIF, WebP, ICO and returns the mime type. |
| `src/engine/mediaRefs.ts` | Pure finder of local image paths referenced by loaded HTML and CSS. |
| `src/engine/mediaLoader.ts` | The image pass of ingestion: caps, downloads, labels. |
| `src/hooks/useRecipe.ts` | The recipe controller: apply, wait for the three-width check, keep or undo. |
| `src/components/LintSummary.tsx`, `src/components/BlockedList.tsx` | Small display components. |
| Tests | See design 11. Helpers: `tests/helpers/lintFixtures.ts`, `tests/helpers/fakeCssProbe.ts`, `tests/helpers/tinyImages.ts` (a few valid tiny images as base64 and fakes of each bad kind). |

### 4.2 Modified (listed so nothing is a surprise)
`package.json`, `package-lock.json` (add `acorn`); `src/types/contracts.ts` (optional `media` list, four reason codes, two optional coverage numbers, consistency check), `src/config/budgets.ts` (image caps), `src/engine/githubSource.ts` (`fetchBytesCapped`), `src/engine/ingestPipeline.ts` (call the image pass), `src/engine/fileSelector.ts` (coverage counts only; `exclusionFor` is unchanged), `src/components/CoveragePanel.tsx`; `src/skillbook/scanSkills.ts` (12 skills), `src/skillbook/playbook.ts` (12 lesson cards); `src/engine/scanProject.ts` (a `code` check area, `runCodeChecks`, coverage counts, `CHECK_COUNT`); `src/engine/scanFix.ts` (dispatch to `syntaxFix` and the diff-safety checks; the "new finding" rule treats a later mistake of the same skill as progress); `src/engine/scanFindingTypes.ts` (optional `confidence` and `measure` fields on `Finding`); `src/engine/scanView.ts` (counts); `src/preview/layoutCheck.ts` (keeps `evaluateOverflow` and `layoutFindings` names, delegates); `src/preview/previewDom.ts` (read the extra values and the outside-style status); `src/preview/previewDocument.ts` (outside style links, outside and local pictures, script list and order, storage stand-in, blocked list); `src/preview/previewFlags.ts` (CSP built from `previewHosts.ts`); `src/config/previewLimits.ts` (new limits, `layoutMs` 6,000); `src/store/previewSlice.ts`, `src/store/previewActions.ts` (cannot-measure counts, recipe state, blocked list); `src/hooks/usePreview.ts` (three-width full check, fonts wait); `src/components/SandboxPanel.tsx`, `src/components/EditPanel.tsx`, `src/components/FindingDetail.tsx`, `src/components/FindingsTable.tsx` if it prints findings (confidence and labels); `src/edit/styleModel.ts` (three allowed properties, a `display` value rule); `src/main.tsx` (register the browser CSS probe once); `src/styles.css` (wireframe only); `README.md`; `traceability/PLAN.md`.

### 4.3 Existing tests that change on purpose
Only numbers and exact strings change; no assertion is weakened or removed. Each change is listed in the task report.
- `tests/aiStatic.test.ts`: the runtime dependency list becomes `acorn`, `react`, `react-dom`, `zod`.
- `tests/scanSkills.test.ts` (17 becomes 29 skills), `tests/lessons.test.ts`, `tests/journalUi.test.tsx`, `tests/journalExport.test.ts`, `tests/contextEngine.test.ts`, and any test that counts checks or lessons (found by running the suite after V1).
- `tests/previewDocument.test.ts`, `tests/previewHostile.test.ts`, `tests/sandboxUi.test.tsx`: the CSP strings (including `img-src`), the "outside stylesheet is blocked" cases (now only for hosts not on the list), the "outside picture is a placeholder" cases (now only for addresses that fail the picture rules), and the script order.
- `tests/contracts.test.ts`, `tests/ingestPipeline.test.ts`, `tests/githubSource.test.ts`, `tests/repoApi.test.ts`, the Coverage panel test: appended cases for `media`, the four new reason codes, and the new coverage numbers. Existing cases pass unchanged because `media` and the new coverage numbers are optional and unreferenced images behave as before.
- `tests/previewModules.test.ts`, `tests/editController.test.ts`, `tests/phase2Flow.test.ts`: measured-finding shape if the new optional fields show up in exact comparisons.
- `tests/scanSamples.test.ts`, `tests/scanProject.test.ts`: only if a bundled sample really contains a mistake the new checks find (each is named in the report).

### 4.4 Not touched
`src/engine/live/*`, `api/*` (the handler is unchanged: it already streams whatever `runIngestion` returns), `src/engine/contextEngine.ts`, `src/engine/aiCache.ts`, 3A UI, the session record and restore (`sessionRecord.ts`, `workStorage.ts`), `src/store/workSlice.ts`, `workActions.ts` (used as is through `applyUserEdit` and the existing Undo), the crew files (`crewScript.ts` and others). The crew will use the new `auto` syntax fixes automatically because it already calls `buildFixProposal` for `auto` findings.

## 5. The twelve new skills (data)

Added to `SCAN_SKILLS`. The ids use the existing pattern `scan.<area>.<name>` so the existing id test still holds; the seven code checks use the `scan.frontend.` prefix with `primary: 'frontend'` and `also: ['backend']`, because a `.js` file can be either side (the area filter lists them under both). Measured skills have `kind: 'measured'`. **The exact `explain`, `why`, `how` text and the three-level lesson cards are in `content-draft.md` in this folder** (checked against the existing writing rules before the spec was pushed) and V1 copies them without changes. Each skill gets one lesson card `lesson.<id>` (kind `check`, three levels, the existing writing rules: Simple at most 3 sentences of at most 20 words, no jargon, no code characters).

| Id | Title | Severity | Certainty | Fix label |
|---|---|---|---|---|
| `scan.frontend.js-syntax` | JavaScript the browser cannot read | high | found | auto (becomes guided when no single candidate works) |
| `scan.frontend.balance` | Brackets or quotes that may not match | medium | possible | guided |
| `scan.frontend.html-structure` | Page tags that do not close properly | medium | found | auto (same downgrade) |
| `scan.frontend.html-id-duplicate` | The same id used twice | medium | found | guided |
| `scan.frontend.html-attr-missing` | A tag is missing something it needs | low | found | guided |
| `scan.frontend.css-possible-invalid` | Possible invalid CSS | low | possible | guided |
| `scan.frontend.css-braces` | CSS braces that do not match | medium | found | guided |
| `scan.frontend.layout-overlap` | Boxes that overlap | low | possible | guided |
| `scan.frontend.tap-target` | Button or link too small to tap | medium | found | guided |
| `scan.frontend.text-small` | Text too small to read on a phone | low | found | guided |
| `scan.frontend.contrast` | Text that is hard to read against its background | medium | found | guided |
| `scan.frontend.media-unsized` | Picture with no size limit (a real picture wider than its box, or a picture with no size limit written down) | low | possible | guided |

Measured findings stay `guided` in `Finding.fix` (so the crew treats them exactly like today's overflow finding). A recipe is a separate button in the Edit panel (design 9).

`CHECK_COUNT` becomes 29. `tests/scanSkills.test.ts` changes only its counts and its two lists (the measured skills, and the Auto-supported skills: target-blank plus the two syntax skills). The "Possible checks are never High" rule is kept and holds for every new skill. `Finding` gains two optional fields, never saved: `confidence?: 'high' | 'medium' | 'low'` and `measure?: { kind: string; value: number; limit: number }`.

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
Look:    default-src 'none'; img-src data: https:; font-src data: <FONT_HOSTS>; media-src data:;
         style-src 'unsafe-inline' <STYLE_HOSTS>; connect-src 'none'; frame-src 'none'; object-src 'none';
         worker-src 'none'; form-action 'none'; base-uri 'none'
Scripts: the same, plus  script-src 'unsafe-inline' <SCRIPT_HOSTS>
```
(`<HOSTS>` is each host written with `https://`.) The two sandbox flag choices stay exactly: `allow-same-origin` (Look-only, no script can run) and `allow-scripts` (Run-scripts, opaque origin). A test builds the policy and fails if any directive other than `font-src`, `style-src`, `img-src`, and `script-src` differs from today's, if `img-src` is not exactly `data: https:`, or if `script-src` appears in Look-only. (`img-src` changes in V9; V6 keeps it as `data:`.)

**Why this is safe enough, in plain words.** In Look-only mode nothing can run code, so a style from a CDN can't read PatchBay's data. CSS can't send data out, because connections are blocked. In Run-scripts mode the frame has no access to PatchBay (opaque origin) and no direct way to send data out (`connect-src 'none'`), even though hosts like `unpkg` and `jsdelivr` can serve anyone's files. The safety comes from the sealed frame, not from trusting the hosts.

**What pictures change (Option C).** `img-src https:` means the preview can contact any public `https:` host to fetch a picture. In Look-only mode only the page's own `<img>` tags do this, after the re-serializer has vetted each address (6.7), and no script can see the result. The picture's host learns the user's IP address (no referrer is sent) and can use it as a tracking pixel. In Run-scripts mode a script on the page can also request any `https:` picture address, so it can send a small message to a host it controls (in the address) and learn whether a private `https:` address answers. It still can't read PatchBay's data. That is why the Run-scripts switch's existing warning gets an extra line (open question 1 in the requirements asks you to confirm this).

### 6.4 Re-serializer (`previewDocument.ts`)
- A `<link rel="stylesheet">` with an allowed outside address is written as `<link rel="stylesheet" href="...">` (attributes `rel` and `href` only, at most 10, in page order **between** the page's own `<style>` blocks, so the cascade order is kept). Everything else is blocked as today and added to the blocked list with a reason.
- Scripts are collected as an ordered list of `{ src }` or `{ body }`. A Look-only build still removes all scripts. A Run-scripts build writes: the inspector (as built), then the storage stand-in, then the page content, then the project scripts in page order. A `type="module"` script whose text contains a line starting with `import` or `export` is not written and is listed as blocked ("module scripts are not supported in the preview").
- `escapeAttr` is still applied to every written value.

### 6.5 Storage stand-in (`storageShim.ts`)
A fixed text constant (no interpolation). It defines an in-memory object with `getItem`, `setItem`, `removeItem`, `clear`, `key`, `length`, string values only, at most 200 keys and 100 KB, and installs it for both `localStorage` and `sessionStorage` with `Object.defineProperty` inside a `try`. It does not touch cookies, `indexedDB`, or `caches` (listed in the limits). It is tested by running the text in a node `vm` context with a fake window.

### 6.6 Blocked list (`blockedReport.ts`)
`PreviewReport` gains `blocked: Array<{ what: string; reason: BlockedReason }>`, capped at 200 entries when built and 20 shown. `BlockedReason` is a fixed set: `not_on_list`, `not_https`, `scripts_off`, `module_script`, `too_many_outside`, `image_not_loaded`, `event_handler`, `removed_tag`, `too_long`. The panel text for each reason is a fixed plain sentence. `blockedExternal` stays (existing tests read it).

### 6.7 Images (Option C)

**Loader (`mediaLoader.ts`, runs inside `runIngestion` after the text files and before the snapshot is assembled):**
1. **Candidates:** inventory file entries whose extension is `png`, `jpg`, `jpeg`, `webp`, `gif`, or `ico`, still marked `excluded_media`, and inside the chosen scope. `mediaRefs.referencedImages(files)` returns, in order, the local image paths referenced by loaded `.html`/`.htm` files (`<img src>`, `<style>` blocks, inline `style` attributes) and `.css` files (`url(...)`), using the same relative-path rules as local stylesheets in `previewDocument.ts` (`..` cannot leave the repository; `data:`, `http:`, `https:`, `//`, and `#` are not local; query and fragment parts are cut). Only candidates in that list are loaded. Order: entry page first, then first-reference order, no duplicates. The reference scan reads at most 200 KB per file and returns at most 200 paths.
2. **Plan from tree sizes, before any download:** a size above 150 KB gives `media_too_large` (never downloaded). Otherwise sizes are added in order until 1 MB or 30 images; the rest get `media_budget_reached`. An unknown size counts as 150 KB for planning.
3. **Download:** `fetchBytesCapped(owner, repo, ref, path, 150 KB, deps)` (same raw-host check, redirect check, abort, and timeout rules as `fetchFileCapped`; no token to the raw host; reads at most 150 KB plus one byte, then cancels). At most 5 at a time. The real byte total is re-checked after each download, so a wrong tree size can't pass the 1 MB cap.
4. **Signature check (`imageSniff.ts`):** PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; GIF `GIF87a` or `GIF89a`; WebP `RIFF....WEBP`; ICO `00 00 01 00` with a sane image count. The signature family must match the extension family (`jpg` and `jpeg` are one family). The mime type comes from the signature, never from the extension. Failure gives `media_failed` ("not a real picture").
5. **Result:** `media` sorted by path (`{ path, mime, base64, bytes }`). Inventory entries: loaded gives `loadStatus: 'skipped'`, `reasonCode: 'media_loaded'`, `reason: 'Loaded for the preview only (N KB).'`; the others get their plain reason and size. Coverage gets `loadedMediaFiles` and `loadedMediaBytes`.
6. **Rate limit, deadline, abort:** as for text files. An image not reached because of them gets `media_failed` with the reason. An abort ends the run as today.

**Why `skipped` plus a policy code, not a new status.** The status list and every switch over it stay as they are, `files` still holds only text, and `sourceAnalysisComplete` keeps its meaning (images are not source files). The four codes are in `POLICY_SKIP_REASONS`.

**Contract.** `RepoSnapshot.media` is optional (snapshots without it validate, so every existing fixture and test is untouched). Item schema is strict: `mime` from a fixed list, `base64` of base64 characters only, `bytes` equal to the decoded length and at most 150 KB. `assertCoverageConsistent` checks that `media` and the `media_loaded` entries match one for one and that byte totals and caps hold.

**Where bytes may go.** Only `mediaLoader.ts` writes them, and only the coverage code, the Sandbox panel, and `previewDocument.ts` read them. The scan, Journal, Context Engine, AI request builders, exports, Log, and storage never import them (a static test in V13 checks the import graph and a sentinel test checks the data).

**Preview, local pictures (`previewDocument.ts`).** `StaticInput.media` (optional) maps a path to `{ mime, base64 }`; `StaticInput.mediaNote` (optional) maps a not-loaded image path to its plain reason for the placeholder. In the `img` branch, in order: (1) the address resolves to a loaded local picture, so write `<img src="data:<mime>;base64,..." ...>` with the allowed attributes, after re-checking the signature; (2) it resolves to a local path that is not loaded, so write the labelled placeholder with the reason; (3) it is an absolute `https:` address accepted by `matchImageUrl`, so write `<img src="<href>" ...>`; (4) anything else, the existing placeholder. For loaded local stylesheets, `rewriteLocalUrls(css, cssPath)` replaces `url(local-picture)` with `url(data:...)` before `styleBody` runs; the sanitizer keeps `data:image/` values and still removes every other non-data `url(`. A shared counter adds each embedded data URL's length (repeats count); at 2 MB further pictures become placeholders ("too many pictures for one preview"). `maxDocBytes` rises to 3 MB.

**Preview, outside pictures (`hostMatch.ts`, `matchImageUrl`).** Accepts only when: no control character, space, backslash, quote, `<`, `>`; at most 500 characters; `new URL` succeeds; protocol exactly `https:`; no user name or password; `port` is empty (the default); the host contains a dot and ends in a letters-only top-level name; it is not an IPv4 or IPv6 address (after URL normalisation, so `2130706433` and `0x7f.1` forms are caught); it is not `localhost` and does not end in `.local`, `.localhost`, `.internal`, `.home.arpa`, `.lan`, or `.localdomain`; path and query use only safe URL characters. The result is `url.href`. **Known limit:** a public name that points to a private address (DNS rebinding) can't be detected in the browser. A page can make the user's browser send a picture request to it; the page can't read the answer in Look-only mode.

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
`splitCssRules(text)` walks the text once (aware of comments and quote strings) and returns top-level items `{ kind: 'rule' | 'block-at' | 'line-at', text, startLine }` plus `braceProblems: Array<{ line, kind: 'extra_close' | 'unclosed_open' }>`. `@import`, `@charset`, `@namespace` line items are skipped. For each `rule` and `block-at` item (at most 500), `probe(text)` returns `true` when the browser kept at least one rule. A `false` becomes one "Possible invalid CSS" finding at the item's first line, listing the first 40 characters of the selector (redacted) in `extra`. Brace problems become `scan.frontend.css-braces` findings. In the browser the probe is: `const s = new CSSStyleSheet(); s.replaceSync(text); return s.cssRules.length > 0`, inside a `try`. A constructed sheet is never attached to any document, so it fetches nothing; the browser run counts requests to prove it. In node the registry holds a fake from `tests/helpers/fakeCssProbe.ts`.

### 7.6 The fix: candidates and verify (`syntaxFix.ts`)
`buildSyntaxFix(finding, content, recheck)` is called from `buildFixProposal` for the two eligible skills. It:
1. Reads the error spot again (re-parse), refusing when the position is at or after the last non-blank character of the file or script block (R6.3).
2. Builds the candidate list. **JavaScript:** for the error position `p` (before the unexpected token, skipping blanks backward), insert one of `)`, `]`, `}`, `,`, `;`, `:`; for "Unterminated string constant", the opening quote at the end of the line, or just before a trailing `;`, `,`, `)`. **HTML:** for a "closed late" element, `</tag>` immediately before the closing tag that closed its parent (a single candidate by construction). At most 12 candidates, each at most 8 characters.
3. Applies each to a temporary copy of the file (an inline script's change is mapped back to a file offset) and runs the **same check** on that copy. A candidate passes when the reported error at that spot disappears and no earlier mistake appears.
4. Accepts only when **exactly one** candidate passes. Builds the diff with `buildLineDiff`, checks 2,000 characters, `containsSecret`, `applyUnifiedDiff` round trip, and the recheck rule from `buildFixProposal` with one change: for a `scan.frontend.*` skill, a finding of the **same skill later in the file** is not a "new finding" (the parser reports one mistake at a time).
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
`checkLayout(runner, [375, 768, 1024])` is the **Full check**. The existing single-width auto check on open stays and uses the same code with one width. The runner waits for `document.fonts.ready` (at most 1,500 ms), for the outside-style links, and for every `img` to finish loading (`complete`, at most 3,000 ms in all) after every width change, so a late font or picture does not change a number. Pictures still loading when the wait ends are counted as can't measure.

### 8.2 The extended `Measurement`
Plain data read by `gatherMeasurements` (all values come from `getBoundingClientRect`, `getComputedStyle`, and the DOM; none from the page's own scripts, which don't run in Look-only mode):
`id`, `parentKey`, `left`, `top`, `width`, `height`, `display`, `position`, `visibility`, `opacity` (the element's own), `see-through` (any ancestor opacity below 1), `hasTransform`, `hasNegativeMargin`, `overlay` (self or an ancestor is `fixed`, `sticky`, or `absolute`), `disabled`, `roleButton`, `inlineInText` (a link that is `display: inline` whose parent has other text), `fontSize`, `bold`, `color` (computed string), for a real `img`: `naturalWidth`, `naturalHeight`, `complete`, `local` (its `currentSrc` starts with `data:`), and `parentClientWidth`, and `bg` (`{ color }`, or `{ unknown: reason }`). The background is found by walking up from the element (at most 30 levels) to the first non-transparent `background-color`; if any step on the way has a `background-image`, a gradient, or a see-through background colour, the result is `unknown` (`'picture'`, `'see_through'`, or `'unparsed'`). Existing fields (client and scroll sizes, overflow, `hasText`) are kept. The reader keeps the existing protection against page markup that shadows DOM methods (it calls the frame's own prototypes).

### 8.3 Evaluation rules (`linter.ts`, pure)
Constants in `previewLimits.ts`: `tapMinPx 44`, `smallTextPx 12`, `contrastNormal 4.5`, `contrastLarge 3`, `overlapMinArea 16`, `overlapMinShare 0.15`, `maxChildrenPerParent 60`, `maxPairs 20000`, `mobileMaxWidth 768`, `maxPerKind 25`.

- **Overflow:** unchanged (existing `evaluateOverflow`), confidence `high`.
- **Tap target:** at widths up to 768; element is `a` (with `href`), `button`, `input` (not `hidden`), `select`, `textarea`, `summary`, or `roleButton`; visible; not `disabled`; not `inlineInText`; `width < 44` or `height < 44`. Value is the smaller side. Confidence `high`, or `medium` for `roleButton`.
- **Small text:** at widths up to 768; `hasText`; visible; `fontSize < 12`. Confidence `high`, `medium` for `small`, `sub`, `sup`.
- **Contrast:** `hasText`, visible, not `disabled`. If `bg.unknown`, or the colour can't be parsed, count in `cantMeasure` with the reason and stop. Otherwise ratio = WCAG relative-luminance contrast of the parsed `color` over the solid `bg`; threshold 3 when large (`fontSize >= 24`, or `>= 18.66` and bold), else 4.5. A see-through foreground colour (alpha below 1) is blended over the background first and the confidence is `medium`; otherwise `high`.
- **Overlap (R8):** group by `parentKey`; skip groups over 60 children (a partial note); compare only pairs that pass the filter; intersection area and share rules; confidence from R8.4; stop at 20,000 pairs (a partial note).
- **Picture wider than its box (measured):** for a real `img` (the DOM tag is `img`, so it is not a placeholder) that is `complete` with `naturalWidth > 0`: report when its drawn width is more than `parentClientWidth + 1`. The value is the drawn width and the limit is the container width. Confidence `high` when `local`, `medium` otherwise. A picture that is not `complete` after the wait is counted as `'picture_loading'`; a `complete` picture with `naturalWidth` 0 as `'picture_broken'`; a placeholder as `'picture_placeholder'` (all "can't measure").
- **Picture with no size limit (`mediaSize.ts`, source reading, only for pictures that could not be measured):** for each annotated `img`, `video`, `canvas`, or `picture` counted above as not measured: constrained when its start tag has both `width` and `height` attributes, or an inline style with `width` or `max-width`, or any loaded stylesheet or `<style>` block has a rule whose selector text contains the tag name, `.class`, or `#id` of the element and whose block contains `width` or `max-width`. Otherwise report, confidence `low`, certainty `possible`.

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

- **Sandbox panel:** a "Full check (375, 768, 1024 px)" button next to the existing width controls; the line "Static render (scripts off): pages built by JavaScript are not measured."; the `LintSummary` (count per check, and "Could not measure: N (reason: …)"); the `BlockedList`; the Look-only note "Styles and fonts may load from: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, fonts.googleapis.com, fonts.gstatic.com. Pictures may load from their own https addresses; that host can see your IP address. No referrer is sent."; the Run-scripts warning gains "Scripts on the page can ask any https address for a picture."; the Coverage panel shows pictures loaded, too large, and over budget.
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
| R16 | `imageSniff.test.ts`, `mediaRefs.test.ts`, `mediaLoader.test.ts`, `contracts.test.ts` (updated), `previewImages.test.ts`, `imageHost.test.ts`, `imagePrivacy.test.ts`, the browser run |
| R14 | `checksPrivacy.test.ts` (sentinels), `checksStatic.test.ts` |
| Exit gate | `phase3b1Gate.test.ts` (store level) and the browser run |

Browser run (task V14), headless Chromium on the built app with a small throw-away server outside the repository (as in 3A) that stands in for the allowed CDN hosts through a **test-harness-only** address override (production code has no override). It covers: the CSS probe makes zero requests; a Look-only page with a stand-in style and font; each new finding kind on a fixture page at three widths; overlay, hidden, and parent-child cases not flagged; each recipe kept; one recipe forced to regress and undone; Run-scripts with a stand-in CDN script, a page using `localStorage`, scripts after content; a repository (served by a fake of the GitHub raw host in the harness) with a local PNG, a 200 KB image (placeholder with size), and an outside `https:` picture (stand-in host with a test certificate and a host-name mapping in the browser's launch flags); the pictures display and a too-wide real picture is measured and fixed by its recipe; 375 px with no sideways scroll; zero unexpected console errors.

## 12. Mutation checks (V14), each must be killed by a test
Remove the module-to-script fallback; skip the template-syntax guard; allow an end-of-file fix; accept two passing candidates; skip the candidate re-check; treat a later mistake of the same skill as damage; accept a fix on a line with a secret; compare ids case-insensitively; match hosts with `endsWith`; accept `http:`, a user name, or a port; allow `img-src` hosts; put `script-src` in Look-only; add `allow-same-origin` with scripts; write project scripts before content; skip the storage stand-in; do not skip `fixed` or `absolute` overlays; do not skip hidden elements; compare parent and child; overlap confidence `high`; contrast threshold 3 for normal text; ignore a see-through ancestor; count "can't measure" as a pass; keep a recipe without re-measuring; keep when a new problem appeared; keep on timeout; undo the wrong History entry; apply the CSS probe to the document; call any network function from the checks; allow 151 KB for one image; skip the 1 MB total cap; skip the 30-image cap; trust the file extension without the signature check; download before checking the tree size; load an unreferenced image; let `..` leave the repository for an image path; put image bytes in `files`, in an AI request, or in an export; allow `http:`, an IP address, `localhost`, a user name, or a port in an outside picture address; allow `img-src` `http:`; skip the 2 MB per-document embed cap; measure a placeholder as a real picture.

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
| Image over 150 KB, over the 1 MB total, or over 30 images | Labelled placeholder with the reason and size; not downloaded when the size is known. |
| Image fetch fails, rate limit, or deadline | `media_failed` with the reason; text files unaffected. |
| A file named `.png` that is not a picture | Not loaded, "not a real picture". |
| An outside picture fails to load or is still loading | The Full check counts it as can't measure and says so. |
| 2 MB of embedded pictures reached in one preview | Remaining pictures become placeholders. |

## 14. Risks and known limits

1. **Automatic syntax fixes are narrow** (7.6). Most mistakes need AI help in 3B-3.
2. **Heuristic checks give false alarms.** Balance on JSX and TS (regex guess), overlap, and the picture-size source check are the likely ones. They are labelled `possible` or `low`. The three bundled samples are the false-alarm canary (R15).
3. **Contrast is measured only on solid backgrounds.** Gradients, pictures, and see-through layers are "can't measure".
4. **Look-only means scripts off.** Menus, tabs, and React views built by JavaScript aren't measured. The label says so.
5. **Pictures over a cap, unreferenced, or used only in JavaScript stay placeholders.** Their sizes can't be measured; the source reading gives a low-confidence hint only.
6. **Recipes work only for plain `.html` elements** with a simple style attribute. They add inline styles, which can look different from a stylesheet fix; the re-measure keeps them honest, but taste is not judged.
7. **Look-only now contacts CDN hosts.** The user's IP reaches those hosts (no referrer). The panel says so.
8. **`unpkg` and `jsdelivr` serve anyone's files.** Safe because of the sealed frame; PatchBay loads only public repositories.
9. **Scripts-after-content changes Run-scripts behaviour.** Pages that relied on scripts running first (rare) may differ.
10. **Cookies, `indexedDB`, and service workers are not shimmed.** A page that needs them can still fail in Run-scripts mode; the console line shows it.
11. **Real-browser behaviour is Unverified until the V14 browser run.** Node tests prove the logic, not the browser's numbers.
12. **Outside pictures leak the user's IP address** to the picture's host and work as a tracking pixel. A page can also send a request to a private address through a public name that points there (DNS rebinding). In Run-scripts mode a script can use picture requests to send a small message out. It can't read PatchBay's data. The panel says so (R16.11), and open question 1 lets you choose `data:` only for Run-scripts mode.
13. **Image budgets are tight on purpose.** A site with a large hero picture shows a placeholder for it. That is labelled, not hidden.
14. **Sample or fixture drift:** new checks may find real mistakes in the bundled samples; each is reported, not hidden.

## 15. PLAN.md nodes

Added to `traceability/PLAN.md` as `plan_id: P3B1-CHECKS-LINTER`, nodes F12.1 to F12.13 and the F12 gate (one per task V1 to V14; V14 is the gate). The old `P3B-LIVE-JOURNAL-CREW` F12 section is replaced.
