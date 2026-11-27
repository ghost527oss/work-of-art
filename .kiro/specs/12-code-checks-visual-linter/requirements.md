# Requirements: 12 Code checks, Visual Linter, and sandbox compatibility (Phase 3, Sub-phase 3B-1)

Sources: `PHASE_3B_IMPLEMENTATION_PLAN.md`; your `Skeleton_Crew_Autonomous_Vision.md` (sections 2, 7); your discussion answers of 2026-11-27; steering `build-phases.md` (3B block); specs 06 (scanner), 07 (sandbox preview), 08 (Edit pad), 11 (live AI, only the shared rules); the real code (`scanProject.ts`, `scanFix.ts`, `previewDocument.ts`, `previewFlags.ts`, `layoutCheck.ts`, `previewDom.ts`, `elementMap.ts`, `workActions.ts`).
Active product phase: **Phase 3, Sub-phase 3B-1**. PatchBay's own screens stay black-and-white wireframe with no animation. `AI_MODE=mock` stays the default. **3B-1 makes no AI request at all.** Free tiers only. **One new runtime dependency: `acorn` (approved).**

## 1. Purpose

3B-1 builds everything in the Skeleton Crew vision that needs **no AI**:

1. **Code checks (Category 1):** PatchBay reads JavaScript, HTML, and CSS and reports real mistakes with the exact place. It never runs the code.
2. **Narrow automatic fixes:** for a few kinds of mistake, PatchBay tries tiny repairs, re-checks each one, and offers a fix only when exactly one works.
3. **Visual Linter (Category 3):** PatchBay measures the rendered preview at three screen widths and reports objective visual problems, each with a number, a confidence, and a place in the code. When it can't measure, it says so.
4. **Recipes:** fixed, zero-AI CSS fixes for objective visual problems. Each fix is re-measured and **undone automatically** if it did not help or caused a new problem.
5. **Sandbox compatibility:** real pages look styled in Look-only mode (styles and fonts from a short CDN list), and "Run scripts" works better on real sites (CDN script hosts, a `localStorage` stand-in, scripts that run after the page content).

In simple words: PatchBay gets much better at finding and fixing the easy problems by itself, for free, before any AI is needed. 3B-2 and 3B-3 then build on this.

## 2. Scope

### In scope
- `acorn` JavaScript syntax check for `.js`, `.mjs`, `.cjs`, and inline `<script>` blocks in `.html` and `.htm`.
- A "balanced" check for `.jsx`, `.ts`, `.tsx`.
- HTML structure checks: unclosed and stray tags, repeated ids, missing required attributes.
- CSS checks: "Possible invalid CSS" (browser `replaceSync`) and "braces that do not match" (own counter), for `.css` files and `<style>` blocks.
- Seven new text scan skills with plain-English text and one lesson card each.
- Candidate-and-verify automatic fix for a narrow set of JavaScript and HTML mistakes.
- Visual Linter: overflow (extends the built check), overlap (with a false-alarm filter), tap targets, small text, contrast, pictures with no size limit. Confidence on every result. A "can't measure" count. Label "static render (scripts off)". Widths 375, 768, 1024 px.
- Five new measured scan skills with plain-English text and one lesson card each.
- Recipes for overflow, tap targets, small text, contrast on solid backgrounds, and picture size, with the re-measure and automatic undo.
- Look-only CDN styles and fonts. Run-scripts CDN scripts and the `localStorage` and `sessionStorage` stand-in. Scripts placed after the page content. A blocked-resources list.
- Updated 2E-1 tests (listed in design 4.3), fake and hostile tests, a real-browser run, mutation checks, an independent review, `traceability/PLAN.md` nodes, README notes.

