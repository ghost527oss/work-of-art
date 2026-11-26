# Tasks: 07 Sandbox Preview (Phase 2, Sub-phase 2E-1)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2E1-SANDBOX` and the F7 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2E-1** (PatchBay's own screens black-and-white wireframe, no animation, `AI_MODE=mock` only, no AI and no network from PatchBay's code). **These tasks start only after 2A to 2D are built and you have advanced the active sub-phase to 2E-1.**

Task ids are **E1 to E11**, so they cannot be confused with T, M, S, B, C, or D (earlier specs).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F7.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network, `fetch`, AI, `mockAssistant`, `aiAssistant`, or `useAssistant` import in any 2E-1 file. No `eval` or `new Function` in PatchBay's code. No `dangerouslySetInnerHTML`. The iframe's `srcdoc` is the only way HTML reaches a frame.
- **Security rule:** `allow-same-origin` and `allow-scripts` must never appear together, and no other sandbox token may ever be produced. Any change to `previewFlags.ts` needs your explicit approval.
- No PatchBay value (snapshot, store data, cookies, storage, secrets) may be written into a preview document. Tests use sentinel values to prove it.
- Everything from the project, the preview, and the bridge is shown as React text outside the iframe.
- The scripts switch, the console, the preview document, and measurements are never saved.
- Do not touch the files in design section 4.3. The 2A and 2D files and tests named in design section 4.2 may change **only** as described there.
- New CSS for PatchBay's own chrome uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

The spec on `spec/07-sandbox-preview`, code on `feat/sandbox-preview` from the spec branch, **one commit per task**, a pull request after E11.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| E1 | F7.1 | Limits and the 17th skill (2D changes) | 2D (D1, D5) |
| E2 | F7.2 | HTML tokenizer and the allowlists | none |
| E3 | F7.3 | Flags, CSS sanitiser, and the static document builder | E2 |
| E4 | F7.4 | Mode detection and the source viewer helpers | 2C, E1 |
| E5 | F7.5 | Workbench extractors and builder | E3, 2C |
| E6 | F7.6 | The bridge and the inspector | E1 |
| E7 | F7.7 | The layout overflow check (pure) | E1, E3 |
| E8 | F7.8 | Preview state and actions | E1, E7 |
| E9 | F7.9 | Panel components, browser adapter, and controller | E3, E4, E5, E6, E7, E8 |
| E10 | F7.10 | Wiring into the Studio, Screens 4 and 5, and the 2D views | E9, 2A, 2D |
| E11 | F7 | Final gate, isolation browser test, mutation checks, independent review | E1 to E10 |

---

## E1. Limits and the 17th skill
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.1
- **scope:** `src/config/previewLimits.ts`, `src/skillbook/types.ts` (add `kind`), `src/skillbook/scanSkills.ts` (add the 17th skill), `src/engine/scanProject.ts` (skip measured skills), `src/engine/scanView.ts` (`allFindings`, counts, `whatWasChecked`), `tests/scanSkills.test.ts` and `tests/scanView.test.ts` (**only the assertions named below**), `tests/previewLimits.test.ts`
- **goal:** Build design sections 4.1 (limits) and 4.2 (the 2D changes). `scan.frontend.layout-overflow`: primary Frontend, severity Medium, certainty Found, fix Guided, `kind: 'measured'`, plain `explain`, `why`, and `how`.
- **acceptance:**
  - **The 2D tests change only here:** `scanSkills.test.ts` now expects 17 skills, 4 with Frontend as the primary area, and the new row; `scanView.test.ts` expects the new "Layout overflow: measured in the preview (look-only mode, static pages only)" line in place of the old "sub-phase 2E" line, and "17 checks". The report shows both diffs. Every other 2D test passes unedited.
  - `scanProject` never runs a `measured` skill (a test adds a fake measured skill and checks it is skipped); the three sample expectations from 2D are unchanged.
  - `allFindings(textFindings, measuredFindings)` merges, sorts by severity, path, and line, and keeps measured findings marked (`skill.kind === 'measured'`); counts per area and severity include them; the unique total counts each once. (The crew change is in E10.)
  - The new skill's `explain`, `why`, and `how` are plain English without banned jargon, no score, and no "secure".
  - `previewLimits.ts` holds the design values and `provisional: true`.
- **verify:** `npm run typecheck && npx vitest run tests/previewLimits.test.ts tests/scanSkills.test.ts tests/scanView.test.ts tests/scanProject.test.ts tests/scanSamples.test.ts tests/crewScript.test.ts`

## E2. HTML tokenizer and the allowlists
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.2
- **scope:** `src/preview/htmlTokens.ts`, `src/preview/htmlAllow.ts`, `tests/htmlTokens.test.ts`
- **goal:** Build design sections 7.1 and 7.2: `tokenizeHtml`, `escapeText`, `escapeAttr`, and the tag and attribute allowlists as data.
- **acceptance:**
  - Tokens, offsets, lines, and columns are correct on a hand-checked multi-line fixture (start tags, end tags, quoted, unquoted, and boolean attributes, comments, doctype, raw-text elements, void elements, self-closing).
  - Odd input never throws and always terminates: unterminated tags, quotes, comments, and raw-text elements; `<<a>`, `<a<b>`, `<a =b>`, `\0` bytes, very long attribute lists, 200 KB of `<`, 200 KB of `<a `, 200 KB of `<!--`, and a seeded fuzz of 1,000 random strings finish in under 1 second each.
  - Tokenizing then concatenating the source slices of all tokens reproduces the original input exactly (no characters lost).
  - `escapeText` escapes `<`, `>`, and a bare `&` but leaves valid entity references (`&copy;`, `&#169;`) alone; `escapeAttr` also escapes `"` and `'`; both are idempotent-safe for already escaped valid entities.
  - The allowlists contain exactly the tags and attributes in design section 7.2 (the test lists them by hand), contain none of `script`, `iframe`, `object`, `embed`, `base`, `meta`, `link`, `frame`, `frameset`, `applet`, `portal`, `template`, `foreignObject`, and no attribute starting with `on`.
  - The files import nothing from React, stores, the network, or the DOM, and use no `DOMParser`.
- **verify:** `npm run typecheck && npx vitest run tests/htmlTokens.test.ts`