### Out of scope
- Any AI request or AI text (3B-3 uses the checks; 3B-1 does not call AI).
- The Knowledge Library, the Repo Map, and the visual templates (3B-2).
- The autonomous queue, Autopilot, wait-and-resume, "Undo this whole run" (3B-3).
- The font-count check (you chose to skip it), templates 11 to 20, and the CSP nonce bridge (you chose to drop it; Look-only mode runs no scripts, so it is not needed).
- Loading real PNG, JPG, or other binary images into the preview (PatchBay does not fetch binaries).
- Running imported code in PatchBay's own page. Any new `eval` or `new Function`.
- Type checking TypeScript, or understanding JSX, Vue, or Svelte syntax.
- Changing the saved-session format (2G). No new saved data.
- Raising the Phase 2 practice limits (that is 3B-3).

## 3. Glossary

- **Check:** a rule that reads a file's text and reports findings. **Measured check:** a rule that needs the rendered preview.
- **Finding:** one reported problem, with file, lines, a short redacted snippet, and a plain explanation.
- **Candidate:** one tiny possible repair (for example, inserting `)`), tried on a temporary copy.
- **Recipe:** a fixed CSS declaration set for a measured problem (for example `min-height: 44px`).
- **Confidence:** `high`, `medium`, or `low`. How sure the measurement is that this is a real problem, not how important it is.
- **Can't measure:** the honest answer when a number can't be trusted (a gradient or picture behind text, see-through layers, colours the reader can't parse).
- **Look-only mode:** the default preview. No scripts run. **Run-scripts mode:** the opt-in preview with scripts, in a sealed frame.

## 4. Functional requirements

### R1. JavaScript syntax check
1. `.js`, `.mjs`, `.cjs` files and inline `<script>` blocks in `.html` and `.htm` are parsed with `acorn` (`ecmaVersion: 'latest'`, hash-bang allowed). PatchBay never runs the code, and uses no `eval` or `new Function`.
2. `.mjs` is parsed as a module only. `.cjs` is parsed as a script only (top-level `return` allowed). `.js` and inline scripts are parsed as a module first, then as a script. If both fail, the error that got further into the file is reported; a tie reports the module error.
3. Inline scripts are checked only when they have no `src` and the `type` is missing, `module`, `text/javascript`, or `application/javascript`. `application/json`, `importmap`, `text/babel`, `text/template`, `text/x-*`, and `speculationrules` blocks are skipped. A script that contains `{{`, `{%`, `<%`, or `<?` is skipped (template syntax) and counted as not checked.
4. A finding reports the line and column in the **file** (inline scripts are offset to the right line). One finding per file or script block (`acorn` reports the first mistake).
5. Messages are plain English from a fixed table. Names taken from the code appear only when they look like a safe identifier (letters, digits, `_`, `$`, at most 40 characters) and pass the secret check.
6. Files over the size limit, minified files (`*.min.js`), and files the scan already ignores are not parsed and are counted as not checked, with the reason.
7. A parse failure of the checker itself (for example the `acorn` chunk could not load) is shown as "could not check", never as "no problems".

### R2. Brackets and quotes balance (JSX and TypeScript)
1. For `.jsx`, `.ts`, `.tsx`, PatchBay counts `()`, `[]`, `{}` outside strings, comments, and template text. For `.ts`, it also reports a quote that does not close on its line.
2. The result is worded "may not match" and is never called "valid". Certainty is `possible`.
3. For `.jsx` and `.tsx`, a mismatch is reported only when it is also found with quotes ignored (apostrophes in page text such as `Don't` must not cause false alarms).
4. A passing balance check never says the file is correct. The Journal and the finding text say what the check can and can't do.

### R3. HTML structure check
1. Applies to `.html` and `.htm` only, and skips files with template syntax (R1.3 list).
2. Reports: an element that is opened and never closed (not counting void tags and tags whose closing tag may be left out, such as `p`, `li`, `td`, `tr`, `option`, `dt`, `dd`, `thead`, `tbody`, `tfoot`); a closing tag with no matching opening tag; an element closed by a closing tag that belongs to an outer element.
3. Reports an `id` used more than once in a file (plain `id="x"` values only), and missing required attributes: `img` without `src`, `link` with `rel="stylesheet"` and no `href`.
4. Findings carry the line of the tag. At most 10 per file.

### R4. CSS check
1. Applies to `.css` files and `<style>` blocks (after masking comments).
2. **Possible invalid CSS:** each top-level rule is given to a browser `CSSStyleSheet` (`replaceSync`). A rule the browser drops is reported with the label "Possible invalid CSS". The text explains that a newer feature or a browser-specific rule can be dropped too. `@import` is ignored. The check runs in the browser only; where the browser can't do it, the check says "not checked", never "fine".
3. **Braces that do not match:** an own counter (aware of strings and comments) reports an unmatched `{` or `}` with the line. Certainty `found`.
4. The CSS probe loads nothing from the network and applies nothing to the page (a test in the browser run counts requests).
5. At most 20 findings per file and 500 rules probed per file.

### R5. New text skills (data)
Seven new scan skills, each with plain English text a beginner can read and exactly one lesson card (`lesson.<skillId>`, three reading levels obeying the existing playbook writing rules):
`scan.code.js-syntax`, `scan.code.balance`, `scan.code.html-structure`, `scan.code.html-id-duplicate`, `scan.code.html-attr-missing`, `scan.code.css-possible-invalid`, `scan.code.css-braces`. Design 5 has the full table.

### R6. Automatic syntax fix (candidate and verify)
1. Offered only for `scan.code.js-syntax` and `scan.code.html-structure`, and only when the fix is a single insertion of at most 8 characters at the error spot.
2. PatchBay builds a small fixed list of candidates at the error spot, applies each to a temporary copy, and re-runs the same check. **Exactly one** candidate must make that error go away. If none or several pass, no automatic fix is offered (the finding stays `guided`, with a plain note).
3. An error at the very end of the file (for example a missing closing `}`) never gets an automatic fix, because the right place can't be known.
4. The accepted fix goes through the **existing Approve and History flow** as a normal practice-copy change, with a normal diff, secret check, hash round trip, Undo, and Redo.
5. After a fix, the next mistake in the same file may appear (the parser reports one at a time). That is not counted as damage from the fix.
6. The fix never makes the diff longer than 2,000 characters and never touches a line that contains a likely secret.

### R7. Visual Linter: measurements
1. The preview is measured at **375, 768, and 1024 px** in one "Full check". The existing single-width auto check on open stays.
2. Results are labelled **"static render (scripts off)"** in the panel and in each measured finding. The label says that UI built by JavaScript is not measured.
3. Measured checks (all use browser layout values from the preview document, never from the page's own scripts):
   - **Overflow** (existing): text wider than its box, text cut at the bottom, page wider than the screen.
   - **Tap target:** a link, button, form control, summary, or `role="button"` element smaller than **44 px** in width or height, checked at widths up to 768 px. A link inside a sentence of text, a hidden element, and a disabled control are skipped.
   - **Small text:** text smaller than **12 px**, checked at widths up to 768 px.
   - **Contrast:** text colour against a solid background below **4.5:1** (3:1 for large text, as WCAG defines large: 24 px, or 18.66 px and bold). Disabled controls are skipped.
   - **Overlap:** see R8.
   - **Picture with no size limit:** an `img`, `video`, `canvas`, or `picture` with no width and height written in the page, and no width or `max-width` from any style. This one is read from the page source and style text, not from the browser, because pictures are placeholders in the preview. It is always low confidence.
4. Every result carries: the number measured, the element and its place in the code, the widths where it happened, and a **confidence**.
5. A measured finding appears in the same lists as text findings (Screen 3 Edit panel, Screen 5, the Journal), is never saved, and holds no page text beyond the redacted snippet.
6. At most 100 measured findings in all and 25 per check, with a plain "limit reached" note.

### R8. Overlap detection with a false-alarm filter
1. Only these pairs are compared: two **siblings** (same parent), both visible (not `display: none`, not `visibility: hidden`, opacity above 0, width and height above 0), both laid out in normal flow (`position` static or relative), both with a block-like display (block, flex, grid, inline-block, inline-flex, list-item, table kinds).
2. Skipped: any element, and all its children, that is `fixed`, `sticky`, or `absolute` (overlays, menus, tooltips); a parent and its own descendants; inline text boxes.
3. A pair is reported when the overlap area is at least 16 px² **and** at least 15% of the smaller box.
4. Confidence: `medium` when both boxes hold text or are a control or a picture; `low` otherwise, and `low` whenever either box has a `transform` or a negative margin (intentional overlap is likely). Overlap is **never `high`**.
5. At most 60 children per parent and 20,000 pairs per check. A page over the limit reports a partial result.

### R9. Confidence and "can't measure"
1. Confidence values: overflow `high`; tap target `high` (a real link, button, or control) or `medium` (`role="button"`); small text `high` (`medium` for `small`, `sub`, `sup`); contrast `high` when both colours are solid, `medium` when a see-through colour was blended; overlap as R8; picture size `low`.
2. **Can't measure** (counted, never a finding): contrast over a gradient or a background picture, with a see-through layer in between, or with a colour the reader can't parse; pictures whose real size is unknown because the preview shows a placeholder.
3. The panel shows a plain line: how many elements could not be measured and why (grouped by reason).
4. A measurement that fails or times out stops the check with a plain message. It never reports "no problems" for a check that did not finish.

### R10. Recipes with automatic undo
1. A recipe is offered only for a measured finding whose element **maps exactly** to a start tag in a plain `.html` file (the same rule the Edit pad uses). Otherwise the finding says why no recipe is offered.
2. Recipes (fixed, validated declarations only):
   - overflow, text wider: `overflow-wrap: anywhere`; page wider: `max-width: 100%`; text cut at the bottom: `height: auto`.
   - tap target: `min-height: 44px` and `min-width: 44px`, plus `display: inline-block` for an inline link.
   - small text: `font-size: 14px`.
   - contrast (solid background only): a text `color` moved toward black or white, in small steps, to the first value that reaches the ratio.
   - picture size: `max-width: 100%` and `height: auto`.
   - overlap: no recipe (it needs a design choice).
3. Pressing the recipe button builds a practice-copy change and records it in History through the existing edit path, with the same checks (precondition hash, 2,000-character limit, secret check). Nothing is written until the button is pressed. Nothing here is automatic in 3B-1.
4. After the change, PatchBay builds the new preview, measures it again at **all three widths**, and compares with the measurement before. The change is **kept only if** the target problem is gone at every width **and** no new problem (same kind on another element, or any other kind) has appeared.
5. Otherwise, or if the measurement can't finish, or the page changed meanwhile, the change is **undone automatically** with the existing Undo, and the panel says why in plain words. If the latest History entry is not this change, nothing is undone and the panel says so.
6. The Log gets fixed-word lines with numbers only (`recipe_applied`, `recipe_kept`, `recipe_undone`). No file text.
7. While a recipe is being checked, the recipe and Edit buttons are disabled (no overlapping runs). Stop and Reset behave as today.

### R11. Look-only sandbox: CDN styles and fonts
1. In Look-only mode, a stylesheet link whose address is `https:` and whose host **exactly** matches the style list (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com`) is written into the preview as a `link` with only `rel="stylesheet"` and `href`. Fonts may load from `fonts.gstatic.com` and the same three CDN hosts.
2. Everything else stays blocked as today: other hosts, `http:`, protocol-relative addresses, addresses with a user name, password, or port, odd characters, over 300 characters, and more than 10 outside styles. `@import` and non-data `url()` inside **your own** CSS stay removed.
3. The preview CSP gets the matching `style-src` and `font-src` hosts and nothing else. `img-src` stays `data:`. `connect-src`, `frame-src`, `object-src`, `worker-src`, `form-action`, `base-uri` stay `'none'`. No script is allowed in Look-only mode.
4. The sandbox flags and `referrerPolicy: no-referrer` stay as built. A plain note tells the user that Look-only mode now contacts these hosts for styles and fonts.
5. `cdn.tailwindcss.com` is a script, so it is allowed only in Run-scripts mode (R12). In Look-only mode, a page that depends on it shows unstyled, and the blocked list says why.
6. If an outside style fails to load, the preview still measures, and the result says "an outside style could not be loaded, so measurements may differ".

### R12. Run-scripts sandbox: CDN scripts, storage stand-in, script order
1. In Run-scripts mode, a script `src` with an `https:` address whose host exactly matches the script list (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, `code.jquery.com`, `cdn.tailwindcss.com`) is written as a script tag, in page order. The CSP `script-src` gets those hosts. The style and font hosts of R11 also apply.
2. The frame keeps an opaque origin (no `allow-same-origin`), `connect-src 'none'`, and every other flag as built. Only public repositories are loaded.
3. **Storage stand-in:** before any project script runs, a fixed script replaces `localStorage` and `sessionStorage` with in-memory copies (`getItem`, `setItem`, `removeItem`, `clear`, `key`, `length`; at most 200 keys and 100 KB; strings only). Page scripts that use storage no longer crash.
4. **Script order:** PatchBay's own inspector and the storage stand-in come first. Project scripts are written **after the page content** (at the end of the body), in their original order, so `document.getElementById(...)` finds its elements. (Today they run before the content; this is a real problem found in the code.)
5. A script that still can't run (a module with `import`, an outside API call) is listed in the blocked-resources list. It is never silently dropped.

### R13. Blocked-resources report
1. Every preview build keeps a list of what was not loaded and why, in plain words: outside address not on the list, outside script in Look-only mode, `http:`, too many outside styles, image not loaded, event handler removed, and so on.
2. The panel shows the list (at most 20 lines, then "and N more"), and the full-check result shows the count.
3. The list holds addresses cut to 80 characters, never page text.

### R14. Safety carried over
- No `eval`, `new Function`, `innerHTML`, or `dangerouslySetInnerHTML` in new code. All text is rendered as React text.
- No page text, snippet, or address is saved to browser storage. Findings are never saved.
- Wireframe only: new CSS uses `#000` and `#fff`, no `transition`, no `animation`.
- Every limit lives in one config file and is marked provisional.
- Secrets: a snippet that contains a likely secret is redacted (existing rules). The syntax fix refuses any line with a likely secret.

### R15. Testing and honesty
- Unit tests for every pure function; browser-only code is kept thin (reads values and returns plain data) and proven in the real-browser run.
- No claim of "valid" or "no problems" for a check that did not run or did not finish. The three bundled samples must produce **no new finding from the new checks unless the sample really contains that mistake** (each real one is listed in the report).
- Real-browser run, mutation checks, static checks, privacy and hostile-input tests, and an independent review, as in 3A.
- Anything not run is reported as **Unverified** with the reason.

## 5. Non-functional requirements

- **Memory (4 GB laptop):** `acorn` loads lazily (its own chunk), only when a scan needs it. Parsing is one file at a time. No full-page copies are kept after a measurement. The headless measuring frame is removed at the end of every run.
- **Time:** the existing scan limits (2,000 files, 8 s) still apply. Layout check limit rises from 3 s to 6 s (three widths, more checks).
- **Bundle:** reported at the gate. Expected: the main bundle grows by the checker code only; `acorn` is a separate chunk.
- **Accessibility of PatchBay's own UI:** new buttons at least 44 px, plain labels, `role="status"` and `role="alert"` for progress and errors as today.

## 6. Acceptance and verification gate

3B-1 is done when all hold. Each is measured, not assumed.

1. **Dependency:** `package.json` runtime dependencies are exactly `acorn`, `react`, `react-dom`, `zod`; the static test is updated on purpose; `npm audit` shows 0 vulnerabilities (or each is explained).
2. **Syntax check tests:** valid and invalid fixtures for module and script; `.mjs`, `.cjs`, hash-bang, top-level `await`, top-level `return` in `.cjs`; inline scripts with the right line offset; skipped types; template syntax skipped; size limit; checker failure reported as "could not check".
3. **Balance, HTML, and CSS tests:** the fixtures in design 11; false-alarm fixtures (apostrophes in JSX text, regex literals, template strings, optional closing tags, comments).
4. **Fix tests:** exactly-one-candidate rule; none or several pass means no fix; end-of-file errors get no fix; the fix applies and reverses exactly; secrets refused; the next mistake in the same file is not "damage".
5. **Visual Linter tests (pure):** each check with measurement fixtures at the three widths; skipped cases (hidden, overlay, parent and child, disabled, inline link); confidence rules; can't-measure cases; limits and partial notes; no page text in any finding.
6. **Recipe tests:** each recipe builds the exact declaration; refusal when the element is not mapped; keep only when the problem is gone at all three widths and nothing new appeared; undo on regression, on timeout, and on a changed page; no undo when the latest History entry is not the recipe's.
7. **Sandbox tests:** exact-host matching with a hostile list (lookalike hosts, user info, ports, `http:`, `//`, uppercase, trailing dots, backslashes, encoded characters, over-long addresses); the CSP strings; scripts after content; the storage stand-in run in an isolated test context; `connect-src 'none'` in both modes; no `allow-same-origin` with scripts.
8. **Existing tests:** every Phase 2 and 3A test not listed in design 4.3 passes **without edits**. The changed ones change only as listed.
9. **Samples:** no unexplained new finding on the three bundled samples.
10. **Static checks:** no `eval`, `new Function`, or `innerHTML` in `src/`; the host lists appear only in `src/config/previewHosts.ts`; no `src/engine/live/` import from browser code; no colour but `#000` and `#fff`; no `transition` or `animation` in new CSS.
11. **Full suite:** `npm run typecheck && npx vitest run && npm run build` passes. Test counts and build size are reported against the 3A baseline (113 files, 2,105 tests, `index-CyYt-s28.js` 708.33 kB, 219.59 kB gzip).
12. **Browser run** (headless Chromium, built app): Look-only page with a CDN style and font (a local stand-in server for the allowed hosts in the test harness only); the CSS probe makes no request; three-width full check with every new finding kind on a fixture page; each recipe kept and one forced to undo; overlay and hidden cases not flagged; Run-scripts with a CDN script stand-in and a page that uses `localStorage`; 375 px with no sideways scroll; zero unexpected console errors.
13. **Mutation checks** (each must be killed by a test): see design 12.
14. **Independent review** by a separate reviewer of the whole diff.

## 7. Decisions for your approval

1. **Contrast threshold for large text is 3:1**, as WCAG defines, while normal text uses your 4.5:1. (R7.3)
2. **Tap-target and small-text checks run at 375 and 768 px**, not only 375. (R7.3)
3. **Overlap confidence is never `high`**, because PatchBay can't know the designer's intent. (R8.4)
4. **Syntax auto-fix will be rare.** The parser reports where it got confused, not where the mistake is, so "exactly one candidate works" will hold only for simple cases such as a missing `)` or `,` before a token, or a nested HTML tag closed too late. Everything else stays `guided` (and becomes AI work in 3B-3). I think this is the honest design; the alternative (guessing a place) can silently change what the code means. (R6)
5. **Recipes are offered through a button in the Edit panel, one at a time.** The crew does not use them until 3B-3. (R10.3)
6. **Scripts after content in Run-scripts mode** changes a 2E-1 behaviour (today scripts run before the page content and can't find their elements). I recommend the change. (R12.4)
7. **Outside images stay blocked** in Look-only mode (your list said "styles, fonts, and images"; I limited it to styles and fonts). Real images are not fetched by PatchBay anyway, and allowing image hosts adds an outbound path with no measuring benefit. (R11.3)
8. **Look-only mode now contacts the CDN hosts** (your IP address reaches them; no referrer is sent). I add a plain note. (R11.4)
9. **Syntax and CSS findings use area Frontend (also Backend)**, since a `.js` file can be either. The area filter on Screen 5 therefore lists them under both. (design 5)
10. **`replaceSync` support:** all current browsers (Chrome 73+, Firefox 101+, Safari 16.4+). In others the CSS check says "not checked". (R4.2)