## E3. Flags, CSS sanitiser, and the static document builder
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.3
- **scope:** `src/preview/previewFlags.ts`, `src/preview/cssSanitize.ts`, `src/preview/previewDocument.ts`, `tests/previewFlags.test.ts`, `tests/previewDocument.test.ts`, `tests/previewHostile.test.ts`
- **goal:** Build design sections 6, 7.3, and 8.
- **acceptance:**
  - **Flags:** `sandboxFlags(false)` is exactly `allow-same-origin`, `sandboxFlags(true)` is exactly `allow-scripts`, any other input gives the look-only value, no output ever contains both tokens, and none of `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`, `allow-downloads`, `allow-pointer-lock`, `allow-presentation`, `allow-popups-to-escape-sandbox`, or `allow-orientation-lock`. `cspFor(false)` and `cspFor(true)` are exactly the two policy strings in the design, written out by hand in the test. `IFRAME_ATTRS` has `referrerpolicy="no-referrer"`, `allow=""`, and no `src`.
  - **CSS:** `@import`, `url(http...)`, `url(//...)`, relative `url(...)`, `expression(`, `-moz-binding`, `behavior`, and a `</style>` inside a string or comment are removed or escaped; `url(data:image/png;base64,...)` and `data:font/` survive; the output never contains `<`.
  - **Builder:** every rule in requirements R2.5 and R3 on fixtures: the allowlist output, dropped tags with counts, unknown tags written as `span` with the note, attributes filtered and `data-*` renamed, `<a href>` written as `#`, external references replaced and listed by host (at most 20), stylesheets inlined and sanitised, local scripts inlined **only** in scripts mode with `</script` and `<!--` escaped, the inspector placed first in scripts mode only, `noscript` as `div` in look-only mode, loaded SVG as a data image, placeholders with copied `id`, `class`, `style`, `width`, `height` and the default 120 by 80, and the body attributes copied through the allowlist.
  - **Policy and meta:** the first element in `<head>` is the policy meta, and the output contains exactly two `<meta>` tags (policy and charset) for every input.
  - **Annotation:** in look-only mode every element written in the body has `data-pb`, numbers start at `idStart`, and the element table (path, tag, line, column, start and end offsets, end line) is correct on a hand-checked fixture, including a multi-line start tag and a placeholder that replaced an `<img>`. In scripts mode there is no annotation.
  - **Bounds:** more than 30 inlined files, an output over 1 MB, and more than 5,000 elements each return the right `{ ok: false, reason }` or set `truncated` as the design says.
  - **Hostile markup (`previewHostile.test.ts`):** the pages listed in requirements section 6, item 4 give output with exactly the two PatchBay `<meta>` tags and no tag outside the allowlist, checked with an independent tag scan written in the test (not the builder's tokenizer), every `<` and `&` from the page escaped, identical policy and flags for all inputs, and no sentinel PatchBay value anywhere in the output.
  - Determinism: same input gives byte-identical output, and the input file map in reversed key order gives the same output.
  - The files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/previewFlags.test.ts tests/previewDocument.test.ts tests/previewHostile.test.ts tests/htmlTokens.test.ts`

## E4. Mode detection and the source viewer helpers
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.4
- **scope:** `src/preview/previewMode.ts`, `src/preview/sourceView.ts`, `tests/previewMode.test.ts`, `tests/sourceView.test.ts`
- **goal:** Build design sections 9 and 11 (the pure parts).
- **acceptance:**
  - **Mode:** the static-site sample gives `static`, the React sample gives `workbench`, the full-stack sample gives `static` (its client page), a Python-only fixture gives `source` with the reason "No web page was found. This looks like a backend or a library.", a Vite app with an empty `#root` and a `.tsx` module script gives `workbench`, a framework project with no extractable component gives `source` with the reason, Vue and Svelte fixtures, and a project with no HTML. Entry page choice follows R1.2 (root `index.html`, `public/index.html`, the shallowest, the first by path). Each result has the fixed reason sentence.
  - `modeChoices` lists only possible modes and always includes `source`.
  - **Viewer:** `groupFiles` groups by label and helper group with stable order; `viewerLines` numbers lines, redacts a secret fixture, cuts lines to 400 characters, caps at 2,000 lines with the "Show more" offset, and highlights a line range; an unread file returns its inventory reason.
  - The files import nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/previewMode.test.ts tests/sourceView.test.ts`

## E5. Workbench extractors and builder
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.5
- **scope:** `src/preview/jsxExtract.ts`, `src/preview/templateExtract.ts`, `src/preview/workbenchDocument.ts`, `tests/workbench.test.ts`
- **goal:** Build design section 10.
- **acceptance:**
  - **JSX:** the React sample gives components `App`, `LoginForm`, and `LoginForm`'s markup with `class` for `className`, the handlers dropped, `{email}` and `{error && ...}` as `pb-expr` markers, and the `<button type="submit">` kept; `App` inlines `LoginForm`; the expected HTML for each is written by hand in the test.
  - Function declarations, `export default function`, `const X = () =>` with parentheses and with a direct JSX body, fragments, self-closing tags, spread attributes dropped, `style={{ color: 'red' }}` kept as a literal style and `style={styles}` dropped, a capitalised unknown tag as a `<Name />` box, nested inlining to 3 levels, and a cycle (A uses B uses A) that stops.
  - `{`}` inside strings and template literals do not confuse the brace tracking. Hostile input (200 KB of `<`, `{`, and `return (`) finishes under 1 second. A component that cannot be parsed returns `error` and does not stop the others. Bounds: 200 components, 100 KB per component.
  - **Vue and Svelte:** the template and markup are extracted with markers, `v-`, `:`, `@`, `on:`, and `bind:` attributes dropped, `{#if}` and `{#each}` lines removed with inner markup kept, and the Vue `<style>` returned.
  - **Builder:** `buildWorkbench` picks `App` by default, collects CSS imported by the component and the entry chain through 2C edges (up to 3 levels, `.css` only), runs the same builder with `annotate: false`, and the output passes the same hostile-markup checks as E3. The result has no `data-pb` attribute.
  - The label text is not inside the document (it belongs to the panel).
  - The files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/workbench.test.ts`

## E6. The bridge and the inspector
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.6
- **scope:** `src/preview/previewBridge.ts`, `tests/previewBridge.test.ts`
- **goal:** Build design section 12.
- **acceptance:**
  - `BridgeMessageSchema` accepts each valid type and rejects: unknown types, extra fields, a missing nonce, a wrong version, text over 200 characters after trimming (it is cut, not rejected, only after control characters are removed), a level outside `log`, `warn`, `error`, and non-object data.
  - `validateBridgeEvent` rejects: a different `source`, an origin that is not `'null'`, a nonce that does not match, data over 8 KB, and a prototype-polluting object (`__proto__`, `constructor`).
  - `RateLimiter(20 per second)` with a fake clock drops the 21st message in a second and allows messages again in the next second.
  - Control characters are removed and the text is shown unchanged otherwise (including `<img src=x onerror=alert(1)>` text).
  - `INSPECTOR_SOURCE(nonce, origin)` returns the fixed text with only the nonce and origin filled in; a bad nonce or origin throws before any text is built; the text contains `parent.postMessage(` with the origin variable, never `'*'`, contains no PatchBay value, and does not contain `eval`, `Function(`, `fetch`, or `XMLHttpRequest`.
  - A reducer test applies a long random sequence of valid and invalid events and asserts the only effects are: ready, a console line (50-line cap), and an invalid count.
  - The file imports nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/previewBridge.test.ts`

## E7. The layout overflow check (pure)
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.7
- **scope:** `src/preview/layoutCheck.ts`, `tests/layoutCheck.test.ts`
- **goal:** Build design section 13 (the pure parts): `evaluateOverflow` and `layoutFindings`.
- **acceptance:**
  - Hand-written measurement tables give: text wider than its box with `overflow: visible`, with `hidden`, and with `clip`; text cut off at the bottom; the page wider than the screen (reported on the widest element); elements with `overflow: auto` or `scroll` not reported; elements without text not reported; differences of 1 pixel or less not reported.
  - The same element and kind at three widths gives one finding listing the widths. More than 100 findings keeps 100 and sets the reason "Layout check limit (100) reached: later findings are missing."
  - Each finding has the skill id `scan.frontend.layout-overflow`, Frontend, Medium, Found, Guided, the file and lines from the element table, a snippet from `snippetFor` on the effective content (redacted; a secret fixture in the tag shows `[REDACTED:...]`), an `extra` with the numbers and width, and a stable id (the same input twice gives the same id; two identical tags get different ids).
  - Numbers outside 0 to 100,000, `NaN`, and negative values are clamped or ignored without throwing.
  - No finding is produced for a missing element table entry (the element is dropped, not guessed).
  - The file imports nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/layoutCheck.test.ts`

## E8. Preview state and actions
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.8
- **scope:** `src/store/previewSlice.ts`, `src/store/previewActions.ts`, `src/store/useStudioStore.ts` (add `preview` only), `tests/previewState.test.ts`
- **goal:** Build design section 14 (state and actions).
- **acceptance:**
  - **Existing tests still pass with no edits** (`store`, `aiState`, `workStore`, `understandingState`, `scanState`, and the 2A tests), and `initialState().preview` equals `idlePreview()`.
  - Every transition: init, mode, width, scripts, build state, console, invalid, layout begin, done, stopped, clear, reset. A stale update changes nothing (same object). `pvScripts(true)` is refused unless the mode is `static`. Every mode change, snapshot change, and reset forces `scripts` to `false`.
  - The console keeps the last 50 lines of at most 200 characters. The invalid count is capped at 1,000,000 and does not overflow.
  - Log entries `preview_mode`, `preview_scripts`, `preview_reset`, and `layout_check_done` have the expected text and hold titles and counts only (sentinel tests for a console line, a snippet line, and a secret fixture).
  - The state clears with `ai`, `work`, `understanding`, and `scan` on snapshot replacement, `reset`, and foreground cancel.
  - The 2B saved record is unchanged by any preview state (a test builds the record with a populated preview and compares it with one built without).
  - The slice file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/previewState.test.ts tests/store.test.ts tests/workStorage.test.ts`

## E9. Panel components, browser adapter, and controller
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.9
- **scope:** `src/components/SandboxPanel.tsx`, `PreviewToolbar.tsx`, `ScriptsSwitch.tsx`, `PreviewNotes.tsx`, `ConsolePane.tsx`, `WorkbenchPicker.tsx`, `SourceViewer.tsx` (all in `src/components/`), `src/preview/previewDom.ts`, `src/hooks/usePreview.ts`, `src/styles.css` (append the 2E-1 block only), `tests/sandboxUi.test.tsx`, `tests/previewController.test.ts`
- **goal:** Build design sections 13 (the browser part) and 14.
- **acceptance:**
  - **Components (server render):** the panel in `static` look-only, `static` scripts-on, `workbench`, `source`, building, failed, and no-preview states. The iframe markup has `sandbox="allow-same-origin"` or `sandbox="allow-scripts"` and never both, `referrerpolicy="no-referrer"`, `allow=""`, a `title`, a `srcdoc`, and **no `src`**. The `srcdoc` contains no sentinel PatchBay value. The mode line shows the reason. The notes read in plain words. The workbench label "Approximate: read from the source, not run." appears for the workbench. The scripts switch shows the confirmation text (both limits) before it can turn on. The console shows lines as escaped text (a `<img onerror>` line is escaped). Check layout is disabled with the reason when scripts are on.
  - Width buttons 375, 768, 1024, and Fit; Reload; the mode selector lists only the possible modes.
  - **Controller (fake timers, fake iframe object, fake `raf`):** the bridge listener is added only while scripts are on and removed on Stop scripts, remount, unmount, and dispose; events from another source are ignored; a second `load` event in scripts mode resets to look-only, logs `preview_reset`, and shows the notice; the layout check sets the width, waits two frames, measures through a fake `gatherMeasurements`, restores the width, runs the three widths for "Check at all widths", stops at 3,000 ms with the message, and is discarded when the content key changes; scripts are off after a remount and after a snapshot change.
  - `previewDom.ts` is small, reads only (a test with a fake document asserts it never calls a setter, `eval`, or anything that executes code), clamps numbers, and caps at 5,000 elements.
  - Static checks on the new files and the CSS block: no `dangerouslySetInnerHTML`, no `eval`, no `new Function`, no color other than `#000` and `#fff`, no `transition`, no `animation`, no `fetch`, every new file tagged `@node: F7.9`.
  - Real iframe behavior is **not** claimed here. It is verified in E11.
- **verify:** `npm run typecheck && npx vitest run tests/sandboxUi.test.tsx tests/previewController.test.ts`

## E10. Wiring into the Studio, Screens 4 and 5, and the 2D views
- **plan_id:** P2E1-SANDBOX  **node_id:** F7.10
- **scope:** `src/components/SandboxPlaceholder.tsx` (remove), `src/components/StudioLayout.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/DomainScreen.tsx`, `src/components/ScanSummary.tsx`, `src/components/FindingsTable.tsx`, `src/components/FindingDetail.tsx`, `src/components/WhatWasChecked.tsx`, `src/App.tsx`, `src/styles.css` (only to fix a class from E9), `src/engine/crewScript.ts` and `src/store/workActions.ts` (`start crew` reads the merged findings and the not-measured sentence only), `tests/crewScript.test.ts` and `tests/crewRun.test.ts` (**append new tests only; no existing assertion changes**), `tests/sandboxUi.test.tsx` (append wiring tests), `tests/studioShell.test.tsx` and `tests/screens.test.tsx` (**only the assertions that look for the placeholder text "Sandbox (coming in sub-phase 2E)"**), `tests/crewUi.test.tsx` (**only assertions on the check count and the old "not checked" line**)
- **goal:** Replace the 2A placeholder with `SandboxPanel` on Screens 3, 4, and 5, merge measured findings into the 2D views, and add `usePreview()` to `App`.
- **acceptance:**
  - **The existing suite passes with no edit** except the named assertions, and the report shows the diff of each.
  - With a seeded store and `react-dom/server`: Screens 3, 4, and 5 each contain the Sandbox panel at the top of the left area, and Project info and the Project understanding section still follow it on Screen 3; no toolbar on Screens 4 and 5; the panel shows the right mode for each of the three samples.
  - Screen 5's table and counts include a measured finding with the word "Measured" and the width; the scan summary and `WhatWasChecked` read 17 checks; `FindingDetail` has **Open in viewer** which, through the store, switches the panel to `source` mode at that file and line (store-level test).
  - **Crew:** with a state containing measured findings, `start crew` builds a script whose Frontend section narrates each measured finding once (path, lines, the three narration sentences, with the measured numbers in the problem sentence), in the same severity, path, and line order as other findings, counted within the 12-per-area and 150-step limits, with no `propose` or `verify` step; with no layout check run, the Frontend area step carries the exact "Layout was not measured..." sentence; the crew code imports nothing from `src/preview/` or the DOM (source-text check) and a state without measured findings gives exactly the 2D script as before (the existing 2D crew tests pass unedited).
  - Moving between screens remounts the panel and scripts are off (store and component test).
  - `StudioLayout` and the screens import no engine or preview module they did not need before, apart from types and the panel.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## E11. Final gate, isolation browser test, and independent review
- **plan_id:** P2E1-SANDBOX  **node_id:** F7
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts and fixture repositories live outside the repo and are deleted afterwards. `README.md` (a short section on the preview and its two modes) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase and its Phase 2E-1 gate.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2D baseline.
  2. Static checks: no new dependency; no network, AI, or `mockAssistant` import in any 2E-1 file; no `eval`, `new Function`, `dangerouslySetInnerHTML`, or `postMessage` with `'*'`; `previewFlags.ts` is the only source of the sandbox string; every new file tagged; the diff of existing tests shows only the named assertions.
  3. Mutation checks (break, see tests fail, restore): the sandbox flag strings (each token), the policy strings, the allowlist (one forbidden tag added), the `<meta>` count, the escaping of text and attributes, the `</script` escape, the inspector origin, the bridge source, origin, nonce, size, and rate checks, the scripts-off-by-default rule and its reset on mode, snapshot, and screen change, the second-document reset, the layout rules, and the 100-finding cap.
  4. **Isolation browser test (headless Chromium, built app, request recording)** exactly as requirements section 6, item 13, including the probe page, both modes, the network log, PatchBay's storage and cookies before and after, and the known navigation limit reported as such.
  5. Browser run of every item in requirements section 6, item 14: the three samples and their modes, widths, the static sample's placeholder, scripts on and off with the button click, Stop scripts, the approximate workbench and its label, the viewer, the layout check on a fixture page and the measured finding on Screen 5, Check layout disabled with scripts on, 375 px, refresh with scripts off, zero console errors, and that AI Chat, the 2B commands, 2C, and 2D (scan, Start Crew, approve, undo) still work.
  6. Independent behavioral review with `semantic_reviewer`, focused on isolation, anything PatchBay value that could reach the preview, trusting preview data, the honesty of the labels, and the 2E-1 scope rules. Fix findings only with your approval.
  7. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the fifteen acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). The report states the two known limits of script mode as limits, not as failures. I then say whether 2E-1 passes its gate: imported code cannot read PatchBay data, cookies, or secrets, or load external scripts or other external content, and messages from the preview are validated and shown as plain text. Advancing to 2E-2 stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 Display modes | E4 |
| R2 Isolation | E2, E3, E6, E9, E11 |
| R3 The preview document | E2, E3 |
| R4 Look-only and Run scripts | E3, E6, E8, E9 |
| R5 Component Workbench | E5 |
| R6 Source Inspection | E4, E9, E10 |
| R7 The Sandbox panel | E9, E10 |
| R8 The layout overflow check | E1, E7, E9, E10 |
| R9 State and wiring | E8, E10 |
| R10 Safety, privacy, resources | E1 to E10, E11 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Mode detection | E4 |
| 2. Sandbox flags | E3 |
| 3. Document builder | E2, E3 |
| 4. Hostile markup | E3 |
| 5. Bridge | E6 |
| 6. Workbench | E5 |
| 7. Source view | E4 |
| 8. Layout check | E1, E7 |
| 9. State | E8, E9 |
| 10. Components | E9, E10 |
| 11. Static checks | E1 to E10, E11 |
| 12. Regression | E1, E8, E10, E11 |
| 13. Isolation browser test | E11 |
| 14. Browser run | E11 |
| 15. Phase 2E-1 gate | E11 |

## Questions

1. **Requirements questions 1 to 7** at the end of `requirements.md` (also written out in the chat message).
2. **Branch pattern** for code: same as before. Confirm or change.
3. **Approval of the spec**, and then, once 2A to 2D are built and you advance the active sub-phase to 2E-1, your explicit "Go" naming **E1**.

---

## Build report (sub-phase 2E-1, as built)

Copied from `PHASE_2_REPORT.md` at the repository root, which also has the summary table and the Phase 2 exit evidence. Numbers are real command output; **Unverified** items say why.


**What was built.** The Sandbox panel shows the project in a locked frame.
- **Look-only:** the frame sandbox is exactly `allow-same-origin`. The page is rebuilt by an allowlist, and the security policy (CSP) comes first.
- **Scripts on:** the frame sandbox is exactly `allow-scripts`, after a confirmation that names the remaining risks.
- **Other views:** a component **workbench** shows an approximate picture of React components, and **Source** view shows the files.
- A **layout check** measures text that does not fit at chosen widths. The result appears as a Measured finding (the 17th check).

**Files.** Created: `src/preview/*` (tokenizer, allowlist, document builder, flags and CSP, bridge, workbench, mode detection, layout check, source view), `src/store/{previewSlice,previewActions}.ts`, `src/hooks/usePreview.ts`, `SandboxPanel` and `PreviewParts`, and tests.

**Results.**
- 62 files, 1,448 tests. Build 567.65 kB (174.85 kB gzip).
- 9 of 9 mutations killed.
- **Isolation browser test with a hostile page: 24 of 24.**
  - Parent document, top location, local and session storage, IndexedDB, and cookies were all blocked.
  - fetch, XHR, WebSocket, beacon, image, iframe, popup, form, worker, and dynamic import made zero network requests.
  - The one documented exception is a self-navigation of the frame. It is detected and reset to look-only, with a Log line.
- 8 of 10 review findings fixed.

**Unverified.** WebRTC and data:/blob: self-navigation in scripts mode were not probed. **Open in viewer** was not built in 2E-1; 2F added it.
